import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { openAuthoritativeState } from '../../src/authoritativeState.js';
import { bootstrapWorkspace, type Workspace } from '../../src/index.js';
import { openRuntimeWorkspace, workspaceGitDirectory } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import { fixture, installWorkspaceReviewingHygiene, requireStarted } from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

/** Stands in for the 128 MiB verification cap without a 128 MiB file. */
const VERIFIED_FILE_BYTES = 64;

it('keeps unchanged incomplete Live Changes instead of recapturing them, and recaptures once the uncaptured file changes', async () => {
  const created = await fixture();
  const oversized = path.join(created.checkout, 'oversized.log');
  await writeFile(oversized, 'x'.repeat(VERIFIED_FILE_BYTES * 4));
  process.env.XDG_STATE_HOME = created.state;
  const bootstrapped = await bootstrapWorkspace({ startPath: created.checkout });
  if (bootstrapped.status !== 'ready') throw new Error('Workspace bootstrap was rejected');
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
  });
  try {
    let captures = 0;
    const { workspace } = openRuntimeWorkspace(
      identity.workspaceIdentity,
      identity.canonicalCheckout,
      state,
      {
        evidenceLimits: { maxVerifiedFileBytes: VERIFIED_FILE_BYTES, maxCapturedFileBytes: VERIFIED_FILE_BYTES },
        onLiveChangesCapture: () => {
          captures += 1;
        },
      },
      workspaceGitDirectory(bootstrapped.workspace),
    );
    const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const review = requireStarted(
      await workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'incomplete-live-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const liveManifest = async (reader: Workspace) => {
      const view = await reader.read({
        kind: 'review.live-manifest',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      });
      if (view.status !== 'available') throw new Error(`Live Changes unavailable: ${JSON.stringify(view)}`);
      return view;
    };

    const first = await liveManifest(workspace);
    expect(first.manifest.files.map(file => file.displayPath).sort()).toEqual(['oversized.log', 'review.txt']);
    const settled = captures;
    for (let read = 0; read < 3; read += 1) {
      expect((await liveManifest(workspace)).liveChangesIdentity).toBe(first.liveChangesIdentity);
    }
    expect(captures).toBe(settled);

    // The uncaptured file changes without changing Git status: recapture once.
    await appendFile(oversized, 'more');
    await liveManifest(workspace);
    expect(captures).toBe(settled + 1);
    await liveManifest(workspace);
    expect(captures).toBe(settled + 1);
  } finally {
    await state.close();
  }
});
