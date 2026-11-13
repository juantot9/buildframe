import type {
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from '../legacyReviewImport/index.js';
import { hasOnlyKeys, isRecord, safeVersion } from '../recordCodec.js';
import {
  normalizeReviewComparisonSelection,
  reviewComparisonUsesExactResolution,
  type ReviewComparisonResolutionIdentity,
} from '../workspaceEvidence/index.js';
import {
  normalizeReviewContextContributionInput,
  normalizeReviewContextSelectionChange,
  questionBody,
} from './context.js';
import type { ReviewAnchorInput, ReviewQuestionDisposition, ReviewingCommand } from './contracts.js';
import {
  reviewGitCommitBasisIdentity,
  type ReviewBasisIdentity,
  type ReviewIdentity,
  type ReviewMessageIdentity,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
  type ReviewResponseIdentity,
  type ReviewSnapshotIdentity,
} from './identities.js';
import { DIFF_ROW_ID_PATTERN, FILE_ID_PATTERN, MAX_BATCH_QUESTIONS } from './limits.js';
import { boundedIdentity, recordIdentity } from './utils.js';

export function normalizeAnchor(value: unknown): ReviewAnchorInput {
  if (!isRecord(value)) {
    throw new TypeError('Invalid exact Review Question Anchor');
  }
  if (value.kind === 'review.whole-file') {
    if (
      !hasOnlyKeys(value, ['kind', 'fileIdentity', 'side'], ['fileAbsolute']) ||
      typeof value.fileIdentity !== 'string' ||
      !FILE_ID_PATTERN.test(value.fileIdentity) ||
      (value.side !== 'old' && value.side !== 'new') ||
      (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute))
    ) {
      throw new TypeError('Invalid exact Review Question Anchor');
    }
    return {
      kind: 'review.whole-file',
      fileIdentity: value.fileIdentity,
      side: value.side,
      ...(value.fileAbsolute === undefined ? {} : { fileAbsolute: value.fileAbsolute }),
    };
  }
  const hasRowCoordinates = value.rowIdentity !== undefined || value.rowAbsolute !== undefined;
  if (
    !hasOnlyKeys(value, ['kind', 'fileIdentity', 'side', 'line'], ['fileAbsolute', 'rowIdentity', 'rowAbsolute']) ||
    value.kind !== 'review.diff-line' ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    (value.side !== 'old' && value.side !== 'new') ||
    !safeVersion(value.line, false) ||
    (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute)) ||
    (hasRowCoordinates &&
      (typeof value.rowIdentity !== 'string' ||
        !DIFF_ROW_ID_PATTERN.test(value.rowIdentity) ||
        !safeVersion(value.rowAbsolute)))
  ) {
    throw new TypeError('Invalid exact Review Question Anchor');
  }
  return {
    kind: 'review.diff-line',
    fileIdentity: value.fileIdentity,
    side: value.side,
    line: value.line,
    ...(value.fileAbsolute === undefined ? {} : { fileAbsolute: value.fileAbsolute }),
    ...(hasRowCoordinates
      ? {
          rowIdentity: value.rowIdentity as string,
          rowAbsolute: value.rowAbsolute as number,
        }
      : {}),
  };
}

