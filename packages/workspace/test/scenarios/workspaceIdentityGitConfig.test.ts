import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapWorkspace } from '../../src/index.js';
import {
  commandMarker,
  createFixture,
  createRepository,
  pathExists,
  readyWorkspace,
  restoreIdentityFixtures,
  runGit,
} from './workspaceIdentityScenarios.js';

afterEach(restoreIdentityFixtures);

/** A path as a Git config value: unescaped backslashes in a Windows path are invalid there. */
const configPath = (file: string): string => file.replaceAll(path.sep, '/');

describe('Workspace Identity and Git configuration', () => {
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
    await writeFile(includedConfiguration, `[core]\n\tfsmonitor = ${configPath(included.command)}\n`);
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
    await writeFile(includedConfiguration, `[core]\n\tfsmonitor = ${configPath(included.command)}\n`);
    await writeFile(
      path.join(home, '.gitconfig'),
      ['[includeIf "hasconfig:remote.*.url:evil"]', `\tpath = ${configPath(includedConfiguration)}`, ''].join('\n'),
    );

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'git-inspection-failed' },
    });
    expect(await pathExists(included.marker)).toBe(false);
  });
});
