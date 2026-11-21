import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  accessIsPrivate,
  protectWindowsDirectory,
  tightenWindowsDirectory,
  windowsDirectoryPrivacy,
} from '../../src/privateDirectories.js';
import {
  currentUserInSddl,
  currentUserSid,
  readOwnerAndAccess,
  sidInSddl,
  writeProtectedAccess,
} from '../../src/windowsSecurity.js';

const roots = new Set<string>();

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-private-directory-'));
  roots.add(root);
  return root;
}

afterEach(async () => {
  await Promise.all([...roots].map(async root => await rm(root, { recursive: true, force: true })));
  roots.clear();
});

/** Lets every local user read the directory, as a careless tool or a copied folder might. */
function widenToUsers(directory: string): void {
  const userSid = currentUserSid();
  writeProtectedAccess(directory, `D:P(A;OICI;FA;;;${userSid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)`);
}

// Real access lists through node:ffi; the tests run with --experimental-ffi.
describe.runIf(process.platform === 'win32')('Windows private directories', () => {
  it('reads the user this process runs as', () => {
    expect(currentUserSid()).toMatch(/^S-1-5-21-\d+-\d+-\d+-\d+$/u);
  });

  it('spells the built-in Administrator as SDDL does, so a directory private to it reads as private', async () => {
    // GitHub's Windows runners run as this account; its access lists say `LA`, not its SID.
    const administrator = currentUserSid().replace(/-\d+$/u, '-500');
    expect(sidInSddl(administrator)).toBe('LA');
    expect(sidInSddl(currentUserSid())).toBe(currentUserInSddl());

    // The current user stays on the list, or the test could not remove the directory.
    const directory = await temporaryRoot();
    const user = currentUserSid();
    writeProtectedAccess(
      directory,
      `D:P(A;OICI;FA;;;${administrator})(A;OICI;FA;;;${user})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`,
    );
    // Read as the administrator would see it: the user's own entry is not theirs,
    // unless the user is the administrator (GitHub's runner).
    let access = readOwnerAndAccess(directory).replace(/^O:[^D]+/u, 'O:LA');
    if (user !== administrator) access = access.replace(`(A;OICI;FA;;;${currentUserInSddl()})`, '');
    expect(access).toContain('(A;OICI;FA;;;LA)');
    expect(accessIsPrivate(access, sidInSddl(administrator))).toBe(true);
    expect(accessIsPrivate(access, administrator)).toBe(false);
  });

  it('protects a new directory and reports it private', async () => {
    const directory = path.join(await temporaryRoot(), 'state');
    await mkdir(directory);

    protectWindowsDirectory(directory);

    expect(readOwnerAndAccess(directory)).toMatch(/D:P/u);
    expect(windowsDirectoryPrivacy(directory)).toBe('private');
  });

  it('notices a directory others can read, and tightens it back', async () => {
    const directory = path.join(await temporaryRoot(), 'state');
    await mkdir(directory);
    widenToUsers(directory);
    expect(windowsDirectoryPrivacy(directory)).toBe('not-private');

    expect(tightenWindowsDirectory(directory)).toBe('protected');
    expect(windowsDirectoryPrivacy(directory)).toBe('private');
    expect(readOwnerAndAccess(directory)).not.toMatch(/;BU\)/u);
  });

  it('passes the private access list to what is created inside', async () => {
    const directory = path.join(await temporaryRoot(), 'state');
    await mkdir(directory);
    protectWindowsDirectory(directory);
    await mkdir(path.join(directory, 'workspaces', 'wsp_1'), { recursive: true });
    await writeFile(path.join(directory, 'workspaces', 'wsp_1', 'CURRENT'), 'generation\n');

    const userSid = currentUserInSddl();
    for (const inside of [path.join(directory, 'workspaces'), path.join(directory, 'workspaces', 'wsp_1', 'CURRENT')]) {
      const access = readOwnerAndAccess(inside);
      expect(access).not.toMatch(/;(BU|WD|AU)\)/u);
      // Inherited, not protected itself, but allowing only the same accounts.
      expect(accessIsPrivate(access.replace('D:', 'D:P'), userSid)).toBe(true);
    }
  });

  it('reports the inherited profile directory as not protected', () => {
    const localAppData = process.env.LOCALAPPDATA as string;
    expect(windowsDirectoryPrivacy(localAppData)).toBe('not-private');
  });
});
