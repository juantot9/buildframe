import { describe, expect, it } from 'vitest';
import {
  emptyReviewingPaneScroll,
  scrollReviewingPaneBy,
  synchronizeReviewingPaneScroll,
  type ReviewingPaneScrollLayout,
} from '../../src/reviewingScroll.js';

const layout = (overrides: Partial<ReviewingPaneScrollLayout> = {}): ReviewingPaneScrollLayout => ({
  contentKey: 'list',
  viewportSize: 10,
  itemSizes: Array.from({ length: 50 }, () => 1),
  selectedIndex: 2,
  selectionKey: 'item-2',
  ...overrides,
});

describe('wheel scrolling moves the view, not the selection', () => {
  it('keeps the selection and its place until the selection changes', () => {
    const settled = synchronizeReviewingPaneScroll(emptyReviewingPaneScroll(), layout());
    expect(settled.offset).toBe(0);

    const scrolled = scrollReviewingPaneBy(settled, 1, 15);
    expect(scrolled.moved).toBe(true);
    expect(scrolled.state.offset).toBe(15);
    expect(scrolled.state.followSelection).toBe(false);

    // The next frame keeps the scrolled place although the selection is off screen.
    const kept = synchronizeReviewingPaneScroll(scrolled.state, layout());
    expect(kept.offset).toBe(15);
    expect(kept.followSelection).toBe(false);

    // A background refresh of the same pane keeps the place too.
    const refreshed = synchronizeReviewingPaneScroll(kept, layout({ contentKey: 'list-v2' }));
    expect(refreshed.offset).toBe(15);

    // A new selection brings the view back to it.
    const followed = synchronizeReviewingPaneScroll(refreshed, layout({ selectedIndex: 4, selectionKey: 'item-4' }));
    expect(followed.offset).toBe(4);
    expect(followed.followSelection).toBe(true);
  });

  it('stops at the edges so the caller can load more rows instead', () => {
    const settled = synchronizeReviewingPaneScroll(emptyReviewingPaneScroll(), layout());
    expect(scrollReviewingPaneBy(settled, -1, 3).moved).toBe(false);
    const end = scrollReviewingPaneBy(settled, 1, 1_000);
    expect(end.state.offset).toBe(40);
    expect(scrollReviewingPaneBy(end.state, 1, 3).moved).toBe(false);
  });
});
