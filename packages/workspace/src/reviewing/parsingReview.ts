import type { StateRecordWrite } from '../authoritativeState.js';
import type { ContextSourceCaptureItem, ContextSourceOccurrenceConflict } from '../contextEvidence.js';
import type {
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from '../legacyReviewImport/index.js';
import { hasOnlyKeys, isRecord, memberOf, safeVersion, unicodeScalarText } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import {
  isPairedEndpointSelection,
  reviewComparisonUsesExactResolution,
  validReviewComparisonResolution,
  type ReviewComparisonResolutionIdentity,
} from '../workspaceEvidence/index.js';
import { normalizeReviewContextContributionScope } from './context.js';
import type { ReviewContextContributionScope, ReviewContextRuleDecision } from './contracts.js';
import { reviewSnapshotContextSourceGroups } from './diff.js';
import {
  reviewContextSelectionIdentity,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewSnapshotBasisIdentity,
  reviewSnapshotContextIdentity,
  reviewingRecordIdentity,
  type ReviewBasisIdentity,
  type ReviewBatchIdentity,
  type ReviewContextRuleIdentity,
  type ReviewIdentity,
  type ReviewMessageIdentity,
  type ReviewMessageMaterialIdentity,
  type ReviewPassIdentity,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
  type ReviewResponseIdentity,
  type ReviewSnapshotContextContentIdentity,
  type ReviewSnapshotContextIdentity,
  type ReviewSnapshotContextItemIdentity,
  type ReviewSnapshotIdentity,
} from './identities.js';
import {
  ReviewingStateProblem,
  type ReviewBasisPayload,
  type ReviewDiffRowPayload,
  type ReviewDiffWindowPayload,
  type ReviewDispositionPayload,
  type ReviewManifestWindowPayload,
  type ReviewMessageBatchPayload,
  type ReviewMessageOutgoingMaterialPayload,
  type ReviewMessagePayload,
  type ReviewMessageRepositoryState,
  type ReviewMessageResponsePayload,
  type ReviewQuestionBatchPayload,
  type ReviewQuestionDraftLegacyCandidateProvenance,
  type ReviewQuestionDraftPayload,
  type ReviewQuestionPayload,
  type ReviewResponsePayload,
  type ReviewSnapshotContextContentPayload,
  type ReviewSnapshotContextContentReference,
  type ReviewSnapshotContextItem,
  type ReviewSnapshotContextManifestWindowPayload,
  type ReviewSnapshotContextPayload,
  type ReviewSnapshotContextScope,
  type ReviewSnapshotDiffIndex,
  type ReviewSnapshotFilePayload,
  type ReviewSnapshotPayload,
  type ReviewingCommandRecordPayload,
} from './internalTypes.js';
import {
  DIFF_ROW_ID_PATTERN,
  FILE_ID_PATTERN,
  MAX_BATCH_QUESTIONS,
  MAX_DIFF_ROWS_PER_FILE,
  MAX_REVIEW_CONTEXT_RULES,
  MAX_REVIEW_CONTEXT_SCOPE_BYTES,
  MAX_REVIEW_SNAPSHOT_CONTEXT_ITEMS,
  QUESTION_MAX_BYTES,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  REVIEW_MESSAGE_MAX_BYTES,
  REVIEW_RESPONSE_MAX_BYTES,
  REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
} from './limits.js';
import {
  parseReviewBasisCommit,
  parseReviewContextContribution,
  parseReviewContextSelection,
  parseReviewingCommandAccepted,
} from './parsingCommands.js';
import {
  endpointCarriesScopeFingerprint,
  endpointRequiresScopeFingerprint,
  parseCurrentChangedFile,
  parseDurableComparisonDynamicInputs,
  parseDurableComparisonSelection,
  parseEvidencePath,
  parseManifestSummary,
  parseReviewComparedState,
  parseReviewComparisonBasis,
  parseReviewQuestionAnchor,
} from './parsingEvidence.js';
import { boundedIdentity, contentEqual, decodeReviewingBytesBase64, encode, recordIdentity } from './utils.js';

export const REVIEW_CONTEXT_CAPTURE_LIMITATIONS = [
  'skip-worktree',
  'missing-working-file',
  'index-unmerged',
  'gitlink',
  'nested-repository',
  'special-entry',
  'unreadable',
  'file-limit',
  'aggregate-limit',
] as const;

export function parseReviewSnapshotContextCaptureItem(value: unknown): ContextSourceCaptureItem {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['origins', 'sourceKind', 'eligibility', 'sourceAvailability', 'sensitive', 'status'],
      [
        'pathBytesBase64',
        'absolutePath',
        'gitMode',
        'sourceSize',
        'sourceAbsenceReason',
        'classification',
        'sourceIdentity',
        'byteLength',
        'contentDigest',
        'reason',
      ],
    ) ||
    !Array.isArray(value.origins) ||
    value.origins.length === 0 ||
    value.origins.length > MAX_REVIEW_CONTEXT_RULES ||
    !(value.origins as unknown[]).every(
      (origin, index) =>
        safeVersion(origin) &&
        origin < MAX_REVIEW_CONTEXT_RULES &&
        (index === 0 || origin > ((value.origins as unknown[])[index - 1] as number)),
    ) ||
    !memberOf(value.sourceKind, ['regular', 'symlink', 'gitlink', 'nested-repository', 'special'] as const) ||
    !memberOf(value.eligibility, ['tracked', 'untracked', 'ignored-explicit', 'outside-checkout'] as const) ||
    !memberOf(value.sourceAvailability, ['available', 'working-missing', 'unavailable'] as const) ||
    (value.sourceAbsenceReason !== undefined &&
      !memberOf(value.sourceAbsenceReason, REVIEW_CONTEXT_CAPTURE_LIMITATIONS.slice(0, 7))) ||
    typeof value.sensitive !== 'boolean' ||
    !memberOf(value.status, ['captured', 'unavailable', 'over-limit', 'excluded'] as const) ||
    (value.classification !== undefined && !memberOf(value.classification, ['generated', 'binary'] as const)) ||
    (value.gitMode !== undefined && (typeof value.gitMode !== 'string' || !/^[0-7]{6}$/u.test(value.gitMode))) ||
    (value.sourceSize !== undefined && !safeVersion(value.sourceSize)) ||
    (value.sourceIdentity !== undefined &&
      (typeof value.sourceIdentity !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value.sourceIdentity))) ||
    (value.byteLength !== undefined && !safeVersion(value.byteLength)) ||
    (value.contentDigest !== undefined &&
      (typeof value.contentDigest !== 'string' || !/^[0-9a-f]{64}$/u.test(value.contentDigest))) ||
    (value.reason !== undefined && !memberOf(value.reason, REVIEW_CONTEXT_CAPTURE_LIMITATIONS)) ||
    (value.pathBytesBase64 === undefined) === (value.absolutePath === undefined) ||
    (value.pathBytesBase64 !== undefined && typeof value.pathBytesBase64 !== 'string') ||
    (value.absolutePath !== undefined &&
      (typeof value.absolutePath !== 'string' ||
        Buffer.byteLength(value.absolutePath) === 0 ||
        Buffer.byteLength(value.absolutePath) > 4096 ||
        value.absolutePath.includes('\u0000')))
  ) {
    throw new ReviewingStateProblem();
  }
  if (value.pathBytesBase64 !== undefined) decodeReviewingBytesBase64(value.pathBytesBase64);
  const captured = value.status === 'captured';
  const limited = value.status === 'over-limit';
  const unavailable = value.status === 'unavailable';
  if (
    (captured &&
      (value.sourceAvailability !== 'available' ||
        value.byteLength === undefined ||
        value.contentDigest === undefined ||
        value.reason !== undefined)) ||
    (limited &&
      (value.sourceAvailability !== 'available' ||
        !memberOf(value.reason, ['file-limit', 'aggregate-limit'] as const) ||
        value.contentDigest !== undefined)) ||
    (unavailable &&
      (!memberOf(value.reason, REVIEW_CONTEXT_CAPTURE_LIMITATIONS.slice(0, 7)) ||
        value.byteLength !== undefined ||
        value.contentDigest !== undefined)) ||
    (value.status === 'excluded' &&
      (value.byteLength !== undefined || value.contentDigest !== undefined || value.reason !== undefined)) ||
    (value.sourceAvailability === 'available' && value.sourceAbsenceReason !== undefined) ||
    (value.sourceAvailability !== 'available' && value.sourceAbsenceReason === undefined) ||
    (value.eligibility === 'outside-checkout') !== (value.absolutePath !== undefined) ||
    value.sensitive !== (value.eligibility === 'ignored-explicit' || value.eligibility === 'outside-checkout')
  ) {
    throw new ReviewingStateProblem();
  }
  return value as unknown as ContextSourceCaptureItem;
}

