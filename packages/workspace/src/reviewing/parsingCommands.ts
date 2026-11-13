import type {
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from '../legacyReviewImport/index.js';
import { deepFreeze, hasOnlyKeys, isRecord, isoTimestamp, memberOf, safeVersion } from '../recordCodec.js';
import {
  applyReviewContextRule,
  normalizeReviewContextContributionScope,
  normalizeReviewEditorBufferProvenance,
  normalizeReviewEditorContextSource,
  parseReviewContextRule,
} from './context.js';
import type {
  ReviewBasisCommit,
  ReviewChangeObservationRecorded,
  ReviewContextContributionScope,
  ReviewContextRule,
  ReviewEditorBufferProvenance,
  ReviewEditorContextSource,
  ReviewingCommandAccepted,
} from './contracts.js';
import {
  reviewContextSelectionIdentity,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewSnapshotBasisIdentity,
  type ReviewBasisIdentity,
  type ReviewBatchIdentity,
  type ReviewContextContributionIdentity,
  type ReviewContextRuleIdentity,
  type ReviewContextSelectionIdentity,
  type ReviewDispositionIdentity,
  type ReviewIdentity,
  type ReviewMessageIdentity,
  type ReviewPassIdentity,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
  type ReviewResponseIdentity,
  type ReviewResultIdentity,
  type ReviewSnapshotIdentity,
} from './identities.js';
import {
  ReviewingStateProblem,
  type ReviewArtifactContextProvenance,
  type ReviewBasisTreeIndex,
  type ReviewContextContributionContent,
  type ReviewContextContributionPayload,
  type ReviewContextContributionSensitivity,
  type ReviewContextSelectionPayload,
  type ReviewContextSensitivityReason,
  type ReviewCurrentDispositionIndexEntry,
  type ReviewIndexEntry,
  type ReviewIndexPayload,
  type ReviewMessageHistoryIndex,
} from './internalTypes.js';
import {
  FILE_ID_PATTERN,
  MAX_BATCHES,
  MAX_BATCH_QUESTIONS,
  MAX_DRAFTS,
  MAX_REVIEWS,
  MAX_REVIEW_BASES,
  MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES,
  MAX_REVIEW_CONTEXT_RULES,
  MAX_REVIEW_MESSAGES,
  MAX_REVIEW_SNAPSHOTS,
} from './limits.js';
import {
  parseEvidenceContentIdentity,
  parseEvidencePath,
  parseManifestSummary,
  parseReviewQuestionAnchor,
} from './parsingEvidence.js';
import { boundedIdentity, contentEqual, recordIdentity } from './utils.js';

export function emptyReviewContextSelection(reviewIdentity: ReviewIdentity): ReviewContextSelectionPayload {
  return {
    formatVersion: 1,
    reviewIdentity,
    selectionIdentity: reviewContextSelectionIdentity(reviewIdentity),
    rules: [],
  };
}

export function parseReviewContextSelection(value: unknown): ReviewContextSelectionPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'selectionIdentity', 'rules']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.selectionIdentity, 'rcs') ||
    !Array.isArray(value.rules) ||
    value.rules.length > MAX_REVIEW_CONTEXT_RULES
  ) {
    throw new ReviewingStateProblem();
  }
  const reviewIdentity = value.reviewIdentity as ReviewIdentity;
  if (value.selectionIdentity !== reviewContextSelectionIdentity(reviewIdentity)) {
    throw new ReviewingStateProblem();
  }
  const rules = value.rules.map(parseReviewContextRule);
  if (
    new Set(rules.map(rule => rule.ruleIdentity)).size !== rules.length ||
    new Set(
      rules
        .filter(
          (rule): rule is Extract<ReviewContextRule, { readonly action: 'contribute' }> => rule.action === 'contribute',
        )
        .map(rule => rule.contributionIdentity),
    ).size !== rules.filter(rule => rule.action === 'contribute').length
  ) {
    throw new ReviewingStateProblem();
  }
  let normalized: readonly ReviewContextRule[] = [];
  for (const rule of rules) {
    const next = applyReviewContextRule(normalized, rule);
    if (next.length !== normalized.length + 1) throw new ReviewingStateProblem();
    normalized = next;
  }
  return {
    formatVersion: 1,
    reviewIdentity,
    selectionIdentity: value.selectionIdentity as ReviewContextSelectionIdentity,
    rules,
  };
}

export const REVIEW_CONTEXT_CONTRIBUTION_UNAVAILABLE_REASONS = [
  'editor-read-failed',
  'native-representation-unavailable',
  'contribution-limit',
  'artifact-side-absent',
  'artifact-content-not-captured',
  'artifact-content-unavailable',
] as const;

export const REVIEW_CONTEXT_SOURCE_LIMITATIONS = [
  'aggregate-capture-limit',
  'file-capture-limit',
  'aggregate-verification-limit',
  'file-verification-limit',
  'missing-object',
  'unsupported-file-kind',
  'unsupported-content-filter',
  'large-file-payload-unavailable',
  'unmerged-index',
  'read-failed',
] as const;

export function reviewEditorContextSensitivity(
  source: ReviewEditorContextSource,
  editor: ReviewEditorBufferProvenance,
): ReviewContextContributionSensitivity {
  const reasons: ReviewContextSensitivityReason[] = [];
  if (editor.savedState === 'unsaved') reasons.push('unsaved-editor');
  if (source.kind === 'workspace' && source.inclusion === 'ignored-explicit') reasons.push('ignored-untracked');
  if (source.kind === 'outside-checkout') reasons.push('outside-checkout');
  return { sensitive: reasons.length > 0, reasons };
}

