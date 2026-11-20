import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { sameDiffLine } from '../../src/reviewing/index.js';
import { fixture, roots, execFileAsync, installWorkspaceReviewingHygiene } from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

describe('direct retained Reviewing diff bytes', () => {
  it('compares Diff line bytes directly without constructing Buffers', () => {
    const line = (bytes: readonly number[]): Parameters<typeof sameDiffLine>[0] => ({
      number: 1,
      byteOffset: 0,
      byteLength: bytes.length,
      bytes: new Uint8Array(bytes),
      side: 'new',
      digest: 'file-content-identity',
      comparedLength: bytes.length,
    });
    const bufferFrom = vi.spyOn(Buffer, 'from').mockImplementation(() => {
      throw new Error('sameDiffLine constructed a Buffer');
    });
    try {
      expect(sameDiffLine(line([1, 2, 3]), line([1, 2, 3]))).toBe(true);
      expect(sameDiffLine(line([1, 2]), line([1, 2, 3]))).toBe(false);
      expect(sameDiffLine(line([1, 2, 3]), line([1, 2, 4]))).toBe(false);
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it('returns the oversized Diff limit through the Interface within a bounded process', async () => {
    const created = await fixture(false);
    roots.add(created.root);
    await writeFile(path.join(created.checkout, 'oversized.txt'), 'x\n'.repeat(250_001));

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--max-old-space-size=96',
        '--experimental-ffi',
        '--import=tsx',
        fileURLToPath(new URL('./workspaceReviewingBoundedProcess.ts', import.meta.url)),
        created.checkout,
      ],
      {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        env: { ...process.env, XDG_STATE_HOME: created.state },
        encoding: 'utf8',
        timeout: 15_000,
      },
    );

    expect(JSON.parse(stdout)).toEqual({
      started: {
        kind: 'review.current-changes.started',
        status: 'accepted',
        stateVersion: 1,
      },
      diff: {
        kind: 'review.diff',
        status: 'unavailable',
        stateVersion: 1,
        reason: 'comparison-limit',
      },
    });
  });
});
