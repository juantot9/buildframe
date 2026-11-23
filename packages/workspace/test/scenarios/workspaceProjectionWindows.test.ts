import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorkspaceHomeView } from '@buildframe/workspace/projection';
import { runWorkspaceScenario } from './driver.js';
import {
  fixture,
  open,
  waitFor,
  started,
  containsPrivateMechanic,
  manifest,
  git,
  installWorkspaceProjectionHygiene,
} from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

describe('bounded Reviewing Projection envelopes and exact windows', () => {
  it('publishes same-version Current and Previous envelopes by scope', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);

    await runWorkspaceScenario(owner.workspace, {
      name: 'same-version Current and Previous projection',
      async run(workspace) {
        const initial = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 8 });
        expect(initial).toMatchObject({
          stateVersion: 0,
          header: { totalReviews: 0, totalPastReviews: 0 },
          actions: [
            expect.objectContaining({
              kind: 'review.current-changes.start',
              availability: 'direct',
            }),
          ],
        });
        const updates: WorkspaceHomeView[] = [];
        const unsubscribe = workspace.subscribe({ kind: 'workspace.home', offset: 0, limit: 8 }, update => {
          if (update.kind === 'workspace.home') updates.push(update);
        });
        await waitFor(() => updates.length === 1, 'initial Workspace Home subscription update');
        const command = {
          kind: 'review.current-changes.start' as const,
          commandIdentity: 'projection-first-current',
          expectedStateVersion: 0,
        };
        const first = started(await workspace.execute(command));
        await waitFor(() => updates.some(update => update.stateVersion === 1), 'Workspace Home State version 1');
        const second = started(
          await workspace.execute({
            kind: 'review.current-changes.start',
            commandIdentity: 'projection-second-current',
            expectedStateVersion: 1,
          }),
        );
        await waitFor(() => updates.some(update => update.stateVersion === 2), 'Workspace Home State version 2');
        const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 8 });
        expect(home).toMatchObject({
          stateVersion: 2,
          header: {
            currentReviewIdentity: second.reviewIdentity,
            totalReviews: 2,
            totalPastReviews: 1,
          },
          currentReview: {
            reviewIdentity: second.reviewIdentity,
            retention: 'current',
          },
          reviews: {
            items: [
              expect.objectContaining({
                reviewIdentity: first.reviewIdentity,
                retention: 'previous',
              }),
            ],
          },
        });
        expect(await workspace.execute(command)).toEqual(first);
        const third = started(
          await workspace.execute({
            kind: 'review.current-changes.start',
            commandIdentity: 'projection-third-current',
            expectedStateVersion: 2,
          }),
        );
        expect(third.stateVersion).toBe(3);
        await waitFor(
          () => updates.some(update => update.stateVersion === third.stateVersion),
          'Workspace Home State version 3',
        );
        expect(updates.map(update => update.stateVersion)).toEqual([0, 1, 2, 3]);
        expect(updates[3]).toMatchObject({
          currentReview: { reviewIdentity: third.reviewIdentity },
        });
        expect(updates.every(update => !containsPrivateMechanic(update))).toBe(true);
        unsubscribe();
      },
    });
  });

  it('windows a multi-chunk manifest and selected diff while preserving stable file and row identities', async () => {
    const created = await fixture(70, true);
    await writeFile(
      path.join(created.checkout, 'review-000.txt'),
      `${Array.from({ length: 64 }, (_, index) => `${String(index).padStart(2, '0')}${'b'.repeat(12 * 1024 - 2)}`).join(
        '\n',
      )}\n`,
    );
    const owner = await open(created.checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-start-bounded',
        expectedStateVersion: 0,
      }),
    );

    const crossing = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 63,
        limit: 2,
      }),
    );
    expect(crossing).toMatchObject({
      stateVersion: 1,
      header: { reviewIdentity: review.reviewIdentity, snapshotStatus: 'current' },
      manifest: { totalFiles: 70, offset: 63, nextOffset: 65 },
    });
    expect(crossing.manifest.files).toHaveLength(2);
    expect(crossing.actions.every(action => action.gateBasis.expectedStateVersion === crossing.stateVersion)).toBe(
      true,
    );

    const first = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 1,
      }),
    ).manifest.files[0]!;
    const reflowed = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 8,
      }),
    ).manifest.files[0]!;
    expect(reflowed.fileIdentity).toBe(first.fileIdentity);

    const oneRow = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: first.fileIdentity,
      offset: 0,
      limit: 1,
    });
    expect(oneRow.kind).toBe('review.diff');
    if (oneRow.kind !== 'review.diff' || oneRow.status !== 'available') {
      throw new Error('Selected diff was not available');
    }
    expect(oneRow.window.rows).toHaveLength(1);
    expect(oneRow.window.rows[0]?.text).toMatchObject({
      byteLength: 8 * 1024,
      totalByteLength: 12 * 1024,
      truncated: true,
    });
    const stableRowIdentity = oneRow.window.rows[0]!.rowIdentity;

    const twoRows = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: first.fileIdentity,
      offset: 0,
      limit: 2,
    });
    if (twoRows.kind !== 'review.diff' || twoRows.status !== 'available') {
      throw new Error('Selected diff was not available after reflow');
    }
    expect(twoRows.window.rows[0]?.rowIdentity).toBe(stableRowIdentity);
    const maximumWindow = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: first.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (maximumWindow.kind !== 'review.diff' || maximumWindow.status !== 'available') {
      throw new Error('Maximum selected diff window was not available');
    }
    expect(maximumWindow.window.rows).toHaveLength(64);
    expect(Buffer.byteLength(JSON.stringify(maximumWindow))).toBeLessThan(1024 * 1024);
    expect(containsPrivateMechanic(crossing)).toBe(false);
    expect(containsPrivateMechanic(twoRows)).toBe(false);

    await expect(
      owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 10_001,
      }),
    ).rejects.toThrow('Invalid bounded Review manifest window');

    await writeFile(path.join(created.checkout, 'review-000.txt'), 'moved\nshared\n');
    const stale = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 1,
      }),
    );
    expect(stale.header.snapshotStatus).toBe('stale');
    const staleDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: first.fileIdentity,
      offset: 0,
      limit: 1,
    });
    expect(
      staleDiff.actions?.find(action => action.kind === 'review.question.ask')?.blockers.map(item => item.code),
    ).toContain('review-snapshot-changed');
  });

  it('resolves an exact source line to the Diff window that contains it', async () => {
    const created = await fixture();
    const basisLines = Array.from({ length: 200 }, (_, index) => `line-${String(index + 1).padStart(3, '0')}`);
    await writeFile(path.join(created.checkout, 'review-000.txt'), `${basisLines.join('\n')}\n`);
    await git(created.checkout, 'add', 'review-000.txt');
    await git(created.checkout, 'commit', '-qm', 'long basis');
    const workingLines = [...basisLines];
    workingLines[179] = 'changed line 180';
    await writeFile(path.join(created.checkout, 'review-000.txt'), `${workingLines.join('\n')}\n`);
    const owner = await open(created.checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-start-anchor-line',
        expectedStateVersion: 0,
      }),
    );
    const file = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 1,
      }),
    ).manifest.files[0]!;

    const anchored = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
      anchorLine: 180,
    });
    if (anchored.kind !== 'review.diff' || anchored.status !== 'available') {
      throw new Error('Anchored Snapshot Diff was not available');
    }
    expect(anchored.window.offset).toBe(128);
    expect(anchored.window.rows.some(row => row.kind === 'addition' && row.newLine === 180)).toBe(true);

    const live = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 1,
    });
    if (live.status !== 'available' || live.manifest.files[0] === undefined) {
      throw new Error('Live Changes manifest was not available');
    }
    const anchoredLive = await owner.workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      fileIdentity: live.manifest.files[0].fileIdentity,
      offset: 0,
      limit: 64,
      anchorLine: 180,
    });
    if (anchoredLive.kind !== 'review.live-diff' || anchoredLive.status !== 'available') {
      throw new Error('Anchored Live Diff was not available');
    }
    expect(anchoredLive.window.offset).toBe(128);
    expect(anchoredLive.window.rows.some(row => row.newLine === 180)).toBe(true);

    // An unresolvable line keeps the caller's requested bounded window.
    const missing = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 64,
      limit: 64,
      anchorLine: 100_000,
    });
    if (missing.kind !== 'review.diff' || missing.status !== 'available') {
      throw new Error('Fallback Snapshot Diff was not available');
    }
    expect(missing.window.offset).toBe(64);
    await expect(
      owner.workspace.read({
        kind: 'review.diff',
        reviewIdentity: review.reviewIdentity,
        fileIdentity: file.fileIdentity,
        offset: 0,
        limit: 64,
        anchorLine: 0,
      }),
    ).rejects.toThrow('Invalid Review Snapshot or file identity');
  });
});
