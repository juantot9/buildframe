import { encodeBytesBase64 } from '../bytesBase64.js';
import {
  reviewGitCommitBasisIdentity,
  type ReviewBasisCommit,
  type ReviewBasisIdentity,
  type ReviewBasisPayload,
  type ReviewIdentity,
  type ReviewIndexEntry,
  type ReviewQuestionAnchor,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
} from '../reviewing/index.js';
import type {
  CurrentChangeSide,
  CurrentChangedFile,
  EvidenceContentLimitation,
  ReviewCommitGraphRow,
  ReviewComparisonSelection,
} from '../workspaceEvidence/index.js';
import type {
  ReviewBasisItem,
  ReviewGateBasis,
  ReviewProjectedAction,
  ReviewProjectedActionKind,
  ReviewProjectedBlocker,
  ReviewProjectedContentStatus,
  ReviewProjectedFile,
  ReviewProjectedFileSide,
  ReviewProjectedQuestionTarget,
  ReviewProjectedTextWindow,
  ReviewProjectionBlockerCode,
  ReviewProjectionHeader,
  WorkspaceHomeReviewItem,
} from './contracts.js';
import { ProjectionRecordsInvalid } from './internalTypes.js';
import { MAX_QUESTION_BODY_PREVIEW_BYTES } from './limits.js';

export function contentStatus(side: CurrentChangeSide): ReviewProjectedContentStatus {
  if (side.contentAvailability === 'captured') return 'available';
  const limitation: EvidenceContentLimitation | undefined = side.contentLimitation;
  if (
    limitation === 'aggregate-capture-limit' ||
    limitation === 'file-capture-limit' ||
    limitation === 'aggregate-verification-limit' ||
    limitation === 'file-verification-limit'
  ) {
    return 'too-large';
  }
  if (limitation === 'unsupported-file-kind' || limitation === 'unsupported-content-filter') {
    return 'unsupported';
  }
  return 'unavailable';
}

export function projectedSide(side: CurrentChangeSide): ReviewProjectedFileSide {
  return {
    path: side.path.display,
    pathBytesBase64: side.path.bytesBase64,
    kind: side.kind === 'gitlink' ? 'nested-workspace' : side.kind,
    byteLength: side.byteLength,
    content: contentStatus(side),
  };
}

export function projectedFile(file: CurrentChangedFile): ReviewProjectedFile {
  const selected = file.newSide ?? file.oldSide;
  if (selected === undefined) throw new ProjectionRecordsInvalid();
  return {
    fileIdentity: file.fileIdentity,
    status: file.status,
    displayPath: selected.path.display,
    ...(file.oldSide === undefined ? {} : { oldSide: projectedSide(file.oldSide) }),
    ...(file.newSide === undefined ? {} : { newSide: projectedSide(file.newSide) }),
    ...(file.scopeMembership === undefined
      ? {}
      : {
          scopeMembership: file.scopeMembership.map(membership => ({
            selectionPath: membership.selectionPath.display,
            selectionPathBytesBase64: membership.selectionPath.bytesBase64,
            selectionKind: membership.selectionKind,
            inclusion: membership.inclusion,
            matchedSides: membership.matchedSides,
          })),
        }),
  };
}

export function fileMatchesComparisonScope(
  file: CurrentChangedFile,
  selection: ReviewComparisonSelection | undefined,
): boolean {
  const scope = selection?.scope;
  if (scope === undefined) return file.scopeMembership === undefined;
  if (file.scopeMembership === undefined || file.scopeMembership.length === 0) {
    return false;
  }
  const entries = new Map(scope.entries.map(entry => [entry.pathBytesBase64, entry.inclusion]));
  return file.scopeMembership.every(membership => {
    const inclusion = entries.get(membership.selectionPath.bytesBase64);
    return inclusion !== undefined && (membership.inclusion === 'ordinary' || inclusion === 'include-ignored');
  });
}

