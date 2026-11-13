import { RGBA, ScrollBarRenderable, type OptimizedBuffer, type RenderContext } from '@opentui/core';

/** A half-open span in projected ordinals (or visual rows for one oversized item). */
export interface ReviewingScrollSpan {
  readonly total: number;
  readonly start: number;
  readonly size: number;
}

/** Durable visual position owned by the Reviewing model, never by a rebuilt renderable. */
export interface ReviewingPaneScrollState {
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

export interface ReviewingPaneScrollLayout {
  /**
   * Same scope across a content change means the same document with more or
   * fewer rows loaded: the view then stays on the row it showed, like an editor.
   */
  readonly anchorScope?: string;
  /** Stable per-item keys (absolute row or file ordinals); undefined for cards. */
  readonly itemKeys?: readonly (string | undefined)[];
  readonly contentKey: string;
  readonly viewportSize: number;
  readonly itemSizes: readonly number[];
  readonly selectedIndex: number;
  readonly selectionKey?: string;
  readonly selectionStart?: number;
  readonly selectionSize?: number;
  readonly pageUp?: number;
  readonly pageDown?: number;
}

export interface ReviewingVisibleItem {
  readonly index: number;
  readonly start: number;
  readonly size: number;
}

export function emptyReviewingPaneScroll(): ReviewingPaneScrollState {
  return {
    contentKey: '',
    offset: 0,
    viewportSize: 1,
    contentSize: 0,
    selectionKey: undefined,
    selectionStart: 0,
    selectionSize: 0,
    pageUp: 1,
    pageDown: 1,
    followSelection: true,
    anchorDelta: 0,
    contentShift: 0,
  };
}

function finiteInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function normalizedSizes(values: readonly number[]): readonly number[] {
  return values.map(value => Math.max(1, finiteInteger(value, 1)));
}

function itemStart(sizes: readonly number[], index: number): number {
  let start = 0;
  for (let cursor = 0; cursor < index; cursor += 1) start += sizes[cursor]!;
  return start;
}

/** Number of logical items crossed by one visual viewport from a selection. */
export function reviewingPageStep(
  itemSizes: readonly number[],
  selectedIndex: number,
  viewportSize: number,
  direction: -1 | 1,
): number {
  const sizes = normalizedSizes(itemSizes);
  if (sizes.length === 0) return 1;
  const selected = Math.max(0, Math.min(finiteInteger(selectedIndex, 0), sizes.length - 1));
  const budget = Math.max(1, finiteInteger(viewportSize, 1));
  let used = 0;
  let count = 0;
  for (
    let index = selected + direction;
    index >= 0 && index < sizes.length && (used < budget || count === 0);
    index += direction
  ) {
    used += sizes[index]!;
    count += 1;
  }
  return Math.max(1, count);
}

/**
 * Reconciles exact View geometry with durable model position. Selection is
 * always revealed, while an oversized selected item may remain partially
 * visible so wheel/page input can traverse every continuation row.
 */
export function synchronizeReviewingPaneScroll(
  previous: ReviewingPaneScrollState,
  layout: ReviewingPaneScrollLayout,
): ReviewingPaneScrollState {
  const sizes = normalizedSizes(layout.itemSizes);
  const viewportSize = Math.max(1, finiteInteger(layout.viewportSize, 1));
  const contentSize = sizes.reduce((total, size) => total + size, 0);
  const maximumOffset = Math.max(0, contentSize - viewportSize);
  const contentChanged = previous.contentKey !== layout.contentKey;
  // A wheel-scrolled view keeps its place through background refreshes.
  const keepPlace = !previous.followSelection;
  const anchorIndex =
    contentChanged &&
    previous.anchorKey !== undefined &&
    layout.anchorScope !== undefined &&
    previous.anchorScope === layout.anchorScope
      ? (layout.itemKeys?.indexOf(previous.anchorKey) ?? -1)
      : -1;
  const sameDocument = anchorIndex >= 0;
  let offset = sameDocument
    ? itemStart(sizes, anchorIndex) + previous.anchorDelta
    : contentChanged && !keepPlace
      ? 0
      : finiteInteger(previous.offset, 0);
  offset = Math.max(0, Math.min(offset, maximumOffset));
  const contentShift = sameDocument ? offset - finiteInteger(previous.offset, 0) : 0;
  const selectedIndex =
    sizes.length === 0 ? -1 : Math.max(-1, Math.min(finiteInteger(layout.selectedIndex, -1), sizes.length - 1));
  const defaultSelectionStart = selectedIndex < 0 ? 0 : itemStart(sizes, selectedIndex);
  const selectionStart = Math.max(0, finiteInteger(layout.selectionStart ?? defaultSelectionStart, 0));
  const defaultSelectionSize = selectedIndex < 0 ? 0 : sizes[selectedIndex]!;
  const selectionSize = Math.max(0, finiteInteger(layout.selectionSize ?? defaultSelectionSize, defaultSelectionSize));
  const selectionEnd = selectionStart + selectionSize;
  const selectionChanged =
    previous.selectionKey !== layout.selectionKey || (contentChanged && !keepPlace && !sameDocument);
  const followSelection = !keepPlace || selectionChanged;

  if (selectionSize > 0 && followSelection) {
    if (selectionSize <= viewportSize) {
      if (selectionStart < offset) offset = selectionStart;
      else if (selectionEnd > offset + viewportSize) offset = selectionEnd - viewportSize;
    } else if (selectionChanged) {
      if (selectionEnd <= offset) offset = selectionEnd - viewportSize;
      else if (selectionStart >= offset + viewportSize) offset = selectionStart;
      else offset = Math.max(selectionStart, Math.min(offset, selectionEnd - viewportSize));
    } else if (selectionEnd <= offset) {
      offset = selectionEnd - viewportSize;
    } else if (selectionStart >= offset + viewportSize) {
      offset = selectionStart;
    }
  }
  offset = Math.max(0, Math.min(finiteInteger(offset, 0), maximumOffset));
  const anchor = topAnchor(sizes, layout.itemKeys, offset);

  return {
    contentKey: layout.contentKey,
    offset,
    viewportSize,
    contentSize,
    selectionKey: layout.selectionKey,
    selectionStart,
    selectionSize,
    pageUp: Math.max(1, finiteInteger(layout.pageUp ?? reviewingPageStep(sizes, selectedIndex, viewportSize, -1), 1)),
    pageDown: Math.max(
      1,
      finiteInteger(layout.pageDown ?? reviewingPageStep(sizes, selectedIndex, viewportSize, 1), 1),
    ),
    followSelection,
    ...(layout.anchorScope === undefined ? {} : { anchorScope: layout.anchorScope }),
    ...(anchor === undefined ? {} : { anchorKey: anchor.key }),
    anchorDelta: anchor?.delta ?? 0,
    contentShift,
  };
}

/** The first keyed item reaching the view's top row, and the view's distance from its start. */
function topAnchor(
  sizes: readonly number[],
  keys: readonly (string | undefined)[] | undefined,
  offset: number,
): { readonly key: string; readonly delta: number } | undefined {
  if (keys === undefined) return undefined;
  let start = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    const key = keys[index];
    if (key !== undefined && start + sizes[index]! > offset) return { key, delta: offset - start };
    start += sizes[index]!;
  }
  return undefined;
}

