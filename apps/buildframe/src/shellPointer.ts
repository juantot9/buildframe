import { MouseButton, type CliRenderer, type MouseEvent } from '@opentui/core';

export interface ShellPointerHost<Target> {
  /** The exact target under the press, when the pressed renderable only knows its region. */
  refine(target: Target, event: MouseEvent): Target;
  /** A click landed: act on what was pressed. */
  activate(target: Target): void;
}

/**
 * Clicks on a screen's targets. A press remembers what it landed on; the
 * release activates it unless the pointer travelled far enough to be a text
 * selection. A click also clears any old selection.
 */
export class ShellPointer<Target> {
  readonly #renderer: CliRenderer;
  readonly #host: ShellPointerHost<Target>;
  #gesture: { readonly target: Target; readonly x: number; readonly y: number } | undefined;

  constructor(renderer: CliRenderer, host: ShellPointerHost<Target>) {
    this.#renderer = renderer;
    this.#host = host;
  }

  readonly begin = (target: Target, event: MouseEvent): void => {
    if (event.button !== MouseButton.LEFT) return;
    this.#gesture = { target: this.#host.refine(target, event), x: event.x, y: event.y };
    event.stopPropagation();
  };

  readonly finish = (event: MouseEvent): void => {
    if (event.button !== MouseButton.LEFT) return;
    const gesture = this.#gesture;
    this.#gesture = undefined;
    if (gesture === undefined) return;
    event.stopPropagation();
    // A physical click can wobble by a couple of terminal cells. Preserve a
    // deliberate longer drag for text selection, but make one ordinary click
    // both clear any old selection and activate the target pressed by the user.
    if (Math.abs(gesture.x - event.x) > 2 || Math.abs(gesture.y - event.y) > 2) return;
    this.#renderer.clearSelection();
    // Retired presented trees remain alive through the replacement frame, so
    // activation can be synchronous; deferring it made clicks trail the next input.
    this.#host.activate(gesture.target);
  };

  /** A selection or a stop: the press in progress no longer counts. */
  cancel(): void {
    this.#gesture = undefined;
  }
}
