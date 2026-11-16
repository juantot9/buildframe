import {
  REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES,
  REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
} from '../reviewing/index.js';
import { normalizeReviewComparisonSelection } from '../workspaceEvidence/index.js';
import type {
  ReviewBasesViewRequest,
  ReviewCommandResultViewRequest,
  ReviewContextContributionContentViewRequest,
  ReviewContextSelectionViewRequest,
  ReviewContinuationViewRequest,
  ReviewDiffViewRequest,
  ReviewLiveDiffViewRequest,
  ReviewLiveFileContentViewRequest,
  ReviewLiveFilesViewRequest,
  ReviewLiveManifestViewRequest,
  ReviewManifestViewRequest,
  ReviewMessageBodyViewRequest,
  ReviewHistoryPoint,
  ReviewHistoryViewRequest,
  ReviewStepChangesDiffViewRequest,
  ReviewStepChangesViewRequest,
  ReviewMessageOriginViewRequest,
  ReviewMessagesViewRequest,
  ReviewQuestionBodyViewRequest,
  ReviewQuestionLocationViewRequest,
  ReviewQuestionsViewRequest,
  ReviewSearchPreviewViewRequest,
  ReviewSearchViewRequest,
  ReviewSnapshotContextContentViewRequest,
  ReviewSnapshotContextViewRequest,
  ReviewVersionsViewRequest,
  WorkspaceHomeViewRequest,
  WorkspaceProjectionViewRequest,
} from './contracts.js';
import {
  FILE_ID_PATTERN,
  LIVE_CHANGES_ID_PATTERN,
  MAX_HOME_REVIEWS,
  MAX_QUESTION_BODY_WINDOW_BYTES,
  MAX_QUESTION_ITEMS,
  MAX_REVIEW_BASIS_ITEMS,
  MAX_REVIEW_CONTEXT_CANDIDATES,
  MAX_REVIEW_MESSAGE_BODY_WINDOW_BYTES,
  MAX_REVIEW_MESSAGE_ITEMS,
  MAX_REVIEW_SEARCH_QUERY_BYTES,
  MAX_REVIEW_SEARCH_RESULTS,
  MAX_REVIEW_VERSION_ITEMS,
  QUESTION_ITEM_ID_PATTERN,
  REVIEW_BASIS_ID_PATTERN,
  REVIEW_ID_PATTERN,
  REVIEW_MESSAGE_ID_PATTERN,
  REVIEW_SNAPSHOT_ID_PATTERN,
} from './limits.js';
import {
  assertWindow,
  boundedIdentity,
  safeInteger,
} from './utils.js'; /** Shared kind-family pre-check: every Review-scoped request needs a bounded Review identity. */
function assertReviewIdentity(request: Record<string, unknown>): void {
  if (typeof request.reviewIdentity !== 'string' || !REVIEW_ID_PATTERN.test(request.reviewIdentity)) {
    throw new TypeError('Invalid Review identity');
  }
}

function normalizeHomeRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertWindow(request.offset as number, request.limit as number, MAX_HOME_REVIEWS, 'Home');
  return value as WorkspaceHomeViewRequest;
}
function normalizeManifestRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    request.reviewSnapshotIdentity !== undefined &&
    (typeof request.reviewSnapshotIdentity !== 'string' ||
      !REVIEW_SNAPSHOT_ID_PATTERN.test(request.reviewSnapshotIdentity))
  ) {
    throw new TypeError('Invalid Review Snapshot identity');
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_MANIFEST_WINDOW_FILES, 'Review manifest');
  return value as ReviewManifestViewRequest;
}
function normalizeDiffRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    (request.reviewSnapshotIdentity !== undefined &&
      (typeof request.reviewSnapshotIdentity !== 'string' ||
        !REVIEW_SNAPSHOT_ID_PATTERN.test(request.reviewSnapshotIdentity))) ||
    typeof request.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(request.fileIdentity) ||
    (request.anchorLine !== undefined && !safeInteger(request.anchorLine, false))
  ) {
    throw new TypeError('Invalid Review Snapshot or file identity');
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_DIFF_WINDOW_ROWS, 'Review diff');
  return value as ReviewDiffViewRequest;
}
function normalizeContinuationRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  return value as ReviewContinuationViewRequest;
}
function normalizeLiveManifestRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  assertWindow(
    request.offset as number,
    request.limit as number,
    REVIEW_MANIFEST_WINDOW_FILES,
    'Live Changes manifest',
  );
  return value as ReviewLiveManifestViewRequest;
}
function normalizeLiveDiffRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    typeof request.liveChangesIdentity !== 'string' ||
    !LIVE_CHANGES_ID_PATTERN.test(request.liveChangesIdentity) ||
    typeof request.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(request.fileIdentity) ||
    (request.anchorLine !== undefined && !safeInteger(request.anchorLine, false))
  ) {
    throw new TypeError('Invalid Live Changes identity or file identity');
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_DIFF_WINDOW_ROWS, 'Live Changes diff');
  return value as ReviewLiveDiffViewRequest;
}
function normalizeLiveFilesRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (typeof request.liveChangesIdentity !== 'string' || !LIVE_CHANGES_ID_PATTERN.test(request.liveChangesIdentity)) {
    throw new TypeError('Invalid Live Changes identity');
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_MANIFEST_WINDOW_FILES, 'Live file list');
  return value as ReviewLiveFilesViewRequest;
}
function normalizeLiveFileContentRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    typeof request.liveChangesIdentity !== 'string' ||
    !LIVE_CHANGES_ID_PATTERN.test(request.liveChangesIdentity) ||
    typeof request.pathBytesBase64 !== 'string' ||
    request.pathBytesBase64.length === 0 ||
    Buffer.from(request.pathBytesBase64, 'base64').byteLength === 0 ||
    (request.anchorLine !== undefined && !safeInteger(request.anchorLine, false))
  ) {
    throw new TypeError('Invalid Live file content request');
  }
  return value as ReviewLiveFileContentViewRequest;
}
function normalizeSearchRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    typeof request.query !== 'string' ||
    request.query.length === 0 ||
    request.query.trim() !== request.query ||
    Buffer.byteLength(request.query) > MAX_REVIEW_SEARCH_QUERY_BYTES ||
    /[\u0000-\u001f\u007f]/u.test(request.query)
  ) {
    throw new TypeError('Invalid bounded Review search query');
  }
  assertWindow(request.offset as number, request.limit as number, MAX_REVIEW_SEARCH_RESULTS, 'Review search');
  return value as ReviewSearchViewRequest;
}
function normalizeSearchPreviewRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (typeof request.fileIdentity !== 'string' || !FILE_ID_PATTERN.test(request.fileIdentity)) {
    throw new TypeError('Invalid Review file identity');
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_DIFF_WINDOW_ROWS, 'Review search preview');
  return value as ReviewSearchPreviewViewRequest;
}
function normalizeVersionsRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  assertWindow(request.offset as number, request.limit as number, MAX_REVIEW_VERSION_ITEMS, 'Review Versions');
  return value as ReviewVersionsViewRequest;
}
function normalizeBasesRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  assertWindow(request.offset as number, request.limit as number, MAX_REVIEW_BASIS_ITEMS, 'Review basis tree');
  return value as ReviewBasesViewRequest;
}
function normalizeMessagesRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    request.reviewBasisIdentity !== undefined &&
    (typeof request.reviewBasisIdentity !== 'string' || !REVIEW_BASIS_ID_PATTERN.test(request.reviewBasisIdentity))
  ) {
    throw new TypeError('Invalid Review Basis identity');
  }
  assertWindow(request.offset as number, request.limit as number, MAX_REVIEW_MESSAGE_ITEMS, 'Review Message list');
  return value as ReviewMessagesViewRequest;
}
function normalizeMessageOriginRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    typeof request.reviewMessageIdentity !== 'string' ||
    !REVIEW_MESSAGE_ID_PATTERN.test(request.reviewMessageIdentity)
  ) {
    throw new TypeError('Invalid Review Message identity');
  }
  return value as ReviewMessageOriginViewRequest;
}
function normalizeMessageBodyRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    typeof request.reviewMessageIdentity !== 'string' ||
    !REVIEW_MESSAGE_ID_PATTERN.test(request.reviewMessageIdentity)
  ) {
    throw new TypeError('Invalid Review Message identity');
  }
  if (request.part !== undefined && request.part !== 'message' && request.part !== 'response') {
    throw new TypeError('Invalid Review Message body part');
  }
  assertWindow(
    request.offset as number,
    request.length as number,
    MAX_REVIEW_MESSAGE_BODY_WINDOW_BYTES,
    'Review Message body',
  );
  return value as ReviewMessageBodyViewRequest;
}
function assertHistoryPoint(value: unknown): asserts value is ReviewHistoryPoint {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid history point');
  const point = value as Record<string, unknown>;
  if (point.kind === 'start' || point.kind === 'now') {
    if (Object.keys(point).length !== 1) throw new TypeError('Invalid history point');
    return;
  }
  if (
    (point.kind !== 'sent' && point.kind !== 'answered') ||
    Object.keys(point).length !== 2 ||
    typeof point.reviewMessageIdentity !== 'string' ||
    !REVIEW_MESSAGE_ID_PATTERN.test(point.reviewMessageIdentity)
  ) {
    throw new TypeError('Invalid history point');
  }
}
function normalizeHistoryRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  return value as ReviewHistoryViewRequest;
}
function normalizeStepChangesRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  assertHistoryPoint(request.from);
  assertHistoryPoint(request.to);
  if (request.kind === 'review.step-changes-diff') {
    if (typeof request.fileIdentity !== 'string' || !FILE_ID_PATTERN.test(request.fileIdentity)) {
      throw new TypeError('Invalid file identity');
    }
    assertWindow(request.offset as number, request.limit as number, REVIEW_DIFF_WINDOW_ROWS, 'Review step changes');
    return value as ReviewStepChangesDiffViewRequest;
  }
  assertWindow(request.offset as number, request.limit as number, REVIEW_MANIFEST_WINDOW_FILES, 'Review step changes');
  return value as ReviewStepChangesViewRequest;
}
function normalizeQuestionsRequest(request: Record<string, unknown>, value: unknown): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    request.reviewSnapshotIdentity !== undefined &&
    (typeof request.reviewSnapshotIdentity !== 'string' ||
      !REVIEW_SNAPSHOT_ID_PATTERN.test(request.reviewSnapshotIdentity))
  ) {
    throw new TypeError('Invalid Review Snapshot identity');
  }
  assertWindow(request.offset as number, request.limit as number, MAX_QUESTION_ITEMS, 'Review Question list');
  return value as ReviewQuestionsViewRequest;
}
function normalizeQuestionLocationRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (typeof request.itemIdentity !== 'string' || !QUESTION_ITEM_ID_PATTERN.test(request.itemIdentity)) {
    throw new TypeError('Invalid Review Question item identity');
  }
  return value as ReviewQuestionLocationViewRequest;
}
function normalizeQuestionBodyRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (typeof request.itemIdentity !== 'string' || !QUESTION_ITEM_ID_PATTERN.test(request.itemIdentity)) {
    throw new TypeError('Invalid Review Question item identity');
  }
  assertWindow(
    request.offset as number,
    request.length as number,
    MAX_QUESTION_BODY_WINDOW_BYTES,
    'Review Question body',
  );
  return value as ReviewQuestionBodyViewRequest;
}
function normalizeContextSelectionRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  assertWindow(
    request.offset as number,
    request.limit as number,
    MAX_REVIEW_CONTEXT_CANDIDATES,
    'Review context selection',
  );
  return value as ReviewContextSelectionViewRequest;
}
function normalizeContextContributionContentRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (typeof request.contributionIdentity !== 'string' || !/^rcc_[0-9a-f]{64}$/u.test(request.contributionIdentity)) {
    throw new TypeError('Invalid Review context contribution identity');
  }
  assertWindow(
    request.offset as number,
    request.length as number,
    REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES,
    'Review context contribution content',
  );
  return value as ReviewContextContributionContentViewRequest;
}
function normalizeSnapshotContextRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  assertReviewIdentity(request);
  if (
    request.reviewSnapshotIdentity !== undefined &&
    (typeof request.reviewSnapshotIdentity !== 'string' ||
      !REVIEW_SNAPSHOT_ID_PATTERN.test(request.reviewSnapshotIdentity))
  ) {
    throw new TypeError('Invalid Review Snapshot identity');
  }
  if (request.kind === 'review.snapshot-context') {
    assertWindow(
      request.offset as number,
      request.limit as number,
      REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
      'Review Snapshot context manifest',
    );
    return value as ReviewSnapshotContextViewRequest;
  }
  if (typeof request.contentIdentity !== 'string' || !/^rsx_[0-9a-f]{64}$/u.test(request.contentIdentity)) {
    throw new TypeError('Invalid Review Snapshot context content identity');
  }
  assertWindow(
    request.offset as number,
    request.length as number,
    REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES,
    'Review Snapshot context content',
  );
  return value as ReviewSnapshotContextContentViewRequest;
}
function normalizeCommandResultRequest(
  request: Record<string, unknown>,
  value: unknown,
): WorkspaceProjectionViewRequest {
  if (!boundedIdentity(request.commandIdentity)) {
    throw new TypeError('Invalid command identity');
  }
  return value as ReviewCommandResultViewRequest;
}
function normalizeComparisonPreviewRequest(
  request: Record<string, unknown>,
  _value: unknown,
): WorkspaceProjectionViewRequest {
  return {
    kind: 'review.comparison-preview',
    selection: normalizeReviewComparisonSelection(request.selection),
  };
}
function normalizeCommitGraphRequest(
  request: Record<string, unknown>,
  _value: unknown,
): WorkspaceProjectionViewRequest {
  if (Object.keys(request).length !== 1) {
    throw new TypeError('Invalid Review commit graph request');
  }
  return { kind: 'review.commit-graph' };
}