export function parseReviewContextContributionContent(value: unknown): ReviewContextContributionContent {
  if (!isRecord(value) || typeof value.status !== 'string') throw new ReviewingStateProblem();
  if (
    value.status === 'available' &&
    hasOnlyKeys(value, ['status', 'byteLength', 'sha256']) &&
    safeVersion(value.byteLength) &&
    value.byteLength <= MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256)
  ) {
    return { status: 'available', byteLength: value.byteLength, sha256: value.sha256 };
  }
  if (
    value.status !== 'unavailable' ||
    !hasOnlyKeys(value, ['status', 'reason'], ['observedByteLength', 'sourceLimitation']) ||
    !memberOf(value.reason, REVIEW_CONTEXT_CONTRIBUTION_UNAVAILABLE_REASONS) ||
    (value.observedByteLength !== undefined && !safeVersion(value.observedByteLength)) ||
    (value.reason === 'contribution-limit' &&
      (value.observedByteLength === undefined || value.observedByteLength <= MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES)) ||
    (value.sourceLimitation !== undefined && !memberOf(value.sourceLimitation, REVIEW_CONTEXT_SOURCE_LIMITATIONS))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    status: 'unavailable',
    reason: value.reason,
    ...(value.observedByteLength === undefined ? {} : { observedByteLength: value.observedByteLength }),
    ...(value.sourceLimitation === undefined ? {} : { sourceLimitation: value.sourceLimitation }),
  };
}

export function parseReviewContextContributionSensitivity(value: unknown): ReviewContextContributionSensitivity {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['sensitive', 'reasons']) ||
    typeof value.sensitive !== 'boolean' ||
    !Array.isArray(value.reasons) ||
    !value.reasons.every(reason =>
      memberOf(reason, ['unsaved-editor', 'ignored-untracked', 'outside-checkout'] as const),
    ) ||
    new Set(value.reasons).size !== value.reasons.length ||
    value.sensitive !== value.reasons.length > 0
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    sensitive: value.sensitive,
    reasons: value.reasons as readonly ReviewContextSensitivityReason[],
  };
}

export function parseReviewArtifactContextProvenance(value: unknown): ReviewArtifactContextProvenance {
  if (!isRecord(value) || typeof value.kind !== 'string') throw new ReviewingStateProblem();
  if (
    value.kind === 'review-response' &&
    hasOnlyKeys(value, [
      'kind',
      'artifactIdentity',
      'sourceReviewIdentity',
      'questionIdentity',
      'sourceByteLength',
      'sourceSha256',
      'sourceRecordChecksum',
    ]) &&
    recordIdentity(value.artifactIdentity, 'rrp') &&
    recordIdentity(value.sourceReviewIdentity, 'rev') &&
    recordIdentity(value.questionIdentity, 'qst') &&
    safeVersion(value.sourceByteLength) &&
    typeof value.sourceSha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sourceSha256) &&
    typeof value.sourceRecordChecksum === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sourceRecordChecksum)
  ) {
    return {
      kind: 'review-response',
      artifactIdentity: value.artifactIdentity as ReviewResponseIdentity,
      sourceReviewIdentity: value.sourceReviewIdentity as ReviewIdentity,
      questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
      sourceByteLength: value.sourceByteLength,
      sourceSha256: value.sourceSha256,
      sourceRecordChecksum: value.sourceRecordChecksum,
    };
  }
  if (
    value.kind !== 'review-snapshot-file-side' ||
    !hasOnlyKeys(
      value,
      [
        'kind',
        'artifactIdentity',
        'sourceReviewIdentity',
        'fileIdentity',
        'side',
        'sourceByteLength',
        'sourceContentAvailability',
        'sourceSensitive',
        'snapshotRecordChecksum',
        'fileRecordChecksum',
      ],
      ['path', 'sourceContentIdentity', 'sourceClassification', 'sourceContentLimitation'],
    ) ||
    !recordIdentity(value.artifactIdentity, 'rsn') ||
    !recordIdentity(value.sourceReviewIdentity, 'rev') ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    !memberOf(value.side, ['old', 'new'] as const) ||
    (value.sourceByteLength !== null && !safeVersion(value.sourceByteLength)) ||
    !memberOf(value.sourceContentAvailability, ['absent', 'captured', 'not-captured', 'unavailable'] as const) ||
    typeof value.sourceSensitive !== 'boolean' ||
    typeof value.snapshotRecordChecksum !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.snapshotRecordChecksum) ||
    typeof value.fileRecordChecksum !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.fileRecordChecksum) ||
    (value.sourceClassification !== undefined &&
      !memberOf(value.sourceClassification, ['text', 'binary', 'unrenderable', 'unknown'] as const)) ||
    (value.sourceContentLimitation !== undefined &&
      !memberOf(value.sourceContentLimitation, REVIEW_CONTEXT_SOURCE_LIMITATIONS))
  ) {
    throw new ReviewingStateProblem();
  }
  const path = value.path === undefined ? undefined : parseEvidencePath(value.path);
  const sourceContentIdentity =
    value.sourceContentIdentity === undefined ? undefined : parseEvidenceContentIdentity(value.sourceContentIdentity);
  if (
    (value.sourceContentAvailability === 'absent' &&
      (path !== undefined ||
        value.sourceByteLength !== null ||
        sourceContentIdentity !== undefined ||
        value.sourceClassification !== undefined ||
        value.sourceContentLimitation !== undefined ||
        value.sourceSensitive)) ||
    (value.sourceContentAvailability === 'captured' &&
      (path === undefined || value.sourceByteLength === null || sourceContentIdentity === undefined)) ||
    (value.sourceContentAvailability !== 'absent' && (path === undefined || value.sourceClassification === undefined))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'review-snapshot-file-side',
    artifactIdentity: value.artifactIdentity as ReviewSnapshotIdentity,
    sourceReviewIdentity: value.sourceReviewIdentity as ReviewIdentity,
    fileIdentity: value.fileIdentity,
    side: value.side,
    ...(path === undefined ? {} : { path }),
    sourceByteLength: value.sourceByteLength,
    ...(sourceContentIdentity === undefined ? {} : { sourceContentIdentity }),
    ...(value.sourceClassification === undefined ? {} : { sourceClassification: value.sourceClassification }),
    sourceContentAvailability: value.sourceContentAvailability,
    ...(value.sourceContentLimitation === undefined ? {} : { sourceContentLimitation: value.sourceContentLimitation }),
    sourceSensitive: value.sourceSensitive,
    snapshotRecordChecksum: value.snapshotRecordChecksum,
    fileRecordChecksum: value.fileRecordChecksum,
  };
}