export function parseReviewSnapshotContextScope(value: unknown): ReviewSnapshotContextScope {
  if (isRecord(value) && hasOnlyKeys(value, ['kind']) && value.kind === 'whole') return { kind: 'whole' };
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'intervals']) ||
    value.kind !== 'bytes' ||
    !Array.isArray(value.intervals) ||
    value.intervals.length === 0 ||
    value.intervals.length > MAX_REVIEW_CONTEXT_RULES
  ) {
    throw new ReviewingStateProblem();
  }
  const intervals = value.intervals.map(interval => {
    try {
      const scope = normalizeReviewContextContributionScope(interval);
      if (scope.kind !== 'bytes') throw new ReviewingStateProblem();
      return scope;
    } catch {
      throw new ReviewingStateProblem();
    }
  });
  if (
    intervals.some(
      (interval, index) => index > 0 && interval.offset <= intervals[index - 1]!.offset + intervals[index - 1]!.length,
    ) ||
    intervals.reduce((total, interval) => total + interval.length, 0) > MAX_REVIEW_CONTEXT_SCOPE_BYTES
  ) {
    throw new ReviewingStateProblem();
  }
  return { kind: 'bytes', intervals };
}

export function parseReviewSnapshotContextContentReference(value: unknown): ReviewSnapshotContextContentReference {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['contentIdentity', 'ordinal', 'scope', 'byteLength', 'sha256']) ||
    !recordIdentity(value.contentIdentity, 'rsx') ||
    !safeVersion(value.ordinal) ||
    !safeVersion(value.byteLength) ||
    value.byteLength > MAX_REVIEW_CONTEXT_SCOPE_BYTES ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    throw new ReviewingStateProblem();
  }
  let scope: ReviewContextContributionScope;
  try {
    scope = normalizeReviewContextContributionScope(value.scope);
  } catch {
    throw new ReviewingStateProblem();
  }
  if (scope.kind === 'bytes' && scope.length !== value.byteLength) throw new ReviewingStateProblem();
  return {
    contentIdentity: value.contentIdentity as ReviewSnapshotContextContentIdentity,
    ordinal: value.ordinal,
    scope,
    byteLength: value.byteLength,
    sha256: value.sha256,
  };
}

export function parseReviewContextRuleDecision(value: unknown): ReviewContextRuleDecision {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['status', 'decidingRuleIdentity', 'inclusionRuleIdentities']) ||
    !memberOf(value.status, ['included', 'excluded'] as const) ||
    !recordIdentity(value.decidingRuleIdentity, 'rcr') ||
    !Array.isArray(value.inclusionRuleIdentities) ||
    value.inclusionRuleIdentities.length === 0 ||
    value.inclusionRuleIdentities.length > MAX_REVIEW_CONTEXT_RULES ||
    !value.inclusionRuleIdentities.every(identity => recordIdentity(identity, 'rcr')) ||
    new Set(value.inclusionRuleIdentities).size !== value.inclusionRuleIdentities.length ||
    (value.status === 'included' && !value.inclusionRuleIdentities.includes(value.decidingRuleIdentity))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    status: value.status,
    decidingRuleIdentity: value.decidingRuleIdentity as ReviewContextRuleIdentity,
    inclusionRuleIdentities: value.inclusionRuleIdentities as unknown as readonly ReviewContextRuleIdentity[],
  };
}

