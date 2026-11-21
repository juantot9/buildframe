import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NOTICE_LIFETIME_MS, SPINNER_FRAME_MS, type NoticeTone } from '../../src/reviewingStatus.js';
import { ShellPulse, type PulseSource } from '../../src/shellPulse.js';

/** A screen with a spinner and a notice, followed after every render as the shell does. */
function screen() {
  const state = {
    spinning: false,
    frames: 0,
    renders: 0,
    notice: undefined as { readonly text: string; readonly tone: NoticeTone } | undefined,
  };
  const source: PulseSource = {
    animating: () => state.spinning,
    advance: () => {
      state.frames += 1;
    },
    notice: () => (state.notice === undefined ? undefined : { identity: state.notice, tone: state.notice.tone }),
    expire: identity => {
      if (state.notice !== identity) return false;
      state.notice = undefined;
      return true;
    },
  };
  const pulse: ShellPulse = new ShellPulse(() => {
    state.renders += 1;
    pulse.follow(source);
  });
  const render = (): void => {
    state.renders += 1;
    pulse.follow(source);
  };
  return { state, pulse, render };
}

describe('the shell pulse', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns the spinner one step per frame while something animates, then rests', () => {
    const { state, render } = screen();
    state.spinning = true;
    render();
    vi.advanceTimersByTime(SPINNER_FRAME_MS * 3);
    expect(state.frames).toBe(3);
    state.spinning = false;
    vi.advanceTimersByTime(SPINNER_FRAME_MS * 5);
    expect(state.frames).toBe(4);
  });

  it('clears a notice after its tone’s lifetime, and times a replacement afresh', () => {
    const { state, render } = screen();
    state.notice = { text: 'Copied.', tone: 'success' };
    render();
    vi.advanceTimersByTime(NOTICE_LIFETIME_MS.success - 1);
    state.notice = { text: 'Copied.', tone: 'success' };
    render();
    vi.advanceTimersByTime(1);
    expect(state.notice).toBeDefined();
    vi.advanceTimersByTime(NOTICE_LIFETIME_MS.success);
    expect(state.notice).toBeUndefined();
  });

  it('stops both timers', () => {
    const { state, pulse, render } = screen();
    state.spinning = true;
    state.notice = { text: 'Saved.', tone: 'success' };
    render();
    pulse.stop();
    vi.advanceTimersByTime(NOTICE_LIFETIME_MS.success + SPINNER_FRAME_MS);
    expect(state.frames).toBe(0);
    expect(state.notice).toBeDefined();
  });
});
