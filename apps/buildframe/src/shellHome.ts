import type { MouseEvent } from '@opentui/core';

import { displayCells, fitDisplayCellsEnd } from './displayCells.js';
import type { RenderChild } from './renderTree.js';
import type { SizedLook } from './shellChrome.js';
import { borderedBox, label, theme, wrappedRows, type ThemeColor } from './shellLook.js';

/** Home's card: one pane centred in the body, with a list of choices and what the selected one does. */

/** What clicking a row does; the screen that owns the row supplies it. */
export interface HomePointer {
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onMouseUp: (event: MouseEvent) => void;
}

/** A Home card and its height in rows, so the body can place it without measuring. */
export interface HomeCard {
  readonly node: RenderChild;
  readonly height: number;
}

/** Home's card is the width of a comfortable reading column, or the whole width when that is less. */
const HOME_CARD_WIDTH = 76;

export function homeCardWidth(state: SizedLook): number {
  return Math.min(HOME_CARD_WIDTH, state.width);
}

/**
 * Home's one pane: the same rounded frame, title row and selection as a
 * Review's panes, so opening BuildFrame and opening a Review look like one app.
 * It is a card centred in the body, as tall as its rows, like a dialog. The
 * launcher, the commit picker and Previous Reviews share its width and left
 * edge, so going between them never moves the column.
 */
export function homePane(
  state: SizedLook,
  id: string,
  title: string,
  detail: string,
  rows: number,
  ...children: RenderChild[]
): HomeCard {
  const colors = theme(state);
  const height = rows + 3;
  const node = borderedBox(
    state,
    {
      id,
      width: homeCardWidth(state),
      // Border and title row, then the content; never taller than the body.
      height,
      maxHeight: '100%',
      flexShrink: 1,
      flexDirection: 'column',
      borderColor: colors.accent,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    label(state, `${state.presentation.ascii ? '|' : '▌'} ${title} FOCUSED  ${detail}`, {
      fg: colors.accent,
      bold: true,
      height: 1,
      paddingLeft: 1,
      paddingRight: 1,
    }),
    ...children,
  );
  return { node, height };
}

/** A Home list row: `›`, bold Frost Text and the wash across the whole row, like a focused Files row. */
export function homeRow(
  state: SizedLook,
  text: string,
  selected: boolean,
  options: {
    readonly id?: string;
    readonly fg?: ThemeColor;
    readonly pointer?: HomePointer;
  },
): RenderChild {
  const colors = theme(state);
  const cursor = selected ? (state.presentation.ascii ? '>' : '›') : ' ';
  // A terminal paints a background only behind characters, so the row is
  // filled to the pane's inner width (border and padding take four cells).
  const inner = Math.max(1, homeCardWidth(state) - 4);
  const fitted = fitDisplayCellsEnd(`${cursor} ${text}`, inner, state.presentation.ascii ? '...' : '…');
  return label(state, `${fitted}${' '.repeat(Math.max(0, inner - displayCells(fitted)))}`, {
    ...(options.id === undefined ? {} : { id: options.id }),
    fg: selected ? colors.text : (options.fg ?? colors.text),
    bg: selected ? colors.accentSoft : colors.surface,
    bold: selected,
    width: '100%',
    height: 1,
    paddingLeft: 1,
    paddingRight: 1,
    ...options.pointer,
  });
}

/** A sentence in the pane: wrapped on whole words, every row indented alike. */
export function homeSentence(state: SizedLook, text: string, fg: ThemeColor, id?: string): RenderChild[] {
  // Border, padding and the two-cell indent.
  const width = Math.max(8, homeCardWidth(state) - 8);
  return wrappedRows(text, width).map((row, index) =>
    label(state, `  ${row}`, {
      ...(id === undefined ? {} : { id: index === 0 ? id : `${id}-${index}` }),
      fg,
      height: 1,
      paddingLeft: 1,
      paddingRight: 1,
    }),
  );
}

/** One choice on the Home card. */
export interface HomeChoice {
  /** Stable name: the row's id and what selection points at. */
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  /** What choosing it does, shown under the list while it is selected. */
  readonly description: string;
  /** False shows the row muted and leaves it out of the count. */
  readonly available: boolean;
}

/** The launcher: the choices, then the selected one's description, in a card that never changes height. */
export function homeLauncherCard(
  state: SizedLook,
  choices: readonly HomeChoice[],
  selectedId: string,
  idPrefix: string,
  pointer?: (id: string) => HomePointer,
): HomeCard {
  const colors = theme(state);
  const selected = choices.find(choice => choice.id === selectedId) ?? choices[0];
  if (selected === undefined) {
    const empty = homeSentence(state, 'Nothing to open yet.', colors.muted);
    return homePane(state, `${idPrefix}-home-pane`, 'Home', '', empty.length, ...empty);
  }
  // The card keeps the height of the longest description, so moving between
  // choices never makes it jump.
  const descriptionRows = Math.max(
    ...choices.map(choice => homeSentence(state, choice.description, colors.muted).length),
  );
  const description = homeSentence(state, selected.description, colors.muted, `${idPrefix}-home-description`);
  const available = choices.filter(choice => choice.available).length;
  return homePane(
    state,
    `${idPrefix}-home-pane`,
    'Home',
    `${available} choice${available === 1 ? '' : 's'}`,
    choices.length + 1 + descriptionRows,
    ...choices.map(choice =>
      homeRow(state, `${choice.icon}  ${choice.label}`, choice.id === selectedId, {
        id: `${idPrefix}-home-choice-${choice.id}`,
        fg: choice.available ? colors.text : colors.muted,
        ...(pointer === undefined ? {} : { pointer: pointer(choice.id) }),
      }),
    ),
    label(state, '', { height: 1 }),
    ...description,
  );
}