export function validateReviewArtifactContributionContent(
  artifact: ReviewArtifactContextProvenance,
  scope: ReviewContextContributionScope,
  content: ReviewContextContributionContent,
): void {
  const sourceByteLength = artifact.sourceByteLength;
  if (scope.kind === 'bytes' && (sourceByteLength === null || scope.offset + scope.length > sourceByteLength)) {
    throw new ReviewingStateProblem();
  }
  const selectedByteLength = scope.kind === 'whole' ? sourceByteLength : scope.length;

  if (artifact.kind === 'review-response') {
    if (selectedByteLength === null) throw new ReviewingStateProblem();
    if (selectedByteLength > MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES) {
      if (
        content.status !== 'unavailable' ||
        content.reason !== 'contribution-limit' ||
        content.observedByteLength !== selectedByteLength ||
        content.sourceLimitation !== undefined
      ) {
        throw new ReviewingStateProblem();
      }
      return;
    }
    if (
      content.status !== 'available' ||
      content.byteLength !== selectedByteLength ||
      (scope.kind === 'whole' && content.sha256 !== artifact.sourceSha256)
    ) {
      throw new ReviewingStateProblem();
    }
    return;
  }

  if (artifact.sourceContentAvailability === 'absent') {
    if (
      scope.kind !== 'whole' ||
      content.status !== 'unavailable' ||
      content.reason !== 'artifact-side-absent' ||
      content.observedByteLength !== undefined ||
      content.sourceLimitation !== undefined
    ) {
      throw new ReviewingStateProblem();
    }
    return;
  }
  if (selectedByteLength !== null && selectedByteLength > MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES) {
    if (
      content.status !== 'unavailable' ||
      content.reason !== 'contribution-limit' ||
      content.observedByteLength !== selectedByteLength ||
      content.sourceLimitation !== undefined
    ) {
      throw new ReviewingStateProblem();
    }
    return;
  }
  if (artifact.sourceContentAvailability === 'captured') {
    if (
      selectedByteLength === null ||
      content.status !== 'available' ||
      content.byteLength !== selectedByteLength ||
      (scope.kind === 'whole' && content.sha256 !== artifact.sourceContentIdentity?.value)
    ) {
      throw new ReviewingStateProblem();
    }
    return;
  }

  const expectedReason =
    artifact.sourceContentAvailability === 'not-captured'
      ? 'artifact-content-not-captured'
      : 'artifact-content-unavailable';
  if (
    content.status !== 'unavailable' ||
    content.reason !== expectedReason ||
    content.observedByteLength !== (selectedByteLength ?? undefined) ||
    content.sourceLimitation !== artifact.sourceContentLimitation
  ) {
    throw new ReviewingStateProblem();
  }
}

export function parseReviewContextContribution(value: unknown): ReviewContextContributionPayload {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.contributionIdentity, 'rcc')
  ) {
    throw new ReviewingStateProblem();
  }
  try {
    const scope = normalizeReviewContextContributionScope(value.scope);
    const content = parseReviewContextContributionContent(value.content);
    const sensitivity = parseReviewContextContributionSensitivity(value.sensitivity);
    const base = {
      formatVersion: 1 as const,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      contributionIdentity: value.contributionIdentity as ReviewContextContributionIdentity,
      scope,
      content,
      sensitivity,
    };
    if (value.kind === 'editor') {
      if (
        !hasOnlyKeys(
          value,
          [
            'formatVersion',
            'reviewIdentity',
            'contributionIdentity',
            'kind',
            'source',
            'scope',
            'editor',
            'content',
            'sensitivity',
          ],
          ['classification'],
        ) ||
        !isRecord(value.editor) ||
        !hasOnlyKeys(value.editor, [
          'editorInstanceIdentity',
          'bufferIdentity',
          'bufferVersion',
          'savedState',
          'attestation',
        ]) ||
        value.editor.attestation !== 'unattested-editor-command' ||
        (value.classification !== undefined && !memberOf(value.classification, ['generated', 'binary'] as const))
      ) {
        throw new ReviewingStateProblem();
      }
      const source = normalizeReviewEditorContextSource(value.source);
      const editor = normalizeReviewEditorBufferProvenance({
        editorInstanceIdentity: value.editor.editorInstanceIdentity,
        bufferIdentity: value.editor.bufferIdentity,
        bufferVersion: value.editor.bufferVersion,
        savedState: value.editor.savedState,
      });
      const expectedSensitivity = reviewEditorContextSensitivity(source, editor);
      if (
        !contentEqual(sensitivity, expectedSensitivity) ||
        (content.status === 'unavailable' &&
          (!memberOf(content.reason, [
            'editor-read-failed',
            'native-representation-unavailable',
            'contribution-limit',
          ] as const) ||
            content.sourceLimitation !== undefined)) ||
        (scope.kind === 'bytes' && content.status === 'available' && scope.length !== content.byteLength)
      ) {
        throw new ReviewingStateProblem();
      }
      return {
        ...base,
        kind: 'editor',
        source,
        editor: { ...editor, attestation: 'unattested-editor-command' },
        ...(value.classification === undefined ? {} : { classification: value.classification }),
      };
    }
    if (
      value.kind !== 'artifact' ||
      !hasOnlyKeys(value, [
        'formatVersion',
        'reviewIdentity',
        'contributionIdentity',
        'kind',
        'artifact',
        'scope',
        'content',
        'sensitivity',
      ])
    ) {
      throw new ReviewingStateProblem();
    }
    const artifact = parseReviewArtifactContextProvenance(value.artifact);
    const expectedSensitivity: ReviewContextContributionSensitivity =
      artifact.kind === 'review-snapshot-file-side' && artifact.sourceSensitive
        ? { sensitive: true, reasons: ['ignored-untracked'] }
        : { sensitive: false, reasons: [] };
    if (!contentEqual(sensitivity, expectedSensitivity)) throw new ReviewingStateProblem();
    validateReviewArtifactContributionContent(artifact, scope, content);
    return { ...base, kind: 'artifact', artifact };
  } catch (error) {
    if (error instanceof ReviewingStateProblem) throw error;
    throw new ReviewingStateProblem();
  }
}

