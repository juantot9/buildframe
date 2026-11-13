import { decodeBytesBase64 } from '../bytesBase64.js';
import { textDecoder, textEncoder } from '../recordCodec.js';
import { ReviewingStateProblem, type ReviewMessageRepositoryState } from './internalTypes.js';
import { COMMAND_IDENTITY_MAX_BYTES, RECORD_ID_PATTERN } from './limits.js';

export function encode(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

export function decodeReviewingPayload(value: Uint8Array): unknown {
  try {
    return JSON.parse(textDecoder.decode(value)) as unknown;
  } catch {
    throw new ReviewingStateProblem();
  }
}

export function decodeReviewingBytesBase64(value: unknown): Buffer {
  try {
    return decodeBytesBase64(value);
  } catch {
    throw new ReviewingStateProblem();
  }
}

export function boundedIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value) > 0 &&
    Buffer.byteLength(value) <= COMMAND_IDENTITY_MAX_BYTES &&
    value.trim() === value &&
    !value.includes('\u0000')
  );
}

export function recordIdentity(value: unknown, prefix?: string): value is string {
  return (
    typeof value === 'string' &&
    RECORD_ID_PATTERN.test(value) &&
    (prefix === undefined || value.startsWith(`${prefix}_`))
  );
}

export function reviewMessageRepositoryStateMatches(
  left: ReviewMessageRepositoryState,
  right: ReviewMessageRepositoryState,
): boolean {
  return (
    contentEqual(left.basis, right.basis) &&
    contentEqual(left.comparedState, right.comparedState) &&
    left.manifest.totalFiles === right.manifest.totalFiles &&
    contentEqual(left.manifest.digest, right.manifest.digest)
  );
}

export function contentEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function nthLine(
  bytes: Uint8Array,
  line: number,
): { readonly offset: number; readonly bytes: Uint8Array } | undefined {
  let currentLine = 1;
  let start = 0;
  for (let index = 0; index <= bytes.byteLength; index += 1) {
    const atEnd = index === bytes.byteLength;
    const atNewline = !atEnd && bytes[index] === 0x0a;
    if (!atEnd && !atNewline) continue;
    if (currentLine === line) {
      if (atEnd && start === bytes.byteLength) return undefined;
      return { offset: start, bytes: bytes.slice(start, index) };
    }
    if (atEnd) break;
    currentLine += 1;
    start = index + 1;
  }
  return undefined;
}
