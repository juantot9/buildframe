import type { MouseEvent } from '@opentui/core';
import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { displayCells, fitDisplayCellsEnd } from './displayCells.js';
import { Box, type RenderChild } from './renderTree.js';
import type { KeyListItem } from './shellKeys.js';
import { borderedBox, controlPlaneTheme, label, theme, type Look, type ThemeColor } from './shellLook.js';

/** The chrome every screen shares: the header row and the `?` panel. */

export interface SizedLook extends Look {
  readonly width: number;
}

export interface HeaderPart {
  readonly text: string;
  readonly fg: ThemeColor;
}

/** A dialog's height: what it prefers, never below its minimum unless the body is smaller. */
export function dialogHeight(bodyHeight: number, preferred: number, minimum: number): number {
  return Math.max(Math.min(minimum, bodyHeight), Math.min(preferred, bodyHeight));
}

/** A dialog's top row, centring it in the body. */
export function dialogTop(bodyHeight: number, height: number): number {
  return Math.max(0, Math.floor((bodyHeight - height) / 2));
}

/** The agent indicator: ● connected, ○ known but gone, nothing before the first read. */
export function agentIndicator(state: Look, view: HarnessConnectionView | undefined): HeaderPart | undefined {
  if (view === undefined) return undefined;
  const colors = theme(state);
  const ascii = state.presentation.ascii;
  const connected = view.harnesses.filter(harness => harness.connected);
  const first = connected[0];
  if (first !== undefined) {
    const more = connected.length > 1 ? ` +${connected.length - 1}` : '';
    return {
      text: `${ascii ? '*' : '●'} ${first.harnessLabel}${more}`,
      fg: first.availability.status === 'available' ? colors.success : colors.warning,
    };
  }
  const known = view.harnesses[0];
  return {
    text: `${ascii ? 'o' : '○'} ${known === undefined ? 'No agent' : known.harnessLabel}`,
    fg: colors.muted,
  };
}

/**
 * The one header row: where you are on the left, then what the screen shows
 * (live, saved, a past step) and whether the agent is connected on the right.
 */
function headerLine(
  state: Look,
  idPrefix: string,
  left: string,
  source: HeaderPart | undefined,
  agent: HeaderPart | undefined,
  width: number,
): RenderChild {
  const colors = theme(state);
  const separator = `  ${state.presentation.ascii ? '|' : '·'}  `;
  const right = [
    ...(source === undefined ? [] : [{ ...source, bold: source.fg !== colors.muted }]),
    ...(agent === undefined ? [] : [{ ...agent, bold: true }]),
  ];
  const rightWidth =
    right.reduce((total, part) => total + displayCells(part.text), 0) +
    Math.max(0, right.length - 1) * displayCells(separator) +
    2;
  const leftWidth = Math.max(1, Math.min(displayCells(left), width - rightWidth));
  return Box(
    { id: `${idPrefix}-header-row`, width: '100%', height: 1, flexDirection: 'row' },
    label(state, fitDisplayCellsEnd(left, leftWidth, state.presentation.ascii ? '...' : '…'), {
      fg: colors.text,
      bold: true,
      flexGrow: 1,
      flexShrink: 1,
    }),
    ...right.flatMap((part, index) => [
      ...(index === 0 ? [] : [label(state, separator, { fg: colors.muted, flexShrink: 0 })]),
      label(state, part.text, {
        ...(index === right.length - 1 && agent !== undefined ? { id: `${idPrefix}-header-agent` } : {}),
        fg: part.fg,
        bold: part.bold,
        flexShrink: 0,
      }),
    ]),
  );
}

/** The header: where you are on the left; what the screen shows and the agent on the right. */
export function shellHeader(
  state: SizedLook,
  idPrefix: string,
  left: string,
  source: HeaderPart | undefined,
  agent: HeaderPart | undefined,
): { readonly height: number; readonly rows: readonly RenderChild[] } {
  const colors = theme(state);
  return {
    height: 1,
    rows: [
      Box(
        {
          id: `${idPrefix}-header`,
          width: '100%',
          height: 1,
          flexShrink: 0,
          paddingLeft: 2,
          paddingRight: 2,
          backgroundColor: state.presentation.noColor ? 'transparent' : colors.surface,
        },
        headerLine(state, idPrefix, left, source, agent, Math.max(1, state.width - 4)),
      ),
    ],
  };
}

