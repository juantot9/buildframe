import { describe, expect, it } from 'vitest';

import * as bytesBase64 from '@buildframe/workspace/bytes-base64';

const { decodeBytesBase64, encodeBytesBase64 } = bytesBase64;

describe('canonical bytesBase64 representation', () => {
  it('exposes only the canonical encoder and decoder', () => {
    expect(Object.keys(bytesBase64).sort()).toEqual(['decodeBytesBase64', 'encodeBytesBase64']);
  });

  it('round-trips exact empty, aligned, and selected binary bytes', () => {
    expect(encodeBytesBase64(new Uint8Array())).toBe('');
    expect(decodeBytesBase64('')).toEqual(Buffer.alloc(0));
    expect(decodeBytesBase64('YWJj')).toEqual(Buffer.from('abc'));

    const backing = new Uint8Array([9, 0, 1, 254, 255, 9]);
    const selected = backing.subarray(1, 5);
    expect(encodeBytesBase64(selected)).toBe('AAH+/w==');
    expect(decodeBytesBase64('AAH+/w==')).toEqual(Buffer.from(selected));
  });

  it('rejects every non-string or non-canonical spelling', () => {
    const invalid: readonly unknown[] = [
      undefined,
      null,
      1,
      {},
      'YQ',
      'YQ=',
      'YQ===',
      'YR==',
      ' YQ==',
      'YQ==\n',
      'YQ-_',
      '!!!!',
    ];
    for (const value of invalid) {
      expect(() => decodeBytesBase64(value)).toThrowError(new TypeError('bytesBase64 must be canonical Base64'));
    }
  });
});
