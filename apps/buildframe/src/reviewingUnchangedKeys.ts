import type { ReviewingApplicationState } from './reviewingModel.js';

/**
 * Whether something over the Diff takes the keys first: the composer, a
 * dialog or list, the key list, or a Message being saved. The model routes
 * keys to them; nothing may move the Diff underneath.
 */
export function overlayTakesKeys(state: ReviewingApplicationState): boolean {
  return (
    state.editor !== undefined ||
    state.comparisonInput !== undefined ||
    state.search !== undefined ||
    state.continuationChoice !== undefined ||
    state.basisPicker !== undefined ||
    state.jumpList !== undefined ||
    state.historicalDialog !== undefined ||
    state.configurationWindow !== undefined ||
    state.actionLookupOpen ||
    state.pending !== undefined
  );
}

/**
 * How many lines a key moves the cursor of an unchanged file shown in the
 * Diff: j/k or the arrows by one, Page Up/Down by a page. Zero when the key
 * is something else, when no unchanged file is shown, or when something over
 * the Diff takes the keys.
 */
export function unchangedContentDelta(
  state: ReviewingApplicationState,
  input: { readonly name?: string | undefined; readonly text?: string | undefined },
  pageSize: number,
): number {
  if (
    state.screen !== 'review' ||
    state.focus !== 'diff' ||
    state.unchangedContent?.view.status !== 'available' ||
    overlayTakesKeys(state)
  ) {
    return 0;
  }
  if (input.text === 'k' || input.name === 'up') return -1;
  if (input.text === 'j' || input.name === 'down') return 1;
  if (input.name === 'pageUp') return -pageSize;
  if (input.name === 'pageDown') return pageSize;
  return 0;
}
