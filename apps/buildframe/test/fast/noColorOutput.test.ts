import { once } from 'node:events';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createNoColorOutput } from '../../src/noColorOutput.js';

interface CapturedStdout<T> {
  readonly bytes: Buffer;
  readonly value: T;
}

async function captureStdout<T>(
  run: (writes: readonly Buffer[]) => Promise<T>,
  writeResult: () => boolean = () => true,
): Promise<CapturedStdout<T>> {
  const stdout = process.stdout;
  const ownWrite = Object.getOwnPropertyDescriptor(stdout, 'write');
  const writes: Buffer[] = [];
  Object.defineProperty(stdout, 'write', {
    configurable: true,
    writable: true,
    value: (chunk: Uint8Array | string): boolean => {
      writes.push(Buffer.from(chunk));
      return writeResult();
    },
  });
  try {
    const value = await run(writes);
    return { bytes: Buffer.concat(writes), value };
  } finally {
    if (ownWrite === undefined) Reflect.deleteProperty(stdout, 'write');
    else Object.defineProperty(stdout, 'write', ownWrite);
  }
}

function writeChunk(output: NodeJS.WriteStream, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    output.write(chunk, error => {
      if (error === undefined || error === null) resolve();
      else reject(error);
    });
  });
}

function endOutput(output: NodeJS.WriteStream): Promise<void> {
  return new Promise(resolve => output.end(resolve));
}

describe('no-color output stream', () => {
  it('filters fragmented styles while preserving reset, lifecycle, UTF-8, and final bytes', async () => {
    const captured = await captureStdout(async () => {
      const output = createNoColorOutput();
      await writeChunk(output, Buffer.from('α\u001b'));
      await writeChunk(output, Buffer.from('[38;2;112'));
      await writeChunk(output, Buffer.from(';183;212mBuildFrame\u001b['));
      await writeChunk(output, Buffer.from('0m π\u001b['));
      await writeChunk(output, Buffer.from('?1049h tail\u001b[3'));
      await endOutput(output);
    });

    expect(captured.bytes.toString()).toBe('αBuildFrame\u001b[0m π\u001b[?1049h tail\u001b[3');
  });

  it('settles one backpressured write callback after the matching drain', async () => {
    let callbackCount = 0;
    const captured = await captureStdout(
      async () => {
        const output = createNoColorOutput();
        const settled = new Promise<void>((resolve, reject) => {
          output.write(Buffer.from('plain bytes'), error => {
            callbackCount += 1;
            if (error === undefined || error === null) resolve();
            else reject(error);
          });
        });
        const callbacksBeforeDrain = callbackCount;
        process.stdout.emit('drain');
        await settled;
        output.destroy();
        await once(output, 'close');
        return callbacksBeforeDrain;
      },
      () => false,
    );

    expect(captured.value).toBe(0);
    expect(callbackCount).toBe(1);
    expect(captured.bytes.toString()).toBe('plain bytes');
  });

  it('bounds one retained candidate and flushes an overflow plus destroy suffix unchanged', async () => {
    const candidateAtLimit = Buffer.concat([Buffer.from('\u001b['), Buffer.alloc(64 * 1024 - 2, '1')]);
    const captured = await captureStdout(async writes => {
      const output = createNoColorOutput();
      await writeChunk(output, candidateAtLimit);
      const bytesAtLimit = Buffer.concat(writes).byteLength;
      await writeChunk(output, Buffer.from('1'));
      await writeChunk(output, Buffer.from('mEND\u001b[4'));
      output.destroy();
      await once(output, 'close');
      return bytesAtLimit;
    });

    expect(captured.value).toBe(0);
    expect(captured.bytes).toEqual(Buffer.concat([candidateAtLimit, Buffer.from('1mEND\u001b[4')]));
  });
});