export function parseReviewingCommandAccepted(value: unknown): ReviewingCommandAccepted {
  if (
    !isRecord(value) ||
    value.status !== 'accepted' ||
    !boundedIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    typeof value.kind !== 'string'
  ) {
    throw new ReviewingStateProblem();
  }
  const base = {
    status: 'accepted' as const,
    commandIdentity: value.commandIdentity,
    stateVersion: value.stateVersion,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
  };
  if (
    value.kind === 'review.basis.git-commit.captured' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBasisIdentity',
      'parentReviewBasisIdentity',
      'reviewSnapshotIdentity',
      'commit',
    ]) &&
    recordIdentity(value.reviewBasisIdentity, 'rbs') &&
    recordIdentity(value.parentReviewBasisIdentity, 'rbs') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn')
  ) {
    const commit = parseReviewBasisCommit(value.commit);
    if (
      value.reviewBasisIdentity !==
        reviewGitCommitBasisIdentity(value.reviewIdentity as ReviewIdentity, commit.objectIdentity) ||
      value.reviewBasisIdentity === value.parentReviewBasisIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      kind: value.kind,
      ...base,
      reviewBasisIdentity: value.reviewBasisIdentity as ReviewBasisIdentity,
      parentReviewBasisIdentity: value.parentReviewBasisIdentity as ReviewBasisIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      commit,
    };
  }
  if (
    value.kind === 'review.basis.forked' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBasisIdentity',
      'parentReviewBasisIdentity',
      'reviewSnapshotIdentity',
    ]) &&
    recordIdentity(value.reviewBasisIdentity, 'rbs') &&
    recordIdentity(value.parentReviewBasisIdentity, 'rbs') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn') &&
    value.reviewBasisIdentity ===
      reviewSnapshotBasisIdentity(
        value.reviewIdentity as ReviewIdentity,
        value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      ) &&
    value.reviewBasisIdentity !== value.parentReviewBasisIdentity
  ) {
    return {
      kind: value.kind,
      ...base,
      reviewBasisIdentity: value.reviewBasisIdentity as ReviewBasisIdentity,
      parentReviewBasisIdentity: value.parentReviewBasisIdentity as ReviewBasisIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    };
  }
  if (
    value.kind === 'review.change-observation.recorded' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'status',
        'commandIdentity',
        'stateVersion',
        'reviewIdentity',
        'outcome',
        'reviewMessageIdentity',
        'responseIdentity',
        'parentReviewBasisIdentity',
      ],
      ['reviewBasisIdentity', 'reviewSnapshotIdentity'],
    ) &&
    memberOf(value.outcome, ['unchanged', 'forked'] as const) &&
    recordIdentity(value.reviewMessageIdentity, 'rmg') &&
    recordIdentity(value.responseIdentity, 'rrp') &&
    recordIdentity(value.parentReviewBasisIdentity, 'rbs') &&
    (value.reviewBasisIdentity === undefined || recordIdentity(value.reviewBasisIdentity, 'rbs')) &&
    (value.reviewSnapshotIdentity === undefined || recordIdentity(value.reviewSnapshotIdentity, 'rsn')) &&
    (value.reviewBasisIdentity === undefined) === (value.reviewSnapshotIdentity === undefined) &&
    (value.outcome === 'forked') === (value.reviewBasisIdentity !== undefined) &&
    (value.outcome !== 'forked' ||
      value.reviewBasisIdentity ===
        reviewSnapshotBasisIdentity(
          value.reviewIdentity as ReviewIdentity,
          value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
        ))
  ) {
    return {
      kind: value.kind,
      ...base,
      outcome: value.outcome,
      reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
      responseIdentity: value.responseIdentity as ReviewResponseIdentity,
      parentReviewBasisIdentity: value.parentReviewBasisIdentity as ReviewBasisIdentity,
      ...(value.reviewBasisIdentity === undefined
        ? {}
        : { reviewBasisIdentity: value.reviewBasisIdentity as ReviewBasisIdentity }),
      ...(value.reviewSnapshotIdentity === undefined
        ? {}
        : { reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity }),
    } as ReviewChangeObservationRecorded;
  }
  if (
    value.kind === 'review.context-selection.changed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'selectionIdentity',
      'selectionRevision',
      'action',
      'ruleIdentity',
    ]) &&
    recordIdentity(value.selectionIdentity, 'rcs') &&
    value.selectionIdentity === reviewContextSelectionIdentity(value.reviewIdentity as ReviewIdentity) &&
    safeVersion(value.selectionRevision, false) &&
    memberOf(value.action, ['included', 'excluded', 'pinned', 'removed'] as const) &&
    recordIdentity(value.ruleIdentity, 'rcr')
  ) {
    return {
      kind: value.kind,
      ...base,
      selectionIdentity: value.selectionIdentity as ReviewContextSelectionIdentity,
      selectionRevision: value.selectionRevision,
      action: value.action,
      ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity,
    };
  }
  if (
    value.kind === 'review.context-contribution.added' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'selectionIdentity',
      'selectionRevision',
      'ruleIdentity',
      'contributionIdentity',
      'contributionKind',
    ]) &&
    recordIdentity(value.selectionIdentity, 'rcs') &&
    value.selectionIdentity === reviewContextSelectionIdentity(value.reviewIdentity as ReviewIdentity) &&
    safeVersion(value.selectionRevision, false) &&
    recordIdentity(value.ruleIdentity, 'rcr') &&
    recordIdentity(value.contributionIdentity, 'rcc') &&
    memberOf(value.contributionKind, ['editor', 'artifact'] as const)
  ) {
    return {
      kind: value.kind,
      ...base,
      selectionIdentity: value.selectionIdentity as ReviewContextSelectionIdentity,
      selectionRevision: value.selectionRevision,
      ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity,
      contributionIdentity: value.contributionIdentity as ReviewContextContributionIdentity,
      contributionKind: value.contributionKind,
    };
  }
  if (
    value.kind === 'review.comparison.continued-live' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'sourceReviewIdentity',
      'changeSetIdentity',
      'reviewSnapshotIdentity',
      'manifest',
    ]) &&
    recordIdentity(value.sourceReviewIdentity, 'rev') &&
    recordIdentity(value.changeSetIdentity, 'cst') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn')
  ) {
    return {
      kind: value.kind,
      ...base,
      sourceReviewIdentity: value.sourceReviewIdentity as ReviewIdentity,
      changeSetIdentity: value.changeSetIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      manifest: parseManifestSummary(value.manifest),
    };
  }
  if (
    value.kind === 'review.change-set.refreshed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'outcome',
      'changeSetIdentity',
      'reviewSnapshotIdentity',
      'previousReviewSnapshotIdentity',
      'manifest',
    ]) &&
    (value.outcome === 'unchanged' || value.outcome === 'changed') &&
    recordIdentity(value.changeSetIdentity, 'cst') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn') &&
    (value.previousReviewSnapshotIdentity === undefined ||
      (recordIdentity(value.previousReviewSnapshotIdentity, 'rsn') &&
        value.previousReviewSnapshotIdentity !== value.reviewSnapshotIdentity)) &&
    (value.outcome === 'changed'
      ? value.previousReviewSnapshotIdentity !== undefined
      : value.previousReviewSnapshotIdentity === undefined)
  ) {
    return {
      kind: value.kind,
      ...base,
      outcome: value.outcome,
      changeSetIdentity: value.changeSetIdentity as string,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      ...(value.previousReviewSnapshotIdentity === undefined
        ? {}
        : {
            previousReviewSnapshotIdentity: value.previousReviewSnapshotIdentity as ReviewSnapshotIdentity,
          }),
      manifest: parseManifestSummary(value.manifest),
    };
  }
  if (
    value.kind === 'review.context.refreshed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'outcome',
      'changeSetIdentity',
      'reviewSnapshotIdentity',
      'previousReviewSnapshotIdentity',
      'manifest',
      'delta',
    ]) &&
    (value.outcome === 'unchanged' || value.outcome === 'changed') &&
    recordIdentity(value.changeSetIdentity, 'cst') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn') &&
    (value.previousReviewSnapshotIdentity === undefined ||
      (recordIdentity(value.previousReviewSnapshotIdentity, 'rsn') &&
        value.previousReviewSnapshotIdentity !== value.reviewSnapshotIdentity)) &&
    (value.outcome === 'changed'
      ? value.previousReviewSnapshotIdentity !== undefined
      : value.previousReviewSnapshotIdentity === undefined) &&
    isRecord(value.delta) &&
    typeof value.delta.selectionChanged === 'boolean' &&
    Array.isArray(value.delta.verdicts)
  ) {
    const verdicts: {
      readonly pathBytesBase64?: string;
      readonly absolutePath?: string;
      readonly currency: 'changed' | 'missing' | 'unavailable' | 'over-limit' | 'added';
      readonly reason?: string;
    }[] = [];
    for (const verdict of value.delta.verdicts) {
      if (
        !isRecord(verdict) ||
        !hasOnlyKeys(verdict, ['currency'], ['pathBytesBase64', 'absolutePath', 'reason']) ||
        (verdict.pathBytesBase64 === undefined && verdict.absolutePath === undefined) ||
        (verdict.pathBytesBase64 !== undefined && typeof verdict.pathBytesBase64 !== 'string') ||
        (verdict.absolutePath !== undefined && typeof verdict.absolutePath !== 'string') ||
        (verdict.reason !== undefined && typeof verdict.reason !== 'string') ||
        !memberOf(verdict.currency, ['changed', 'missing', 'unavailable', 'over-limit', 'added'] as const)
      ) {
        throw new TypeError('Invalid Review context refresh delta verdict');
      }
      verdicts.push({
        ...(verdict.pathBytesBase64 === undefined ? {} : { pathBytesBase64: verdict.pathBytesBase64 }),
        ...(verdict.absolutePath === undefined ? {} : { absolutePath: verdict.absolutePath }),
        currency: verdict.currency,
        ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
      });
    }
    return {
      kind: value.kind,
      ...base,
      outcome: value.outcome,
      changeSetIdentity: value.changeSetIdentity as string,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      ...(value.previousReviewSnapshotIdentity === undefined
        ? {}
        : {
            previousReviewSnapshotIdentity: value.previousReviewSnapshotIdentity as ReviewSnapshotIdentity,
          }),
      manifest: parseManifestSummary(value.manifest),
      delta: deepFreeze({ selectionChanged: value.delta.selectionChanged, verdicts }),
    };
  }
  if (
    (value.kind === 'review.current-changes.started' || value.kind === 'review.comparison.started') &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'changeSetIdentity',
      'reviewSnapshotIdentity',
      'manifest',
    ]) &&
    recordIdentity(value.changeSetIdentity, 'cst') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn')
  ) {
    return {
      kind: value.kind,
      ...base,
      changeSetIdentity: value.changeSetIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      manifest: parseManifestSummary(value.manifest),
    };
  }
  if (
    value.kind === 'review.legacy-question-candidate.promoted' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'draftIdentity',
      'draftRevision',
      'anchor',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'sourceDigest',
      'candidateIdentity',
      'promotionIdentity',
      'intent',
    ]) &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn') &&
    recordIdentity(value.draftIdentity, 'qdr') &&
    value.draftRevision === 1 &&
    recordIdentity(value.sourceIdentity, 'lgs') &&
    recordIdentity(value.sourceOccurrenceIdentity, 'lso') &&
    typeof value.sourceDigest === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sourceDigest) &&
    recordIdentity(value.candidateIdentity, 'lgc') &&
    recordIdentity(value.promotionIdentity, 'lcp') &&
    value.intent === 'question'
  ) {
    const anchor = parseReviewQuestionAnchor(value.anchor);
    if (anchor.reviewSnapshotIdentity !== value.reviewSnapshotIdentity) {
      throw new ReviewingStateProblem();
    }
    return {
      kind: value.kind,
      ...base,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      draftIdentity: value.draftIdentity as ReviewQuestionDraftIdentity,
      draftRevision: 1,
      anchor,
      sourceIdentity: value.sourceIdentity as LegacyReviewSourceIdentity,
      sourceOccurrenceIdentity: value.sourceOccurrenceIdentity as LegacyReviewSourceOccurrenceIdentity,
      sourceDigest: value.sourceDigest,
      candidateIdentity: value.candidateIdentity as LegacyReviewQueueCandidateIdentity,
      promotionIdentity: value.promotionIdentity as LegacyReviewCandidatePromotionIdentity,
      intent: 'question',
    };
  }
  if (
    (value.kind === 'review.question-draft.created' || value.kind === 'review.question-draft.revised') &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'draftIdentity',
      'draftRevision',
      'anchor',
    ]) &&
    recordIdentity(value.draftIdentity, 'qdr') &&
    safeVersion(value.draftRevision, false)
  ) {
    return {
      kind: value.kind,
      ...base,
      draftIdentity: value.draftIdentity as ReviewQuestionDraftIdentity,
      draftRevision: value.draftRevision,
      anchor: parseReviewQuestionAnchor(value.anchor),
    };
  }
  if (
    value.kind === 'review.question-batch.committed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'questionIdentities',
      'reviewSnapshotIdentity',
    ]) &&
    recordIdentity(value.reviewBatchIdentity, 'rbt') &&
    Array.isArray(value.questionIdentities) &&
    value.questionIdentities.length <= MAX_BATCH_QUESTIONS &&
    value.questionIdentities.every(identity => recordIdentity(identity, 'qst')) &&
    new Set(value.questionIdentities).size === value.questionIdentities.length &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn')
  ) {
    return {
      kind: 'review.question-batch.committed',
      ...base,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      questionIdentities: value.questionIdentities.map(identity => identity as ReviewQuestionIdentity),
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    };
  }
  if (
    value.kind === 'review.question.disposition-recorded' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'questionIdentity',
      'dispositionIdentity',
      'disposition',
    ]) &&
    recordIdentity(value.questionIdentity, 'qst') &&
    recordIdentity(value.dispositionIdentity, 'dsp') &&
    memberOf(value.disposition, ['answered', 'open', 'dismissed'] as const)
  ) {
    return {
      kind: 'review.question.disposition-recorded',
      ...base,
      questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
      dispositionIdentity: value.dispositionIdentity as ReviewDispositionIdentity,
      disposition: value.disposition,
    };
  }
  if (
    value.kind === 'review.completed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewPassIdentity',
      'reviewSnapshotIdentity',
      'reviewResultIdentity',
      'mode',
    ]) &&
    recordIdentity(value.reviewPassIdentity, 'rps') &&
    recordIdentity(value.reviewSnapshotIdentity, 'rsn') &&
    recordIdentity(value.reviewResultIdentity, 'rrs') &&
    memberOf(value.mode, ['normal', 'no-findings'] as const)
  ) {
    return {
      kind: 'review.completed',
      ...base,
      reviewPassIdentity: value.reviewPassIdentity as ReviewPassIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      reviewResultIdentity: value.reviewResultIdentity as ReviewResultIdentity,
      mode: value.mode,
    };
  }
  if (
    value.kind === 'review.cancelled' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'cancellationIdentity',
    ]) &&
    recordIdentity(value.cancellationIdentity, 'rcl')
  ) {
    return {
      kind: 'review.cancelled',
      ...base,
      cancellationIdentity: value.cancellationIdentity,
    };
  }
  throw new ReviewingStateProblem();
}

