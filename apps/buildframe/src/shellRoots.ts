import type { CliRenderer, Renderable } from '@opentui/core';

import { mount, type RenderNode } from './renderTree.js';

/**
 * Replaces the whole screen tree on each render. The tree that was just
 * presented stays alive for one more frame, because the native hit grid
 * still points at it until OpenTUI commits the replacement; it is destroyed
 * on the next frame, never under an active text selection drag.
 */
export class ShellRoots {
  readonly #renderer: CliRenderer;
  readonly #rootId: string;
  #root: Renderable | undefined;
  readonly #retired = new Set<Renderable>();
  #cleanupScheduled = false;
  #running = false;

  constructor(renderer: CliRenderer, rootId: string) {
    this.#renderer = renderer;
    this.#rootId = rootId;
  }

  start(): void {
    this.#running = true;
  }

  /** The tree on screen now, for hit-testing. */
  get current(): Renderable | undefined {
    return this.#root;
  }

  /** Detaches the shown tree; `beforeDetach` runs first when there is one. Returns whether there was one. */
  retire(beforeDetach: () => void): boolean {
    const attached = this.#renderer.root.getRenderable(this.#rootId);
    const previous = new Set([this.#root, attached].filter(root => root !== undefined));
    if (previous.size === 0) return false;
    beforeDetach();
    for (const root of previous) {
      if (root.parent === this.#renderer.root) this.#renderer.root.remove(root);
      this.#retired.add(root);
    }
    this.#root = undefined;
    return true;
  }

  /** Mounts the new tree, which must carry the shell's root id. */
  mount(tree: RenderNode): void {
    const index = this.#renderer.root.add(mount(this.#renderer, tree));
    const next = this.#renderer.root.getChildren()[index];
    if (next?.id !== this.#rootId) throw new Error('Screen root did not mount');
    this.#root = next;
  }

  /** Asks for the frame that shows the new tree, and cleans up the retired ones after it. */
  present(): void {
    this.#renderer.requestRender();
    this.#scheduleCleanup();
  }

  stop(): void {
    this.#running = false;
    this.#renderer.off('frame', this.#onCleanupFrame);
    this.#cleanupScheduled = false;
    const attached = this.#renderer.root.getRenderable(this.#rootId);
    const active = new Set([this.#root, attached].filter(root => root !== undefined));
    this.#root = undefined;
    for (const root of active) {
      if (root.parent === this.#renderer.root) this.#renderer.root.remove(root);
      root.destroyRecursively();
    }
    for (const root of this.#retired) root.destroyRecursively();
    this.#retired.clear();
  }

  readonly #onCleanupFrame = (): void => {
    this.#cleanupScheduled = false;
    if (this.#renderer.getSelection()?.isDragging) {
      this.#scheduleCleanup();
      return;
    }
    for (const root of this.#retired) root.destroyRecursively();
    this.#retired.clear();
  };

  #scheduleCleanup(): void {
    if (this.#cleanupScheduled || this.#retired.size === 0 || !this.#running) return;
    this.#cleanupScheduled = true;
    this.#renderer.once('frame', this.#onCleanupFrame);
    this.#renderer.requestRender();
  }
}
