import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { gitLinkTarget, readLinkTarget } from '../../src/linkTarget.js';
import { itWithSymlinks } from '../platformCases.js';

const text = (value: Buffer): string => value.toString('utf8');

describe('symlink targets as Git records them', () => {
  it('keeps raw bytes on macOS and Linux, a \\ included', () => {
    expect(text(gitLinkTarget(Buffer.from('../a\\b'), 'linux'))).toBe('../a\\b');
    expect(text(gitLinkTarget(Buffer.from('../a\\b'), 'darwin'))).toBe('../a\\b');
  });

  it('reads Windows separators as / on Windows', () => {
    expect(text(gitLinkTarget(Buffer.from('..\\outside\\a.txt'), 'win32'))).toBe('../outside/a.txt');
  });

  describe('on this host', () => {
    let root: string;
    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-link-target-'));
    });
    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });

    itWithSymlinks('reads a relative target with / as written', async () => {
      await fs.mkdir(path.join(root, 'outside'));
      await fs.symlink('../outside', path.join(root, 'checkout-link'), 'dir');
      expect(text((await readLinkTarget(path.join(root, 'checkout-link')))!)).toBe('../outside');
    });

    it('is undefined for a path that is not a link', async () => {
      await fs.writeFile(path.join(root, 'file.txt'), 'content');
      expect(await readLinkTarget(path.join(root, 'file.txt'))).toBeUndefined();
    });
  });
});