export function parseReviewBasisTreeIndex(value: unknown): ReviewBasisTreeIndex {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'liveReviewBasisIdentity', 'reviewBasisIdentities']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.liveReviewBasisIdentity, 'rbs') ||
    !Array.isArray(value.reviewBasisIdentities) ||
    value.reviewBasisIdentities.length < 1 ||
    value.reviewBasisIdentities.length > MAX_REVIEW_BASES ||
    !value.reviewBasisIdentities.every(identity => recordIdentity(identity, 'rbs')) ||
    new Set(value.reviewBasisIdentities).size !== value.reviewBasisIdentities.length ||
    value.reviewBasisIdentities[0] !== value.liveReviewBasisIdentity
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    liveReviewBasisIdentity: value.liveReviewBasisIdentity as ReviewBasisIdentity,
    reviewBasisIdentities: value.reviewBasisIdentities.map(identity => identity as ReviewBasisIdentity),
  };
}

export function parseReviewMessageHistoryIndex(value: unknown): ReviewMessageHistoryIndex {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'messages', 'responses', 'changeObservations']) ||
    value.formatVersion !== 1 ||
    !Array.isArray(value.messages) ||
    value.messages.length > MAX_REVIEW_MESSAGES ||
    !Array.isArray(value.responses) ||
    value.responses.length > value.messages.length ||
    !Array.isArray(value.changeObservations) ||
    value.changeObservations.length > value.responses.length
  ) {
    throw new ReviewingStateProblem();
  }
  const messages = value.messages.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['reviewMessageIdentity', 'originReviewBasisIdentity']) ||
      !recordIdentity(item.reviewMessageIdentity, 'rmg') ||
      !recordIdentity(item.originReviewBasisIdentity, 'rbs')
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      reviewMessageIdentity: item.reviewMessageIdentity as ReviewMessageIdentity,
      originReviewBasisIdentity: item.originReviewBasisIdentity as ReviewBasisIdentity,
    };
  });
  const responses = value.responses.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['reviewMessageIdentity', 'responseIdentity']) ||
      !recordIdentity(item.reviewMessageIdentity, 'rmg') ||
      !recordIdentity(item.responseIdentity, 'rrp')
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      reviewMessageIdentity: item.reviewMessageIdentity as ReviewMessageIdentity,
      responseIdentity: item.responseIdentity as ReviewResponseIdentity,
    };
  });
  const changeObservations = value.changeObservations.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['reviewMessageIdentity', 'responseIdentity', 'outcome'], ['reviewBasisIdentity']) ||
      !recordIdentity(item.reviewMessageIdentity, 'rmg') ||
      !recordIdentity(item.responseIdentity, 'rrp') ||
      !memberOf(item.outcome, ['unchanged', 'forked'] as const) ||
      (item.reviewBasisIdentity !== undefined && !recordIdentity(item.reviewBasisIdentity, 'rbs')) ||
      (item.outcome === 'forked') !== (item.reviewBasisIdentity !== undefined)
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      reviewMessageIdentity: item.reviewMessageIdentity as ReviewMessageIdentity,
      responseIdentity: item.responseIdentity as ReviewResponseIdentity,
      outcome: item.outcome,
      ...(item.reviewBasisIdentity === undefined
        ? {}
        : { reviewBasisIdentity: item.reviewBasisIdentity as ReviewBasisIdentity }),
    };
  });
  const reviewMessageIdentities = messages.map(message => message.reviewMessageIdentity);
  if (
    new Set(reviewMessageIdentities).size !== messages.length ||
    new Set(responses.map(response => response.reviewMessageIdentity)).size !== responses.length ||
    new Set(responses.map(response => response.responseIdentity)).size !== responses.length ||
    responses.some(response => !reviewMessageIdentities.includes(response.reviewMessageIdentity)) ||
    new Set(changeObservations.map(observation => observation.reviewMessageIdentity)).size !==
      changeObservations.length ||
    new Set(changeObservations.map(observation => observation.responseIdentity)).size !== changeObservations.length ||
    new Set(
      changeObservations.flatMap(observation =>
        observation.reviewBasisIdentity === undefined ? [] : [observation.reviewBasisIdentity],
      ),
    ).size !== changeObservations.filter(observation => observation.reviewBasisIdentity !== undefined).length ||
    changeObservations.some(
      observation =>
        !responses.some(
          response =>
            response.reviewMessageIdentity === observation.reviewMessageIdentity &&
            response.responseIdentity === observation.responseIdentity,
        ),
    )
  ) {
    throw new ReviewingStateProblem();
  }
  return { formatVersion: 1, messages, responses, changeObservations };
}

