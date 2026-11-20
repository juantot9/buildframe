import { describe, expect, it } from 'vitest';

import { dispatchReviewingKey } from '../../src/reviewingActions.js';
import { ReviewingApplicationModel } from '../../src/reviewingModel.js';

const typed = (text: string) => ({ text, ctrl: false, alt: false, shift: false, super: false });

/** A Review shown at a past step whose Diff rows are still loading. */
function pastStepStillLoading(): ReviewingApplicationModel {
  const model = new ReviewingApplicationModel();
  model.state.screen = 'review';
  model.state.shownStep = {} as never;
  model.state.loading = { label: 'Loading Diff rows' };
  model.state.notice = undefined;
  return model;
}

describe('the order of the Reviewing key guards', () => {
  it('at a past step, says to press Esc even while the rows load, since the key can never act there', () => {
    for (const key of ['a', 'r', 'x', 'f', 't', 'R', 'C']) {
      const model = pastStepStillLoading();
      expect(dispatchReviewingKey(model, typed(key), 0)).toEqual([]);
      expect(model.state.notice, key).toBe('Press Esc to come back to now first.');
    }
  });

  it('at now, says the Review is still loading', () => {
    const model = pastStepStillLoading();
    model.state.shownStep = undefined;
    dispatchReviewingKey(model, typed('a'), 0);
    expect(model.state.notice).toBe('Still loading (Loading Diff rows); press a again in a moment.');
  });
});
