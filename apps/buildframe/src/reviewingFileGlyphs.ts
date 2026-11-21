import { RGBA, StyledText, TextAttributes } from '@opentui/core';

import type { ReviewingApplicationState } from './reviewingModel.js';
import { safeText, type Look, type SemanticTheme, type ThemeColor } from './shellLook.js';

/** What a Files row shows before the name: the change letter and, when chosen, Nerd Font icons. */

export function fileStatus(status: string, ascii: boolean): string {
  if (status === 'unchanged') return ascii ? '-' : '·';
  if (status === 'added') return 'A';
  if (status === 'deleted') return 'D';
  if (status === 'renamed') return 'R';
  if (status === 'copied') return 'C';
  if (status === 'staging-only') return 'S';
  if (status === 'type-changed') return 'T';
  return 'M';
}

/** Nerd Font glyphs; only rendered when the user opts in via Configuration. */
export const NERD_ICONS: Readonly<Record<string, string>> = Object.freeze({
  folder: '\uf07b',
  folderOpen: '\uf07c',
  file: '\uf15b',
  fileTs: '\ue628',
  fileJs: '\ue74e',
  fileJson: '\ue60b',
  fileMd: '\uf48a',
  fileGit: '\ue702',
  fileLock: '\uf023',
  modified: '\uf040',
  added: '\uf067',
  deleted: '\uf068',
  renamed: '\uf074',
  copied: '\uf0c5',
});

export function nerdIcons(state: ReviewingApplicationState): boolean {
  return state.icons === 'nerd' && !state.presentation.ascii;
}

export function statusIcon(state: ReviewingApplicationState, status: string): string {
  if (!nerdIcons(state)) return fileStatus(status, state.presentation.ascii);
  if (status === 'unchanged') return '';
  if (status === 'added') return NERD_ICONS.added!;
  if (status === 'deleted') return NERD_ICONS.deleted!;
  if (status === 'renamed') return NERD_ICONS.renamed!;
  if (status === 'copied') return NERD_ICONS.copied!;
  return NERD_ICONS.modified!;
}

export function fileTypeIcon(state: ReviewingApplicationState, displayPath: string): string {
  if (!nerdIcons(state)) return '';
  const base = (displayPath.split('/').at(-1) ?? '').toLowerCase();
  if (/\.(ts|tsx|mts|cts)$/.test(base)) return NERD_ICONS.fileTs!;
  if (/\.(js|mjs|cjs)$/.test(base)) return NERD_ICONS.fileJs!;
  if (base.endsWith('.json')) return NERD_ICONS.fileJson!;
  if (/\.(md|markdown)$/.test(base)) return NERD_ICONS.fileMd!;
  if (base === 'package-lock.json' || base.endsWith('.lock')) return NERD_ICONS.fileLock!;
  if (/^\.?git/.test(base)) return NERD_ICONS.fileGit!;
  return NERD_ICONS.file!;
}

/** A change's colour: new, gone, or otherwise changed. An unchanged file has none. */
export function statusColor(colors: SemanticTheme, status: string): ThemeColor | undefined {
  if (status === 'unchanged') return undefined;
  if (status === 'added') return colors.success;
  if (status === 'deleted') return colors.danger;
  return colors.warning;
}

/**
 * A file row whose change letter (or icon) takes the change's colour, the
 * selected row included; the rest of the row keeps the row's colour. The
 * letter is always there, so the colour only reinforces it.
 */
export function statusColoredRow(
  look: Look,
  colors: SemanticTheme,
  row: { readonly before: string; readonly status: string; readonly glyph: string; readonly after: string },
  rowStyle: { readonly fg: ThemeColor; readonly bold: boolean },
): string | StyledText {
  const color = row.glyph === '' || look.presentation.noColor ? undefined : statusColor(colors, row.status);
  if (color === undefined || color === 'transparent') return `${row.before}${row.glyph}${row.after}`;
  const ascii = look.presentation.ascii;
  const attributes = rowStyle.bold ? TextAttributes.BOLD : 0;
  const fg = rowStyle.fg === 'transparent' ? RGBA.defaultForeground() : RGBA.fromHex(rowStyle.fg);
  return new StyledText([
    { __isChunk: true, text: safeText(row.before, ascii), fg, attributes },
    { __isChunk: true, text: safeText(row.glyph, ascii), fg: RGBA.fromHex(color), attributes },
    { __isChunk: true, text: safeText(row.after, ascii), fg, attributes },
  ]);
}
