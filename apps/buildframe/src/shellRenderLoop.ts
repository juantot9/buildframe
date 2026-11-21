import type { CliRenderer } from '@opentui/core';

/**
 * When a screen's tree is drawn. `render` draws now; `renderSoon` coalesces a
 * burst (wheel input) into at most one draw per burst and per presented
 * frame; `invalidate` asks for a draw on the next frame (late syntax
 * highlighting). No draw replaces the tree under an active text drag, and a
 * draw asked for while one is mounting is dropped: the one in progress
 * already reads the current state.
 */
export class ShellRenderLoop {
  readonly #renderer: CliRenderer;
  readonly #draw: () => void;
  #running = false;
  #drawing = false;
  #soonQueued: NodeJS.Immediate | undefined;
  #soonFramePending = false;
  #soonDirty = false;
  #invalidated = false;

  constructor(renderer: CliRenderer, draw: () => void) {
    this.#renderer = renderer;
    this.#draw = draw;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    this.#running = true;
    this.#renderer.on('frame', this.#onInvalidatedFrame);
  }

  stop(): void {
    this.#running = false;
    this.#renderer.off('frame', this.#onInvalidatedFrame);
    this.#renderer.off('frame', this.#onSoonFrame);
    if (this.#soonQueued !== undefined) clearImmediate(this.#soonQueued);
    this.#soonQueued = undefined;
    this.#soonFramePending = false;
    this.#soonDirty = false;
  }

  render(): void {
    // Layout callbacks can request a replacement while a VNode is mounting.
    // The in-progress tree already reads the current synchronous state;
    // dropping that nested replacement leaves one unambiguous root owner.
    if (this.#drawing) return;
    this.#drawing = true;
    try {
      // Any immediate draw already includes the latest queued wheel state.
      this.#soonDirty = false;
      this.#invalidated = false;
      this.#draw();
    } finally {
      this.#drawing = false;
    }
  }

  /**
   * State changes stay lossless, while expensive whole-tree replacement is
   * coalesced across one terminal input burst and capped at one per presented
   * frame, so rapid wheel input can't build and retain dozens of superseded
   * trees before OpenTUI publishes one of them.
   */
  renderSoon(): void {
    this.#soonDirty = true;
    if (this.#soonQueued !== undefined || this.#soonFramePending || !this.#running) return;
    this.#soonQueued = setImmediate(() => {
      this.#soonQueued = undefined;
      if (!this.#running || !this.#soonDirty) return;
      this.#soonDirty = false;
      this.render();
      if (!this.#running) return;
      // render() registers retired-tree cleanup before this listener. On the
      // frame, cleanup therefore runs before another replacement can retire
      // the tree whose hit grid was just presented.
      this.#soonFramePending = true;
      this.#renderer.once('frame', this.#onSoonFrame);
    });
  }

  /** Something drawn is out of date (highlighting arrived): draw on the next frame. */
  invalidate(): void {
    if (!this.#running) return;
    this.#invalidated = true;
    this.#renderer.requestRender();
  }

  readonly #onSoonFrame = (): void => {
    this.#soonFramePending = false;
    if (this.#soonDirty) this.renderSoon();
  };

  readonly #onInvalidatedFrame = (): void => {
    if (!this.#invalidated || !this.#running) return;
    // Do not replace a tree underneath an active native text selection.
    if (this.#renderer.getSelection()?.isDragging) return;
    // Finish the presented frame's hit-grid/retired-tree cleanup first.
    queueMicrotask(() => {
      if (this.#running && this.#invalidated) this.render();
    });
  };
}
