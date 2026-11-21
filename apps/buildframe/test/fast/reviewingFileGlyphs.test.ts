import { RGBA, StyledText } from '@opentui/core';
import { describe, expect, it } from 'vitest';

import { statusColor, statusColoredRow } from '../../src/reviewingFileGlyphs.js';
import { QUIET_GRAPHITE, type Look } from '../../src/shellLook.js';

const look = (noColor = false): Look => ({
  presentation: { ascii: false, noColor },
  reviewingTheme: { inherits: 'quiet-graphite', colors: {} },
  background: 'theme',
  terminalThemeMode: 'dark',
});

const colors = QUIET_GRAPHITE;
const row = (status: string, glyph: string) => ({ before: '›  ', status, glyph, after: '  review.ts' });

function chunks(value: string | StyledText): { text: string; fg: string | undefined }[] {
  if (typeof value === 'string') throw new Error(`expected colour, got plain "${value}"`);
  return value.chunks.map(chunk => ({
    text: chunk.text,
    fg: [colors.success, colors.danger, colors.warning, colors.text, colors.accent].find(hex =>
      RGBA.fromHex(hex).equals(chunk.fg),
    ),
  }));
}

describe('File status colours', () => {
  it('gives new files success, removed files danger, and every other change warning', () => {
    expect(statusColor(colors, 'added')).toBe(colors.success);
    expect(statusColor(colors, 'deleted')).toBe(colors.danger);
    for (const status of ['modified', 'renamed', 'copied', 'type-changed', 'staging-only']) {
      expect(statusColor(colors, status)).toBe(colors.warning);
    }
    expect(statusColor(colors, 'unchanged')).toBeUndefined();
  });

  it('colours the letter only; the rest keeps the row colour, the selected row included', () => {
    expect(chunks(statusColoredRow(look(), colors, row('added', 'A'), { fg: colors.text, bold: false }))).toEqual([
      { text: '›  ', fg: colors.text },
      { text: 'A', fg: colors.success },
      { text: '  review.ts', fg: colors.text },
    ]);
    expect(chunks(statusColoredRow(look(), colors, row('modified', 'M'), { fg: colors.accent, bold: true }))).toEqual([
      { text: '›  ', fg: colors.accent },
      { text: 'M', fg: colors.warning },
      { text: '  review.ts', fg: colors.accent },
    ]);
  });

  it('stays plain text for unchanged files, with no colour, and without a letter', () => {
    const style = { fg: colors.text, bold: false };
    expect(statusColoredRow(look(), colors, row('unchanged', '·'), style)).toBe('›  ·  review.ts');
    expect(statusColoredRow(look(true), colors, row('deleted', 'D'), style)).toBe('›  D  review.ts');
    expect(statusColoredRow(look(), colors, row('added', ''), style)).toBe('›    review.ts');
  });
});
