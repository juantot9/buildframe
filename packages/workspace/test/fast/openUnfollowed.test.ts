import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openUnfollowed } from '../../src/workspaceEvidence/openUnfollowed.js';
import { itWithSymlinks } from '../platformCases.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-unfollowed-'));
});

afterEach(async () => {
  vi.mocked(fs.lstat).mockClear();
  await fs.rm(root, { recursive: true, force: true });
});

async function contentOf(filename: string, noFollow: number | undefined): Promise<string | undefined> {
  const handle = await openUnfollowed(Buffer.from(filename), 0, noFollow);
  if (handle === undefined) return undefined;
  try {
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

// `O_NOFOLLOW` where the platform has it; `undefined` is the Windows path, which runs anywhere.
const modes = [
  ...(constants.O_NOFOLLOW === undefined ? [] : [['O_NOFOLLOW', constants.O_NOFOLLOW] as const]),
  ['same file before and after the open', undefined] as const,
];

describe.each(modes)('opening without following links (%s)', (_name, noFollow) => {
  it('reads a regular file and refuses a missing one', async () => {
    await fs.writeFile(path.join(root, 'file.txt'), 'content');
    expect(await contentOf(path.join(root, 'file.txt'), noFollow)).toBe('content');
    expect(await contentOf(path.join(root, 'absent.txt'), noFollow)).toBeUndefined();
  });

  itWithSymlinks('refuses a symlink to a file', async () => {
    await fs.writeFile(path.join(root, 'target.txt'), 'target');
    await fs.symlink(path.join(root, 'target.txt'), path.join(root, 'link.txt'), 'file');
    expect(await contentOf(path.join(root, 'link.txt'), noFollow)).toBeUndefined();
  });
});

describe('opening without following links on Windows', () => {
  it('refuses a directory link (a junction on Windows, which needs no privilege)', async () => {
    await fs.mkdir(path.join(root, 'directory'));
    await fs.symlink(path.join(root, 'directory'), path.join(root, 'link'), 'junction');
    expect(await openUnfollowed(Buffer.from(path.join(root, 'link')), 0, undefined)).toBeUndefined();
  });

  it('refuses the open when the path became another file after the check', async () => {
    await fs.writeFile(path.join(root, 'checked.txt'), 'checked');
    await fs.writeFile(path.join(root, 'opened.txt'), 'opened');
    // The check sees one file; by the open, the path holds another.
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(fs.lstat).mockImplementationOnce(
      async () => await actual.lstat(path.join(root, 'checked.txt'), { bigint: true }),
    );
    expect(await contentOf(path.join(root, 'opened.txt'), undefined)).toBeUndefined();
  });
});