export function parseReviewSnapshotContextItem(value: unknown): ReviewSnapshotContextItem {
  if (!isRecord(value) || !recordIdentity(value.itemIdentity, 'rsi') || !safeVersion(value.order)) {
    throw new ReviewingStateProblem();
  }
  if (value.kind === 'locator') {
    if (
      !hasOnlyKeys(
        value,
        ['kind', 'itemIdentity', 'order', 'source', 'decision', 'scope', 'contents'],
        ['pinnedFrom'],
      ) ||
      !Array.isArray(value.contents)
    ) {
      throw new ReviewingStateProblem();
    }
    const source = parseReviewSnapshotContextCaptureItem(value.source);
    const decision = parseReviewContextRuleDecision(value.decision);
    const scope = parseReviewSnapshotContextScope(value.scope);
    const contents = value.contents.map(parseReviewSnapshotContextContentReference);
    let pinnedFrom: Extract<ReviewSnapshotContextItem, { kind: 'locator' }>['pinnedFrom'];
    if (value.pinnedFrom !== undefined) {
      if (
        !isRecord(value.pinnedFrom) ||
        !hasOnlyKeys(value.pinnedFrom, ['reviewSnapshotIdentity', 'itemIdentity']) ||
        !recordIdentity(value.pinnedFrom.reviewSnapshotIdentity, 'rsn') ||
        !recordIdentity(value.pinnedFrom.itemIdentity, 'rsi')
      ) {
        throw new ReviewingStateProblem();
      }
      pinnedFrom = {
        reviewSnapshotIdentity: value.pinnedFrom.reviewSnapshotIdentity as ReviewSnapshotIdentity,
        itemIdentity: value.pinnedFrom.itemIdentity as ReviewSnapshotContextItemIdentity,
      };
    }
    const expectedScopes = scope.kind === 'whole' ? [{ kind: 'whole' as const }] : scope.intervals;
    if (
      new Set(contents.map(content => content.contentIdentity)).size !== contents.length ||
      contents.some(
        (content, index) => content.ordinal !== index || !contentEqual(content.scope, expectedScopes[index]),
      ) ||
      (source.status === 'captured' &&
        (decision.status !== 'included' ||
          contents.length !== expectedScopes.length ||
          contents.reduce((total, content) => total + content.byteLength, 0) !== source.byteLength)) ||
      (source.status !== 'captured' && contents.length !== 0) ||
      (source.status === 'excluded') !== (decision.status === 'excluded') ||
      (source.status === 'excluded' && pinnedFrom !== undefined)
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      kind: 'locator',
      itemIdentity: value.itemIdentity as ReviewSnapshotContextItemIdentity,
      order: value.order,
      source,
      decision,
      scope,
      contents,
      ...(pinnedFrom === undefined ? {} : { pinnedFrom }),
    };
  }
  if (
    value.kind !== 'contribution' ||
    !hasOnlyKeys(value, ['kind', 'itemIdentity', 'order', 'ruleIdentity', 'contribution', 'contents']) ||
    !recordIdentity(value.ruleIdentity, 'rcr') ||
    !Array.isArray(value.contents)
  ) {
    throw new ReviewingStateProblem();
  }
  const contribution = parseReviewContextContribution(value.contribution);
  const contents = value.contents.map(parseReviewSnapshotContextContentReference);
  if (
    new Set(contents.map(content => content.contentIdentity)).size !== contents.length ||
    (contribution.content.status === 'available'
      ? contents.length !== 1 ||
        contents[0]!.ordinal !== 0 ||
        !contentEqual(contents[0]!.scope, contribution.scope) ||
        contents[0]!.byteLength !== contribution.content.byteLength ||
        contents[0]!.sha256 !== contribution.content.sha256
      : contents.length !== 0)
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'contribution',
    itemIdentity: value.itemIdentity as ReviewSnapshotContextItemIdentity,
    order: value.order,
    ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity,
    contribution,
    contents,
  };
}

export function parseReviewSnapshotContextConflict(value: unknown): ContextSourceOccurrenceConflict {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'nominalSource', 'liveOccurrence', 'immutableOccurrence', 'resolution']) ||
    value.kind !== 'saved-versus-unsaved' ||
    value.resolution !== 'keep-distinct' ||
    !isRecord(value.nominalSource) ||
    !isRecord(value.liveOccurrence) ||
    !isRecord(value.immutableOccurrence) ||
    value.liveOccurrence.kind !== 'context-locator' ||
    !Array.isArray(value.liveOccurrence.origins) ||
    !value.liveOccurrence.origins.every(origin => safeVersion(origin) && origin < MAX_REVIEW_CONTEXT_RULES) ||
    value.immutableOccurrence.kind !== 'editor-context-contribution' ||
    !recordIdentity(value.immutableOccurrence.occurrenceIdentity, 'rcc') ||
    !recordIdentity(value.immutableOccurrence.ruleIdentity, 'rcr') ||
    !safeVersion(value.immutableOccurrence.sourceGroupOrder)
  ) {
    throw new ReviewingStateProblem();
  }
  try {
    normalizeReviewContextContributionScope(value.immutableOccurrence.scope);
  } catch {
    throw new ReviewingStateProblem();
  }
  const nominal = value.nominalSource;
  if (
    nominal.kind === 'workspace'
      ? !hasOnlyKeys(nominal, ['kind', 'pathBytesBase64']) || typeof nominal.pathBytesBase64 !== 'string'
      : nominal.kind === 'outside-checkout'
        ? !hasOnlyKeys(nominal, ['kind', 'absolutePath']) || typeof nominal.absolutePath !== 'string'
        : true
  ) {
    throw new ReviewingStateProblem();
  }
  return value as unknown as ContextSourceOccurrenceConflict;
}