export function normalizeCommand(value: unknown): ReviewingCommand {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Unknown Workspace command');
  }
  if (!boundedIdentity(value.commandIdentity)) {
    throw new TypeError('commandIdentity must be a bounded stable identity');
  }
  if (!safeVersion(value.expectedStateVersion)) {
    throw new TypeError('expectedStateVersion must be a safe State version');
  }

  const base = {
    commandIdentity: value.commandIdentity,
    expectedStateVersion: value.expectedStateVersion,
  };

  if (value.kind === 'review.current-changes.start') {
    if (!hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion'])) {
      throw new TypeError('Invalid Review current changes command');
    }
    return { kind: value.kind, ...base };
  }

  if (value.kind === 'review.comparison.start') {
    const selection = normalizeReviewComparisonSelection(value.selection);
    const exactResolution = reviewComparisonUsesExactResolution(selection);
    if (
      !hasOnlyKeys(
        value,
        [
          'kind',
          'commandIdentity',
          'expectedStateVersion',
          'selection',
          'expectedBasisObjectIdentity',
          'expectedComparedObjectIdentity',
        ],
        ['expectedComparisonResolutionIdentity'],
      ) ||
      (value.expectedBasisObjectIdentity !== null &&
        (typeof value.expectedBasisObjectIdentity !== 'string' ||
          !/^[0-9a-f]{40,64}$/u.test(value.expectedBasisObjectIdentity))) ||
      typeof value.expectedComparedObjectIdentity !== 'string' ||
      !/^[0-9a-f]{40,64}$/u.test(value.expectedComparedObjectIdentity) ||
      (exactResolution
        ? typeof value.expectedComparisonResolutionIdentity !== 'string' ||
          !/^rcp_[0-9a-f]{64}$/u.test(value.expectedComparisonResolutionIdentity)
        : value.expectedComparisonResolutionIdentity !== undefined)
    ) {
      throw new TypeError('Invalid start Review comparison command');
    }
    return {
      kind: value.kind,
      ...base,
      selection,
      expectedBasisObjectIdentity: value.expectedBasisObjectIdentity,
      expectedComparedObjectIdentity: value.expectedComparedObjectIdentity,
      ...(value.expectedComparisonResolutionIdentity === undefined
        ? {}
        : {
            expectedComparisonResolutionIdentity:
              value.expectedComparisonResolutionIdentity as ReviewComparisonResolutionIdentity,
          }),
    };
  }

  if (value.kind === 'review.change-set.refresh') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'expectedReviewSnapshotIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.expectedReviewSnapshotIdentity, 'rsn')
    ) {
      throw new TypeError('Invalid Review change-set refresh command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedReviewSnapshotIdentity: value.expectedReviewSnapshotIdentity as ReviewSnapshotIdentity,
    };
  }

  if (value.kind === 'review.context.refresh') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'expectedReviewSnapshotIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.expectedReviewSnapshotIdentity, 'rsn')
    ) {
      throw new TypeError('Invalid Review context refresh command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedReviewSnapshotIdentity: value.expectedReviewSnapshotIdentity as ReviewSnapshotIdentity,
    };
  }

  if (value.kind === 'review.basis.git-commit.capture') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'reviewBasisIdentity',
        'commitObjectIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.reviewBasisIdentity, 'rbs') ||
      typeof value.commitObjectIdentity !== 'string' ||
      !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value.commitObjectIdentity) ||
      value.reviewBasisIdentity !==
        reviewGitCommitBasisIdentity(value.reviewIdentity as ReviewIdentity, value.commitObjectIdentity)
    ) {
      throw new TypeError('Invalid Git Review Basis capture command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBasisIdentity: value.reviewBasisIdentity as ReviewBasisIdentity,
      commitObjectIdentity: value.commitObjectIdentity,
    };
  }

  if (value.kind === 'review.basis.fork') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'parentReviewBasisIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.parentReviewBasisIdentity, 'rbs')
    ) {
      throw new TypeError('Invalid explicit Review Basis fork command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      parentReviewBasisIdentity: value.parentReviewBasisIdentity as ReviewBasisIdentity,
    };
  }

  if (value.kind === 'review.change-observation.record') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'reviewMessageIdentity',
        'responseIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
      !recordIdentity(value.responseIdentity, 'rrp')
    ) {
      throw new TypeError('Invalid Review change observation command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
      responseIdentity: value.responseIdentity as ReviewResponseIdentity,
    };
  }

  if (value.kind === 'review.context-selection.change') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'expectedSelectionRevision',
        'change',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !safeVersion(value.expectedSelectionRevision)
    ) {
      throw new TypeError('Invalid Review context selection command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedSelectionRevision: value.expectedSelectionRevision,
      change: normalizeReviewContextSelectionChange(value.change),
    };
  }

  if (value.kind === 'review.context-contribution.add') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'expectedSelectionRevision',
        'contribution',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !safeVersion(value.expectedSelectionRevision)
    ) {
      throw new TypeError('Invalid Review context contribution command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedSelectionRevision: value.expectedSelectionRevision,
      contribution: normalizeReviewContextContributionInput(value.contribution),
    };
  }

  if (value.kind === 'review.comparison.continue-live') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'expectedReviewSnapshotIdentity',
        'expectedSavedEndpointObjectIdentity',
        'expectedCurrentHeadObjectIdentity',
        'expectedLiveChangesIdentity',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.expectedReviewSnapshotIdentity, 'rsn') ||
      typeof value.expectedSavedEndpointObjectIdentity !== 'string' ||
      !/^[0-9a-f]{40,64}$/u.test(value.expectedSavedEndpointObjectIdentity) ||
      (value.expectedCurrentHeadObjectIdentity !== null &&
        (typeof value.expectedCurrentHeadObjectIdentity !== 'string' ||
          !/^[0-9a-f]{40,64}$/u.test(value.expectedCurrentHeadObjectIdentity))) ||
      typeof value.expectedLiveChangesIdentity !== 'string' ||
      !/^lch_[0-9a-f]{64}$/u.test(value.expectedLiveChangesIdentity)
    ) {
      throw new TypeError('Invalid continue Review comparison command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedReviewSnapshotIdentity: value.expectedReviewSnapshotIdentity as ReviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: value.expectedSavedEndpointObjectIdentity,
      expectedCurrentHeadObjectIdentity: value.expectedCurrentHeadObjectIdentity,
      expectedLiveChangesIdentity: value.expectedLiveChangesIdentity,
    };
  }

  if (value.kind === 'review.question-draft.create') {
    if (
      !hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'reviewIdentity', 'anchor', 'body']) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !questionBody(value.body)
    ) {
      throw new TypeError('Invalid create Review Question Draft command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      anchor: normalizeAnchor(value.anchor),
      body: value.body,
    };
  }

  if (value.kind === 'review.legacy-question-candidate.promote') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'sourceOccurrenceIdentity',
        'candidateIdentity',
        'expectedSourceDigest',
        'reviewIdentity',
        'expectedReviewSnapshotIdentity',
        'intent',
        'anchor',
      ]) ||
      !recordIdentity(value.sourceOccurrenceIdentity, 'lso') ||
      !recordIdentity(value.candidateIdentity, 'lgc') ||
      typeof value.expectedSourceDigest !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.expectedSourceDigest) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.expectedReviewSnapshotIdentity, 'rsn') ||
      value.intent !== 'question'
    ) {
      throw new TypeError('Invalid legacy Question candidate promotion command');
    }
    return {
      kind: value.kind,
      ...base,
      sourceOccurrenceIdentity: value.sourceOccurrenceIdentity as LegacyReviewSourceOccurrenceIdentity,
      candidateIdentity: value.candidateIdentity as LegacyReviewQueueCandidateIdentity,
      expectedSourceDigest: value.expectedSourceDigest,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      expectedReviewSnapshotIdentity: value.expectedReviewSnapshotIdentity as ReviewSnapshotIdentity,
      intent: 'question',
      anchor: normalizeAnchor(value.anchor),
    };
  }

  if (value.kind === 'review.question-draft.revise') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'draftIdentity',
        'expectedDraftRevision',
        'anchor',
        'body',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.draftIdentity, 'qdr') ||
      !safeVersion(value.expectedDraftRevision, false) ||
      !questionBody(value.body)
    ) {
      throw new TypeError('Invalid revise Review Question Draft command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      draftIdentity: value.draftIdentity as ReviewQuestionDraftIdentity,
      expectedDraftRevision: value.expectedDraftRevision,
      anchor: normalizeAnchor(value.anchor),
      body: value.body,
    };
  }

  if (value.kind === 'review.question-batch.commit') {
    if (
      !hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'reviewIdentity', 'draftIdentities']) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !Array.isArray(value.draftIdentities) ||
      value.draftIdentities.length > MAX_BATCH_QUESTIONS ||
      !value.draftIdentities.every(identity => recordIdentity(identity, 'qdr')) ||
      new Set(value.draftIdentities).size !== value.draftIdentities.length
    ) {
      throw new TypeError('Invalid commit Review Question Batch command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      draftIdentities: [...value.draftIdentities] as ReviewQuestionDraftIdentity[],
    };
  }

  if (value.kind === 'review.question.disposition.set') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'questionIdentity',
        'disposition',
      ]) ||
      !recordIdentity(value.reviewIdentity, 'rev') ||
      !recordIdentity(value.questionIdentity, 'qst') ||
      !['answered', 'open', 'dismissed'].includes(String(value.disposition))
    ) {
      throw new TypeError('Invalid human Review Question disposition command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
      disposition: value.disposition as ReviewQuestionDisposition,
    };
  }

  if (value.kind === 'review.complete') {
    if (
      !hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'reviewIdentity']) ||
      !recordIdentity(value.reviewIdentity, 'rev')
    ) {
      throw new TypeError('Invalid complete Review command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
    };
  }

  if (value.kind === 'review.cancel') {
    if (
      !hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'reviewIdentity']) ||
      !recordIdentity(value.reviewIdentity, 'rev')
    ) {
      throw new TypeError('Invalid cancel Review command');
    }
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
    };
  }

  throw new TypeError('Unknown Workspace command');
}

export function normalizedCommand(command: ReviewingCommand): string {
  return JSON.stringify(command);
}
