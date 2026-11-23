import { MacOSScrollAccel } from '@opentui/core';

/** How long a pane takes to glide to its new offset. */
const SCROLL_GLIDE_MS = 120;
/** Rows one wheel notch moves before acceleration. */
const WHEEL_ROWS = 3;
/** One presented frame. */
const GLIDE_FRAME_MS = 16;

interface PaneGlide {
  readonly contentKey: string;
  readonly anchorScope?: string;
  readonly from: number;
  readonly to: number;
  readonly startedAt: number;
}

/** Ease-out cubic: fast at first, settling gently, in whole rows. */
function glideOffset(glide: PaneGlide, now: number): number {
  const progress = Math.min(1, Math.max(0, (now - glide.startedAt) / SCROLL_GLIDE_MS));
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(glide.from + (glide.to - glide.from) * eased);
}

export interface PaneGliderHost {
  /** Whether motion is on (Configuration, `--reduced-motion`). */
  smooth(): boolean;
  running(): boolean;
  /** A native text selection is being dragged: never rebuild under it. */
  selecting(): boolean;
  render(): void;
}

/**
 * Smooth scrolling for any screen's panes. A screen decides where each pane
 * should be; the glider shows it easing there and asks for the frames it
 * needs, and turns wheel notches into rows with gentle acceleration.
 */
export class PaneGlider<Region> {
  readonly #host: PaneGliderHost;
  readonly #glides = new Map<Region, PaneGlide>();
  readonly #wheelAcceleration = new Map<Region, MacOSScrollAccel>();
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: PaneGliderHost) {
    this.#host = host;
  }

  /**
   * The model owns where a pane should be; the View shows it gliding there.
   * A new list (another file, another window) appears in place without motion.
   */
  glide(region: Region, scroll: PaneScrollState): PaneScrollState {
    const now = performance.now();
    let previous = this.#glides.get(region);
    const scope = scroll.anchorScope === undefined ? {} : { anchorScope: scroll.anchorScope };
    // Rows loaded above the view moved everything down; the glide moves with them.
    if (
      previous !== undefined &&
      previous.contentKey !== scroll.contentKey &&
      previous.anchorScope !== undefined &&
      previous.anchorScope === scroll.anchorScope
    ) {
      previous = {
        ...previous,
        contentKey: scroll.contentKey,
        from: previous.from + scroll.contentShift,
        to: previous.to + scroll.contentShift,
      };
      this.#glides.set(region, previous);
    }
    if (!this.#host.smooth() || previous === undefined || previous.contentKey !== scroll.contentKey) {
      this.#glides.set(region, {
        contentKey: scroll.contentKey,
        ...scope,
        from: scroll.offset,
        to: scroll.offset,
        startedAt: now,
      });
      return scroll;
    }
    let glide = previous;
    if (glide.to !== scroll.offset) {
      const shown = glideOffset(glide, now);
      // A long jump slides only its last two screenfuls, so it reads as motion, not a blur.
      const reach = Math.max(1, scroll.viewportSize) * 2;
      const from =
        Math.abs(scroll.offset - shown) > reach ? scroll.offset - Math.sign(scroll.offset - shown) * reach : shown;
      glide = { contentKey: scroll.contentKey, ...scope, from, to: scroll.offset, startedAt: now };
      this.#glides.set(region, glide);
    }
    const offset = glideOffset(glide, now);
    if (offset === scroll.offset) return scroll;
    this.#scheduleFrame();
    return { ...scroll, offset };
  }

  /** Rows one wheel event moves: quick flicks travel further; slow, deliberate notches stay precise. */
  wheelRows(region: Region, delta: number | undefined, now: number): number {
    let multiplier = 1;
    if (this.#host.smooth()) {
      let acceleration = this.#wheelAcceleration.get(region);
      if (acceleration === undefined) {
        acceleration = new MacOSScrollAccel();
        this.#wheelAcceleration.set(region, acceleration);
      }
      multiplier = acceleration.tick(now);
    }
    const notches = Math.max(1, Math.abs(delta ?? 1));
    return Math.max(1, Math.round(WHEEL_ROWS * notches * multiplier));
  }

  stop(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#glides.clear();
  }

  #scheduleFrame(): void {
    if (this.#timer !== undefined || !this.#host.running()) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (!this.#host.running()) return;
      if (this.#host.selecting()) {
        this.#scheduleFrame();
        return;
      }
      this.#host.render();
    }, GLIDE_FRAME_MS);
  }
}

/** Durable visual position owned by the Reviewing model, never by a rebuilt renderable. */
export interface PaneScrollState {
  readonly contentKey: string;
  readonly offset: number;
  readonly viewportSize: number;
  readonly contentSize: number;
  readonly selectionKey: string | undefined;
  readonly selectionStart: number;
  readonly selectionSize: number;
  readonly pageUp: number;
  readonly pageDown: number;
  /**
   * False after the wheel moved the view on its own: the selection may then sit
   * off screen until the next key press or click brings the view back to it.
   */
  readonly followSelection: boolean;
  /** The document the anchor belongs to; another file or list never reuses it. */
  readonly anchorScope?: string;
  /** Key of the item that holds the view's top row, and how far into it the view starts. */
  readonly anchorKey?: string;
  readonly anchorDelta: number;
  /** Rows the content moved under the view in this update (rows loaded above); a glide shifts with it. */
  readonly contentShift: number;
}