export function parseReviewSnapshotContext(
  value: unknown,
  reviewIdentity: ReviewIdentity,
  reviewSnapshotIdentity: ReviewSnapshotIdentity,
): ReviewSnapshotContextPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'contextIdentity',
      'selectionIdentity',
      'selectionRevision',
      'rules',
      'defaultIgnoredUntracked',
      'semanticDigest',
      'manifest',
      'sourceGroups',
      'conflicts',
      'totals',
    ]) ||
    value.formatVersion !== 1 ||
    value.contextIdentity !== reviewSnapshotContextIdentity(reviewSnapshotIdentity) ||
    value.selectionIdentity !== reviewContextSelectionIdentity(reviewIdentity) ||
    !safeVersion(value.selectionRevision) ||
    !Array.isArray(value.rules) ||
    value.defaultIgnoredUntracked !== 'excluded' ||
    !isRecord(value.semanticDigest) ||
    !hasOnlyKeys(value.semanticDigest, ['algorithm', 'value']) ||
    value.semanticDigest.algorithm !== 'sha256' ||
    typeof value.semanticDigest.value !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.semanticDigest.value) ||
    !isRecord(value.manifest) ||
    !hasOnlyKeys(value.manifest, ['formatVersion', 'totalItems', 'digest', 'windowSize']) ||
    value.manifest.formatVersion !== 1 ||
    !safeVersion(value.manifest.totalItems) ||
    value.manifest.totalItems > MAX_REVIEW_SNAPSHOT_CONTEXT_ITEMS ||
    !isRecord(value.manifest.digest) ||
    !hasOnlyKeys(value.manifest.digest, ['algorithm', 'value']) ||
    value.manifest.digest.algorithm !== 'sha256' ||
    typeof value.manifest.digest.value !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.manifest.digest.value) ||
    value.manifest.windowSize !== REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS ||
    !Array.isArray(value.sourceGroups) ||
    !Array.isArray(value.conflicts) ||
    !isRecord(value.totals) ||
    !hasOnlyKeys(value.totals, [
      'availableItems',
      'unavailableItems',
      'excludedItems',
      'sensitiveItems',
      'contentSegments',
      'contentBytes',
    ]) ||
    !Object.values(value.totals).every(total => safeVersion(total))
  ) {
    throw new ReviewingStateProblem();
  }
  const selection = parseReviewContextSelection({
    formatVersion: 1,
    reviewIdentity,
    selectionIdentity: value.selectionIdentity,
    rules: value.rules,
  });
  if (value.selectionRevision === 0 && selection.rules.length > 0) throw new ReviewingStateProblem();
  const expectedGroups = reviewSnapshotContextSourceGroups(selection.rules);
  if (!contentEqual(value.sourceGroups, expectedGroups)) throw new ReviewingStateProblem();
  const conflicts = value.conflicts.map(parseReviewSnapshotContextConflict);
  const totals = value.totals as unknown as ReviewSnapshotContextPayload['totals'];
  if (
    totals.availableItems + totals.unavailableItems + totals.excludedItems !== value.manifest.totalItems ||
    totals.sensitiveItems > value.manifest.totalItems ||
    (value.selectionRevision === 0 && selection.rules.length === 0 && value.manifest.totalItems === 0)
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    contextIdentity: value.contextIdentity as ReviewSnapshotContextIdentity,
    selectionIdentity: selection.selectionIdentity,
    selectionRevision: value.selectionRevision,
    rules: selection.rules,
    defaultIgnoredUntracked: 'excluded',
    semanticDigest: { algorithm: 'sha256', value: value.semanticDigest.value },
    manifest: {
      formatVersion: 1,
      totalItems: value.manifest.totalItems,
      digest: { algorithm: 'sha256', value: value.manifest.digest.value },
      windowSize: REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
    },
    sourceGroups: expectedGroups,
    conflicts,
    totals,
  };
}

export function parseReviewSnapshotContextManifestWindow(value: unknown): ReviewSnapshotContextManifestWindowPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'contextIdentity',
      'offset',
      'items',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    value.contextIdentity !== reviewSnapshotContextIdentity(value.reviewSnapshotIdentity as ReviewSnapshotIdentity) ||
    !safeVersion(value.offset) ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    value.items.length > REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS
  ) {
    throw new ReviewingStateProblem();
  }
  const items = value.items.map(parseReviewSnapshotContextItem);
  if (
    items.some(
      (item, index) =>
        item.order !== (value.offset as number) + index ||
        item.itemIdentity !==
          reviewingRecordIdentity('rsi', value.reviewSnapshotIdentity as ReviewSnapshotIdentity, String(item.order)) ||
        item.contents.some(
          content =>
            content.contentIdentity !==
            reviewingRecordIdentity(
              'rsx',
              value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
              String(item.order),
              String(content.ordinal),
            ),
        ),
    ) ||
    new Set(items.map(item => item.itemIdentity)).size !== items.length
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    contextIdentity: value.contextIdentity as ReviewSnapshotContextIdentity,
    offset: value.offset,
    items,
  };
}

export function parseReviewSnapshotContextContent(value: unknown): ReviewSnapshotContextContentPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'contextIdentity',
      'itemIdentity',
      'itemOrder',
      'contentIdentity',
      'ordinal',
      'scope',
      'byteLength',
      'sha256',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    value.contextIdentity !== reviewSnapshotContextIdentity(value.reviewSnapshotIdentity as ReviewSnapshotIdentity) ||
    !recordIdentity(value.itemIdentity, 'rsi') ||
    !safeVersion(value.itemOrder) ||
    value.itemIdentity !==
      reviewingRecordIdentity('rsi', value.reviewSnapshotIdentity as ReviewSnapshotIdentity, String(value.itemOrder)) ||
    value.contentIdentity !==
      reviewingRecordIdentity(
        'rsx',
        value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
        String(value.itemOrder),
        String(value.ordinal),
      )
  ) {
    throw new ReviewingStateProblem();
  }
  const reference = parseReviewSnapshotContextContentReference({
    contentIdentity: value.contentIdentity,
    ordinal: value.ordinal,
    scope: value.scope,
    byteLength: value.byteLength,
    sha256: value.sha256,
  });
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    contextIdentity: value.contextIdentity as ReviewSnapshotContextIdentity,
    itemIdentity: value.itemIdentity as ReviewSnapshotContextItemIdentity,
    itemOrder: value.itemOrder,
    ...reference,
  };
}

