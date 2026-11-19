import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs';
import { open, rename } from 'node:fs/promises';

/**
 * File steps the State worker and the Workspace identity registry use to
 * publish a file, with Windows' rules in one place.
 *
 * Windows differs in two ways. A directory cannot be opened to flush it
 * (`fsync` fails with EPERM), so directory sync is skipped there: a finished
 * rename survives a crash of BuildFrame, but after a power loss NTFS may roll
 * back a rename its journal had not written yet. File contents are still
 * flushed before every rename, so a file never comes back half-written; at
 * worst the previous file is still in place. And a rename fails while another
 * process has either file open (antivirus and the search indexer open new
 * files briefly), so it is retried for a short, bounded time.
 */

export interface FilePlatformOptions {
  readonly platform?: NodeJS.Platform;
}

/** About 1.3 seconds in all before the last error is reported. */
const RENAME_RETRY_DELAYS_MILLISECONDS: readonly number[] = [10, 20, 40, 80, 160, 320, 640];
const RETRYABLE_RENAME_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);

function platformOf(options: FilePlatformOptions): NodeJS.Platform {
  return options.platform ?? process.platform;
}

function retryDelay(error: unknown, attempt: number, platform: NodeJS.Platform): number | undefined {
  if (platform !== 'win32') return undefined;
  const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code === undefined || !RETRYABLE_RENAME_CODES.has(code)) return undefined;
  return RENAME_RETRY_DELAYS_MILLISECONDS[attempt];
}

/** Renames `from` to `to`, replacing `to`; on Windows, waits out a brief open handle. */
export function renameFileSync(
  from: string,
  to: string,
  options: FilePlatformOptions & { readonly rename?: (from: string, to: string) => void } = {},
): void {
  const renameOnce = options.rename ?? renameSync;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameOnce(from, to);
      return;
    } catch (error) {
      const delay = retryDelay(error, attempt, platformOf(options));
      if (delay === undefined) throw error;
      Atomics.wait(pause, 0, 0, delay);
    }
  }
}

/** Renames `from` to `to`, replacing `to`; on Windows, waits out a brief open handle. */
export async function renameFile(
  from: string,
  to: string,
  options: FilePlatformOptions & { readonly rename?: (from: string, to: string) => Promise<void> } = {},
): Promise<void> {
  const renameOnce = options.rename ?? rename;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameOnce(from, to);
      return;
    } catch (error) {
      const delay = retryDelay(error, attempt, platformOf(options));
      if (delay === undefined) throw error;
      await new Promise<void>(resolve => {
        setTimeout(resolve, delay);
      });
    }
  }
}

/**
 * Flushes one file's contents. Windows flushes only through a handle that can
 * write (`FlushFileBuffers`), so the file is opened read-write there.
 */
export function fsyncPath(target: string, options: FilePlatformOptions = {}): void {
  const descriptor = openSync(target, platformOf(options) === 'win32' ? 'r+' : 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function writeBytesDurably(target: string, bytes: Uint8Array): void {
  const descriptor = openSync(target, 'wx', 0o600);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** Flushes a directory's entries after a rename into it; skipped on Windows. */
export function syncDirectorySync(directory: string, options: FilePlatformOptions = {}): void {
  if (platformOf(options) === 'win32') return;
  const descriptor = openSync(directory, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** Flushes a directory's entries after a rename into it; skipped on Windows. */
export async function syncDirectory(directory: string, options: FilePlatformOptions = {}): Promise<void> {
  if (platformOf(options) === 'win32') return;
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
