import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MAX_FRAME_BYTES } from '../../src/protocol.js';

const execFileAsync = promisify(execFile);

describe('bounded JSONL framing', () => {
  it('assembles exact-limit one-byte fragments linearly and retains the overflow bound', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--conditions=development',
        '--import=tsx',
        fileURLToPath(new URL('./framingFragmentedProcess.ts', import.meta.url)),
      ],
      {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        encoding: 'utf8',
        timeout: 30_000,
      },
    );

    expect(JSON.parse(stdout)).toEqual({
      exact: {
        frameBytes: MAX_FRAME_BYTES,
        receivedFrames: 4,
      },
      oversized: {
        closeCode: 'frame-too-large',
        ended: true,
        frame: {
          type: 'protocol.error',
          code: 'frame-too-large',
        },
      },
    });
  }, 10_000);
});
