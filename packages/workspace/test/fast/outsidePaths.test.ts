import { describe, expect, it } from 'vitest';

import { outsideChild, outsideSelection, outsideUnder } from '../../src/outsidePaths.js';

const bytes = (text: string): Buffer => Buffer.from(text, 'utf8');
const text = (value: Buffer): string => value.toString('utf8');

describe('outside-checkout paths on macOS and Linux', () => {
  it('keeps the selection exactly and joins with /', () => {
    expect(text(outsideSelection('/work//outside/', 'linux'))).toBe('/work//outside/');
    expect(text(outsideChild(bytes('/work/outside'), bytes('a.txt'), 'darwin'))).toBe('/work/outside/a.txt');
    // As before: a selection ending in `/` gains another before the name.
    expect(text(outsideChild(bytes('/work/outside/'), bytes('a.txt'), 'linux'))).toBe('/work/outside//a.txt');
  });

  it('contains strictly beneath a / boundary', () => {
    expect(outsideUnder(bytes('/work/outside/a.txt'), bytes('/work/outside'), 'linux')).toBe(true);
    expect(outsideUnder(bytes('/work/outside'), bytes('/work/outside'), 'linux')).toBe(false);
    expect(outsideUnder(bytes('/work/outside-other/a.txt'), bytes('/work/outside'), 'linux')).toBe(false);
  });
});

describe('outside-checkout paths on Windows', () => {
  it('normalizes the selection once and joins with \\', () => {
    expect(text(outsideSelection('C:/work//outside', 'win32'))).toBe('C:\\work\\outside');
    expect(text(outsideChild(bytes('C:\\work\\outside'), bytes('a.txt'), 'win32'))).toBe('C:\\work\\outside\\a.txt');
    expect(text(outsideChild(bytes('C:\\'), bytes('a.txt'), 'win32'))).toBe('C:\\a.txt');
  });

  it('contains strictly beneath a \\ boundary, a drive root included', () => {
    expect(outsideUnder(bytes('C:\\work\\outside\\a.txt'), bytes('C:\\work\\outside'), 'win32')).toBe(true);
    expect(outsideUnder(bytes('C:\\a.txt'), bytes('C:\\'), 'win32')).toBe(true);
    expect(outsideUnder(bytes('C:\\work\\outside'), bytes('C:\\work\\outside'), 'win32')).toBe(false);
    expect(outsideUnder(bytes('C:\\work\\outside-other\\a.txt'), bytes('C:\\work\\outside'), 'win32')).toBe(false);
    // Case is not folded: a differently cased path is another selection.
    expect(outsideUnder(bytes('c:\\work\\outside\\a.txt'), bytes('C:\\work\\outside'), 'win32')).toBe(false);
  });
});
