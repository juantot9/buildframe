import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBounded, stillHolds } from '../../src/legacyReviewSourceRead.js';

let root: string;
let file: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-legacy-read-'));
  file = path.join(root, 'receipt.json');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function withHandle<T>(use: (handle: fs.FileHandle) => Promise<T>): Promise<T> {
  const handle = await fs.open(file, 'r');
  try {
    return await use(handle);
  } finally {
    await handle.close();
  }
}

describe('reading a legacy Review source', () => {
  it('reads the whole file within the bound, and nothing beyond it', async () => {
    await fs.writeFile(file, 'receipt-1');
    expect((await withHandle(async handle => await readBounded(handle, 9)))?.toString()).toBe('receipt-1');
    expect(await withHandle(async handle => await readBounded(handle, 8))).toBeUndefined();
    await fs.writeFile(file, '');
    expect((await withHandle(async handle => await readBounded(handle, 8)))?.byteLength).toBe(0);
  });

  it('confirms unchanged bytes by reading them again', async () => {
    await fs.writeFile(file, 'receipt-1');
    expect(await withHandle(async handle => await stillHolds(handle, (await readBounded(handle, 64))!))).toBe(true);
  });

  // WIN-004: on Windows a same-size rewrite within one clock tick can leave
  // size and file times unchanged, so only the bytes show it.
  it('notices a same-size rewrite, a longer file and a shorter one', async () => {
    await fs.writeFile(file, 'receipt-1');
    for (const rewritten of ['receipt-2', 'receipt-10', 'receipt']) {
      const held = await withHandle(async handle => {
        const bytes = (await readBounded(handle, 64))!;
        await fs.writeFile(file, rewritten);
        return await stillHolds(handle, bytes);
      });
      expect(held).toBe(false);
      await fs.writeFile(file, 'receipt-1');
    }
  });
});