export function parseReviewBasis(value: unknown): ReviewBasisPayload {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewBasisIdentity, 'rbs') ||
    !memberOf(value.kind, ['live', 'git-commit', 'saved-review-point', 'change-event'] as const)
  ) {
    throw new ReviewingStateProblem();
  }
  const reviewIdentity = value.reviewIdentity as ReviewIdentity;
  const reviewBasisIdentity = value.reviewBasisIdentity as ReviewBasisIdentity;
  if (value.kind === 'live') {
    if (
      !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'reviewBasisIdentity', 'kind']) ||
      reviewBasisIdentity !== reviewLiveBasisIdentity(reviewIdentity)
    ) {
      throw new ReviewingStateProblem();
    }
    return { formatVersion: 1, reviewIdentity, reviewBasisIdentity, kind: 'live' };
  }
  if (
    !recordIdentity(value.parentReviewBasisIdentity, 'rbs') ||
    value.parentReviewBasisIdentity === reviewBasisIdentity ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn')
  ) {
    throw new ReviewingStateProblem();
  }
  const parentReviewBasisIdentity = value.parentReviewBasisIdentity as ReviewBasisIdentity;
  const reviewSnapshotIdentity = value.reviewSnapshotIdentity as ReviewSnapshotIdentity;
  if (value.kind === 'git-commit') {
    if (
      !hasOnlyKeys(value, [
        'formatVersion',
        'reviewIdentity',
        'reviewBasisIdentity',
        'kind',
        'parentReviewBasisIdentity',
        'reviewSnapshotIdentity',
        'commit',
      ])
    ) {
      throw new ReviewingStateProblem();
    }
    const commit = parseReviewBasisCommit(value.commit);
    if (reviewBasisIdentity !== reviewGitCommitBasisIdentity(reviewIdentity, commit.objectIdentity)) {
      throw new ReviewingStateProblem();
    }
    return {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity,
      kind: 'git-commit',
      parentReviewBasisIdentity,
      reviewSnapshotIdentity,
      commit,
    };
  }
  if (reviewBasisIdentity !== reviewSnapshotBasisIdentity(reviewIdentity, reviewSnapshotIdentity)) {
    throw new ReviewingStateProblem();
  }
  if (value.kind === 'saved-review-point') {
    if (
      !hasOnlyKeys(value, [
        'formatVersion',
        'reviewIdentity',
        'reviewBasisIdentity',
        'kind',
        'parentReviewBasisIdentity',
        'reviewSnapshotIdentity',
      ])
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      formatVersion: 1,
      reviewIdentity,
      reviewBasisIdentity,
      kind: 'saved-review-point',
      parentReviewBasisIdentity,
      reviewSnapshotIdentity,
    };
  }
  if (
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewBasisIdentity',
      'kind',
      'parentReviewBasisIdentity',
      'reviewSnapshotIdentity',
      'provenance',
    ]) ||
    !isRecord(value.provenance) ||
    !hasOnlyKeys(value.provenance, ['kind', 'responseIdentity']) ||
    value.provenance.kind !== 'changes-observed-after-response' ||
    !recordIdentity(value.provenance.responseIdentity, 'rrp')
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity,
    reviewBasisIdentity,
    kind: 'change-event',
    parentReviewBasisIdentity,
    reviewSnapshotIdentity,
    provenance: {
      kind: 'changes-observed-after-response',
      responseIdentity: value.provenance.responseIdentity as ReviewResponseIdentity,
    },
  };
}

export function parseReviewMessageRepositoryState(value: unknown): ReviewMessageRepositoryState {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'basis', 'comparedState', 'manifest']) ||
    value.kind !== 'current-repository-state'
  ) {
    throw new ReviewingStateProblem();
  }
  const basis = parseReviewComparisonBasis(value.basis);
  const comparedState = parseReviewComparedState(value.comparedState);
  if (
    basis.kind !== 'head' ||
    comparedState.kind !== 'effective-working-state' ||
    'workingFingerprint' in comparedState
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'current-repository-state',
    basis,
    comparedState,
    manifest: parseManifestSummary(value.manifest),
  };
}

export function parseReviewMessage(value: unknown): ReviewMessagePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewMessageIdentity',
      'originReviewBasisIdentity',
      'location',
      'body',
      'outgoingMaterialIdentity',
      'repositoryStateAtCommitment',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
    !recordIdentity(value.originReviewBasisIdentity, 'rbs') ||
    !isRecord(value.location) ||
    !hasOnlyKeys(value.location, ['file', 'line']) ||
    !safeVersion(value.location.line, false) ||
    typeof value.body !== 'string' ||
    value.body.trim().length === 0 ||
    Buffer.byteLength(value.body) > REVIEW_MESSAGE_MAX_BYTES ||
    value.body.includes('\u0000') ||
    !unicodeScalarText(value.body) ||
    !recordIdentity(value.outgoingMaterialIdentity, 'rmo')
  ) {
    throw new ReviewingStateProblem();
  }
  const file = parseEvidencePath(value.location.file);
  const repositoryStateAtCommitment = parseReviewMessageRepositoryState(value.repositoryStateAtCommitment);
  if (Buffer.byteLength(file.display) > 16 * 1024 || file.display.includes('\n') || file.display.includes('\r')) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    originReviewBasisIdentity: value.originReviewBasisIdentity as ReviewBasisIdentity,
    location: { file, line: value.location.line },
    body: value.body,
    outgoingMaterialIdentity: value.outgoingMaterialIdentity as ReviewMessageMaterialIdentity,
    repositoryStateAtCommitment,
  };
}

export function parseReviewMessageBatch(value: unknown): ReviewMessageBatchPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'reviewMessageIdentity',
      'originReviewBasisIdentity',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewBatchIdentity, 'rbt') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
    !recordIdentity(value.originReviewBasisIdentity, 'rbs')
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    originReviewBasisIdentity: value.originReviewBasisIdentity as ReviewBasisIdentity,
  };
}

export function parseReviewMessageOutgoingMaterial(value: unknown): ReviewMessageOutgoingMaterialPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewMessageIdentity',
      'outgoingMaterialIdentity',
      'representation',
      'encoding',
      'byteLength',
      'characterLength',
      'sha256',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
    !recordIdentity(value.outgoingMaterialIdentity, 'rmo') ||
    !memberOf(value.representation, ['live-repository-reference', 'saved-origin'] as const) ||
    value.encoding !== 'utf8' ||
    !safeVersion(value.byteLength, false) ||
    !safeVersion(value.characterLength, false) ||
    value.characterLength > value.byteLength ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    outgoingMaterialIdentity: value.outgoingMaterialIdentity as ReviewMessageMaterialIdentity,
    representation: value.representation,
    encoding: 'utf8',
    byteLength: value.byteLength,
    characterLength: value.characterLength,
    sha256: value.sha256,
  };
}

