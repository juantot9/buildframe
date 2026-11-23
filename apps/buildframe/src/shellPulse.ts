import { NOTICE_LIFETIME_MS, SPINNER_FRAME_MS, type NoticeTone } from './shellStatus.js';

/** What the pulse follows after each frame: a spinner that turns, and a notice that fades. */
export interface PulseSource {
  /** Something on screen moves (a spinner): the next frame is due one spinner step from now. */
  animating(): boolean;
  /** Moves every spinner one step. */
  advance(): void;
  /** The notice on screen; `identity` tells a new notice from the one already timed. */
  notice(): { readonly identity: unknown; readonly tone: NoticeTone } | undefined;
  /** The notice with this identity has had its time: clear it if it is still the one shown, and say whether it was. */
  expire(identity: unknown): boolean;
}

/**
 * The shell's two timers: spinner frames while something animates, and each
 * notice cleared after its tone's lifetime unless something replaced it.
 * Call `follow` after every render; `stop` cancels both.
 */
export class ShellPulse {
  readonly #render: () => void;
  #animationTimer: NodeJS.Timeout | undefined;
  #noticeTimer: NodeJS.Timeout | undefined;
  #noticeShown: unknown;
  #stopped = false;

  constructor(render: () => void) {
    this.#render = render;
  }

  follow(source: PulseSource): void {
    this.#scheduleAnimation(source);
    this.#scheduleNoticeExpiry(source);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#animationTimer !== undefined) clearTimeout(this.#animationTimer);
    this.#animationTimer = undefined;
    if (this.#noticeTimer !== undefined) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
  }

  #scheduleAnimation(source: PulseSource): void {
    if (this.#stopped || this.#animationTimer !== undefined || !source.animating()) return;
    this.#animationTimer = setTimeout(() => {
      this.#animationTimer = undefined;
      if (this.#stopped) return;
      source.advance();
      this.#render();
    }, SPINNER_FRAME_MS);
  }

  #scheduleNoticeExpiry(source: PulseSource): void {
    const notice = source.notice();
    if (notice?.identity === this.#noticeShown) return;
    this.#noticeShown = notice?.identity;
    if (this.#noticeTimer !== undefined) clearTimeout(this.#noticeTimer);
    this.#noticeTimer = undefined;
    if (notice === undefined || this.#stopped) return;
    this.#noticeTimer = setTimeout(() => {
      this.#noticeTimer = undefined;
      if (this.#stopped || !source.expire(notice.identity)) return;
      this.#render();
    }, NOTICE_LIFETIME_MS[notice.tone]);
  }
}