export function parseReviewIndexEntry(value: unknown): ReviewIndexEntry {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'reviewIdentity',
        'status',
        'changeSetIdentity',
        'reviewSnapshotIdentity',
        'draftIdentities',
        'openDraftIdentities',
        'batchIdentities',
        'questionIdentities',
        'dispositionIdentities',
        'currentDispositions',
      ],
      [
        'startedAt',
        'completedAt',
        'cancelledAt',
        'reviewPassIdentity',
        'continuedFromReviewIdentity',
        'reviewSnapshotIdentities',
        'basisTree',
        'messageHistory',
        'responses',
        'resultIdentity',
        'cancellationIdentity',
      ],
    ) ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !memberOf(value.status, ['retained', 'active', 'completed', 'cancelled'] as const) ||
    (value.startedAt !== undefined && !isoTimestamp(value.startedAt)) ||
    (value.completedAt !== undefined && !isoTimestamp(value.completedAt)) ||
    (value.cancelledAt !== undefined && !isoTimestamp(value.cancelledAt)) ||
    !recordIdentity(value.changeSetIdentity, 'cst') ||
    (value.continuedFromReviewIdentity !== undefined && !recordIdentity(value.continuedFromReviewIdentity, 'rev')) ||
    (value.reviewPassIdentity !== undefined && !recordIdentity(value.reviewPassIdentity, 'rps')) ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    (value.reviewSnapshotIdentities !== undefined &&
      (!Array.isArray(value.reviewSnapshotIdentities) ||
        !value.reviewSnapshotIdentities.every(identity => recordIdentity(identity, 'rsn')))) ||
    !Array.isArray(value.draftIdentities) ||
    !value.draftIdentities.every(item => recordIdentity(item, 'qdr')) ||
    !Array.isArray(value.openDraftIdentities) ||
    !value.openDraftIdentities.every(item => recordIdentity(item, 'qdr')) ||
    !Array.isArray(value.batchIdentities) ||
    !value.batchIdentities.every(item => recordIdentity(item, 'rbt')) ||
    !Array.isArray(value.questionIdentities) ||
    !value.questionIdentities.every(item => recordIdentity(item, 'qst')) ||
    !Array.isArray(value.dispositionIdentities) ||
    !value.dispositionIdentities.every(item => recordIdentity(item, 'dsp')) ||
    !Array.isArray(value.currentDispositions) ||
    (value.responses !== undefined && !Array.isArray(value.responses)) ||
    (value.resultIdentity !== undefined && !recordIdentity(value.resultIdentity, 'rrs')) ||
    (value.cancellationIdentity !== undefined && !recordIdentity(value.cancellationIdentity, 'rcl'))
  ) {
    throw new ReviewingStateProblem();
  }
  const currentDispositions = value.currentDispositions.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['questionIdentity', 'dispositionIdentity', 'disposition']) ||
      !recordIdentity(item.questionIdentity, 'qst') ||
      !recordIdentity(item.dispositionIdentity, 'dsp') ||
      !memberOf(item.disposition, ['answered', 'open', 'dismissed'] as const)
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      questionIdentity: item.questionIdentity as ReviewQuestionIdentity,
      dispositionIdentity: item.dispositionIdentity as ReviewDispositionIdentity,
      disposition: item.disposition,
    } satisfies ReviewCurrentDispositionIndexEntry;
  });
  const responses = (value.responses ?? []).map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ['questionIdentity', 'responseIdentity']) ||
      !recordIdentity(item.questionIdentity, 'qst') ||
      !recordIdentity(item.responseIdentity, 'rrp')
    ) {
      throw new ReviewingStateProblem();
    }
    return {
      questionIdentity: item.questionIdentity as ReviewQuestionIdentity,
      responseIdentity: item.responseIdentity as ReviewResponseIdentity,
    };
  });
  const reviewSnapshotIdentities = (value.reviewSnapshotIdentities ?? [value.reviewSnapshotIdentity]).map(
    identity => identity as ReviewSnapshotIdentity,
  );
  const basisTree = value.basisTree === undefined ? undefined : parseReviewBasisTreeIndex(value.basisTree);
  const messageHistory =
    value.messageHistory === undefined ? undefined : parseReviewMessageHistoryIndex(value.messageHistory);
  const entry: ReviewIndexEntry = {
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    status: value.status,
    ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
    ...(value.completedAt === undefined ? {} : { completedAt: value.completedAt }),
    ...(value.cancelledAt === undefined ? {} : { cancelledAt: value.cancelledAt }),
    changeSetIdentity: value.changeSetIdentity,
    ...(value.continuedFromReviewIdentity === undefined
      ? {}
      : {
          continuedFromReviewIdentity: value.continuedFromReviewIdentity as ReviewIdentity,
        }),
    ...(value.reviewPassIdentity === undefined
      ? {}
      : { reviewPassIdentity: value.reviewPassIdentity as ReviewPassIdentity }),
    reviewSnapshotIdentities,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    ...(basisTree === undefined ? {} : { basisTree }),
    ...(messageHistory === undefined ? {} : { messageHistory }),
    draftIdentities: value.draftIdentities.map(identity => identity as ReviewQuestionDraftIdentity),
    openDraftIdentities: value.openDraftIdentities.map(identity => identity as ReviewQuestionDraftIdentity),
    batchIdentities: value.batchIdentities.map(identity => identity as ReviewBatchIdentity),
    questionIdentities: value.questionIdentities.map(identity => identity as ReviewQuestionIdentity),
    dispositionIdentities: value.dispositionIdentities.map(identity => identity as ReviewDispositionIdentity),
    currentDispositions,
    responses,
    ...(value.resultIdentity === undefined ? {} : { resultIdentity: value.resultIdentity as ReviewResultIdentity }),
    ...(value.cancellationIdentity === undefined ? {} : { cancellationIdentity: value.cancellationIdentity }),
  };
  if (
    entry.reviewSnapshotIdentities.length < 1 ||
    entry.reviewSnapshotIdentities.length > MAX_REVIEW_SNAPSHOTS ||
    new Set(entry.reviewSnapshotIdentities).size !== entry.reviewSnapshotIdentities.length ||
    entry.reviewSnapshotIdentities.at(-1) !== entry.reviewSnapshotIdentity ||
    entry.draftIdentities.length > MAX_DRAFTS ||
    entry.batchIdentities.length > MAX_BATCHES ||
    entry.questionIdentities.length > MAX_DRAFTS ||
    new Set(entry.draftIdentities).size !== entry.draftIdentities.length ||
    new Set(entry.openDraftIdentities).size !== entry.openDraftIdentities.length ||
    entry.openDraftIdentities.some(identity => !entry.draftIdentities.includes(identity)) ||
    new Set(entry.batchIdentities).size !== entry.batchIdentities.length ||
    new Set(entry.questionIdentities).size !== entry.questionIdentities.length ||
    new Set(entry.dispositionIdentities).size !== entry.dispositionIdentities.length ||
    new Set(entry.currentDispositions.map(item => item.questionIdentity)).size !== entry.currentDispositions.length ||
    entry.currentDispositions.some(
      item =>
        !entry.questionIdentities.includes(item.questionIdentity) ||
        !entry.dispositionIdentities.includes(item.dispositionIdentity),
    ) ||
    new Set(entry.responses.map(item => item.questionIdentity)).size !== responses.length ||
    new Set(entry.responses.map(item => item.responseIdentity)).size !== responses.length ||
    entry.responses.some(item => !entry.questionIdentities.includes(item.questionIdentity)) ||
    (entry.basisTree !== undefined &&
      entry.basisTree.liveReviewBasisIdentity !== reviewLiveBasisIdentity(entry.reviewIdentity)) ||
    (entry.messageHistory !== undefined &&
      (entry.basisTree === undefined ||
        entry.messageHistory.messages.some(
          message => !entry.basisTree?.reviewBasisIdentities.includes(message.originReviewBasisIdentity),
        ) ||
        entry.messageHistory.changeObservations.some(
          observation =>
            observation.reviewBasisIdentity !== undefined &&
            !entry.basisTree?.reviewBasisIdentities.includes(observation.reviewBasisIdentity),
        ))) ||
    (entry.status === 'active' && (entry.completedAt !== undefined || entry.cancelledAt !== undefined)) ||
    (entry.status === 'completed' && entry.cancelledAt !== undefined) ||
    (entry.status === 'cancelled' && entry.completedAt !== undefined)
  ) {
    throw new ReviewingStateProblem();
  }
  return entry;
}

