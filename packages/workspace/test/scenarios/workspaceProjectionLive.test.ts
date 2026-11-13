import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ReviewContinuationView } from '@buildframe/workspace/projection';
import type { CurrentChangesReviewStarted } from '@buildframe/workspace/reviewing';
import { reviewComparisonEndpointIdentity } from '../../src/workspaceEvidence/index.js';
import {
  fixture,
  openObserved,
  started,
  manifest,
  openInternal,
  waitFor,
  git,
  installWorkspaceProjectionHygiene,
} from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

describe('bounded Reviewing Projection live evidence and continuation', () => {
  it('bounds Snapshot evidence identity hints and falls back after eviction', async () => {
    const created = await fixture();
    const observedSizes: number[] = [];
    const owner = await openObserved(created.checkout, size => observedSizes.push(size));
    const reviews: CurrentChangesReviewStarted[] = [];
    let expectedStateVersion = 0;
    for (let index = 0; index < 6; index += 1) {
      const review = started(
        await owner.workspace.execute({
          kind: 'review.current-changes.start',
          commandIdentity: `bounded-evidence-hint-review-${index}`,
          expectedStateVersion,
        }),
      );
      reviews.push(review);
      expectedStateVersion = review.stateVersion;
    }

    for (const review of reviews) {
      const view = manifest(
        await owner.workspace.read({
          kind: 'review.manifest',
          reviewIdentity: review.reviewIdentity,
          offset: 0,
          limit: 1,
        }),
      );
      expect(view.header.snapshotStatus).toBe('current');
    }
    expect(observedSizes).toEqual([1, 2, 3, 4, 4, 4]);

    const evicted = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: reviews[0]!.reviewIdentity,
        offset: 0,
        limit: 1,
      }),
    );
    expect(evicted.header.snapshotStatus).toBe('current');
    expect(observedSizes).toEqual([1, 2, 3, 4, 4, 4, 4]);
  });

  it('verifies and coalesces hint-driven same-version Live Changes', async () => {
    const created = await fixture();
    let invalidate: (() => void) | undefined;
    const owner = await openInternal(created.checkout, {
      liveFallbackVerificationMilliseconds: 50,
      subscribeToEvidenceInvalidation(onInvalidate) {
        invalidate = onInvalidate;
        return () => {
          invalidate = undefined;
        };
      },
    });
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'live-projection-start',
        expectedStateVersion: 0,
      }),
    );
    const initial = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (initial.status !== 'available') {
      throw new Error('Initial Live Changes unavailable');
    }
    expect(initial).toMatchObject({
      stateVersion: review.stateVersion,
      latestReviewSnapshotIdentity: review.reviewSnapshotIdentity,
      matchesLatestSnapshot: true,
      manifest: { totalFiles: 1 },
    });
    const fileIdentity = initial.manifest.files[0]!.fileIdentity;
    const initialDiff = await owner.workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: initial.liveChangesIdentity,
      fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(initialDiff).toMatchObject({
      kind: 'review.live-diff',
      status: 'available',
      stateVersion: review.stateVersion,
      matchesLatestSnapshot: true,
    });

    const updates: Array<typeof initial> = [];
    const statuses: string[] = [];
    const unsubscribe = owner.workspace.subscribe(
      {
        kind: 'review.live-manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      },
      update => {
        statuses.push(`${update.kind}:${update.status}`);
        if (update.kind === 'review.live-manifest' && update.status === 'available') {
          updates.push(update);
        }
      },
    );
    await waitFor(() => updates.length === 1, 'initial Live Changes subscription update');
    await writeFile(path.join(created.checkout, 'review-000.txt'), 'live successor\nshared\n');
    invalidate?.();
    invalidate?.();
    invalidate?.();
    await waitFor(() => updates.length === 2, 'hint-driven Live Changes successor update');
    const successor = updates[1]!;
    expect(successor.stateVersion).toBe(review.stateVersion);
    expect(successor.liveChangesIdentity).not.toBe(initial.liveChangesIdentity);
    expect(successor.matchesLatestSnapshot).toBe(false);

    invalidate?.();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(updates).toHaveLength(2);
    const moved = await owner.workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: initial.liveChangesIdentity,
      fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(moved).toMatchObject({
      status: 'moved',
      reason: 'live-changes-moved',
      stateVersion: review.stateVersion,
    });
    const successorDiff = await owner.workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: successor.liveChangesIdentity,
      fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (successorDiff.status !== 'available') {
      throw new Error('Successor Live Diff unavailable');
    }
    expect(successorDiff.stateVersion).toBe(review.stateVersion);
    expect(successorDiff.matchesLatestSnapshot).toBe(false);
    expect(
      successorDiff.window.rows
        .filter(row => row.kind === 'addition')
        .map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8'))
        .join(''),
    ).toContain('live successor');

    await writeFile(path.join(created.checkout, 'review-000.txt'), 'fallback successor\nshared\n');
    await waitFor(() => updates.length === 3, 'fallback-verified Live Changes successor update');
    expect(updates[2]!.stateVersion).toBe(review.stateVersion);
    expect(updates[2]!.liveChangesIdentity).not.toBe(successor.liveChangesIdentity);

    const gitDirectory = path.join(created.checkout, '.git');
    const unavailableGitDirectory = path.join(created.checkout, '.git-away');
    await rename(gitDirectory, unavailableGitDirectory);
    invalidate?.();
    await waitFor(
      () => statuses.includes('review.live-manifest:unverified'),
      'unverified Live Changes subscription update',
    );
    expect(statuses).not.toContain('workspace.projection-failed:failed');
    await rename(unavailableGitDirectory, gitDirectory);
    invalidate?.();
    await waitFor(() => updates.length === 4, 'recovered Live Changes subscription update');
    expect(updates[3]!.liveChangesIdentity).toBe(updates[2]!.liveChangesIdentity);
    unsubscribe();
  });

  it('reuses the start capture for the first live read, yet still sees a change made since', async () => {
    const created = await fixture();
    // No watcher hint reaches the Projection: only verification can notice.
    const owner = await openInternal(created.checkout, { subscribeToEvidenceInvalidation: () => () => {} });
    const live = async (reviewIdentity: CurrentChangesReviewStarted['reviewIdentity']) => {
      const view = await owner.workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 });
      if (view.status !== 'available') throw new Error('Live Changes unavailable');
      return view;
    };
    const unchanged = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'adopted-capture-unchanged',
        expectedStateVersion: 0,
      }),
    );
    const first = await live(unchanged.reviewIdentity);
    expect(first).toMatchObject({ matchesLatestSnapshot: true });

    const changed = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'adopted-capture-changed',
        expectedStateVersion: unchanged.stateVersion,
      }),
    );
    await writeFile(path.join(created.checkout, 'review-000.txt'), 'changed right after the start\nshared\n');
    const afterChange = await live(changed.reviewIdentity);
    expect(afterChange.matchesLatestSnapshot).toBe(false);
    expect(afterChange.liveChangesIdentity).not.toBe(first.liveChangesIdentity);
  });

  it('checks less often in the background and at once back in the foreground', async () => {
    const created = await fixture();
    const owner = await openInternal(created.checkout, {
      liveFallbackVerificationMilliseconds: 50,
      liveBackgroundFallbackVerificationMilliseconds: 60_000,
      // No watcher: only the fallback check can see a change.
      subscribeToEvidenceInvalidation: () => () => {},
    });
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'live-attention-start',
        expectedStateVersion: 0,
      }),
    );
    const identities: string[] = [];
    const unsubscribe = owner.workspace.subscribe(
      { kind: 'review.live-manifest', reviewIdentity: review.reviewIdentity, offset: 0, limit: 64 },
      update => {
        if (update.kind === 'review.live-manifest' && update.status === 'available') {
          identities.push(update.liveChangesIdentity);
        }
      },
    );
    // Before any foreground check can start, so none is in flight below.
    owner.workspace.setAttention('background');
    await waitFor(() => identities.length === 1, 'initial Live Changes subscription update');

    await writeFile(path.join(created.checkout, 'review-000.txt'), 'changed in the background\nshared\n');
    // Several foreground intervals pass without a check.
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(identities).toHaveLength(1);

    owner.workspace.setAttention('foreground');
    await waitFor(() => identities.length === 2, 'foreground Live Changes check');
    expect(identities[1]).not.toBe(identities[0]);
    expect(() => owner.workspace.setAttention('away' as never)).toThrow(TypeError);
    unsubscribe();
  });

  it('refreshes a fixed Review continuation when HEAD moves at the same State version', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'fixed range endpoint');
    let invalidate: (() => void) | undefined;
    const owner = await openInternal(created.checkout, {
      liveFallbackVerificationMilliseconds: 50,
      subscribeToEvidenceInvalidation(onInvalidate) {
        invalidate = onInvalidate;
        return () => {
          invalidate = undefined;
        };
      },
    });
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection: { kind: 'last-commit' },
    });
    if (preview.status !== 'available') {
      throw new Error('Fixed range preview unavailable');
    }
    const startedRange = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'continuation-subscription-range',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: reviewComparisonEndpointIdentity(preview.basis),
      expectedComparedObjectIdentity: reviewComparisonEndpointIdentity(preview.comparedState) ?? '',
    });
    if (startedRange.kind !== 'review.comparison.started') {
      throw new Error('Fixed range start failed');
    }
    const updates: ReviewContinuationView[] = [];
    const unsubscribe = owner.workspace.subscribe(
      {
        kind: 'review.continuation',
        reviewIdentity: startedRange.reviewIdentity,
      },
      update => {
        if (update.kind === 'review.continuation') updates.push(update);
      },
    );
    await waitFor(() => updates.length === 1, 'initial Review continuation subscription update');
    expect(updates[0]).toMatchObject({
      status: 'available',
      stateVersion: startedRange.stateVersion,
      headMoved: false,
      currentHeadAction: { availability: 'blocked' },
    });

    await writeFile(path.join(created.checkout, 'review-000.txt'), 'new local HEAD\nshared\n');
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'move local HEAD');
    await writeFile(path.join(created.checkout, 'review-000.txt'), 'new Live Changes\nshared\n');
    invalidate?.();
    await waitFor(
      () => updates.some(update => update.status === 'available' && update.headMoved),
      'moved-HEAD Review continuation update',
    );
    const moved = [...updates]
      .reverse()
      .find(
        (update): update is Extract<ReviewContinuationView, { status: 'available' }> => update.status === 'available',
      );
    expect(moved).toMatchObject({
      stateVersion: startedRange.stateVersion,
      headMoved: true,
      currentHeadAction: { availability: 'direct' },
    });
    if (updates[0]?.status === 'available') {
      expect(moved?.liveChangesIdentity).not.toBe(updates[0].liveChangesIdentity);
    }
    unsubscribe();
  });
});
