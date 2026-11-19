import { execFile } from 'node:child_process';
import { access, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { linkOverlayEntry, removeInspectionOverlay } from '../../src/gitInspectionLinks.js';
import { prepareGitInspectionContext, resolveGitExecutable, runGitProcess } from '../../src/gitProcess.js';

const execFileAsync = promisify(execFile);
const roots = new Set<string>();

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-inspection-overlay-'));
  roots.add(root);
  return root;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all([...roots].map(async root => await rm(root, { recursive: true, force: true })));
  roots.clear();
});

// Windows has no unprivileged symlinks, so only its own rule runs there. On
// macOS and Linux both rules run (a junction request makes a plain symlink).
const rules: readonly NodeJS.Platform[] = process.platform === 'win32' ? ['win32'] : ['linux', 'win32'];

describe('Inspection overlay links', () => {
  it.each(rules)('shows a directory and a file through the overlay (%s rule)', async platform => {
    const root = await temporaryRoot();
    const target = path.join(root, 'target');
    await mkdir(path.join(target, 'pack'), { recursive: true });
    await writeFile(path.join(target, 'pack', 'object'), 'object bytes');
    await writeFile(path.join(root, 'packed-refs'), 'refs bytes');
    const overlay = path.join(root, 'overlay');
    await mkdir(overlay);

    await linkOverlayEntry(target, path.join(overlay, 'objects'), 'dir', { platform });
    await linkOverlayEntry(path.join(root, 'packed-refs'), path.join(overlay, 'packed-refs'), 'file', { platform });

    expect((await lstat(path.join(overlay, 'objects'))).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(overlay, 'objects', 'pack', 'object'), 'utf8')).toBe('object bytes');
    expect(await readFile(path.join(overlay, 'packed-refs'), 'utf8')).toBe('refs bytes');
    if (platform === 'win32') {
      // A hard link: the same file under a second name, not a link to follow.
      expect((await lstat(path.join(overlay, 'packed-refs'))).isSymbolicLink()).toBe(false);
      expect((await stat(path.join(overlay, 'packed-refs'))).ino).toBe(
        (await stat(path.join(root, 'packed-refs'))).ino,
      );
    }
  });

  it('copies a file on Windows when a hard link is impossible', async () => {
    const root = await temporaryRoot();
    const source = path.join(root, 'packed-refs');
    const destination = path.join(root, 'overlay-packed-refs');
    await writeFile(source, 'refs at inspection time');
    const crossVolume = Object.assign(new Error('cross-device link'), { code: 'EXDEV' });

    await linkOverlayEntry(source, destination, 'file', {
      platform: 'win32',
      hardLink: async () => {
        throw crossVolume;
      },
    });
    await writeFile(source, 'refs rewritten later');

    expect((await lstat(destination)).isSymbolicLink()).toBe(false);
    expect(await readFile(destination, 'utf8')).toBe('refs at inspection time');
  });

  it.each(rules)('removes the overlay without touching what it links to (%s rule)', async platform => {
    const root = await temporaryRoot();
    const repository = path.join(root, 'repository');
    await mkdir(path.join(repository, 'objects', 'pack'), { recursive: true });
    await mkdir(path.join(repository, 'info'));
    await writeFile(path.join(repository, 'objects', 'pack', 'object'), 'object bytes');
    await writeFile(path.join(repository, 'packed-refs'), 'refs bytes');
    await writeFile(path.join(repository, 'info', 'exclude'), 'exclude bytes');

    const overlay = path.join(root, 'overlay');
    const common = path.join(overlay, 'common');
    await mkdir(path.join(common, 'info'), { recursive: true });
    await linkOverlayEntry(path.join(repository, 'objects'), path.join(common, 'objects'), 'dir', { platform });
    await linkOverlayEntry(path.join(repository, 'packed-refs'), path.join(common, 'packed-refs'), 'file', {
      platform,
    });
    await linkOverlayEntry(path.join(repository, 'info', 'exclude'), path.join(common, 'info', 'exclude'), 'file', {
      platform,
    });
    await writeFile(path.join(common, 'config'), '[core]\n');

    await removeInspectionOverlay(overlay);

    expect(await exists(overlay)).toBe(false);
    expect(await readFile(path.join(repository, 'objects', 'pack', 'object'), 'utf8')).toBe('object bytes');
    expect(await readFile(path.join(repository, 'packed-refs'), 'utf8')).toBe('refs bytes');
    expect(await readFile(path.join(repository, 'info', 'exclude'), 'utf8')).toBe('exclude bytes');
    await expect(removeInspectionOverlay(overlay)).resolves.toBeUndefined();
  });
});