/** Moves the view itself, as a wheel does; the selection stays where it is. */
export function scrollReviewingPaneBy(
  state: ReviewingPaneScrollState,
  direction: -1 | 1,
  rows: number,
): { readonly state: ReviewingPaneScrollState; readonly moved: boolean } {
  const maximumOffset = Math.max(0, state.contentSize - state.viewportSize);
  const distance = Math.max(1, finiteInteger(rows, 1));
  const offset = Math.max(0, Math.min(state.offset + direction * distance, maximumOffset));
  if (offset === state.offset) return { state, moved: false };
  return { state: { ...state, offset, followSelection: false }, moved: true };
}

/** Moves through an oversized selected item without allowing it to disappear. */
export function scrollWithinOversizedSelection(
  state: ReviewingPaneScrollState,
  direction: -1 | 1,
  amount: number,
): { readonly state: ReviewingPaneScrollState; readonly moved: boolean } {
  if (state.selectionSize <= state.viewportSize || state.selectionSize <= 0) {
    return { state, moved: false };
  }
  const distance = Math.max(1, finiteInteger(amount, 1));
  const top = state.selectionStart;
  const bottom = Math.max(top, state.selectionStart + state.selectionSize - state.viewportSize);
  const next = direction < 0 ? Math.max(top, state.offset - distance) : Math.min(bottom, state.offset + distance);
  if (next === state.offset) return { state, moved: false };
  return { state: { ...state, offset: next }, moved: true };
}