export function projectedReviewBasis(payload: ReviewBasisPayload, depth: number): ReviewBasisItem {
  const parent = payload.kind === 'live' ? {} : { parentReviewBasisIdentity: payload.parentReviewBasisIdentity };
  if (payload.kind === 'live') {
    return {
      reviewBasisIdentity: payload.reviewBasisIdentity,
      depth,
      kind: 'live',
      source: { kind: 'live-working-diff' },
      capture: { status: 'live' },
    };
  }
  if (payload.kind === 'git-commit') {
    return {
      reviewBasisIdentity: payload.reviewBasisIdentity,
      ...parent,
      depth,
      kind: 'git-commit',
      source: { kind: 'git-commit', commit: payload.commit },
      capture: { status: 'captured', reviewSnapshotIdentity: payload.reviewSnapshotIdentity },
    };
  }
  if (payload.kind === 'saved-review-point') {
    return {
      reviewBasisIdentity: payload.reviewBasisIdentity,
      ...parent,
      depth,
      kind: 'saved-review-point',
      source: { kind: 'review-snapshot', reviewSnapshotIdentity: payload.reviewSnapshotIdentity },
      capture: { status: 'captured', reviewSnapshotIdentity: payload.reviewSnapshotIdentity },
    };
  }
  return {
    reviewBasisIdentity: payload.reviewBasisIdentity,
    ...parent,
    depth,
    kind: 'change-event',
    source: {
      kind: 'changes-observed-after-response',
      responseIdentity: payload.provenance.responseIdentity,
      label: 'changes observed after this Response',
    },
    capture: { status: 'captured', reviewSnapshotIdentity: payload.reviewSnapshotIdentity },
  };
}

export function observedGitCommit(
  reviewIdentity: ReviewIdentity,
  liveReviewBasisIdentity: ReviewBasisIdentity,
  row: Extract<ReviewCommitGraphRow, { readonly kind: 'commit' }>,
): ReviewBasisItem {
  const objectFormat =
    row.objectIdentity.length === 40 ? 'sha1' : row.objectIdentity.length === 64 ? 'sha256' : 'unknown';
  const commit: ReviewBasisCommit = {
    kind: 'commit',
    objectFormat,
    objectIdentity: row.objectIdentity,
    abbreviatedObjectIdentity: row.abbreviatedObjectIdentity,
    subject: row.subject,
  };
  return {
    reviewBasisIdentity: reviewGitCommitBasisIdentity(reviewIdentity, row.objectIdentity),
    parentReviewBasisIdentity: liveReviewBasisIdentity,
    depth: 1,
    kind: 'git-commit',
    source: { kind: 'git-commit', commit },
    capture: { status: 'capture-on-open' },
  };
}

export function questionTarget(anchor: ReviewQuestionAnchor): ReviewProjectedQuestionTarget {
  if (anchor.kind === 'review.whole-file') {
    return {
      kind: 'review.whole-file',
      reviewSnapshotIdentity: anchor.reviewSnapshotIdentity,
      fileIdentity: anchor.fileIdentity,
      side: anchor.side,
      scope: 'file',
      ...(anchor.fileAbsolute === undefined ? {} : { fileAbsolute: anchor.fileAbsolute }),
      content: anchor.content,
    };
  }
  return {
    kind: 'review.diff-line',
    reviewSnapshotIdentity: anchor.reviewSnapshotIdentity,
    fileIdentity: anchor.fileIdentity,
    side: anchor.side,
    line: anchor.line,
    ...(anchor.fileAbsolute === undefined ? {} : { fileAbsolute: anchor.fileAbsolute }),
    ...(anchor.rowIdentity === undefined || anchor.rowAbsolute === undefined
      ? {}
      : {
          rowIdentity: anchor.rowIdentity,
          rowAbsolute: anchor.rowAbsolute,
        }),
  };
}

export function textPreview(
  body: string,
  maximumBytes: number = MAX_QUESTION_BODY_PREVIEW_BYTES,
): ReviewProjectedTextWindow {
  const bytes = Buffer.from(body, 'utf8');
  const shown = bytes.subarray(0, maximumBytes);
  return {
    encoding: 'utf8',
    bytesBase64: encodeBytesBase64(shown),
    byteLength: shown.byteLength,
    totalByteLength: bytes.byteLength,
    truncated: shown.byteLength < bytes.byteLength,
  };
}

export function completeText(body: string): ReviewProjectedTextWindow & {
  readonly truncated: false;
} {
  const bytes = Buffer.from(body, 'utf8');
  return {
    encoding: 'utf8',
    bytesBase64: encodeBytesBase64(bytes),
    byteLength: bytes.byteLength,
    totalByteLength: bytes.byteLength,
    truncated: false,
  };
}