export function normalizeRequest(value: unknown): WorkspaceProjectionViewRequest {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new TypeError('Unknown Workspace projection request');
  }

  const request = value as Record<string, unknown>;
  switch (request.kind) {
    case 'workspace.home':
      return normalizeHomeRequest(request, value);
    case 'review.manifest':
      return normalizeManifestRequest(request, value);
    case 'review.diff':
      return normalizeDiffRequest(request, value);
    case 'review.continuation':
      return normalizeContinuationRequest(request, value);
    case 'review.live-manifest':
      return normalizeLiveManifestRequest(request, value);
    case 'review.live-diff':
      return normalizeLiveDiffRequest(request, value);
    case 'review.live-files':
      return normalizeLiveFilesRequest(request, value);
    case 'review.live-file-content':
      return normalizeLiveFileContentRequest(request, value);
    case 'review.search':
      return normalizeSearchRequest(request, value);
    case 'review.search-preview':
      return normalizeSearchPreviewRequest(request, value);
    case 'review.versions':
      return normalizeVersionsRequest(request, value);
    case 'review.bases':
      return normalizeBasesRequest(request, value);
    case 'review.messages':
      return normalizeMessagesRequest(request, value);
    case 'review.message-origin':
      return normalizeMessageOriginRequest(request, value);
    case 'review.message-body':
      return normalizeMessageBodyRequest(request, value);
    case 'review.history':
      return normalizeHistoryRequest(request, value);
    case 'review.step-changes':
    case 'review.step-changes-diff':
      return normalizeStepChangesRequest(request, value);
    case 'review.questions':
      return normalizeQuestionsRequest(request, value);
    case 'review.question-location':
      return normalizeQuestionLocationRequest(request, value);
    case 'review.question-body':
      return normalizeQuestionBodyRequest(request, value);
    case 'review.context-selection':
      return normalizeContextSelectionRequest(request, value);
    case 'review.context-contribution-content':
      return normalizeContextContributionContentRequest(request, value);
    case 'review.snapshot-context':
      return normalizeSnapshotContextRequest(request, value);
    case 'review.snapshot-context-content':
      return normalizeSnapshotContextRequest(request, value);
    case 'review.command-result':
      return normalizeCommandResultRequest(request, value);
    case 'review.comparison-preview':
      return normalizeComparisonPreviewRequest(request, value);
    case 'review.commit-graph':
      return normalizeCommitGraphRequest(request, value);
    default:
      throw new TypeError('Unknown Workspace projection request');
  }
}
