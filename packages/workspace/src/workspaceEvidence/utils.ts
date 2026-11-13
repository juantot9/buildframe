import path from 'node:path';
import { GitInspectionError } from '../gitProcess.js';

const ZERO_OID_PATTERN = /^0+$/u;

export function now(): string {
  return new Date().toISOString();
}

export function splitAtSpaces(record: Buffer, fieldCount: number): readonly Buffer[] | null {
  const fields: Buffer[] = [];
  let start = 0;
  for (let field = 0; field < fieldCount - 1; field += 1) {
    const separator = record.indexOf(0x20, start);
    if (separator < 0) return null;
    fields.push(record.subarray(start, separator));
    start = separator + 1;
  }
  fields.push(record.subarray(start));
  return fields;
}

export function ascii(field: Buffer): string {
  return field.toString('ascii');
}

export function nullableOid(value: string): string | null {
  return ZERO_OID_PATTERN.test(value) ? null : value;
}

export function validateRelativePath(relative: Buffer): void {
  if (relative.byteLength === 0 || relative[0] === 0x2f || relative.includes(0)) {
    throw new GitInspectionError('invalid-repository-path');
  }
  for (const component of splitBuffer(relative, 0x2f)) {
    if (
      component.byteLength === 0 ||
      (component.byteLength === 1 && component[0] === 0x2e) ||
      (component.byteLength === 2 && component[0] === 0x2e && component[1] === 0x2e)
    ) {
      throw new GitInspectionError('invalid-repository-path');
    }
  }
}

export function splitBuffer(value: Buffer, separator: number): readonly Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (start <= value.byteLength) {
    const at = value.indexOf(separator, start);
    if (at < 0) {
      parts.push(value.subarray(start));
      break;
    }
    parts.push(value.subarray(start, at));
    start = at + 1;
  }
  return parts;
}

export function absolutePath(checkout: string, relative: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${checkout}${path.sep}`), relative]);
}

export function objectFormat(value: string): 'sha1' | 'sha256' | 'unknown' {
  if (value === 'sha1' || value === 'sha256') return value;
  return 'unknown';
}

export const FULL_OBJECT_ID_PATTERN: RegExp = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export function pathListCanonical(paths: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [];
  for (const item of paths) {
    parts.push(item, Buffer.from([0]));
  }
  return Buffer.concat(parts);
}
