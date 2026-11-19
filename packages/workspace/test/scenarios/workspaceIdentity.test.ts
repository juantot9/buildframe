import {
  appendFile,
  cp,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapWorkspace, type WorkspaceIdentityView } from '../../src/index.js';
import {
  commandMarker,
  createFixture,
  createRepository,
  pathExists,
  permissions,
  readyWorkspace,
  restoreIdentityFixtures,
  runGit,
} from './workspaceIdentityScenarios.js';

afterEach(restoreIdentityFixtures);

describe('Workspace Identity scenarios', () => {
  it('retains identity across subdirectories, aliases, branches, and checkout moves', async () => {
    const { root, stateHome } = await createFixture();
    const repository = path.join(root, 'repository');
    const nested = path.join(repository, 'src', 'nested');
    await createRepository(repository);
    await mkdir(nested, { recursive: true });

    const first = await readyWorkspace(nested);
    const alias = path.join(root, 'repository-alias');
    await symlink(repository, alias, 'dir');
    const throughAlias = await readyWorkspace(path.join(alias, 'src'));
    expect(throughAlias.view.workspaceIdentity).toBe(first.view.workspaceIdentity);

    await runGit(repository, 'checkout', '-b', 'identity-does-not-follow-branch');
    const afterBranchChange = await readyWorkspace(repository);
    expect(afterBranchChange.view.workspaceIdentity).toBe(first.view.workspaceIdentity);

    const gitDirectory = await realpath(await runGit(repository, 'rev-parse', '--absolute-git-dir'));
    const markerFile = path.join(gitDirectory, 'neoflow-workspace-identity.json');
    const registryDirectory = path.join(stateHome, 'buildframe');
    const registryFile = path.join(registryDirectory, 'workspace-registry.json');
    const marker = JSON.parse(await readFile(markerFile, 'utf8')) as {
      readonly workspaceIdentity: string;
    };
    const registry = JSON.parse(await readFile(registryFile, 'utf8')) as {
      readonly registrations: ReadonlyArray<{
        readonly workspaceIdentity: string;
      }>;
    };
    expect(marker.workspaceIdentity).toBe(first.view.workspaceIdentity);
    expect(registry.registrations).toContainEqual(
      expect.objectContaining({ workspaceIdentity: first.view.workspaceIdentity }),
    );
    expect(permissions((await stat(markerFile)).mode)).toBe(0o600);
    expect(permissions((await stat(registryFile)).mode)).toBe(0o600);
    expect(permissions((await stat(registryDirectory)).mode)).toBe(0o700);
    expect(await pathExists(path.join(repository, '.neoflow'))).toBe(false);

    const movedRepository = path.join(root, 'moved-repository');
    await rename(repository, movedRepository);
    const afterMove = await readyWorkspace(movedRepository);
    expect(afterMove.view.workspaceIdentity).toBe(first.view.workspaceIdentity);
    expect(afterMove.view.canonicalCheckout).toBe(await realpath(movedRepository));

    const updates: WorkspaceIdentityView[] = [];
    const unsubscribe = afterMove.workspace.subscribe({ kind: 'workspace.identity' }, update => updates.push(update));
    await Promise.resolve();
    expect(updates).toEqual([afterMove.view]);
    unsubscribe();

    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(afterMove.workspace))
        .filter(name => name !== 'constructor')
        .sort(),
    ).toEqual(['execute', 'read', 'setAttention', 'subscribe']);
  });

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
    const syncFault = vi
      .spyOn(fileHandlePrototype, 'sync')
      .mockImplementation(async function (this: typeof probeHandle): Promise<void> {
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
    const syncFault = vi
      .spyOn(fileHandlePrototype, 'sync')
      .mockImplementation(async function (this: typeof probeHandle): Promise<void> {
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

  it('does not revive a retired identity from a recycled Git path', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const original = await readyWorkspace(repository);

    // `git worktree remove` deletes the administration directory that holds the
    // marker, and `git worktree add` recycles the same path for a new worktree.
    const linkedWorktree = path.join(root, 'linked-worktree');
    await runGit(repository, 'worktree', 'add', '-b', 'first', linkedWorktree);
    const firstLinked = await readyWorkspace(linkedWorktree);
    await runGit(repository, 'worktree', 'remove', '--force', linkedWorktree);
    await runGit(repository, 'worktree', 'add', '-b', 'second', linkedWorktree);
    const secondLinked = await readyWorkspace(linkedWorktree);
    expect(secondLinked.view.workspaceIdentity).not.toBe(firstLinked.view.workspaceIdentity);

    // An unrelated project started where a deleted one used to live is likewise
    // a new Workspace, not the old one resurrected.
    await rm(repository, { recursive: true, force: true });
    await createRepository(repository);
    const rebuilt = await readyWorkspace(repository);
    expect(rebuilt.view.workspaceIdentity).not.toBe(original.view.workspaceIdentity);
  });

  it('keeps an old live lock private and clears a lock from another process instance', async () => {
    const { root, stateHome } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const first = await readyWorkspace(repository);

    const lockDirectory = path.join(stateHome, 'buildframe', 'workspace-registry.lock');
    const nonce = '11111111-1111-4111-8111-111111111111';
    const ownerFile = path.join(lockDirectory, `owner-${nonce}.json`);
    await mkdir(lockDirectory, { mode: 0o700 });
    await writeFile(
      ownerFile,
      `${JSON.stringify({
        formatVersion: 1,
        pid: process.pid,
        nonce,
      })}\n`,
      { mode: 0o600 },
    );

    // Age never invalidates a lock whose recorded process is still live.
    const longAgo = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(lockDirectory, longAgo, longAgo);
    const busy = await bootstrapWorkspace({ startPath: repository });
    expect(busy).toEqual({
      status: 'rejected',
      diagnostic: { code: 'workspace-registry-busy' },
    });
    expect(await pathExists(lockDirectory)).toBe(true);

    // A different process-start identity proves that a reused PID does not own
    // the leaked lock. Unique owner filenames make its removal ABA-safe.
    await writeFile(
      ownerFile,
      `${JSON.stringify({
        formatVersion: 1,
        pid: process.pid,
        nonce,
        processIdentity: 'a-prior-process-instance',
      })}\n`,
    );
    const recovered = await Promise.all(Array.from({ length: 4 }, () => readyWorkspace(repository)));
    expect(recovered.every(attempt => attempt.view.workspaceIdentity === first.view.workspaceIdentity)).toBe(true);
    expect(await pathExists(lockDirectory)).toBe(false);

    // Upgrade also recovers a pre-review single-file lock from an earlier boot,
    // even if its PID has since been reused by this process.
    await writeFile(lockDirectory, `${JSON.stringify({ pid: process.pid, nonce: 'legacy-lock' })}\n`, { mode: 0o600 });
    const beforeThisBoot = new Date(0);
    await utimes(lockDirectory, beforeThisBoot, beforeThisBoot);
    const afterLegacyRecovery = await readyWorkspace(repository);
    expect(afterLegacyRecovery.view.workspaceIdentity).toBe(first.view.workspaceIdentity);
    expect(await pathExists(lockDirectory)).toBe(false);
  });

  it('fails closed before checkout-local fsmonitor or includes can execute', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const fsmonitor = await commandMarker(root, 'fsmonitor');
    await runGit(repository, 'config', 'core.fsmonitor', fsmonitor.command);

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(fsmonitor.marker)).toBe(false);

    await runGit(repository, 'config', '--unset', 'core.fsmonitor');
    const included = await commandMarker(root, 'included-fsmonitor');
    const includedConfiguration = path.join(root, 'checkout-include');
    await writeFile(includedConfiguration, `[core]\n\tfsmonitor = ${included.command}\n`);
    await runGit(repository, 'config', 'include.path', includedConfiguration);

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(included.marker)).toBe(false);
  });

  it('opens a checkout whose local config sets hooks, an editor or a pager, without running them', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    // husky's layout: a hooks folder named in the checkout's own config.
    const hooks = path.join(root, 'hooks');
    await mkdir(hooks, { mode: 0o700 });
    const hook = await commandMarker(root, 'hook');
    for (const name of ['pre-commit', 'post-checkout', 'post-index-change', 'reference-transaction']) {
      await writeFile(path.join(hooks, name), await readFile(hook.command), { mode: 0o700 });
    }
    const editor = await commandMarker(root, 'editor');
    const pager = await commandMarker(root, 'pager');
    await runGit(repository, 'config', 'core.hooksPath', hooks);
    await runGit(repository, 'config', 'core.editor', editor.command);
    await runGit(repository, 'config', 'core.pager', pager.command);

    const opened = await readyWorkspace(repository);
    expect(opened.view.workspaceIdentity).toMatch(/^wsp_/u);
    for (const marker of [hook.marker, editor.marker, pager.marker]) {
      expect(await pathExists(marker)).toBe(false);
    }

    // A key that changes how files are read is still refused.
    await runGit(repository, 'config', 'core.attributesFile', path.join(root, 'attributes'));
    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
  });

  it('admits only sparse interpretation from worktree-specific config', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const filter = await commandMarker(root, 'worktree-filter');
    await runGit(repository, 'config', 'extensions.worktreeConfig', 'true');
    await runGit(repository, 'config', '--worktree', 'filter.attacker.clean', filter.command);
    await writeFile(path.join(repository, '.gitattributes'), '*.txt filter=attacker\n');
    await writeFile(path.join(repository, 'filtered.txt'), 'content\n');

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(filter.marker)).toBe(false);
  });

  it('fails closed before a checkout-local clean filter selected by tracked attributes can execute', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const filter = await commandMarker(root, 'checkout-filter');
    await runGit(repository, 'config', 'filter.attacker.clean', filter.command);
    await writeFile(path.join(repository, '.gitattributes'), '*.txt filter=attacker\n');
    await writeFile(path.join(repository, 'filtered.txt'), 'content\n');

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(filter.marker)).toBe(false);
  });

  it('rejects a legitimate checkout-local clean-filter repository instead of misreporting it', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const filter = path.join(root, 'normalizing-filter.sh');
    await writeFile(filter, "#!/bin/sh\nsed 's/^worktree:/canonical:/'\n", { mode: 0o700 });
    await runGit(repository, 'config', 'filter.normalize.clean', filter);
    await writeFile(path.join(repository, '.gitattributes'), '*.txt filter=normalize\n');
    await writeFile(path.join(repository, 'filtered.txt'), 'worktree:value\n');
    await runGit(repository, 'add', '.gitattributes', 'filtered.txt');
    await runGit(repository, 'commit', '-m', 'filtered basis');
    await writeFile(path.join(repository, 'filtered.txt'), 'worktree:value\n');
    await runGit(repository, 'update-index', '--really-refresh');
    expect(await runGit(repository, 'status', '--porcelain')).toBe('');

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
  });

  it('rejects unsupported operator hasconfig conditions before inspection', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const home = path.join(root, 'operator-home');
    await mkdir(home);
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = path.join(root, 'operator-xdg');
    const included = await commandMarker(root, 'operator-hasconfig');
    const includedConfiguration = path.join(root, 'operator-include');
    await writeFile(includedConfiguration, `[core]\n\tfsmonitor = ${included.command}\n`);
    await writeFile(
      path.join(home, '.gitconfig'),
      ['[includeIf "hasconfig:remote.*.url:evil"]', `\tpath = ${includedConfiguration}`, ''].join('\n'),
    );

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(included.marker)).toBe(false);
  });

  it('separates unreadable inputs and failed inspection from an unmanaged directory', async () => {
    const { root, stateHome } = await createFixture();
    const missing = path.join(root, 'does-not-exist');

    expect(await bootstrapWorkspace({ startPath: missing })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'path-unavailable',
        requestedPath: missing,
        reason: 'missing',
      },
    });

    const repository = path.join(root, 'repository');
    await createRepository(repository);
    vi.stubEnv('PATH', path.join(root, 'no-tools'));
    const withoutGit = await bootstrapWorkspace({ startPath: repository });
    vi.unstubAllEnvs();

    expect(withoutGit).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'git-inspection-failed',
        requestedPath: repository,
        reason: 'git-unavailable',
      },
    });

    // A repository Git can find but cannot read is broken, not unmanaged.
    // Reporting it as unmanaged would invite adopting it as a new Workspace.
    await appendFile(path.join(repository, '.git', 'config'), '\nthis is not a valid configuration line\n');
    expect(await bootstrapWorkspace({ startPath: repository })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'git-inspection-failed',
        requestedPath: repository,
        reason: 'inspection-failed',
      },
    });

    const brokenCheckout = path.join(root, 'broken-checkout');
    await mkdir(brokenCheckout);
    await writeFile(path.join(brokenCheckout, '.git'), `gitdir: ${path.join(root, 'missing-git-administration')}\n`);
    expect(await bootstrapWorkspace({ startPath: brokenCheckout })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'git-inspection-failed',
        requestedPath: brokenCheckout,
        reason: 'inspection-failed',
      },
    });
    expect(await pathExists(stateHome)).toBe(false);
  });

  it('assigns distinct identities to linked worktrees and ordinary clones', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const original = await readyWorkspace(repository);

    const linkedWorktree = path.join(root, 'linked-worktree');
    await runGit(repository, 'worktree', 'add', '-b', 'linked-worktree-branch', linkedWorktree);
    const linked = await readyWorkspace(linkedWorktree);

    const clone = path.join(root, 'ordinary-clone');
    await runGit(root, 'clone', repository, clone);
    const cloned = await readyWorkspace(clone);

    expect(linked.view.workspaceIdentity).not.toBe(original.view.workspaceIdentity);
    expect(cloned.view.workspaceIdentity).not.toBe(original.view.workspaceIdentity);
    expect(cloned.view.workspaceIdentity).not.toBe(linked.view.workspaceIdentity);
  });

  it('captures evidence through the linked-worktree administration path', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const linkedWorktree = path.join(root, 'linked-worktree');
    await runGit(repository, 'worktree', 'add', '-b', 'linked-evidence', linkedWorktree);

    const linked = await readyWorkspace(linkedWorktree);
    await writeFile(path.join(linkedWorktree, 'linked.txt'), 'linked change\n');
    await expect(linked.workspace.read({ kind: 'workspace.current-changes.capture' })).resolves.toMatchObject({
      status: 'captured',
      manifest: { totalFiles: 1 },
    });
  });

  it('fails visibly instead of merging simultaneously copied markers', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const original = await readyWorkspace(repository);

    const copiedRepository = path.join(root, 'copied-repository');
    await cp(repository, copiedRepository, { recursive: true });
    const copied = await bootstrapWorkspace({ startPath: copiedRepository });

    expect(copied.status).toBe('rejected');
    if (copied.status !== 'rejected') throw new Error('Expected a collision');
    expect(copied.diagnostic).toEqual({
      code: 'workspace-identity-collision',
      reason: 'duplicate-marker',
      workspaceIdentity: original.view.workspaceIdentity,
      registeredCheckout: await realpath(repository),
      attemptedCheckout: await realpath(copiedRepository),
    });

    const originalAgain = await readyWorkspace(repository);
    expect(originalAgain.view.workspaceIdentity).toBe(original.view.workspaceIdentity);
  });

  it('rejects two surviving checkouts that share one administration generation', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);

    const linkedWorktree = path.join(root, 'linked-worktree');
    await runGit(repository, 'worktree', 'add', '-b', 'shared-administration', linkedWorktree);
    await readyWorkspace(linkedWorktree);

    const copiedWorktree = path.join(root, 'copied-worktree');
    await cp(linkedWorktree, copiedWorktree, { recursive: true });
    const gitDirectory = await realpath(await runGit(linkedWorktree, 'rev-parse', '--absolute-git-dir'));
    const replacementIdentity = 'wsp_22222222-2222-4222-8222-222222222222';
    await writeFile(
      path.join(gitDirectory, 'neoflow-workspace-identity.json'),
      `${JSON.stringify({
        formatVersion: 1,
        workspaceIdentity: replacementIdentity,
      })}\n`,
    );

    expect(await bootstrapWorkspace({ startPath: copiedWorktree })).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-identity-collision',
        reason: 'registered-worktree-mismatch',
        workspaceIdentity: replacementIdentity,
        registeredCheckout: await realpath(linkedWorktree),
        attemptedCheckout: await realpath(copiedWorktree),
      },
    });
  });

  it('converges concurrent bootstrap attempts on one worktree identity', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);

    const attempts = await Promise.all(Array.from({ length: 8 }, () => readyWorkspace(repository)));
    expect(new Set(attempts.map(attempt => attempt.view.workspaceIdentity)).size).toBe(1);
  });

  it('reports damaged identity authority without replacing it', async () => {
    const { root, stateHome } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    await readyWorkspace(repository);

    const gitDirectory = await realpath(await runGit(repository, 'rev-parse', '--absolute-git-dir'));
    const markerFile = path.join(gitDirectory, 'neoflow-workspace-identity.json');
    const markerBytes = await readFile(markerFile);
    await unlink(markerFile);

    const missingMarker = await bootstrapWorkspace({ startPath: repository });
    expect(missingMarker).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-marker-missing',
        canonicalCheckout: await realpath(repository),
      },
    });
    expect(await pathExists(markerFile)).toBe(false);

    await writeFile(markerFile, markerBytes);
    await writeFile(markerFile, '{damaged marker\n');

    const damagedMarker = await bootstrapWorkspace({ startPath: repository });
    expect(damagedMarker).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-marker-invalid',
        canonicalCheckout: await realpath(repository),
      },
    });
    expect(await readFile(markerFile, 'utf8')).toBe('{damaged marker\n');

    await writeFile(markerFile, markerBytes);
    const registryFile = path.join(stateHome, 'buildframe', 'workspace-registry.json');
    await writeFile(registryFile, '{damaged registry\n');

    const damagedRegistry = await bootstrapWorkspace({ startPath: repository });
    expect(damagedRegistry).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'workspace-registry-invalid',
        reason: 'malformed',
      },
    });
    expect(await readFile(registryFile, 'utf8')).toBe('{damaged registry\n');
  });

  it('rejects non-Git and bare inputs without creating identity authority', async () => {
    const { root, stateHome } = await createFixture();
    const ordinaryDirectory = path.join(root, 'ordinary-directory');
    await mkdir(ordinaryDirectory);

    const nonGit = await bootstrapWorkspace({ startPath: ordinaryDirectory });
    expect(nonGit).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'not-git-worktree',
        requestedPath: ordinaryDirectory,
      },
    });
    expect(await pathExists(stateHome)).toBe(false);

    const bareRepository = path.join(root, 'bare.git');
    await runGit(root, 'init', '--bare', bareRepository);
    const bare = await bootstrapWorkspace({ startPath: bareRepository });
    expect(bare).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'bare-git-repository',
        requestedPath: bareRepository,
      },
    });
    expect(await pathExists(stateHome)).toBe(false);
    expect(await pathExists(path.join(bareRepository, 'neoflow-workspace-identity.json'))).toBe(false);
  });

  it('rejects native Windows before creating identity authority', async () => {
    const { root, stateHome } = await createFixture();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

    const result = await bootstrapWorkspace({ startPath: root });

    expect(result).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'unsupported-platform',
        platform: 'win32',
        reason: 'native-windows',
      },
    });
    expect(await pathExists(stateHome)).toBe(false);
  });
});
