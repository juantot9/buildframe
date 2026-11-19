import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fsyncPath, renameFile, renameFileSync, syncDirectory, syncDirectorySync } from '../../src/durableFiles.js';

const roots = new Set<string>();
const holders = new Set<ChildProcess>();

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-durable-files-'));
  roots.add(root);
  return root;
}

afterEach(async () => {
  for (const holder of holders) holder.kill();
  holders.clear();
  await Promise.all([...roots].map(async root => await rm(root, { recursive: true, force: true })));
  roots.clear();
});

function failure(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** Another process that keeps `file` open for `milliseconds`, as antivirus or a reader would. */
async function holdOpen(file: string, milliseconds: number): Promise<ChildProcess> {
  const source = `const fs = require('node:fs');
const descriptor = fs.openSync(${JSON.stringify(file)}, 'r');
process.stdout.write('ready');
setTimeout(() => { fs.closeSync(descriptor); process.exit(0); }, ${milliseconds});`;
  const holder = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'inherit'] });
  holders.add(holder);
  await new Promise<void>((resolve, reject) => {
    holder.stdout?.once('data', () => resolve());
    holder.once('error', reject);
  });
  return holder;
}

describe('renaming a published file', () => {
  it('retries a busy rename on Windows, then succeeds', async () => {
    let syncAttempts = 0;
    renameFileSync('from', 'to', {
      platform: 'win32',
      rename: () => {
        syncAttempts += 1;
        if (syncAttempts < 3) throw failure(syncAttempts === 1 ? 'EBUSY' : 'EPERM');
      },
    });
    expect(syncAttempts).toBe(3);

    let asyncAttempts = 0;
    await renameFile('from', 'to', {
      platform: 'win32',
      rename: async () => {
        asyncAttempts += 1;
        if (asyncAttempts < 3) throw failure('EACCES');
      },
    });
    expect(asyncAttempts).toBe(3);
  });

  it('gives up after a bounded number of attempts and reports the last error', async () => {
    let attempts = 0;
    expect(() =>
      renameFileSync('from', 'to', {
        platform: 'win32',
        rename: () => {
          attempts += 1;
          throw failure('EPERM');
        },
      }),
    ).toThrow('EPERM');
    expect(attempts).toBe(8);
  });

  it('never retries other errors, and never retries outside Windows', async () => {
    for (const [platform, code] of [
      ['win32', 'ENOENT'],
      ['linux', 'EBUSY'],
      ['darwin', 'EPERM'],
    ] as const) {
      let attempts = 0;
      await expect(
        renameFile('from', 'to', {
          platform,
          rename: async () => {
            attempts += 1;
            throw failure(code);
          },
        }),
      ).rejects.toMatchObject({ code });
      expect(attempts).toBe(1);
    }
  });

  it.runIf(process.platform === 'win32')(
    'replaces a file another process holds open, once it lets go',
    async () => {
      const root = await temporaryRoot();
      const current = path.join(root, 'CURRENT');
      await writeFile(current, 'generation-1\n');

      for (const replace of [
        async (from: string, to: string) => renameFileSync(from, to),
        async (from: string, to: string) => await renameFile(from, to),
      ]) {
        const prepared = path.join(root, '.CURRENT.tmp');
        await writeFile(prepared, 'generation-2\n');
        await holdOpen(current, 200);
        await replace(prepared, current);
        expect(await readFile(current, 'utf8')).toBe('generation-2\n');
        await writeFile(current, 'generation-1\n');
      }
    },
    10_000,
  );

  it.runIf(process.platform === 'win32')(
    'reports the failure when the other process holds on past the bound',
    async () => {
      const root = await temporaryRoot();
      const current = path.join(root, 'CURRENT');
      const prepared = path.join(root, '.CURRENT.tmp');
      await writeFile(current, 'generation-1\n');
      await writeFile(prepared, 'generation-2\n');
      await holdOpen(current, 5_000);

      expect(() => renameFileSync(prepared, current)).toThrow(expect.objectContaining({ code: 'EPERM' }));
      expect(await readFile(current, 'utf8')).toBe('generation-1\n');
      expect(await readFile(prepared, 'utf8')).toBe('generation-2\n');
    },
    10_000,
  );
});

describe('flushing a file', () => {
  it('flushes an existing file on this platform', async () => {
    const root = await temporaryRoot();
    const file = path.join(root, '.candidate.sqlite');
    await writeFile(file, 'generation bytes');
    // On Windows a read-only handle cannot be flushed (EPERM).
    expect(() => fsyncPath(file)).not.toThrow();
    expect(await readFile(file, 'utf8')).toBe('generation bytes');
  });
});

describe('syncing a directory after a rename', () => {
  it('opens and flushes the directory outside Windows, and skips it on Windows', async () => {
    const missing = path.join(await temporaryRoot(), 'missing');
    // Skipped: not even opened, so a missing directory is not an error.
    expect(() => syncDirectorySync(missing, { platform: 'win32' })).not.toThrow();
    await expect(syncDirectory(missing, { platform: 'win32' })).resolves.toBeUndefined();
    // Opened: the same directory is missing.
    expect(() => syncDirectorySync(missing, { platform: 'linux' })).toThrow(
      expect.objectContaining({ code: 'ENOENT' }),
    );
    await expect(syncDirectory(missing, { platform: 'darwin' })).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('flushes a real directory on this platform', async () => {
    const root = await temporaryRoot();
    expect(() => syncDirectorySync(root)).not.toThrow();
    await expect(syncDirectory(root)).resolves.toBeUndefined();
  });
});
