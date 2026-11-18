import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaneGlider } from '../../src/shellGlide.js';
import type { ReviewingPaneScrollState } from '../../src/reviewingScroll.js';

const scroll = (offset: number, contentKey = 'file-a'): ReviewingPaneScrollState =>
  ({ offset, contentKey, contentShift: 0, viewportSize: 20 }) as unknown as ReviewingPaneScrollState;

function glider(smooth: boolean) {
  const renders: number[] = [];
  const pane = new PaneGlider<'diff'>({
    smooth: () => smooth,
    running: () => true,
    selecting: () => false,
    render: () => renders.push(performance.now()),
  });
  return { pane, renders };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('smooth scrolling', () => {
  it('jumps straight to the offset when motion is off', () => {
    const { pane, renders } = glider(false);
    pane.glide('diff', scroll(0));
    expect(pane.glide('diff', scroll(10)).offset).toBe(10);
    expect(renders).toEqual([]);
  });

  it('eases towards a new offset and asks for frames until it arrives', () => {
    vi.useFakeTimers();
    const { pane } = glider(true);
    pane.glide('diff', scroll(0));
    const first = pane.glide('diff', scroll(10)).offset;
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(10);
    vi.advanceTimersByTime(200);
    expect(pane.glide('diff', scroll(10)).offset).toBe(10);
    pane.stop();
  });

  it('shows another file in place, without motion', () => {
    const { pane } = glider(true);
    pane.glide('diff', scroll(0, 'file-a'));
    expect(pane.glide('diff', scroll(30, 'file-b')).offset).toBe(30);
  });

  it('turns wheel notches into rows, accelerating only when motion is on', () => {
    expect(glider(false).pane.wheelRows('diff', 2, 0)).toBe(6);
    expect(glider(true).pane.wheelRows('diff', 1, 0)).toBeGreaterThanOrEqual(3);
  });
});
