import { constants, type BigIntStats } from 'node:fs';

import type { CurrentRepositoryFileContent } from './contracts.js';
import { openUnfollowed } from './openUnfollowed.js';

const WINDOW_LINES = 512;
const CONTEXT_LINES = 128;
const CONTEXT_BYTES = 64 * 1024;

interface LineWindow {
  readonly firstLine: number;
  readonly startByte: number;
  endByte: number;
  lineCount: number;
}

/** Counts the whole file, but retains only a fixed ring of recent line offsets. */
class LineWindowIndex {
  readonly #starts = new Float64Array(CONTEXT_LINES + 1);
  #bytes = 0;
  #lineStart = 0;
  #lines = 0;
  #foundAnchor = false;
  #windowDone = false;
  #window: LineWindow | undefined;

  constructor(
    readonly anchorLine: number,
    readonly maximumBytes: number,
  ) {}

  accept(chunk: Buffer): void {
    let offset = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline < 0) break;
      this.#line(this.#bytes + newline + 1);
      offset = newline + 1;
    }
    this.#bytes += chunk.byteLength;
  }

  #line(endByte: number): void {
    this.#lines += 1;
    this.#starts[(this.#lines - 1) % this.#starts.length] = this.#lineStart;
    if (this.#lines === this.anchorLine) {
      this.#foundAnchor = true;
      this.#chooseWindow(endByte);
    } else if (this.#window !== undefined && !this.#windowDone) {
      if (this.#window.lineCount >= WINDOW_LINES || endByte - this.#window.startByte > this.maximumBytes) {
        this.#windowDone = true;
      } else {
        this.#window.endByte = endByte;
        this.#window.lineCount += 1;
      }
    }
    this.#lineStart = endByte;
  }

  #chooseWindow(endByte: number): void {
    const anchorStart = this.#starts[(this.#lines - 1) % this.#starts.length]!;
    // Do not silently truncate a source line; the caller reports the limit.
    if (endByte - anchorStart > this.maximumBytes) return;
    for (let line = Math.max(1, this.#lines - CONTEXT_LINES); line <= this.#lines; line += 1) {
      const startByte = this.#starts[(line - 1) % this.#starts.length]!;
      if (
        anchorStart - startByte <= Math.min(CONTEXT_BYTES, this.maximumBytes / 4) &&
        endByte - startByte <= this.maximumBytes
      ) {
        this.#window = { firstLine: line, startByte, endByte, lineCount: this.#lines - line + 1 };
        return;
      }
    }
  }

  finish(): (LineWindow & { readonly totalLines: number }) | undefined {
    if (this.#lineStart < this.#bytes || this.#bytes === 0) this.#line(this.#bytes);
    // A shortened file or a jump beyond EOF lands on the final real line.
    if (!this.#foundAnchor) this.#chooseWindow(this.#bytes);
    return this.#window === undefined ? undefined : { ...this.#window, totalLines: this.#lines };
  }
}

function sameFile(before: BigIntStats, after: BigIntStats): boolean {
  return (
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeNs === after.mtimeNs &&
    before.ctimeNs === after.ctimeNs
  );
}

/** One coherent, complete-line window; no full-file buffer or unbounded line index. */
export async function readRepositoryContentWindow(
  filename: Buffer,
  maximumFileBytes: number,
  maximumWindowBytes: number,
  anchorLine = 1,
): Promise<CurrentRepositoryFileContent> {
  const handle = await openUnfollowed(filename, constants.O_NONBLOCK);
  if (handle === undefined) return { status: 'unavailable' };
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) return { status: 'unavailable' };
    if (before.size > BigInt(maximumFileBytes)) return { status: 'too-large' };
    // Keep base64 plus metadata comfortably below the local protocol's 1 MiB frame.
    const index = new LineWindowIndex(anchorLine, Math.min(maximumWindowBytes, 256 * 1024));
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let binary = false;
    let invalidText = false;
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk)) return { status: 'unavailable' };
      bytes += chunk.byteLength;
      if (bytes > maximumFileBytes) return { status: 'too-large' };
      binary ||= chunk.includes(0);
      if (!invalidText) {
        try {
          decoder.decode(chunk, { stream: true });
        } catch {
          invalidText = true;
        }
      }
      index.accept(chunk);
    }
    if (!invalidText) {
      try {
        decoder.decode();
      } catch {
        invalidText = true;
      }
    }
    if (bytes !== Number(before.size) || !sameFile(before, await handle.stat({ bigint: true }))) {
      return { status: 'unavailable' };
    }
    if (binary || invalidText) return { status: 'unsupported', classification: binary ? 'binary' : 'unrenderable' };
    const window = index.finish();
    if (window === undefined) return { status: 'too-large' };
    const content = Buffer.alloc(window.endByte - window.startByte);
    for (let offset = 0; offset < content.byteLength;) {
      const read = await handle.read(content, offset, content.byteLength - offset, window.startByte + offset);
      if (read.bytesRead === 0) return { status: 'unavailable' };
      offset += read.bytesRead;
    }
    if (!sameFile(before, await handle.stat({ bigint: true }))) return { status: 'unavailable' };
    return {
      status: 'available',
      bytesBase64: content.toString('base64'),
      byteLength: content.byteLength,
      totalByteLength: bytes,
      firstLine: window.firstLine,
      lineCount: window.lineCount,
      totalLines: window.totalLines,
      truncated: window.startByte > 0 || window.endByte < bytes,
    };
  } catch {
    return { status: 'unavailable' };
  } finally {
    await handle.close().catch(() => undefined);
  }
}
