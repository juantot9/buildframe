import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withRegistryLock } from '../../src/registryLock.js';

// One injected failure: the next matching call rejects with EPERM, as Windows
// does for a name another handle is still deleting.
const failNext = vi.hoisted(() => ({ call: undefined as string | undefined, pathPart: '' }));

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const failing =
    <A extends unknown[], R>(name: string, original: (...arguments_: A) => Promise<R>) =>
    async (...arguments_: A): Promise<R> => {
      if (failNext.call === name && String(arguments_[0]).includes(failNext.pathPart)) {
        failNext.call = undefined;
        throw Object.assign(new Error(`${name}: operation not permitted`), { code: 'EPERM' });
      }
      return await original(...arguments_);
    };
  return { ...actual, mkdir: failing('mkdir', actual.mkdir), readFile: failing('readFile', actual.readFile) };
});

const windows = process.platform === 'win32';
let stateDirectory: string;

beforeEach(async () => {
  stateDirectory = path.join(await mkdtemp(path.join(tmpdir(), 'buildframe-registry-lock-')), 'state');
});

afterEach(async () => {
  failNext.call = undefined;
  await rm(path.dirname(stateDirectory), { recursive: true, force: true });
});

async function locked(): Promise<unknown> {
  return await withRegistryLock(stateDirectory, 'requested', async () => 'entered').catch(
    (error: { diagnostic?: unknown }) => error.diagnostic,
  );
}

const refused = { code: 'workspace-authority-unavailable', requestedPath: 'requested', operation: 'lock-registry' };

describe('registry lock under a pending delete', () => {
  it(`${windows ? 'waits out' : 'refuses'} EPERM creating the lock directory`, async () => {
    failNext.call = 'mkdir';
    failNext.pathPart = 'workspace-registry.lock';
    expect(await locked()).toEqual(windows ? 'entered' : refused);
  });

  it(`${windows ? 'waits out' : 'refuses'} EPERM reading an abandoned owner record`, async () => {
    // An old lock with a partial owner record: removable once it can be read.
    const lockDirectory = path.join(stateDirectory, 'workspace-registry.lock');
    await mkdir(lockDirectory, { recursive: true });
    await writeFile(path.join(lockDirectory, 'owner-00000000-0000-4000-8000-000000000000.json'), '{');
    const old = new Date(Date.now() - 5 * 60_000);
    await utimes(lockDirectory, old, old);
    failNext.call = 'readFile';
    failNext.pathPart = 'owner-00000000';
    expect(await locked()).toEqual(windows ? 'entered' : refused);
  });
});
