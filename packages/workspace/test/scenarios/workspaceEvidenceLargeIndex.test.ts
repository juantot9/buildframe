import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { openAuthoritativeState } from '../../src/authoritativeState.js';
import { bootstrapWorkspace } from '../../src/index.js';
import { openRuntimeWorkspace, workspaceGitDirectory } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import {
  fixture,
  git,
  installWorkspaceReviewingHygiene,
  requireStarted,
  type Fixture,
} from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

const TRACKED_FILES = 40;
/** Stands in for the 100,000 changed-file cap without a 100,000-file repository. */
const MANIFEST_FILES = 10;

async function largeIndexFixture(): Promise<Fixture> {
  const created = await fixture(false);
  await Promise.all(
    Array.from({ length: TRACKED_FILES }, (_, index) =>
      writeFile(path.join(created.checkout, `tracked-${String(index).padStart(3, '0')}.txt`), `${index}\n`),
    ),
  );
  await git(created.checkout, 'add', '.');
  await git(created.checkout, 'commit', '-qm', 'many tracked files');
  await writeFile(path.join(created.checkout, 'review.txt'), 'after\n');
  return created;
}

it('reviews one change in a repository with more tracked files than the changed-file cap', async () => {
  const created = await largeIndexFixture();
  process.env.XDG_STATE_HOME = created.state;
  const bootstrapped = await bootstrapWorkspace({ startPath: created.checkout });
  if (bootstrapped.status !== 'ready') throw new Error('Workspace bootstrap was rejected');
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
  });
  try {
    const { workspace } = openRuntimeWorkspace(
      identity.workspaceIdentity,
      identity.canonicalCheckout,
      state,
      { evidenceLimits: { maxManifestFiles: MANIFEST_FILES } },
      workspaceGitDirectory(bootstrapped.workspace),
    );
    const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const review = requireStarted(
      await workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'large-index-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const manifest = await workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({ status: 'available' });
    if (manifest.status !== 'available') return;
    expect(manifest.manifest.files.map(file => file.displayPath)).toEqual(['review.txt']);
    const diff = await workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: manifest.liveChangesIdentity,
      fileIdentity: manifest.manifest.files[0]!.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(diff).toMatchObject({ status: 'available' });
  } finally {
    await state.close();
  }
});
