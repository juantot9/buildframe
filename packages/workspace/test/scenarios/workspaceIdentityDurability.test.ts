import { open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapWorkspace } from '../../src/index.js';
import {
  createFixture,
  createRepository,
  readyWorkspace,
  restoreIdentityFixtures,
  runGit,
} from './workspaceIdentityScenarios.js';

afterEach(restoreIdentityFixtures);

// These cases fault a directory flush. Windows cannot flush a directory and
// skips it (durableFiles.ts), so there is nothing to fault there.
describe.skipIf(process.platform === 'win32')('Workspace Identity directory durability', () => {
  it('fails closed when marker directory durability cannot be confirmed', async () => {
    const { root, stateHome } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);

    // Fault only directory-handle sync. The marker file itself is complete and
    // synced, so current source fails this regression by skipping directly to
    // the registry barrier and reporting the wrong owner operation.
    const probeFile = path.join(root, 'file-handle-prototype-probe');
    const probeHandle = await open(probeFile, 'w');
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as typeof probeHandle;
    const originalSync = fileHandlePrototype.sync;
    await probeHandle.close();
    await rm(probeFile);
    const syncFault = vi.spyOn(fileHandlePrototype, 'sync').mockImplementation(async function (
      this: typeof probeHandle,
    ): Promise<void> {
      if ((await this.stat()).isDirectory()) {
        throw new Error('injected marker directory sync failure');
      }
      await originalSync.call(this);
    });

    expect(await bootstrapWorkspace({ startPath: repository })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-authority-unavailable',
        requestedPath: repository,
        operation: 'write-marker',
      },
    });
    syncFault.mockRestore();

    // Link publication completed before durability confirmation failed. Once
    // syncing is available, bootstrap must adopt that marker and register the
    // same identity rather than minting replacement authority.
    const gitDirectory = await realpath(await runGit(repository, 'rev-parse', '--absolute-git-dir'));
    const marker = JSON.parse(await readFile(path.join(gitDirectory, 'neoflow-workspace-identity.json'), 'utf8')) as {
      readonly workspaceIdentity: string;
    };
    const recovered = await readyWorkspace(repository);
    expect(recovered.view.workspaceIdentity).toBe(marker.workspaceIdentity);
    const registry = JSON.parse(
      await readFile(path.join(stateHome, 'buildframe', 'workspace-registry.json'), 'utf8'),
    ) as {
      readonly registrations: readonly [{ readonly workspaceIdentity: string }];
    };
    expect(registry.registrations).toEqual([
      expect.objectContaining({
        workspaceIdentity: marker.workspaceIdentity,
      }),
    ]);
  });

  it('fails closed when registry directory durability cannot be confirmed', async () => {
    const { root, stateHome } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);

    // Allow the marker-directory barrier and fault the following registry
    // directory sync. Current source has only the latter sync, so it incorrectly
    // returns ready instead of reaching this second injected directory barrier.
    const probeFile = path.join(root, 'file-handle-prototype-probe');
    const probeHandle = await open(probeFile, 'w');
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as typeof probeHandle;
    const originalSync = fileHandlePrototype.sync;
    await probeHandle.close();
    await rm(probeFile);
    let directorySyncs = 0;
    const syncFault = vi.spyOn(fileHandlePrototype, 'sync').mockImplementation(async function (
      this: typeof probeHandle,
    ): Promise<void> {
      if ((await this.stat()).isDirectory()) {
        directorySyncs += 1;
        if (directorySyncs === 2) {
          throw new Error('injected registry directory sync failure');
        }
      }
      await originalSync.call(this);
    });

    expect(await bootstrapWorkspace({ startPath: repository })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-authority-unavailable',
        requestedPath: repository,
        operation: 'write-registry',
      },
    });
    expect(directorySyncs).toBe(2);
    syncFault.mockRestore();

    // Rename completed before durability confirmation failed. A retry must
    // recover that same marker/registration pair instead of minting authority.
    const gitDirectory = await realpath(await runGit(repository, 'rev-parse', '--absolute-git-dir'));
    const marker = JSON.parse(await readFile(path.join(gitDirectory, 'neoflow-workspace-identity.json'), 'utf8')) as {
      readonly workspaceIdentity: string;
    };
    const registry = JSON.parse(
      await readFile(path.join(stateHome, 'buildframe', 'workspace-registry.json'), 'utf8'),
    ) as {
      readonly registrations: readonly [{ readonly workspaceIdentity: string }];
    };
    expect(registry.registrations).toEqual([
      expect.objectContaining({
        workspaceIdentity: marker.workspaceIdentity,
      }),
    ]);
    const recovered = await readyWorkspace(repository);
    expect(recovered.view.workspaceIdentity).toBe(marker.workspaceIdentity);
  });
});
