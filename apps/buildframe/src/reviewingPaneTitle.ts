// The pane title row: which pane, whether it has focus, and what slice of it is on screen.
import { label, spans, theme, type ThemeColor } from './shellLook.js';
import type { RenderChild } from './renderTree.js';
import { displayCells } from './displayCells.js';
import { fitPaneDetail } from './reviewingPathText.js';
import type { ReviewingScrollSpan } from './reviewingScroll.js';
import { messagesPaneName, type ReviewingApplicationState, type ReviewRegion } from './reviewingModel.js';

/**
 * The pane that reads as focused. While a Message is being written its
 * composer lives in the Diff, so the Diff shows focus there even when the
 * Message was started from another pane.
 */
export function shownFocus(state: ReviewingApplicationState): ReviewingApplicationState['focus'] {
  return state.editor !== undefined ? 'diff' : state.focus;
}

export function paneTitle(
  state: ReviewingApplicationState,
  region: ReviewRegion,
  title: string,
  detail: string,
  span?: ReviewingScrollSpan,
  /** Overrides the title's color, as for a Diff showing the past. */
  tone?: ThemeColor,
  /** The pane's outer width in cells, when known, so the detail can be fitted rather than cut mid-word. */
  paneWidth?: number,
): RenderChild {
  const colors = theme(state);
  const focused = shownFocus(state) === region;
  const marker = focused && !state.presentation.ascii ? '▌' : ' ';
  // A self-describing window beats an abstract position bar: which slice of the
  // bounded projection is on screen, in ordinals.
  const position =
    span !== undefined && span.size > 0 && span.size < span.total
      ? ` · ${span.start + 1}-${span.start + span.size}/${span.total}`
      : '';
  const lead = `${marker} ${title}${focused ? ' FOCUSED' : ''}  `;
  const shownDetail =
    paneWidth === undefined
      ? detail
      : fitPaneDetail(
          detail,
          // Border and padding take two cells on each side.
          paneWidth - 4 - displayCells(lead) - displayCells(position),
          state.presentation.ascii ? '...' : '…',
        );
  // The name is bold; its detail and position are regular and muted, so the eye finds the pane first.
  return label(
    state,
    spans(state, [
      { text: lead, fg: tone ?? (focused ? colors.accent : colors.text), bold: true },
      // A state tone (Brass on a past step) holds across the detail, so `PAST` never fades to meta.
      { text: `${shownDetail}${position}`, fg: tone ?? colors.muted },
    ]),
    { height: 1, paddingLeft: 1, paddingRight: 1 },
  );
}

/**
 * In the balanced arrangement Files and History share one side pane; its title
 * names the other one, so a pane you can't see is never a pane you don't know about.
 */
export function balancedSibling(state: ReviewingApplicationState, region: 'files' | 'questions'): string {
  if (state.layout !== 'balanced' || !state.filePaneVisible) return '';
  const separator = state.presentation.ascii ? '-' : '·';
  return region === 'files'
    ? `  ${separator} ${messagesPaneName(state)} ${state.review?.messages.messages.total ?? 0}`
    : `  ${separator} Files`;
}
