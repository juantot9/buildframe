import { Writable } from 'node:stream';
import process from 'node:process';

const ESCAPE = 0x1b;
const LEFT_BRACKET = 0x5b;
const SGR_END = 0x6d;
const ZERO = 0x30;
const NINE = 0x39;
const SEMICOLON = 0x3b;
const MAX_PENDING_STYLE_BYTES = 64 * 1024;
const EMPTY_BUFFER = Buffer.alloc(0);

function trailingSgrCandidateStart(bytes: Buffer): number | undefined {
  const start = bytes.lastIndexOf(ESCAPE);
  if (start < 0) return undefined;
  if (start === bytes.length - 1) return start;
  if (bytes[start + 1] !== LEFT_BRACKET) return undefined;
  for (let index = start + 2; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (!((byte >= ZERO && byte <= NINE) || byte === SEMICOLON)) {
      return undefined;
    }
  }
  return bytes.length - start <= MAX_PENDING_STYLE_BYTES ? start : undefined;
}

/** Removes complete SGR styles while retaining reset and all non-style control sequences. */
export function removeAnsiStyles(bytes: Uint8Array): Buffer {
  const source = Buffer.from(bytes);
  const chunks: Buffer[] = [];
  let copiedFrom = 0;
  let index = 0;
  while (index < source.length - 2) {
    if (source[index] !== ESCAPE || source[index + 1] !== LEFT_BRACKET) {
      index += 1;
      continue;
    }
    let end = index + 2;
    let validParameters = true;
    while (end < source.length && source[end] !== SGR_END) {
      const byte = source[end]!;
      if (!((byte >= ZERO && byte <= NINE) || byte === SEMICOLON)) {
        validParameters = false;
        break;
      }
      end += 1;
    }
    if (!validParameters || end >= source.length || source[end] !== SGR_END) {
      index += 1;
      continue;
    }
    const parameters = source.subarray(index + 2, end).toString('ascii');
    if (parameters === '' || parameters === '0') {
      index = end + 1;
      continue;
    }
    if (index > copiedFrom) chunks.push(source.subarray(copiedFrom, index));
    copiedFrom = end + 1;
    index = end + 1;
  }
  if (copiedFrom === 0) return source;
  if (copiedFrom < source.length) chunks.push(source.subarray(copiedFrom));
  return Buffer.concat(chunks);
}

/**
 * OpenTUI 0.4.5 has no terminal-default color mode. A non-process renderer
 * stream keeps native output in JavaScript long enough to remove only SGR
 * styles while preserving cursor, alternate-screen, and keyboard controls.
 */
export function createNoColorOutput(): NodeJS.WriteStream {
  let pending = EMPTY_BUFFER;
  const writeToStdout = (bytes: Buffer, callback: (error?: Error | null) => void): void => {
    if (bytes.length === 0 || process.stdout.write(bytes)) callback();
    else process.stdout.once('drain', callback);
  };
  const flushPending = (callback: (error?: Error | null) => void): void => {
    const bytes = pending;
    pending = EMPTY_BUFFER;
    writeToStdout(removeAnsiStyles(bytes), callback);
  };
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      const source = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      const pendingFrom = trailingSgrCandidateStart(source);
      if (pendingFrom === undefined) {
        pending = EMPTY_BUFFER;
        writeToStdout(removeAnsiStyles(source), callback);
        return;
      }
      pending = Buffer.from(source.subarray(pendingFrom));
      writeToStdout(removeAnsiStyles(source.subarray(0, pendingFrom)), callback);
    },
    final(callback): void {
      flushPending(callback);
    },
    destroy(error, callback): void {
      flushPending(() => callback(error));
    },
  });
  Object.defineProperties(output, {
    isTTY: { get: () => process.stdout.isTTY },
    columns: { get: () => process.stdout.columns },
    rows: { get: () => process.stdout.rows },
    fd: { get: () => process.stdout.fd },
  });
  return output as NodeJS.WriteStream;
}