export function parseReviewMessageResponse(value: unknown): ReviewMessageResponsePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewMessageIdentity',
      'responseIdentity',
      'handoffIdentity',
      'invocationIdentity',
      'terminalEvidenceIdentity',
      'artifactResultContractIdentity',
      'body',
      'bodySha256',
      'bodyByteLength',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
    !recordIdentity(value.responseIdentity, 'rrp') ||
    typeof value.handoffIdentity !== 'string' ||
    !/^hho_[0-9a-f]{64}$/u.test(value.handoffIdentity) ||
    typeof value.invocationIdentity !== 'string' ||
    !/^hin_[0-9a-f]{64}$/u.test(value.invocationIdentity) ||
    !boundedIdentity(value.terminalEvidenceIdentity) ||
    !boundedIdentity(value.artifactResultContractIdentity) ||
    typeof value.body !== 'string' ||
    Buffer.byteLength(value.body) > REVIEW_RESPONSE_MAX_BYTES ||
    typeof value.bodySha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.bodySha256) ||
    !safeVersion(value.bodyByteLength) ||
    Buffer.byteLength(value.body) !== value.bodyByteLength ||
    sha256(value.body) !== value.bodySha256
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    responseIdentity: value.responseIdentity as ReviewResponseIdentity,
    handoffIdentity: value.handoffIdentity,
    invocationIdentity: value.invocationIdentity,
    terminalEvidenceIdentity: value.terminalEvidenceIdentity,
    artifactResultContractIdentity: value.artifactResultContractIdentity,
    body: value.body,
    bodySha256: value.bodySha256,
    bodyByteLength: value.bodyByteLength,
  };
}

export function parseReviewSnapshot(value: unknown): ReviewSnapshotPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'formatVersion',
        'reviewIdentity',
        'reviewSnapshotIdentity',
        'changeSetIdentity',
        'basis',
        'comparedState',
        'manifest',
        'workspaceVerificationAtCapture',
      ],
      [
        'reviewPassIdentity',
        'previousReviewSnapshotIdentity',
        'sourceEvidenceIdentity',
        'comparison',
        'comparisonResolutionIdentity',
        'comparisonDynamicInputs',
        'context',
      ],
    ) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    (value.reviewPassIdentity !== undefined && !recordIdentity(value.reviewPassIdentity, 'rps')) ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    (value.previousReviewSnapshotIdentity !== undefined &&
      (!recordIdentity(value.previousReviewSnapshotIdentity, 'rsn') ||
        value.previousReviewSnapshotIdentity === value.reviewSnapshotIdentity)) ||
    !recordIdentity(value.changeSetIdentity, 'cst') ||
    (value.sourceEvidenceIdentity !== undefined &&
      (typeof value.sourceEvidenceIdentity !== 'string' ||
        !/^evd_[0-9a-f-]{36}$/u.test(value.sourceEvidenceIdentity))) ||
    !memberOf(value.workspaceVerificationAtCapture, ['current', 'unverified'] as const)
  ) {
    throw new ReviewingStateProblem();
  }
  const basis = parseReviewComparisonBasis(value.basis);
  const comparedState = parseReviewComparedState(value.comparedState);
  const comparison = value.comparison === undefined ? undefined : parseDurableComparisonSelection(value.comparison);
  const comparisonDynamicInputs =
    value.comparisonDynamicInputs === undefined
      ? undefined
      : parseDurableComparisonDynamicInputs(value.comparisonDynamicInputs);
  const exactResolution = comparison !== undefined && reviewComparisonUsesExactResolution(comparison);
  const paired = comparison !== undefined && isPairedEndpointSelection(comparison);
  if (
    (comparison === undefined &&
      (basis.kind !== 'head' ||
        comparedState.kind !== 'effective-working-state' ||
        'workingFingerprint' in comparedState)) ||
    (comparison !== undefined &&
      !paired &&
      (basis.kind === 'index' ||
        comparedState.kind === 'working-tree' ||
        comparedState.kind === 'index' ||
        'workingFingerprint' in comparedState)) ||
    (paired &&
      (comparison.kind === 'index-to-working-tree'
        ? basis.kind !== 'index'
        : basis.kind !== 'commit' && basis.kind !== 'tree')) ||
    (comparison?.scope === undefined
      ? endpointCarriesScopeFingerprint(basis) ||
        endpointCarriesScopeFingerprint(comparedState) ||
        ('explicitlyScopedIgnoredUntracked' in comparedState &&
          comparedState.explicitlyScopedIgnoredUntracked !== undefined)
      : ('explicitlyScopedIgnoredUntracked' in comparedState &&
          comparedState.explicitlyScopedIgnoredUntracked !== undefined &&
          !comparison.scope.entries.some(entry => entry.inclusion === 'include-ignored')) ||
        (endpointRequiresScopeFingerprint(basis) && !endpointCarriesScopeFingerprint(basis)) ||
        (endpointRequiresScopeFingerprint(comparedState) && !endpointCarriesScopeFingerprint(comparedState))) ||
    (exactResolution
      ? typeof value.comparisonResolutionIdentity !== 'string' ||
        comparisonDynamicInputs === undefined ||
        !validReviewComparisonResolution(
          comparison,
          basis,
          comparedState,
          comparisonDynamicInputs,
          value.comparisonResolutionIdentity,
        )
      : value.comparisonResolutionIdentity !== undefined || comparisonDynamicInputs !== undefined)
  ) {
    throw new ReviewingStateProblem();
  }
  const reviewIdentity = value.reviewIdentity as ReviewIdentity;
  const reviewSnapshotIdentity = value.reviewSnapshotIdentity as ReviewSnapshotIdentity;
  const context =
    value.context === undefined
      ? undefined
      : parseReviewSnapshotContext(value.context, reviewIdentity, reviewSnapshotIdentity);
  return {
    formatVersion: 1,
    reviewIdentity,
    ...(value.reviewPassIdentity === undefined
      ? {}
      : { reviewPassIdentity: value.reviewPassIdentity as ReviewPassIdentity }),
    reviewSnapshotIdentity,
    ...(value.previousReviewSnapshotIdentity === undefined
      ? {}
      : {
          previousReviewSnapshotIdentity: value.previousReviewSnapshotIdentity as ReviewSnapshotIdentity,
        }),
    changeSetIdentity: value.changeSetIdentity,
    ...(value.sourceEvidenceIdentity === undefined ? {} : { sourceEvidenceIdentity: value.sourceEvidenceIdentity }),
    basis,
    comparedState,
    ...(comparison === undefined ? {} : { comparison }),
    ...(value.comparisonResolutionIdentity === undefined
      ? {}
      : {
          comparisonResolutionIdentity: value.comparisonResolutionIdentity as ReviewComparisonResolutionIdentity,
        }),
    ...(comparisonDynamicInputs === undefined ? {} : { comparisonDynamicInputs }),
    manifest: parseManifestSummary(value.manifest),
    ...(context === undefined ? {} : { context }),
    workspaceVerificationAtCapture: value.workspaceVerificationAtCapture,
  };
}

