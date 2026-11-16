import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { HarnessAttachmentIdentity, HarnessInvocationStatus } from '../../src/harness-interaction/contracts.js';
import type {
  HarnessHandoffIndexEntry,
  HarnessIndexPayload,
  HarnessInvocationIndexEntry,
} from '../../src/harness-interaction/internalTypes.js';
import { MAX_REVIEW_HANDOFFS } from '../../src/harness-interaction/limits.js';
import { parseIndex, parseReviewHistory } from '../../src/harness-interaction/parsing.js';
import {
  emptyReviewHistory,
  liveWorkCounts,
  moveSettledInteractions,
  reviewsWithMovableInteractions,
  restoreUnresolvedInteractions,
} from '../../src/harness-interaction/records.js';
import type { ReviewIdentity } from '../../src/reviewing/index.js';

/** A pattern-valid identity of any branded kind. */
function identity(prefix: string, seed: string): never {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex')}` as never;
}

const REVIEW: ReviewIdentity = identity('rev', 'review');
const OTHER_REVIEW: ReviewIdentity = identity('rev', 'other-review');
const KEPT: HarnessAttachmentIdentity = identity('att', 'kept');
const EARLIER: HarnessAttachmentIdentity = identity('att', 'earlier');

function attachment(attachmentIdentity: HarnessAttachmentIdentity): HarnessIndexPayload['attachments'][number] {
  return {
    attachmentIdentity,
    compatibilityIdentity: identity('hcp', attachmentIdentity),
    establishmentEvidenceIdentity: `establish-${attachmentIdentity}`,
    destination: {
      harnessLabel: 'Scripted Harness',
      sessionLabel: 'scripted session',
      repositoryLabel: 'test repository',
      canonicalCheckout: '/checkout',
    },
    availability: { status: 'available' },
  };
}

function interaction(
  seed: string,
  status: HarnessInvocationStatus,
  attachmentIdentity = KEPT,
  reviewIdentity = REVIEW,
): { readonly handoff: HarnessHandoffIndexEntry; readonly invocation: HarnessInvocationIndexEntry } {
  const handoffIdentity = identity('hho', seed);
  const invocationIdentity = identity('hin', seed);
  return {
    handoff: {
      handoffIdentity,
      reviewIdentity,
      reviewBatchIdentity: identity('rbt', seed),
      attachmentIdentity,
      commitmentReceiptIdentity: identity('hcr', seed),
      capabilitySnapshotIdentity: identity('hcs', seed),
      invocationIdentity,
      disclosure: { fileCount: 0, questionCount: 0, messageCount: 1, byteLength: 1, sha256: '0'.repeat(64) },
    },
    invocation: {
      invocationIdentity,
      handoffIdentity,
      reviewIdentity,
      attachmentIdentity,
      status,
      evidenceIdentities: [],
      interruptionIntentIdentities: [],
    },
  };
}

function indexOf(
  attachments: readonly HarnessAttachmentIdentity[],
  items: readonly ReturnType<typeof interaction>[],
): HarnessIndexPayload {
  return parseIndex({
    formatVersion: 3,
    attachments: attachments.map(attachment),
    handoffs: items.map(item => item.handoff),
    invocations: items.map(item => item.invocation),
    preparations: [],
  });
}