export function parseReviewIndex(value: unknown): ReviewIndexPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviews'], ['currentReviewIdentity']) ||
    value.formatVersion !== 1 ||
    !Array.isArray(value.reviews)
  ) {
    throw new ReviewingStateProblem();
  }
  const reviews = value.reviews.map(parseReviewIndexEntry);
  const legacyActive = reviews.filter(entry => entry.status === 'active');
  const currentReviewIdentity =
    value.currentReviewIdentity === undefined
      ? legacyActive[0]?.reviewIdentity
      : recordIdentity(value.currentReviewIdentity, 'rev')
        ? (value.currentReviewIdentity as ReviewIdentity)
        : undefined;
  if (
    reviews.length > MAX_REVIEWS ||
    new Set(reviews.map(entry => entry.reviewIdentity)).size !== reviews.length ||
    legacyActive.length > 1 ||
    reviews.some((entry, index) => {
      if (entry.continuedFromReviewIdentity === undefined) return false;
      const sourceIndex = reviews.findIndex(
        candidate => candidate.reviewIdentity === entry.continuedFromReviewIdentity,
      );
      return sourceIndex < 0 || sourceIndex >= index;
    }) ||
    (value.currentReviewIdentity !== undefined && currentReviewIdentity === undefined) ||
    (currentReviewIdentity !== undefined &&
      !reviews.some(
        entry =>
          entry.reviewIdentity === currentReviewIdentity &&
          entry.status !== 'completed' &&
          entry.status !== 'cancelled',
      ))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    ...(currentReviewIdentity === undefined ? {} : { currentReviewIdentity }),
    reviews,
  };
}

export function parseReviewBasisCommit(value: unknown): ReviewBasisCommit {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'objectFormat', 'objectIdentity', 'abbreviatedObjectIdentity', 'subject']) ||
    value.kind !== 'commit' ||
    !memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) ||
    typeof value.objectIdentity !== 'string' ||
    !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value.objectIdentity) ||
    (value.objectFormat === 'sha1' && value.objectIdentity.length !== 40) ||
    (value.objectFormat === 'sha256' && value.objectIdentity.length !== 64) ||
    typeof value.abbreviatedObjectIdentity !== 'string' ||
    !/^[0-9a-f]{7,64}$/u.test(value.abbreviatedObjectIdentity) ||
    !value.objectIdentity.startsWith(value.abbreviatedObjectIdentity) ||
    typeof value.subject !== 'string' ||
    Buffer.byteLength(value.subject) > 16 * 1024 ||
    value.subject.includes('\u0000')
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'commit',
    objectFormat: value.objectFormat,
    objectIdentity: value.objectIdentity,
    abbreviatedObjectIdentity: value.abbreviatedObjectIdentity,
    subject: value.subject,
  };
}
