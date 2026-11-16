import type { StateRecordWrite } from '../authoritativeState.js';
import type { ReviewIdentity } from '../reviewing/index.js';
import type { HarnessAttachmentIdentity, HarnessHandoffIdentity, HarnessInvocationStatus } from './contracts.js';
import type {
  HarnessAttachmentIndexEntry,
  HarnessHandoffIndexEntry,
  HarnessIndexPayload,
  HarnessInvocationIndexEntry,
  HarnessReviewHistoryPayload,
  UserPullPreparationIndexEntry,
} from './internalTypes.js';
import { MAX_REVIEW_HANDOFFS } from './limits.js';
import { encode, stableIdentity } from './utils.js';

export function immutableRecord(
  recordIdentity: string,
  workflowIdentity: string,
  kind: string,
  payload: unknown,
  content: readonly { readonly role: string; readonly bytes: Uint8Array }[] = [],
): StateRecordWrite {
  return {
    recordClass: 'immutable',
    recordIdentity,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    payload: encode(payload),
    content,
  };
}

export function revisionedRecord(
  recordIdentity: string,
  workflowIdentity: string,
  kind: string,
  expectedRevision: number,
  payload: unknown,
): StateRecordWrite {
  return {
    recordClass: 'revisioned',
    recordIdentity,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    expectedRevision,
    payload: encode(payload),
    content: [],
  };
}

export function emptyIndex(): HarnessIndexPayload {
  return { formatVersion: 4, attachments: [], handoffs: [], invocations: [], preparations: [] };
}

export function reviewHistoryIdentity(reviewIdentity: ReviewIdentity): string {
  return stableIdentity('hrh', reviewIdentity, 'review-harness-history');
}

export function emptyReviewHistory(reviewIdentity: ReviewIdentity): HarnessReviewHistoryPayload {
  return { formatVersion: 1, reviewIdentity, handoffs: [], invocations: [] };
}

const SETTLED_STATUSES: ReadonlySet<HarnessInvocationStatus> = new Set<HarnessInvocationStatus>([
  'rejected',
  'ended-normally',
  'failed',
  'interrupted',
]);

/**
 * The Invocation a Handoff would move to its Review's history with. A User Pull
 * Preparation keeps its Handoff live; an unresolved outcome moves only with its
 * retired Attachment, because it still gates Sends through that Attachment.
 */
function movableInvocation(
  index: HarnessIndexPayload,
  handoff: HarnessHandoffIndexEntry,
  retired: ReadonlySet<HarnessAttachmentIdentity>,
): HarnessInvocationIndexEntry | undefined {
  if (handoff.invocationIdentity === undefined) return undefined;
  if (index.preparations.some(preparation => preparation.handoffIdentity === handoff.handoffIdentity)) return undefined;
  const invocation = index.invocations.find(item => item.invocationIdentity === handoff.invocationIdentity);
  if (invocation === undefined) return undefined;
  if (SETTLED_STATUSES.has(invocation.status)) return invocation;
  return invocation.status === 'unresolved' && retired.has(handoff.attachmentIdentity) ? invocation : undefined;
}

/**
 * Live work the next write keeps. The live-index bounds count only this, so a
 * format-3 index full of settled entries never refuses the Send that converts it.
 */
export function liveWorkCounts(index: HarnessIndexPayload): {
  readonly handoffs: number;
  readonly invocations: number;
} {
  const settled = index.handoffs.filter(handoff => movableInvocation(index, handoff, new Set()) !== undefined).length;
  return { handoffs: index.handoffs.length - settled, invocations: index.invocations.length - settled };
}

/** Reviews whose history the next index write may append to. */
export function reviewsWithMovableInteractions(
  index: HarnessIndexPayload,
  keptAttachmentIdentity?: HarnessAttachmentIdentity,
): readonly ReviewIdentity[] {
  const retirable = new Set(
    keptAttachmentIdentity === undefined
      ? []
      : index.attachments.map(item => item.attachmentIdentity).filter(identity => identity !== keptAttachmentIdentity),
  );
  return [
    ...new Set(
      index.handoffs
        .filter(handoff => movableInvocation(index, handoff, retirable) !== undefined)
        .map(handoff => handoff.reviewIdentity),
    ),
  ];
}

export interface MovedInteractions {
  readonly index: HarnessIndexPayload;
  /** Only the histories changed by this move. */
  readonly histories: ReadonlyMap<ReviewIdentity, HarnessReviewHistoryPayload>;
}

/**
 * Keeps only live work in the index. Settled Handoffs move, in index order, to
 * their Review's history. With `keptAttachmentIdentity`, every other Attachment
 * with nothing awaiting start or active retires, taking its unresolved
 * Handoffs to history. A Review whose history is full keeps the rest live, and
 * an Attachment keeps its place while any of its Handoffs stays live.
 */