describe('Harness live index', () => {
  it('restores only a returning session’s unresolved work from every Review without changing its outcome', () => {
    const lost = interaction('returning-lost', 'unresolved');
    const otherSession = interaction('other-session-lost', 'unresolved', EARLIER);
    const settled = interaction('returning-settled', 'failed');
    const otherReview = interaction('returning-other-review', 'unresolved', KEPT, OTHER_REVIEW);
    const history = {
      ...emptyReviewHistory(REVIEW),
      handoffs: [lost.handoff, otherSession.handoff, settled.handoff],
      invocations: [lost.invocation, otherSession.invocation, settled.invocation],
    };
    const histories = new Map([
      [REVIEW, history],
      [
        OTHER_REVIEW,
        {
          ...emptyReviewHistory(OTHER_REVIEW),
          handoffs: [otherReview.handoff],
          invocations: [otherReview.invocation],
        },
      ],
    ]);
    const restored = restoreUnresolvedInteractions(indexOf([KEPT], []), histories, KEPT);
    expect(restored.index.handoffs).toEqual([lost.handoff, otherReview.handoff]);
    expect(restored.index.invocations).toEqual([lost.invocation, otherReview.invocation]);
    expect(parseIndex(JSON.parse(JSON.stringify(restored.index)))).toEqual(restored.index);
    expect(restored.histories.get(REVIEW)?.invocations).toEqual([otherSession.invocation, settled.invocation]);
    expect(restored.histories.get(OTHER_REVIEW)).toEqual(emptyReviewHistory(OTHER_REVIEW));
    expect(parseReviewHistory(restored.histories.get(REVIEW), REVIEW)).toEqual(restored.histories.get(REVIEW));
    expect(history.invocations).toEqual([lost.invocation, otherSession.invocation, settled.invocation]);
    const again = restoreUnresolvedInteractions(restored.index, new Map([...histories, ...restored.histories]), KEPT);
    expect(again.index).toEqual(restored.index);
    expect(again.histories.size).toBe(0);
  });

  it('moves settled work to its Review history in index order and keeps unfinished and unresolved work live', () => {
    const items = [
      interaction('ended', 'ended-normally'),
      interaction('active', 'active'),
      interaction('lost', 'unresolved'),
      interaction('refused', 'rejected', KEPT, OTHER_REVIEW),
      interaction('failed', 'failed'),
    ];
    const index = indexOf([KEPT], items);
    expect(liveWorkCounts(index)).toEqual({ handoffs: 2, invocations: 2 });
    expect(reviewsWithMovableInteractions(index)).toEqual([REVIEW, OTHER_REVIEW]);
    const moved = moveSettledInteractions(index, new Map());
    expect(moved.index.formatVersion).toBe(4);
    expect(moved.index.handoffs.map(item => item.handoffIdentity)).toEqual([
      items[1]!.handoff.handoffIdentity,
      items[2]!.handoff.handoffIdentity,
    ]);
    expect(moved.index.invocations.map(item => item.status)).toEqual(['active', 'unresolved']);
    const history = moved.histories.get(REVIEW);
    expect(history?.invocations.map(item => item.status)).toEqual(['ended-normally', 'failed']);
    expect(parseReviewHistory(JSON.parse(JSON.stringify(history)), REVIEW)).toEqual(history);
    expect(moved.histories.get(OTHER_REVIEW)?.invocations.map(item => item.status)).toEqual(['rejected']);
    expect(parseIndex(JSON.parse(JSON.stringify(moved.index)))).toEqual(moved.index);
  });

  it('retires an earlier session with its unresolved work, but never one with a turn in flight', () => {
    const lost = interaction('earlier-lost', 'unresolved', EARLIER);
    const busy: HarnessAttachmentIdentity = identity('att', 'busy');
    const running = interaction('busy-running', 'awaiting-start', busy);
    const moved = moveSettledInteractions(indexOf([EARLIER, busy, KEPT], [lost, running]), new Map(), KEPT);
    expect(moved.index.attachments.map(item => item.attachmentIdentity)).toEqual([busy, KEPT]);
    expect(moved.index.handoffs).toEqual([running.handoff]);
    expect(moved.histories.get(REVIEW)?.invocations).toEqual([lost.invocation]);
  });

  it('keeps work live, and its session with it, when the Review history is full', () => {
    const full = {
      ...emptyReviewHistory(REVIEW),
      handoffs: Array.from({ length: MAX_REVIEW_HANDOFFS }, (_, index) => interaction(`old-${index}`, 'failed')).map(
        item => item.handoff,
      ),
      invocations: Array.from({ length: MAX_REVIEW_HANDOFFS }, (_, index) => interaction(`old-${index}`, 'failed')).map(
        item => item.invocation,
      ),
    };
    const settled = interaction('earlier-settled', 'rejected', EARLIER);
    const elsewhere = interaction('earlier-elsewhere', 'unresolved', EARLIER, OTHER_REVIEW);
    const moved = moveSettledInteractions(
      indexOf([EARLIER, KEPT], [settled, elsewhere]),
      new Map([[REVIEW, full]]),
      KEPT,
    );
    // The earlier session cannot retire while its settled Handoff stays live, so its unresolved one stays too.
    expect(moved.index.attachments.map(item => item.attachmentIdentity)).toEqual([EARLIER, KEPT]);
    expect(moved.index.handoffs).toEqual([settled.handoff, elsewhere.handoff]);
    expect(moved.histories.size).toBe(0);
    expect(() => parseIndex(JSON.parse(JSON.stringify(moved.index)))).not.toThrow();
  });
});
