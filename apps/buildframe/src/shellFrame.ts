import type { MouseEvent } from '@opentui/core';

import { displayCells, fitDisplayCellsEnd } from './displayCells.js';
import { Box, type RenderChild, type RenderNode } from './renderTree.js';
import type { StatusTone } from './reviewingStatus.js';
import { label, theme, toneColor, wrappedRows, type Look } from './shellLook.js';

export interface FrameLook extends Look {
  readonly width: number;
  readonly height: number;
  /** The width mode, published as an empty marker so tests can wait for a relayout. */
  readonly layout: string;
}

export interface FrameStatus {
  readonly text: string;
  readonly tone: StatusTone;
}

/** What a screen puts in the shell's frame. */
export interface FrameParts {
  /** Prefix of the frame's renderable ids (`<prefix>-screen`, `-status-line`, `-action-strip`, `-layout-*`). */
  readonly idPrefix: string;
  /** The header row (none when hidden) and the rows it takes. */
  readonly header: { readonly rows: readonly RenderChild[]; readonly height: number };
  /** Rows between the header and the body (the history row, conditions). */
  readonly context: readonly RenderChild[];
  /** The body and its overlays, given the rows left for them. */
  body(contentHeight: number): readonly RenderChild[];
  /** What is being said now; when nothing is, the mode's idle sentence shows instead. */
  readonly said: FrameStatus;
  readonly idleSentence: string | undefined;
  keysRow(width: number): string;
  readonly onMouseMove?: (event: MouseEvent) => void;
}

/**
 * The shell's frame: header, context rows, the body taking what is left, and
 * a footer of always the same two rows (what is being said, or what this
 * mode means; then the keys). A warning or error that does not fit takes a
 * second status row rather than losing its end.
 */
export function shellFrame(look: FrameLook, parts: FrameParts): RenderNode {
  const colors = theme(look);
  const background = look.presentation.noColor ? 'transparent' : colors.background;
  // Footer rows keep their start and mark a cut, so a narrow terminal never
  // ends a hint mid-word.
  const footerWidth = Math.max(1, look.width - 2);
  const footerEllipsis = look.presentation.ascii ? '...' : '…';
  const status: FrameStatus =
    parts.said.text === '' && parts.idleSentence !== undefined
      ? { text: parts.idleSentence, tone: 'muted' }
      : parts.said;
  const statusRows =
    (status.tone === 'danger' || status.tone === 'warning') && displayCells(status.text) > footerWidth
      ? wrappedRows(status.text, footerWidth)
      : [status.text];
  const statusHeight = Math.min(2, statusRows.length);
  const footerHeight = statusHeight + 1;
  const contentHeight = Math.max(1, look.height - parts.header.height - parts.context.length - footerHeight);
  const statusColor = toneColor(colors, status.tone);
  return Box(
    {
      id: `${parts.idPrefix}-screen`,
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      backgroundColor: background,
      ...(parts.onMouseMove === undefined ? {} : { onMouseMove: parts.onMouseMove }),
    },
    Box({ id: `${parts.idPrefix}-layout-${look.layout}`, position: 'absolute', width: 0, height: 0 }),
    ...parts.header.rows,
    ...parts.context,
    Box(
      {
        width: '100%',
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: background,
      },
      ...parts.body(contentHeight),
    ),
    Box(
      {
        width: '100%',
        height: footerHeight,
        flexShrink: 0,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: look.presentation.noColor ? 'transparent' : colors.raised,
      },
      statusHeight === 1
        ? label(
            look,
            // Status text is a sentence: keep its start and mark the cut at the end.
            fitDisplayCellsEnd(status.text, footerWidth, footerEllipsis),
            { id: `${parts.idPrefix}-status-line`, fg: statusColor },
          )
        : Box(
            { id: `${parts.idPrefix}-status-line`, width: '100%', height: 2, flexDirection: 'column', flexShrink: 0 },
            label(look, statusRows[0]!, { fg: statusColor }),
            label(look, fitDisplayCellsEnd(statusRows.slice(1).join(' '), footerWidth, footerEllipsis), {
              fg: statusColor,
            }),
          ),
      label(look, parts.keysRow(footerWidth), { id: `${parts.idPrefix}-action-strip`, fg: colors.text }),
    ),
  );
}
