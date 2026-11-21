import type { CliRenderer, KeyEvent, Selection } from '@opentui/core';

import type { ReviewingInput } from './reviewingInput.js';

export interface ShellSelectionHost {
  /** Whether a finished selection is copied now (not while a composer owns the text). */
  copying(): boolean;
  /** A selection finished or was cleared; a click in progress no longer counts. */
  selected(): void;
  /** Copies the text: quietly after a drag, out loud on Ctrl+C. */
  copy(text: string, announce: 'failure-only' | 'always'): void;
}

/**
 * Text selected with the mouse: copied quietly as soon as the drag ends, and
 * copied again (saying so) with Ctrl+C, which then clears the selection
 * instead of quitting.
 */
export class ShellSelection {
  readonly #renderer: CliRenderer;
  readonly #host: ShellSelectionHost;
  #text: string | undefined;
  #running = false;

  constructor(renderer: CliRenderer, host: ShellSelectionHost) {
    this.#renderer = renderer;
    this.#host = host;
  }

  start(): void {
    this.#running = true;
    this.#renderer.on('selection', this.#onSelection);
  }

  stop(): void {
    this.#running = false;
    this.#renderer.off('selection', this.#onSelection);
    this.#text = undefined;
  }

  /** Ctrl+C while text is selected copies it and clears the selection; returns whether it did. */
  copyOnCtrlC(input: ReviewingInput, event: KeyEvent): boolean {
    if (input.name !== 'c' || !input.ctrl || (!this.#renderer.hasSelection && this.#text === undefined)) return false;
    const text = this.#renderer.getSelection()?.getSelectedText() || this.#text || '';
    if (text.length === 0) return false;
    event.preventDefault();
    event.stopPropagation();
    this.#text = undefined;
    this.#renderer.clearSelection();
    this.#host.copy(text, 'always');
    return true;
  }

  readonly #onSelection = (selection: Selection): void => {
    if (!this.#running || !this.#host.copying()) return;
    const text = selection.getSelectedText();
    this.#host.selected();
    this.#text = text.length === 0 ? undefined : text;
    if (text.length === 0) return;
    // Let OpenTUI complete the selection gesture before using the composed
    // clipboard. The quiet first write preserves the visible selection;
    // explicit Ctrl+C then reports clipboard support and clears without quitting.
    queueMicrotask(() => {
      if (!this.#running || this.#text !== text) return;
      this.#host.copy(text, 'failure-only');
    });
  };
}