/** The `?` panel: each group names itself once in a gutter, its keys in one or two columns. */
export function keyListPanel(
  state: SizedLook,
  items: readonly KeyListItem[],
  availableHeight: number,
  idPrefix: string,
): RenderChild[] {
  const colors = controlPlaneTheme(state);
  const width = Math.min(112, Math.max(36, state.width - 4));
  const left = Math.max(0, Math.floor((state.width - width) / 2));
  const contentWidth = Math.max(1, width - 4);
  // Each group names itself once in a left gutter; its keys follow in one or
  // two columns, so labels are not cut by a repeated group prefix.
  const groups = (['MOVE', 'OPEN', 'VIEW', 'WORKSPACE'] as const)
    .map(group => ({
      name: group === 'WORKSPACE' ? 'App' : `${group[0]}${group.slice(1).toLowerCase()}`,
      items: items.filter(item => item.group === group),
    }))
    .filter(group => group.items.length > 0);
  const gutter = 6;
  const oneColumnRows = items.length + 1;
  const columns = state.width >= 100 || oneColumnRows + 2 > availableHeight ? 2 : 1;
  const availableCellWidth = contentWidth - gutter - (columns - 1);
  const baseCellWidth = Math.max(1, Math.floor(availableCellWidth / columns));
  const extraCellWidth = availableCellWidth % columns;
  const boundedCell = (value: string, cellWidth: number): string => {
    const characters = [...value];
    const fitted =
      characters.length <= cellWidth
        ? value
        : `${characters.slice(0, Math.max(0, cellWidth - 1)).join('')}${state.presentation.ascii ? '~' : '…'}`;
    return fitted.padEnd(cellWidth);
  };
  const rows: RenderChild[] = [];
  for (const group of groups) {
    for (let index = 0; index < group.items.length; index += columns) {
      rows.push(
        Box(
          { width: contentWidth, height: 1, flexDirection: 'row', gap: 1 },
          label(state, (index === 0 ? group.name : '').padEnd(gutter - 1), {
            fg: colors.text,
            bold: true,
            width: gutter - 1,
            flexShrink: 0,
          }),
          ...Array.from({ length: columns }, (_, column) => {
            const item = group.items[index + column];
            const cellWidth = baseCellWidth + (column < extraCellWidth ? 1 : 0);
            return label(
              state,
              boundedCell(
                item === undefined ? '' : `${item.key.startsWith('[') ? item.key : `[${item.key}]`} ${item.label}`,
                cellWidth,
              ),
              {
                fg: colors.text,
                width: cellWidth,
                flexShrink: 0,
              },
            );
          }),
        ),
      );
    }
  }
  const panelHeight = Math.min(availableHeight, rows.length + 2);
  const stopPointer = (event: MouseEvent): void => event.stopPropagation();
  return [
    Box(
      {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 25,
        flexDirection: 'column',
        backgroundColor: 'transparent',
        onMouseDown: stopPointer,
        onMouseUp: stopPointer,
      },
      borderedBox(
        state,
        {
          id: `${idPrefix}-action-lookup`,
          position: 'absolute',
          left,
          top: 0,
          width,
          height: panelHeight,
          flexShrink: 0,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          overflow: 'hidden',
          backgroundColor: colors.raised,
          borderColor: colors.accent,
          title: state.presentation.ascii ? 'KEYS' : ' KEYS ',
          titleColor: colors.accent,
          titleAlignment: 'center',
          bottomTitle: ' [?/Esc] close · then press the key ',
          bottomTitleAlignment: 'right',
        },
        ...rows,
      ),
    ),
  ];
}

/** The `!` panel: what the screen's actions can do at the State version shown, one line each. */
export function actionChecksPanel(look: Look, lines: readonly string[]): RenderChild[] {
  const colors = theme(look);
  return [
    borderedBox(
      look,
      {
        position: 'absolute',
        left: 1,
        right: 1,
        bottom: 0,
        height: Math.max(3, Math.min(7, lines.length + 2)),
        zIndex: 10,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: colors.raised,
        title: ' Action checks from state ',
        titleColor: colors.accent,
      },
      ...lines.map(line => label(look, line, { fg: colors.text })),
    ),
  ];
}

/** The first visible row that keeps the selected one centred, without running past either end. */
export function centeredStart(selected: number, offset: number, count: number, visible: number): number {
  const local = Math.max(0, Math.min(selected - offset, Math.max(0, count - 1)));
  return Math.max(0, Math.min(local - Math.floor(visible / 2), Math.max(0, count - visible)));
}