export function moveSettledInteractions(
  index: HarnessIndexPayload,
  histories: ReadonlyMap<ReviewIdentity, HarnessReviewHistoryPayload>,
  keptAttachmentIdentity?: HarnessAttachmentIdentity,
): MovedInteractions {
  const retired = new Set<HarnessAttachmentIdentity>();
  if (keptAttachmentIdentity !== undefined) {
    for (const attachment of index.attachments) {
      if (attachment.attachmentIdentity === keptAttachmentIdentity) continue;
      const candidate = new Set([attachment.attachmentIdentity]);
      const own = index.handoffs.filter(handoff => handoff.attachmentIdentity === attachment.attachmentIdentity);
      if (own.every(handoff => movableInvocation(index, handoff, candidate) !== undefined)) {
        retired.add(attachment.attachmentIdentity);
      }
    }
  }
  for (;;) {
    const room = new Map<ReviewIdentity, number>();
    const moved = new Set<HarnessHandoffIdentity>();
    const overflowing = new Set<HarnessAttachmentIdentity>();
    for (const handoff of index.handoffs) {
      if (movableInvocation(index, handoff, retired) === undefined) continue;
      const available =
        room.get(handoff.reviewIdentity) ??
        MAX_REVIEW_HANDOFFS - (histories.get(handoff.reviewIdentity)?.handoffs.length ?? 0);
      if (available <= 0) {
        if (retired.has(handoff.attachmentIdentity)) overflowing.add(handoff.attachmentIdentity);
        room.set(handoff.reviewIdentity, 0);
        continue;
      }
      room.set(handoff.reviewIdentity, available - 1);
      moved.add(handoff.handoffIdentity);
    }
    if (overflowing.size > 0) {
      for (const identity of overflowing) retired.delete(identity);
      continue;
    }
    const nextHistories = new Map<ReviewIdentity, HarnessReviewHistoryPayload>();
    for (const handoff of index.handoffs) {
      if (!moved.has(handoff.handoffIdentity)) continue;
      const invocation = movableInvocation(index, handoff, retired);
      if (invocation === undefined) continue;
      const prior =
        nextHistories.get(handoff.reviewIdentity) ??
        histories.get(handoff.reviewIdentity) ??
        emptyReviewHistory(handoff.reviewIdentity);
      nextHistories.set(handoff.reviewIdentity, {
        ...prior,
        handoffs: [...prior.handoffs, handoff],
        invocations: [...prior.invocations, invocation],
      });
    }
    const movedInvocations = new Set(
      index.handoffs.filter(handoff => moved.has(handoff.handoffIdentity)).map(handoff => handoff.invocationIdentity),
    );
    return {
      index: {
        formatVersion: 4,
        attachments: index.attachments.filter(attachment => !retired.has(attachment.attachmentIdentity)),
        handoffs: index.handoffs.filter(handoff => !moved.has(handoff.handoffIdentity)),
        invocations: index.invocations.filter(invocation => !movedInvocations.has(invocation.invocationIdentity)),
        preparations: index.preparations,
      },
      histories: nextHistories,
    };
  }
}

/**
 * A returning session still owns its earlier unknown turns. Bring only those
 * interactions back into the live index, so every existing consent gate sees
 * them. The caller commits the index and changed histories atomically.
 */
export function restoreUnresolvedInteractions(
  index: HarnessIndexPayload,
  histories: ReadonlyMap<ReviewIdentity, HarnessReviewHistoryPayload>,
  attachmentIdentity: HarnessAttachmentIdentity,
): MovedInteractions {
  const handoffs = [...index.handoffs];
  const invocations = [...index.invocations];
  const changed = new Map<ReviewIdentity, HarnessReviewHistoryPayload>();
  for (const [reviewIdentity, history] of histories) {
    const returning = history.invocations.filter(
      invocation => invocation.attachmentIdentity === attachmentIdentity && invocation.status === 'unresolved',
    );
    if (returning.length === 0) continue;
    const identities = new Set(returning.map(invocation => invocation.invocationIdentity));
    const belongsToReturningSession = (handoff: HarnessHandoffIndexEntry): boolean =>
      handoff.invocationIdentity !== undefined && identities.has(handoff.invocationIdentity);
    handoffs.push(...history.handoffs.filter(belongsToReturningSession));
    invocations.push(...returning);
    changed.set(reviewIdentity, {
      ...history,
      handoffs: history.handoffs.filter(handoff => !belongsToReturningSession(handoff)),
      invocations: history.invocations.filter(invocation => !identities.has(invocation.invocationIdentity)),
    });
  }
  return { index: { ...index, handoffs, invocations }, histories: changed };
}

export function replaceAttachment(
  index: HarnessIndexPayload,
  attachment: HarnessAttachmentIndexEntry,
): HarnessIndexPayload {
  const exists = index.attachments.some(item => item.attachmentIdentity === attachment.attachmentIdentity);
  return {
    ...index,
    attachments: exists
      ? index.attachments.map(item => (item.attachmentIdentity === attachment.attachmentIdentity ? attachment : item))
      : [...index.attachments, attachment],
  };
}

export function replaceInvocation(
  index: HarnessIndexPayload,
  invocation: HarnessInvocationIndexEntry,
): HarnessIndexPayload {
  return {
    ...index,
    invocations: index.invocations.map(item =>
      item.invocationIdentity === invocation.invocationIdentity ? invocation : item,
    ),
  };
}

export function replacePreparation(
  index: HarnessIndexPayload,
  preparation: UserPullPreparationIndexEntry,
): HarnessIndexPayload {
  return {
    ...index,
    preparations: index.preparations.map(item =>
      item.preparationIdentity === preparation.preparationIdentity ? preparation : item,
    ),
  };
}
