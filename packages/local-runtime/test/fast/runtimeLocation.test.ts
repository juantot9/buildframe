import { chmod, lstat, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { currentUserSid, writeProtectedAccess } from '../../../workspace/src/windowsSecurity.js';
import {
  preparePrivateRuntimeDirectory,
  validatePrivateRuntimeEndpoint,
  type RuntimeLocation,
} from '../../src/runtimeLocation.js';
import { prepareWindowsRuntimeDirectory, validateWindowsRuntimeDirectory } from '../../src/windowsRuntimeEndpoint.js';

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

// These cases are POSIX: owner ids, modes, symlinks and a Unix socket. The
// Windows runtime directory has its own cases below.
describe.skipIf(process.platform === 'win32')('the shared fallback runtime base', () => {
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

describe.skipIf(process.platform === 'win32')('the runtime endpoint', () => {
  it('is owner-private from the moment it exists, so a connector never sees it insecure', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--conditions=development',
        '--import=tsx',
        fileURLToPath(new URL('./privateEndpointProcess.ts', import.meta.url)),
      ],
      { cwd: fileURLToPath(new URL('../../../../', import.meta.url)), encoding: 'utf8', timeout: 30_000 },
    );
    expect(JSON.parse(stdout)).toEqual({ mode: 0o600, validation: 'valid', umaskAfter: 0o022 });
  });
});

describe.runIf(process.platform === 'win32')('the Windows runtime directory', () => {
  const widenToUsers = (directory: string): void => {
    const user = currentUserSid();
    writeProtectedAccess(directory, `D:P(A;OICI;FA;;;${user})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)`);
  };

  it('is created private to the user', async () => {
    const directory = path.join(scratch, 'BuildFrame', 'runtime');

    await prepareWindowsRuntimeDirectory(directory);

    await expect(validateWindowsRuntimeDirectory(directory)).resolves.toBe('private');
  });

  it('is tightened when it already exists readable by other users', async () => {
    const directory = path.join(scratch, 'BuildFrame', 'runtime');
    await mkdir(directory, { recursive: true });
    widenToUsers(directory);

    await prepareWindowsRuntimeDirectory(directory);

    await expect(validateWindowsRuntimeDirectory(directory)).resolves.toBe('private');
  });

  it('is refused when a junction stands in its place', async () => {
    const elsewhere = path.join(scratch, 'elsewhere');
    await mkdir(elsewhere);
    const directory = path.join(scratch, 'runtime');
    await symlink(elsewhere, directory, 'junction');

    await expect(prepareWindowsRuntimeDirectory(directory)).rejects.toMatchObject({
      code: 'runtime-directory-insecure',
    });
    await expect(validateWindowsRuntimeDirectory(directory)).rejects.toMatchObject({
      code: 'runtime-directory-insecure',
    });
  });

  it('is refused by clients once it is no longer private, and missing when absent', async () => {
    const directory = path.join(scratch, 'BuildFrame', 'runtime');
    await expect(validateWindowsRuntimeDirectory(directory)).rejects.toMatchObject({
      code: 'runtime-endpoint-missing',
    });
    await prepareWindowsRuntimeDirectory(directory);
    widenToUsers(directory);

    await expect(validateWindowsRuntimeDirectory(directory)).rejects.toMatchObject({
      code: 'runtime-directory-insecure',
    });
  });
});
