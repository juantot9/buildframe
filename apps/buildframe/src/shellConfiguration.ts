import { wrapDisplayCellRows } from './displayCells.js';
import { Key, matchesKey, type KeyInput } from './keyInput.js';
import { Box, type RenderChild } from './renderTree.js';
import { dialogTop, type SizedLook } from './shellChrome.js';
import { borderedBox, controlPlaneTheme, label } from './shellLook.js';

/**
 * The Configuration window (`c`): a list of settings, each changed in place
 * with ←/→ and saved as it changes. What the settings are is the caller's;
 * moving, changing, closing and drawing the window are the same for all.
 */

export interface ConfigurationWindow {
  selected: string;
}

/** One setting as the window shows it, read from the current state. */
export interface ConfigurationRow {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  /** What the current value does, under the list. */
  readonly description: string;
  /** Steps the value to the previous or next choice. */
  change(direction: -1 | 1): void;
}

export interface ConfigurationContent {
  /** The heading above the rows. */
  readonly title: string;
  readonly rows: readonly ConfigurationRow[];
  /** Every description any row can show, so the box keeps one height whatever is selected. */
  readonly descriptions: readonly string[];
}

/** What a key did: closed the window, changed a value, moved between rows, or nothing. */
export type ConfigurationKeyOutcome = 'closed' | 'changed' | 'moved' | 'ignored';

/** Esc, Enter or `c` close; ↑/↓ (or k/j) move, wrapping; ←/→ (or h/l) change the selected row. */
export function configurationKey(
  window: ConfigurationWindow,
  input: KeyInput,
  rows: readonly ConfigurationRow[],
): ConfigurationKeyOutcome {
  if (matchesKey(input, Key.escape) || matchesKey(input, Key.enter) || input.text === 'c') return 'closed';
  if (matchesKey(input, Key.up) || matchesKey(input, Key.down) || input.text === 'j' || input.text === 'k') {
    const current = rows.findIndex(row => row.id === window.selected);
    const direction = matchesKey(input, Key.up) || input.text === 'k' ? -1 : 1;
    window.selected = rows[(current + direction + rows.length) % rows.length]!.id;
    return 'moved';
  }
  const previous = matchesKey(input, Key.left) || input.text === 'h';
  const next = matchesKey(input, Key.right) || input.text === 'l';
  if (!previous && !next) return 'ignored';
  (rows.find(row => row.id === window.selected) ?? rows[0])?.change(previous ? -1 : 1);
  return 'changed';
}

/** The window, centred in the body like every other dialog. */
export function configurationDialog(
  look: SizedLook,
  window: ConfigurationWindow,
  content: ConfigurationContent,
  bodyHeight: number,
  /** Header rows above the body: the box is centred as if they were body, so hiding the header never moves it. */
  headerRows: number,
  idPrefix: string,
): RenderChild[] {
  // Terminal-default workspace surfaces remain unpainted, but a modal is a
  // control plane and must replace the cells beneath it to remain legible.
  const colors = controlPlaneTheme(look);
  const width = Math.min(68, Math.max(34, look.width - 4));
  const textWidth = Math.max(1, width - 6);
  const row = (setting: ConfigurationRow): RenderChild => {
    const selected = window.selected === setting.id;
    return label(
      look,
      `${selected ? (look.presentation.ascii ? '>' : '›') : ' '} ${setting.name.padEnd(15)}<  ${setting.value}  >`,
      {
        id: `${idPrefix}-configuration-${setting.id}`,
        fg: selected ? colors.accent : colors.text,
        bg: selected ? colors.accentSoft : colors.raised,
        bold: selected,
        paddingLeft: 1,
        paddingRight: 1,
      },
    );
  };
  const selected = content.rows.find(setting => setting.id === window.selected) ?? content.rows[0];
  // Every line of the description sits under the same indent, however it wraps.
  const descriptionRows = wrapDisplayCellRows(selected?.description ?? '', textWidth - 2);
  // The box keeps the height of its longest description, so moving between
  // settings or changing one never makes it grow, shrink or move.
  const reservedDescriptionRows = Math.max(
    descriptionRows.length,
    ...content.descriptions.map(variant => wrapDisplayCellRows(variant, textWidth - 2).length),
  );
  const description = Box(
    {
      id: `${idPrefix}-configuration-description`,
      width: '100%',
      height: reservedDescriptionRows,
      flexDirection: 'column',
    },
    ...descriptionRows.map(line => label(look, `  ${line}`, { fg: colors.muted })),
  );
  const rows: RenderChild[] = [
    label(look, content.title, { fg: colors.text, bold: true }),
    ...content.rows.map(row),
    label(look, ' ', {}),
    description,
  ];
  // As tall as its content.
  const height = Math.min(Math.max(1, bodyHeight), rows.length - 1 + reservedDescriptionRows + 2);
  return [
    borderedBox(
      look,
      {
        id: `${idPrefix}-configuration-overlay`,
        position: 'absolute',
        left: Math.max(0, Math.floor((look.width - width) / 2)),
        top: Math.max(0, dialogTop(bodyHeight + headerRows, height) - headerRows),
        width,
        height,
        zIndex: 34,
        flexDirection: 'column',
        paddingLeft: 2,
        paddingRight: 2,
        borderColor: colors.accent,
        backgroundColor: colors.raised,
        title: ' Configuration ',
        titleColor: colors.accent,
        overflow: 'hidden',
      },
      ...rows.slice(0, Math.max(1, height - 2)),
    ),
  ];
}