/** Moves a model-owned viewport that has no logical selection (for Message detail). */
export function scrollReviewingViewport(
  state: ReviewingPaneScrollState,
  direction: -1 | 1,
  amount: number,
): ReviewingPaneScrollState {
  const maximumOffset = Math.max(0, state.contentSize - state.viewportSize);
  const distance = Math.max(1, finiteInteger(amount, 1));
  const offset = Math.max(0, Math.min(state.offset + direction * distance, maximumOffset));
  return offset === state.offset ? state : { ...state, offset };
}

/** Returns only items intersecting the clipped viewport. */
export function visibleReviewingItems(
  itemSizes: readonly number[],
  offset: number,
  viewportSize: number,
): readonly ReviewingVisibleItem[] {
  const sizes = normalizedSizes(itemSizes);
  const top = Math.max(0, finiteInteger(offset, 0));
  const bottom = top + Math.max(1, finiteInteger(viewportSize, 1));
  const visible: ReviewingVisibleItem[] = [];
  let start = 0;
  sizes.forEach((size, index) => {
    const end = start + size;
    if (end > top && start < bottom) visible.push({ index, start, size });
    start = end;
  });
  return visible;
}

interface ReviewingScrollOptions {
  readonly id: string;
  readonly span: ReviewingScrollSpan;
  readonly orientation: 'horizontal' | 'vertical';
  readonly length: number;
  readonly ascii: boolean;
  readonly noColor: boolean;
  readonly foreground: string;
  readonly background: string;
}

/** Noninteractive, whole-cell scrollbar for the model-owned visual position. */
export class ReviewingScrollRenderable extends ScrollBarRenderable {
  readonly #span: ReviewingScrollSpan;
  readonly #ascii: boolean;
  readonly #foreground: RGBA;
  readonly #background: RGBA;

  constructor(context: RenderContext, options: ReviewingScrollOptions) {
    super(context, {
      id: options.id,
      orientation: options.orientation,
      width: options.orientation === 'vertical' ? 1 : options.length,
      height: options.orientation === 'vertical' ? options.length : 1,
      flexShrink: 0,
      position: 'absolute',
      right: -1,
      bottom: options.orientation === 'horizontal' ? -1 : 0,
      zIndex: 2,
    });
    this.focusable = false;
    this.slider.visible = false;
    this.#span = options.span;
    this.#ascii = options.ascii;
    this.#foreground =
      options.noColor || options.foreground === 'transparent'
        ? RGBA.defaultForeground()
        : RGBA.fromHex(options.foreground);
    this.#background =
      options.noColor || options.background === 'transparent'
        ? RGBA.defaultBackground()
        : RGBA.fromHex(options.background);
    this.scrollSize = Math.max(0, options.span.total);
    this.viewportSize = Math.max(0, options.span.size);
    this.scrollPosition = Math.max(0, options.span.start);
  }

  override handleKeyPress(): boolean {
    return false;
  }

  protected override renderSelf(buffer: OptimizedBuffer): void {
    const length = this.orientation === 'vertical' ? this.height : this.width;
    if (length <= 0 || this.#span.total <= 0 || this.#span.size >= this.#span.total) return;
    const size = Math.min(length, Math.max(1, Math.round((length * this.#span.size) / this.#span.total)));
    const travel = length - size;
    const start = Math.round((travel * this.#span.start) / Math.max(1, this.#span.total - this.#span.size));
    const track = this.#ascii
      ? this.orientation === 'vertical'
        ? '|'
        : '-'
      : this.orientation === 'vertical'
        ? '│'
        : '─';
    const thumb = this.#ascii ? '#' : this.orientation === 'vertical' ? '┃' : '━';
    if (this.orientation === 'horizontal') {
      buffer.drawText(
        track.repeat(start) + thumb.repeat(size) + track.repeat(travel - start),
        this.x,
        this.y,
        this.#foreground,
        this.#background,
      );
      return;
    }
    for (let row = 0; row < length; row += 1) {
      buffer.drawText(
        row >= start && row < start + size ? thumb : track,
        this.x,
        this.y + row,
        this.#foreground,
        this.#background,
      );
    }
  }
}