export function parseReviewSnapshotFile(value: unknown): ReviewSnapshotFilePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'reviewSnapshotIdentity', 'file', 'diff']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !isRecord(value.diff) ||
    !memberOf(value.diff.status, ['available', 'unavailable'] as const)
  ) {
    throw new ReviewingStateProblem();
  }
  const diff: ReviewSnapshotDiffIndex | undefined =
    value.diff.status === 'available'
      ? hasOnlyKeys(value.diff, ['status', 'totalRows', 'windowSize']) &&
        safeVersion(value.diff.totalRows) &&
        value.diff.totalRows <= MAX_DIFF_ROWS_PER_FILE &&
        value.diff.windowSize === REVIEW_DIFF_WINDOW_ROWS
        ? {
            status: 'available' as const,
            totalRows: value.diff.totalRows,
            windowSize: REVIEW_DIFF_WINDOW_ROWS,
          }
        : undefined
      : hasOnlyKeys(value.diff, ['status', 'reason']) &&
          memberOf(value.diff.reason, ['content-unavailable', 'not-text', 'comparison-limit'] as const)
        ? { status: 'unavailable' as const, reason: value.diff.reason }
        : undefined;
  if (diff === undefined) throw new ReviewingStateProblem();
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    file: parseCurrentChangedFile(value.file),
    diff,
  };
}

export function parseReviewManifestWindow(value: unknown): ReviewManifestWindowPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'reviewSnapshotIdentity', 'offset', 'files']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !safeVersion(value.offset) ||
    !Array.isArray(value.files) ||
    value.files.length > REVIEW_MANIFEST_WINDOW_FILES
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    offset: value.offset,
    files: value.files.map(parseCurrentChangedFile),
  };
}

export function parseReviewDiffWindow(value: unknown): ReviewDiffWindowPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'fileIdentity',
      'offset',
      'rows',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    !safeVersion(value.offset) ||
    !Array.isArray(value.rows) ||
    value.rows.length > REVIEW_DIFF_WINDOW_ROWS
  ) {
    throw new ReviewingStateProblem();
  }
  const rows = value.rows.map((row): ReviewDiffRowPayload => {
    if (
      !isRecord(row) ||
      !hasOnlyKeys(row, ['rowIdentity', 'kind', 'content'], ['oldLine', 'newLine']) ||
      typeof row.rowIdentity !== 'string' ||
      !DIFF_ROW_ID_PATTERN.test(row.rowIdentity) ||
      !memberOf(row.kind, ['context', 'deletion', 'addition'] as const) ||
      (row.oldLine !== undefined && !safeVersion(row.oldLine, false)) ||
      (row.newLine !== undefined && !safeVersion(row.newLine, false)) ||
      (row.kind === 'context' && (!safeVersion(row.oldLine, false) || !safeVersion(row.newLine, false))) ||
      (row.kind === 'deletion' && (!safeVersion(row.oldLine, false) || row.newLine !== undefined)) ||
      (row.kind === 'addition' && (!safeVersion(row.newLine, false) || row.oldLine !== undefined)) ||
      !isRecord(row.content) ||
      !hasOnlyKeys(row.content, ['side', 'byteOffset', 'byteLength', 'digest']) ||
      !memberOf(row.content.side, ['old', 'new'] as const) ||
      !safeVersion(row.content.byteOffset) ||
      !safeVersion(row.content.byteLength) ||
      typeof row.content.digest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(row.content.digest)
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      rowIdentity: row.rowIdentity,
      kind: row.kind,
      ...(row.oldLine === undefined ? {} : { oldLine: row.oldLine }),
      ...(row.newLine === undefined ? {} : { newLine: row.newLine }),
      content: {
        side: row.content.side,
        byteOffset: row.content.byteOffset,
        byteLength: row.content.byteLength,
        digest: row.content.digest,
      },
    };
  });
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    fileIdentity: value.fileIdentity,
    offset: value.offset,
    rows,
  };
}

export function parseReviewQuestionBatch(value: unknown): ReviewQuestionBatchPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'reviewBatchIdentity',
      'intent',
      'questionIdentities',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !recordIdentity(value.reviewBatchIdentity, 'rbt') ||
    value.intent !== 'question-only' ||
    !Array.isArray(value.questionIdentities) ||
    value.questionIdentities.length < 1 ||
    value.questionIdentities.length > MAX_BATCH_QUESTIONS ||
    !value.questionIdentities.every(identity => recordIdentity(identity, 'qst')) ||
    new Set(value.questionIdentities).size !== value.questionIdentities.length
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
    intent: 'question-only',
    questionIdentities: value.questionIdentities.map(identity => identity as ReviewQuestionIdentity),
  };
}

export function parseReviewQuestion(value: unknown): ReviewQuestionPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'formatVersion',
        'reviewIdentity',
        'reviewSnapshotIdentity',
        'reviewBatchIdentity',
        'questionIdentity',
        'intent',
        'body',
        'anchor',
        'ordinal',
      ],
      ['draftIdentity'],
    ) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !recordIdentity(value.reviewBatchIdentity, 'rbt') ||
    !recordIdentity(value.questionIdentity, 'qst') ||
    (value.draftIdentity !== undefined && !recordIdentity(value.draftIdentity, 'qdr')) ||
    value.intent !== 'question' ||
    typeof value.body !== 'string' ||
    Buffer.byteLength(value.body) > QUESTION_MAX_BYTES ||
    !safeVersion(value.ordinal)
  ) {
    throw new ReviewingStateProblem();
  }
  const anchor = parseReviewQuestionAnchor(value.anchor);
  if (anchor.reviewSnapshotIdentity !== value.reviewSnapshotIdentity) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
    questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
    ...(value.draftIdentity === undefined ? {} : { draftIdentity: value.draftIdentity as ReviewQuestionDraftIdentity }),
    intent: 'question',
    body: value.body,
    anchor,
    ordinal: value.ordinal,
  };
}

