import { describe, expect, it } from 'vitest';

import * as digest from '../../src/sha256.js';

const unaryCannotSatisfyMultipart: typeof digest.sha256 extends typeof digest.sha256Parts ? false : true = true;

describe('shared SHA-256 representation', () => {
  it('exposes only exact unary string and byte coding', () => {
    expect(Object.keys(digest).sort()).toEqual(['sha256', 'sha256Parts']);
    expect(digest.sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(digest.sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(digest.sha256('café')).toBe('850f7dc43910ff890f8879c0ed26fe697c93a067ad93a7d50f466a7028a9bf4e');
    expect(digest.sha256(new Uint8Array([0, 1, 2, 255]))).toBe(
      '3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56',
    );
  });

  it('keeps the multi-part contract array-shaped and NUL-delimited', () => {
    expect(unaryCannotSatisfyMultipart).toBe(true);
    expect(digest.sha256Parts([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(digest.sha256Parts(['abc'])).toBe('dc1114cd074914bd872cc1f9a23ec910ea2203bc79779ab2e17da25782a624fc');
    expect(digest.sha256Parts(['a', 'bc'])).toBe('aa795aa4bbb6117911ef062e271bcb05ccfd58ea439da7d46a44e3a3fcefa790');
    expect(digest.sha256Parts(['ab', 'c'])).toBe('629c2f14f654f026086f2aefe1855533d0897f49df86a19073be17b237361b09');
    expect(digest.sha256Parts(['alpha', 'beta', 'gamma'])).toBe(
      '3a521ad250cdab627adf4f9099a7782a742be062bd381d5194d3be13c4db1a49',
    );
  });
});
