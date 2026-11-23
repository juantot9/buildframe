import type { FileHandle } from 'node:fs/promises';

const CHUNK_BYTES = 64 * 1024;

/** The open file's bytes from its start, or `undefined` when it holds more than `maximumBytes`. */
export async function readBounded(handle: FileHandle, maximumBytes: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (totalBytes <= maximumBytes) {
    const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, maximumBytes + 1 - totalBytes));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, totalBytes);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    totalBytes += bytesRead;
  }
  if (totalBytes > maximumBytes) return undefined;
  return Buffer.concat(chunks, totalBytes);
}

/**
 * Whether the open file still holds exactly `bytes`, by reading it again.
 * Unchanged metadata does not prove it: Windows stamps file times from the
 * clock tick, so a same-size rewrite within one tick leaves size, `mtime` and
 * `ctime` as they were (WIN-004), and coarse clocks leave the same gap
 * elsewhere.
 */
export async function stillHolds(handle: FileHandle, bytes: Buffer): Promise<boolean> {
  const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, bytes.byteLength + 1));
  let offset = 0;
  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, offset);
    if (bytesRead === 0) return offset === bytes.byteLength;
    if (!chunk.subarray(0, bytesRead).equals(bytes.subarray(offset, offset + bytesRead))) return false;
    offset += bytesRead;
    if (offset > bytes.byteLength) return false;
  }
}