export function parseReviewingCommandRecord(value: unknown): ReviewingCommandRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'normalizedCommand', 'result']) ||
    value.formatVersion !== 1 ||
    typeof value.normalizedCommand !== 'string'
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    normalizedCommand: value.normalizedCommand,
    result: parseReviewingCommandAccepted(value.result),
  };
}

export function parseReviewQuestionDraftLegacyCandidateProvenance(
  value: unknown,
): ReviewQuestionDraftLegacyCandidateProvenance {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'sourceDigest',
      'candidateIdentity',
      'promotionIdentity',
    ]) ||
    value.kind !== 'legacy-review.queue-candidate' ||
    !recordIdentity(value.sourceIdentity, 'lgs') ||
    !recordIdentity(value.sourceOccurrenceIdentity, 'lso') ||
    typeof value.sourceDigest !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.sourceDigest) ||
    !recordIdentity(value.candidateIdentity, 'lgc') ||
    !recordIdentity(value.promotionIdentity, 'lcp')
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'legacy-review.queue-candidate',
    sourceIdentity: value.sourceIdentity as LegacyReviewSourceIdentity,
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity as LegacyReviewSourceOccurrenceIdentity,
    sourceDigest: value.sourceDigest,
    candidateIdentity: value.candidateIdentity as LegacyReviewQueueCandidateIdentity,
    promotionIdentity: value.promotionIdentity as LegacyReviewCandidatePromotionIdentity,
  };
}

export function parseReviewQuestionDraft(value: unknown): ReviewQuestionDraftPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['formatVersion', 'reviewIdentity', 'reviewSnapshotIdentity', 'status', 'body', 'anchor'],
      ['provenance', 'reviewBatchIdentity', 'questionIdentity'],
    ) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !memberOf(value.status, ['open', 'committed'] as const) ||
    typeof value.body !== 'string' ||
    Buffer.byteLength(value.body) > QUESTION_MAX_BYTES ||
    (value.reviewBatchIdentity !== undefined && !recordIdentity(value.reviewBatchIdentity, 'rbt')) ||
    (value.questionIdentity !== undefined && !recordIdentity(value.questionIdentity, 'qst')) ||
    (value.reviewBatchIdentity === undefined) !== (value.questionIdentity === undefined) ||
    (value.status === 'open' && value.reviewBatchIdentity !== undefined) ||
    (value.status === 'committed' && value.reviewBatchIdentity === undefined)
  ) {
    throw new ReviewingStateProblem();
  }
  const anchor = parseReviewQuestionAnchor(value.anchor);
  if (anchor.reviewSnapshotIdentity !== value.reviewSnapshotIdentity) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    status: value.status,
    body: value.body,
    anchor,
    ...(value.provenance === undefined
      ? {}
      : {
          provenance: parseReviewQuestionDraftLegacyCandidateProvenance(value.provenance),
        }),
    ...(value.reviewBatchIdentity === undefined
      ? {}
      : { reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity }),
    ...(value.questionIdentity === undefined
      ? {}
      : { questionIdentity: value.questionIdentity as ReviewQuestionIdentity }),
  };
}

export function parseReviewDisposition(value: unknown): ReviewDispositionPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'questionIdentity',
      'disposition',
      'decidedBy',
      'stateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.questionIdentity, 'qst') ||
    !memberOf(value.disposition, ['answered', 'open', 'dismissed'] as const) ||
    value.decidedBy !== 'human' ||
    !safeVersion(value.stateVersion, false)
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
    disposition: value.disposition,
    decidedBy: 'human',
    stateVersion: value.stateVersion,
  };
}

export function parseReviewResponse(value: unknown): ReviewResponsePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'reviewBatchIdentity',
      'questionIdentity',
      'responseIdentity',
      'handoffIdentity',
      'invocationIdentity',
      'terminalEvidenceIdentity',
      'artifactResultContractIdentity',
      'body',
      'bodySha256',
      'bodyByteLength',
    ]) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    !recordIdentity(value.reviewBatchIdentity, 'rbt') ||
    !recordIdentity(value.questionIdentity, 'qst') ||
    !recordIdentity(value.responseIdentity, 'rrp') ||
    typeof value.handoffIdentity !== 'string' ||
    !/^hho_[0-9a-f]{64}$/u.test(value.handoffIdentity) ||
    typeof value.invocationIdentity !== 'string' ||
    !/^hin_[0-9a-f]{64}$/u.test(value.invocationIdentity) ||
    !boundedIdentity(value.terminalEvidenceIdentity) ||
    !boundedIdentity(value.artifactResultContractIdentity) ||
    typeof value.body !== 'string' ||
    Buffer.byteLength(value.body) > REVIEW_RESPONSE_MAX_BYTES ||
    typeof value.bodySha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.bodySha256) ||
    !safeVersion(value.bodyByteLength) ||
    Buffer.byteLength(value.body) !== value.bodyByteLength ||
    sha256(value.body) !== value.bodySha256
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
    questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
    responseIdentity: value.responseIdentity as ReviewResponseIdentity,
    handoffIdentity: value.handoffIdentity,
    invocationIdentity: value.invocationIdentity,
    terminalEvidenceIdentity: value.terminalEvidenceIdentity,
    artifactResultContractIdentity: value.artifactResultContractIdentity,
    body: value.body,
    bodySha256: value.bodySha256,
    bodyByteLength: value.bodyByteLength,
  };
}

export function immutableRecord(
  recordIdentity_: string,
  workflowIdentity: string,
  kind: string,
  payload: unknown,
  content: readonly { readonly role: string; readonly bytes: Uint8Array }[] = [],
): StateRecordWrite {
  return {
    recordClass: 'immutable',
    recordIdentity: recordIdentity_,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    payload: encode(payload),
    content,
  };
}
