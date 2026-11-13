import { deepFreeze, textDecoder, textEncoder } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import { HarnessStateProblem } from './internalTypes.js';
import { EVIDENCE_IDENTITY_MAX_BYTES, IDENTITY_MAX_BYTES, LABEL_MAX_BYTES } from './limits.js';

export function stableIdentity(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}_${sha256(`neoflow-harness-interaction-v1\0${parts.join('\0')}`)}`;
}

export function encode(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

export function decode(value: Uint8Array): unknown {
  try {
    return JSON.parse(textDecoder.decode(value)) as unknown;
  } catch {
    throw new HarnessStateProblem();
  }
}

export function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

export function boundedText(value: unknown, maximum: number = IDENTITY_MAX_BYTES): value is string {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value) > 0 &&
    Buffer.byteLength(value) <= maximum &&
    value.trim() === value &&
    !value.includes('\u0000')
  );
}

export function boundedLabel(value: unknown): value is string {
  return boundedText(value, LABEL_MAX_BYTES);
}

export function boundedEvidenceIdentity(value: unknown): value is string {
  return boundedText(value, EVIDENCE_IDENTITY_MAX_BYTES);
}

export function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function nthLine(
  bytes: Uint8Array,
  requestedLine: number,
): { readonly offset: number; readonly bytes: Uint8Array } | undefined {
  let line = 1;
  let start = 0;
  for (let index = 0; index <= bytes.byteLength; index += 1) {
    const atEnd = index === bytes.byteLength;
    const atNewline = !atEnd && bytes[index] === 0x0a;
    if (!atEnd && !atNewline) continue;
    if (line === requestedLine) {
      const end = atNewline ? index + 1 : index;
      return { offset: start, bytes: bytes.subarray(start, end) };
    }
    line += 1;
    start = index + 1;
  }
  return undefined;
}

export function exactUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function maximumBacktickRun(text: string): number {
  let maximum = 0;
  let current = 0;
  for (const character of text) {
    if (character === '`') {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
  }
  return maximum;
}