async function git(repository: string, ...arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync(await resolveGitExecutable(), ['-C', repository, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
  });
  return stdout;
}

async function directoryListing(directory: string): Promise<string[]> {
  return (await readdir(directory, { recursive: true })).map(entry => entry.replaceAll('\\', '/')).sort();
}

describe('Inspection overlay over a real repository', () => {
  it('reports what plain Git reports, hides checkout config, and leaves .git unchanged', async () => {
    const root = await temporaryRoot();
    const repository = path.join(root, 'repository');
    await mkdir(repository);
    await git(repository, 'init', '--initial-branch=main');
    await git(repository, 'config', 'user.name', 'BuildFrame Test');
    await git(repository, 'config', 'user.email', 'buildframe@example.invalid');
    await writeFile(path.join(repository, 'tracked.txt'), 'one\n');
    await writeFile(path.join(repository, 'staged.txt'), 'staged\n');
    await git(repository, 'add', '.');
    await git(repository, 'commit', '-m', 'initial');
    await git(repository, 'tag', 'v1');
    await git(repository, 'pack-refs', '--all');
    await writeFile(path.join(repository, 'tracked.txt'), 'two\n');
    await writeFile(path.join(repository, 'staged.txt'), 'staged twice\n');
    await git(repository, 'add', 'staged.txt');
    await writeFile(path.join(repository, 'untracked.txt'), 'new\n');

    // Checkout config BuildFrame admits but must never act on.
    const hooks = path.join(root, 'hooks');
    const marker = path.join(root, 'hook-ran');
    await mkdir(hooks);
    await writeFile(path.join(hooks, 'post-checkout'), `#!/bin/sh\nprintf ran > ${JSON.stringify(marker)}\n`, {
      mode: 0o700,
    });
    await git(repository, 'config', 'core.hooksPath', hooks);

    const gitDirectory = path.join(repository, '.git');
    const listingBefore = await directoryListing(gitDirectory);
    const packedRefsBefore = await readFile(path.join(gitDirectory, 'packed-refs'));

    const context = await prepareGitInspectionContext(repository, gitDirectory);
    const overlayCommon = context.environment.GIT_COMMON_DIR as string;
    const inspect = async (arguments_: string[], allowedExitCodes?: number[]): Promise<string> => {
      const result = await runGitProcess({
        executable: context.executable,
        checkout: context.checkout,
        arguments: arguments_,
        environment: context.environment,
        maxStdoutBytes: 1024 * 1024,
        timeoutMilliseconds: 10_000,
        ...(allowedExitCodes === undefined ? {} : { allowedExitCodes }),
      });
      return result.stdout.toString('utf8');
    };
    try {
      expect((await lstat(path.join(overlayCommon, 'objects'))).isSymbolicLink()).toBe(true);
      if (process.platform === 'win32') {
        expect((await stat(path.join(overlayCommon, 'packed-refs'))).ino).toBe(
          (await stat(path.join(gitDirectory, 'packed-refs'))).ino,
        );
      }

      for (const arguments_ of [
        ['rev-parse', 'HEAD'],
        ['for-each-ref', '--format=%(refname) %(objectname)'],
        ['status', '--porcelain=v2', '--untracked-files=all'],
        ['diff', '--cached', '--name-status'],
      ]) {
        expect(await inspect(arguments_)).toBe(await git(repository, ...arguments_));
      }
      expect(await inspect(['config', '--get', 'core.hooksPath'], [0, 1])).toBe('');
      await inspect(['hook', 'run', '--ignore-missing', 'post-checkout']);
      expect(await exists(marker)).toBe(false);
    } finally {
      await context.dispose();
    }

    expect(await exists(path.dirname(overlayCommon))).toBe(false);
    expect(await directoryListing(gitDirectory)).toEqual(listingBefore);
    expect(await readFile(path.join(gitDirectory, 'packed-refs'))).toEqual(packedRefsBefore);
    await git(repository, 'fsck', '--no-progress');
  });
});