export function gateBasis(
  kind: ReviewProjectedActionKind,
  stateVersion: number,
  entry: ReviewIndexEntry | undefined,
  targetIdentities: readonly string[] = [],
): ReviewGateBasis {
  return {
    action: kind,
    expectedStateVersion: stateVersion,
    ...(entry === undefined ? {} : { reviewIdentity: entry.reviewIdentity }),
    ...(entry === undefined ? {} : { reviewSnapshotIdentity: entry.reviewSnapshotIdentity }),
    targetIdentities: [...targetIdentities],
  };
}

export function projectedAction(
  kind: ReviewProjectedActionKind,
  stateVersion: number,
  entry: ReviewIndexEntry | undefined,
  blockers: readonly ReviewProjectedBlocker[],
  targetIdentities: readonly string[] = [],
): ReviewProjectedAction {
  return {
    kind,
    availability: blockers.length === 0 ? 'direct' : 'blocked',
    gateBasis: gateBasis(kind, stateVersion, entry, targetIdentities),
    blockers,
  };
}

export function blocker(
  code: ReviewProjectionBlockerCode,
  identities: readonly string[],
  correctiveAction: ReviewProjectedBlocker['correctiveAction'],
): ReviewProjectedBlocker {
  return { code, identities: [...identities], correctiveAction };
}

export function currentReviewBlockers(
  entry: ReviewIndexEntry,
  currentReviewIdentity: ReviewIdentity | undefined,
): readonly ReviewProjectedBlocker[] {
  return entry.reviewIdentity === currentReviewIdentity
    ? []
    : [blocker('review-is-not-current', [entry.reviewIdentity], 'start-new-review')];
}

export function snapshotBlockers(
  entry: ReviewIndexEntry,
  snapshotStatus: ReviewProjectionHeader['snapshotStatus'],
): readonly ReviewProjectedBlocker[] {
  if (snapshotStatus === 'current') return [];
  return [
    blocker(
      snapshotStatus === 'stale' ? 'review-snapshot-changed' : 'review-snapshot-unavailable',
      [entry.reviewSnapshotIdentity],
      snapshotStatus === 'stale' ? 'return-to-review' : 'retry-inspection',
    ),
  ];
}

/** Direct-retained Reviews have no Finish ceremony, so no Review action is projected. */
export function reviewActions(
  _entry?: ReviewIndexEntry,
  _stateVersion?: number,
  _snapshotStatus?: ReviewProjectionHeader['snapshotStatus'],
): readonly ReviewProjectedAction[] {
  return [];
}

/** Questions continue without disposition, so no Question action is projected. */
export function questionActions(
  _entry?: ReviewIndexEntry,
  _stateVersion?: number,
  _itemIdentity?: ReviewQuestionDraftIdentity | ReviewQuestionIdentity,
  _kind?: 'draft' | 'question',
): readonly ReviewProjectedAction[] {
  return [];
}

export function homeItem(
  entry: ReviewIndexEntry,
  totalFiles: number,
  currentReviewIdentity: ReviewIdentity | undefined,
): WorkspaceHomeReviewItem {
  const current = new Map(entry.currentDispositions.map(item => [item.questionIdentity, item]));
  const recordedAt = entry.completedAt ?? entry.cancelledAt ?? entry.startedAt;
  return {
    reviewIdentity: entry.reviewIdentity,
    reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
    retention: entry.reviewIdentity === currentReviewIdentity ? 'current' : 'previous',
    ...(entry.continuedFromReviewIdentity === undefined
      ? {}
      : { continuedFromReviewIdentity: entry.continuedFromReviewIdentity }),
    ...(entry.status === 'completed' || entry.status === 'cancelled' ? { historicalOutcome: entry.status } : {}),
    ...(recordedAt === undefined ? {} : { recordedAt }),
    totalFiles,
    messages: entry.messageHistory?.messages.length ?? 0,
    openDrafts: entry.openDraftIdentities.length,
    questions: entry.questionIdentities.length,
    questionsNeedingJudgment: entry.questionIdentities.filter(identity => !current.has(identity)).length,
    openQuestions: entry.questionIdentities.filter(identity => current.get(identity)?.disposition === 'open').length,
  };
}
