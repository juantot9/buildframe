import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openIfSame, openUnfollowed } from '../../src/workspaceEvidence/openUnfollowed.js';
import { itWithSymlinks } from '../platformCases.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-unfollowed-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function contentOf(opening: Promise<fs.FileHandle | undefined>): Promise<string | undefined> {
  const handle = await opening;
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
  const read = async (name: string) => await contentOf(openUnfollowed(Buffer.from(path.join(root, name)), 0, noFollow));

  it('reads a regular file and refuses a missing one', async () => {
    await fs.writeFile(path.join(root, 'file.txt'), 'content');
    expect(await read('file.txt')).toBe('content');
    expect(await read('absent.txt')).toBeUndefined();
  });

  itWithSymlinks('refuses a symlink to a file', async () => {
    await fs.writeFile(path.join(root, 'target.txt'), 'target');
    await fs.symlink(path.join(root, 'target.txt'), path.join(root, 'link.txt'), 'file');
    expect(await read('link.txt')).toBeUndefined();
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
    const checked = await fs.lstat(path.join(root, 'checked.txt'), { bigint: true });
    const opened = await fs.lstat(path.join(root, 'opened.txt'), { bigint: true });
    // The check saw `checked.txt`; by the open, the path holds `opened.txt`.
    expect(await contentOf(openIfSame(Buffer.from(path.join(root, 'opened.txt')), checked))).toBeUndefined();
    expect(await contentOf(openIfSame(Buffer.from(path.join(root, 'opened.txt')), opened))).toBe('opened');
  });
});
