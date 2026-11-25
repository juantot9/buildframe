import { describe, expect, it } from 'vitest';

import type { ReviewingApplicationState } from '../../src/reviewingModel.js';
import { unchangedContentDelta } from '../../src/reviewingUnchangedKeys.js';

/** A Review with an unchanged file open in the Diff and nothing over it. */
function shown(over: Partial<ReviewingApplicationState> = {}): ReviewingApplicationState {
  return {
    screen: 'review',
    focus: 'diff',
    unchangedContent: { pathBytesBase64: 'YS50cw==', view: { status: 'available' } },
    editor: undefined,
    comparisonInput: undefined,
    search: undefined,
    continuationChoice: undefined,
    basisPicker: undefined,
    jumpList: undefined,
    historicalDialog: undefined,
    configurationWindow: undefined,
    actionLookupOpen: false,
    pending: undefined,
    ...over,
  } as unknown as ReviewingApplicationState;
}

describe('moving through an unchanged file in the Diff', () => {
  it('moves a line with j, k and the arrows, and a page with Page Up and Down', () => {
    expect(unchangedContentDelta(shown(), { text: 'j' }, 20)).toBe(1);
    expect(unchangedContentDelta(shown(), { name: 'up' }, 20)).toBe(-1);
    expect(unchangedContentDelta(shown(), { name: 'pageDown' }, 20)).toBe(20);
    expect(unchangedContentDelta(shown(), { text: 'x' }, 20)).toBe(0);
  });

  it('leaves the keys to Review points, search, lists and the composer when they are open', () => {
    const overlays: Partial<ReviewingApplicationState>[] = [
      { basisPicker: { selectedReviewBasisIdentity: 'rbs_1' } } as never,
      { search: {} } as never,
      { jumpList: {} } as never,
      { editor: {} } as never,
      { comparisonInput: {} } as never,
      { continuationChoice: {} } as never,
      { historicalDialog: {} } as never,
      { configurationWindow: { selected: 'theme' } } as never,
      { actionLookupOpen: true },
      { pending: {} } as never,
    ];
    for (const overlay of overlays) {
      expect(unchangedContentDelta(shown(overlay), { text: 'j' }, 20)).toBe(0);
      expect(unchangedContentDelta(shown(overlay), { text: 'k' }, 20)).toBe(0);
    }
  });

  it('does nothing outside the Diff or without an unchanged file', () => {
    expect(unchangedContentDelta(shown({ focus: 'files' }), { text: 'j' }, 20)).toBe(0);
    expect(unchangedContentDelta(shown({ unchangedContent: undefined }), { text: 'j' }, 20)).toBe(0);
  });
});
