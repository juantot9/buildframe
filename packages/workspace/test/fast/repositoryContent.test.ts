import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRepositoryContentWindow } from '../../src/workspaceEvidence/repositoryContent.js';
import { itWithSymlinks } from '../platformCases.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'buildframe-content-window-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function read(text: string | Buffer, anchorLine = 1, budget = 256 * 1024) {
  const filename = path.join(root, 'source.txt');
  await writeFile(filename, text);
  return await readRepositoryContentWindow(Buffer.from(filename), 2 * 1024 * 1024, budget, anchorLine);
}

describe('bounded repository content windows', () => {
  it.each([
    ['', 1],
    ['a', 1],
    ['a\n', 1],
    ['\n', 1],
    ['\n\n', 2],
    ['a\n\n', 2],
  ] as const)('preserves exact bytes and real line counts for %j', async (text, totalLines) => {
    const view = await read(text);
    expect(view).toMatchObject({
      status: 'available',
      firstLine: 1,
      lineCount: totalLines,
      totalLines,
      truncated: false,
    });
    if (view.status !== 'available') throw new Error('Window unavailable');
    expect(Buffer.from(view.bytesBase64, 'base64').toString('utf8')).toBe(text);
    expect(view.totalByteLength).toBe(Buffer.byteLength(text));
  });

  it('finds distant UTF-8 lines without splitting characters or retaining a whole-file line index', async () => {
    const lines = Array.from({ length: 20_000 }, (_, index) => `${index + 1}: ${'🙂'.repeat(16)}\n`);
    const text = lines.join('');
    for (const anchorLine of [1, 12_345, 20_000, Number.MAX_SAFE_INTEGER]) {
      const view = await read(text, anchorLine);
      expect(view).toMatchObject({ status: 'available', totalLines: lines.length, truncated: true });
      if (view.status !== 'available') throw new Error('Window unavailable');
      expect(view.lineCount).toBeLessThanOrEqual(512);
      expect(view.byteLength).toBeLessThanOrEqual(256 * 1024);
      const shown = Buffer.from(view.bytesBase64, 'base64').toString('utf8');
      expect(shown).toBe(lines.slice(view.firstLine - 1, view.firstLine - 1 + view.lineCount).join(''));
      expect(shown).toContain(lines[Math.min(anchorLine, lines.length) - 1]);
      expect(shown).not.toContain('\uFFFD');
    }
  });

  it('honours the byte budget with complete lines, including CRLF', async () => {
    const lines = Array.from({ length: 100 }, (_, index) => `${index}: ${'x'.repeat(1000)}\r\n`);
    const view = await read(lines.join(''), 50, 4096);
    expect(view.status).toBe('available');
    if (view.status !== 'available') return;
    expect(view.byteLength).toBeLessThanOrEqual(4096);
    expect(Buffer.from(view.bytesBase64, 'base64').toString('utf8')).toBe(
      lines.slice(view.firstLine - 1, view.firstLine - 1 + view.lineCount).join(''),
    );
    expect(view.firstLine).toBeLessThanOrEqual(50);
    expect(view.firstLine + view.lineCount).toBeGreaterThan(50);
  });

  it('limits only an oversized target line, so later ordinary lines remain reachable', async () => {
    const text = `${'x'.repeat(4097)}\nshort\n`;
    await expect(read(text, 1, 4096)).resolves.toEqual({ status: 'too-large' });
    const later = await read(text, 2, 4096);
    expect(later).toMatchObject({ status: 'available', firstLine: 2, lineCount: 1, totalLines: 2 });
    if (later.status === 'available') expect(Buffer.from(later.bytesBase64, 'base64').toString('utf8')).toBe('short\n');
  });

  it('classifies the whole file, not just the text in the requested window', async () => {
    const prefix = Buffer.from('text\n'.repeat(1000));
    await expect(read(Buffer.concat([prefix, Buffer.from([0])]))).resolves.toEqual({
      status: 'unsupported',
      classification: 'binary',
    });
    await expect(read(Buffer.concat([prefix, Buffer.from([0xc3])]))).resolves.toEqual({
      status: 'unsupported',
      classification: 'unrenderable',
    });
  });

  it('keeps the frame-safe cap even when a caller supplies a larger window budget', async () => {
    const view = await read('word\n'.repeat(100_000), 1, 1024 * 1024);
    expect(view.status).toBe('available');
    if (view.status === 'available') expect(view.byteLength).toBeLessThanOrEqual(256 * 1024);
  });

  it('refuses files above the scan budget, directories and missing files', async () => {
    await expect(read('x'.repeat(2 * 1024 * 1024 + 1))).resolves.toEqual({ status: 'too-large' });
    for (const filename of [root, path.join(root, 'absent')]) {
      await expect(readRepositoryContentWindow(Buffer.from(filename), 1024, 1024)).resolves.toEqual({
        status: 'unavailable',
      });
    }
  });

  itWithSymlinks('refuses symlinks', async () => {
    const source = path.join(root, 'target.txt');
    await writeFile(source, 'target');
    const link = path.join(root, 'link.txt');
    await symlink(source, link);
    await expect(readRepositoryContentWindow(Buffer.from(link), 1024, 1024)).resolves.toEqual({
      status: 'unavailable',
    });
  });
});
