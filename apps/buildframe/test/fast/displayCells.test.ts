import { describe, expect, it } from 'vitest';
import {
  codeRowStarts,
  segmentedCodeRowStarts,
  displayCells,
  fitDisplayCellsEnd,
  fitDisplayCellsStart,
  sliceDisplayCells,
  wrapDisplayCellRows,
  wrappedDisplayRows,
} from '../../src/displayCells.js';

describe('bounded terminal cell policy', () => {
  it.each([
    ['', 0],
    ['ASCII', 5],
    ['A界B', 4],
    ['中文', 4],
    ['Ａ', 2],
    ['e\u0301', 1],
    ['\u0301', 0],
    ['\u200d', 0],
    ['🙂', 2],
    ['👩‍💻', 2],
    ['🇪🇸', 2],
    ['1️⃣', 2],
    ['✈️', 2],
    ['ᄀ', 2],
  ] as const)('measures %j as %i cells', (text, expected) => {
    expect(displayCells(text)).toBe(expected);
  });

  it('clips in cells without splitting graphemes, padding the tail at a left boundary', () => {
    expect(sliceDisplayCells('A界Bé🙂Z', 0, 2)).toBe('A');
    expect(sliceDisplayCells('A界Bé🙂Z', 2, 4)).toBe(' Bé');
    expect(sliceDisplayCells('A界Bé🙂Z', 3, 4)).toBe('Bé🙂');
    expect(sliceDisplayCells('界', 1, 1)).toBe(' ');
    expect(sliceDisplayCells('abc', 9, 4)).toBe('');
  });

  it('wraps complete multiline text on words without splitting graphemes', () => {
    expect(wrapDisplayCellRows('alpha beta\n\n', 5)).toEqual(['alpha', 'beta', '', '']);
    expect(wrapDisplayCellRows('A界Bé🙂Z', 4)).toEqual(['A界B', 'é🙂Z']);
    expect(wrapDisplayCellRows('unbroken', 3)).toEqual(['unb', 'rok', 'en']);
  });

  it('wraps a maximum Message-sized unbroken line without losing text', () => {
    const text = 'x'.repeat(256 * 1024);
    const rows = wrapDisplayCellRows(text, 80);
    expect(rows).toHaveLength(Math.ceil(text.length / 80));
    expect(rows.join('')).toBe(text);
  });

  it('stops a bounded preview wrap early without touching the text', () => {
    expect(wrapDisplayCellRows('one two three four five six', 7, 2)).toEqual(['one', 'two']);
    expect(wrapDisplayCellRows('alpha\nbeta\ngamma', 5, 2)).toEqual(['alpha', 'beta']);
    expect(wrapDisplayCellRows('anything', 5, 0)).toEqual([]);
  });

  it('counts packing gaps rather than dividing total width', () => {
    expect(wrappedDisplayRows('A界B', 2)).toBe(3);
    expect(wrappedDisplayRows('A界B', 3)).toBe(2);
    expect(wrappedDisplayRows('A界B', 4)).toBe(1);
    expect(wrappedDisplayRows('界界界', 3)).toBe(3);
    expect(wrappedDisplayRows('é🙂', 3)).toBe(1);
  });

  it('fits text by keeping its start or its end, never cutting the middle', () => {
    expect(fitDisplayCellsEnd('Try again; restart BuildFrame.', 12, '…')).toBe('Try again;…');
    expect(fitDisplayCellsEnd('short', 12, '…')).toBe('short');
    // A cut never leaves half a word; one long word is cut where it must be.
    expect(fitDisplayCellsEnd('Could this sort be stable for equal priorities?', 40, '…')).toBe(
      'Could this sort be stable for equal…',
    );
    expect(fitDisplayCellsEnd('Supercalifragilistic', 8, '…')).toBe('Superca…');
    expect(fitDisplayCellsStart('src/reviewQueue.ts', 12, '…')).toBe('…iewQueue.ts');
    expect(displayCells(fitDisplayCellsStart('src/reviewQueue.ts', 12, '…'))).toBe(12);
    expect(fitDisplayCellsStart('界界界界', 5, '...')).toBe('...界');
  });

  it('wraps code after spaces or delimiters so tokens stay whole', () => {
    const rows = (text: string, width: number): string[] => {
      const starts = [0, ...codeRowStarts(text, width), text.length];
      return starts.slice(0, -1).map((start, index) => text.slice(start, starts[index + 1]));
    };
    expect(rows("import { readFile } from 'node:fs/promises';", 30)).toEqual([
      'import { readFile } from ',
      "'node:fs/promises';",
    ]);
    expect(rows('a'.repeat(25), 10)).toEqual(['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
    expect(rows('界界界', 3)).toEqual(['界', '界', '界']);
    expect(codeRowStarts('fits', 10)).toEqual([]);
  });

  it('wraps printable ASCII exactly as the grapheme path does', () => {
    // A fixed linear congruential sequence keeps the cases reproducible.
    let seed = 0x2f6b;
    const next = (limit: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % limit;
    };
    const alphabet = ' abcXYZ019_.,;:()[]{}<>/=+-*&|!?\'"`~@#$%^';
    for (let sample = 0; sample < 2_000; sample += 1) {
      const text = Array.from({ length: next(300) }, () => alphabet[next(alphabet.length)]).join('');
      const width = 1 + next(120);
      expect(codeRowStarts(text, width), `${JSON.stringify(text)} at ${width}`).toEqual(
        segmentedCodeRowStarts(text, width),
      );
    }
  });
});
