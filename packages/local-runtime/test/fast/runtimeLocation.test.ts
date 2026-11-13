import { chmod, lstat, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  preparePrivateRuntimeDirectory,
  validatePrivateRuntimeEndpoint,
  type RuntimeLocation,
} from '../../src/runtimeLocation.js';

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'buildframe-runtime-location-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

function fallbackLocation(base: string): RuntimeLocation {
  const directory = path.join(base, 'buildframe');
  return { directory, endpoint: path.join(directory, 'w-test.sock'), ownedBase: base };
}

describe('the shared fallback runtime base', () => {
  it('is created owner-private along with the runtime directory', async () => {
    const location = fallbackLocation(path.join(scratch, 'buildframe-501'));

    await preparePrivateRuntimeDirectory(location);

    expect((await lstat(location.ownedBase!)).mode & 0o777).toBe(0o700);
    expect((await lstat(location.directory)).mode & 0o777).toBe(0o700);
    await expect(validatePrivateRuntimeEndpoint(location)).rejects.toMatchObject({
      code: 'runtime-endpoint-missing',
    });
  });

  it('is tightened when it already exists with a loose mode', async () => {
    const location = fallbackLocation(path.join(scratch, 'buildframe-501'));
    await mkdir(location.ownedBase!, { mode: 0o755 });
    await chmod(location.ownedBase!, 0o755);

    await preparePrivateRuntimeDirectory(location);

    expect((await lstat(location.ownedBase!)).mode & 0o777).toBe(0o700);
  });

  it('is refused when it is a symlink', async () => {
    const elsewhere = path.join(scratch, 'elsewhere');
    await mkdir(elsewhere, { mode: 0o700 });
    const location = fallbackLocation(path.join(scratch, 'buildframe-501'));
    await symlink(elsewhere, location.ownedBase!);

    await expect(preparePrivateRuntimeDirectory(location)).rejects.toMatchObject({
      code: 'runtime-directory-insecure',
    });
  });

  it('is refused by clients once it is no longer owner-private', async () => {
    const location = fallbackLocation(path.join(scratch, 'buildframe-501'));
    await preparePrivateRuntimeDirectory(location);
    await chmod(location.ownedBase!, 0o777);

    await expect(validatePrivateRuntimeEndpoint(location)).rejects.toMatchObject({
      code: 'runtime-directory-insecure',
    });
  });
});
