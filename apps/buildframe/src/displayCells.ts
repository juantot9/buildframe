const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const ZERO_WIDTH = /^[\p{Mark}\p{Default_Ignorable_Code_Point}\u0000-\u001f\u007f-\u009f]+$/u;
const EMOJI = /\p{Emoji_Presentation}|\uFE0F|\u20E3/u;

// Compact East Asian Wide/Fullwidth ranges. This is a presentation policy, not
// a promise about every terminal's Unicode version or ambiguous-width setting.
function wide(code: number): boolean {
  return (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd))
  );
}

function graphemeWidth(text: string): number {
  if (ZERO_WIDTH.test(text)) return 0;
  return EMOJI.test(text) || wide(text.codePointAt(0)!) ? 2 : 1;
}

export function displayCells(text: string): number {
  let width = 0;
  for (const { segment } of segmenter.segment(text)) width += graphemeWidth(segment);
  return width;
}

/** Whole graphemes only; a viewport starting inside a wide cell shows its blank tail. */
export function displayCellSlice(
  text: string,
  offset: number,
  width: number,
): {
  start: number;
  end: number;
  padding: string;
} {
  let column = 0;
  let start = text.length;
  let end = text.length;
  let padding = '';
  const lastColumn = offset + Math.max(0, width);
  for (const { segment, index } of segmenter.segment(text)) {
    const size = graphemeWidth(segment);
    if (column >= lastColumn && size > 0) break;
    if (column >= offset && column + size <= lastColumn) {
      if (start === text.length) start = index;
      end = index + segment.length;
    } else if (column < offset && column + size > offset) {
      padding = ' '.repeat(Math.min(lastColumn, column + size) - offset);
    }
    column += size;
  }
  return { start, end, padding };
}

export function sliceDisplayCells(text: string, offset: number, width: number): string {
  const slice = displayCellSlice(text, offset, width);
  return slice.padding + text.slice(slice.start, slice.end);
}

/**
 * Wrap complete text in linear time without splitting graphemes or logical
 * lines. `maximumRows` stops early for bounded previews.
 */
export function wrapDisplayCellRows(
  text: string,
  width: number,
  maximumRows: number = Number.POSITIVE_INFINITY,
): readonly string[] {
  const columns = Math.max(1, width);
  const boundedRows = Math.max(0, Math.floor(maximumRows));
  const rows: string[] = [];
  outer: for (const logicalLine of text.split('\n')) {
    if (rows.length >= boundedRows) break;
    const graphemes = Array.from(segmenter.segment(logicalLine), ({ segment }) => segment);
    if (graphemes.length === 0) {
      rows.push('');
      continue;
    }
    let start = 0;
    while (start < graphemes.length && rows.length < boundedRows) {
      let end = start;
      let used = 0;
      let lastWhitespace = -1;
      while (end < graphemes.length) {
        const size = graphemeWidth(graphemes[end]!);
        if (used > 0 && used + size > columns) break;
        used += size;
        if (/\s/u.test(graphemes[end]!)) lastWhitespace = end;
        end += 1;
        if (used > columns) break;
      }
      if (end >= graphemes.length) {
        rows.push(graphemes.slice(start).join(''));
        break;
      }
      const breakAt = lastWhitespace > start ? lastWhitespace : Math.max(start + 1, end);
      rows.push(graphemes.slice(start, breakAt).join('').trimEnd());
      start = breakAt;
      while (start < graphemes.length && /\s/u.test(graphemes[start]!)) start += 1;
    }
    if (rows.length >= boundedRows) break outer;
  }
  return rows;
}

/** Simulate char wrapping: a wide grapheme never straddles a row boundary. */
export function wrappedDisplayRows(text: string, width: number): number {
  const columns = Math.max(1, width);
  let rows = 1;
  let used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const size = graphemeWidth(segment);
    if (size > 0 && used > 0 && used + size > columns) {
      rows += 1;
      used = 0;
    }
    used += size;
  }
  return rows;
}

/**
 * Keeps the beginning of `text` within `width` cells, marking a cut at the end.
 * The cut falls after a whole word when there is one to keep; a single long
 * word is cut where it must be.
 */
export function fitDisplayCellsEnd(text: string, width: number, ellipsis: string): string {
  if (displayCells(text) <= width) return text;
  const room = Math.max(0, width - displayCells(ellipsis));
  const kept = sliceDisplayCells(text, 0, room);
  const midWord = kept.length < text.length && !/\s/u.test(text[kept.length] ?? ' ') && !/\s$/u.test(kept);
  const wordEnd = midWord ? kept.trimEnd().search(/\s\S*$/u) : -1;
  return `${(wordEnd > 0 ? kept.slice(0, wordEnd) : kept).trimEnd()}${ellipsis}`;
}

/** Keeps the end of `text` (a path's file name) within `width` cells, marking a cut at the start. */
export function fitDisplayCellsStart(text: string, width: number, ellipsis: string): string {
  const total = displayCells(text);
  if (total <= width) return text;
  const room = Math.max(0, width - displayCells(ellipsis));
  return `${ellipsis}${sliceDisplayCells(text, total - room, room).trimStart()}`;
}

/** Characters after which code may wrap: whitespace and common delimiters/operators. */
const CODE_BREAK_AFTER = /[\s.,;:()[\]{}<>/=+\-*&|!?]/u;

/**
 * String offsets where each continuation row of `text` starts when wrapped to
 * `width` cells. Rows end after a space or delimiter when one falls in the
 * row's second half, so identifiers and strings stay whole; otherwise the row
 * is cut at the width. Wide graphemes never straddle a row.
 */
export function codeRowStarts(text: string, width: number): readonly number[] {
  // Most code is printable ASCII: one character, one grapheme, one cell. Skip
  // grapheme segmentation there; the result is identical (see the tests).
  return PRINTABLE_ASCII.test(text) ? asciiCodeRowStarts(text, width) : segmentedCodeRowStarts(text, width);
}

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/u;
const ASCII_BREAK_AFTER = new Set([...' .,;:()[]{}<>/=+-*&|!?'].map(character => character.charCodeAt(0)));

function asciiCodeRowStarts(text: string, width: number): readonly number[] {
  const columns = Math.max(1, width);
  const starts: number[] = [];
  if (text.length <= columns) return starts;
  let rowStart = 0;
  let used = 0;
  let boundary = -1;
  let boundaryUsed = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (used > 0 && used + 1 > columns) {
      const breakAt = boundary > rowStart && boundaryUsed * 2 >= columns ? boundary : index;
      starts.push(breakAt);
      used = breakAt === index ? 0 : used - boundaryUsed;
      rowStart = breakAt;
      boundary = -1;
      boundaryUsed = 0;
    }
    used += 1;
    if (ASCII_BREAK_AFTER.has(text.charCodeAt(index))) {
      boundary = index + 1;
      boundaryUsed = used;
    }
  }
  return starts;
}

/** The general path, by grapheme; exported only so tests can prove the ASCII path equal. */
export function segmentedCodeRowStarts(text: string, width: number): readonly number[] {
  const columns = Math.max(1, width);
  const starts: number[] = [];
  let rowStart = 0;
  let used = 0;
  let boundary = -1;
  let boundaryUsed = 0;
  for (const { segment, index } of segmenter.segment(text)) {
    const size = graphemeWidth(segment);
    if (size > 0 && used > 0 && used + size > columns) {
      const breakAt = boundary > rowStart && boundaryUsed * 2 >= columns ? boundary : index;
      starts.push(breakAt);
      used = breakAt === index ? 0 : used - boundaryUsed;
      rowStart = breakAt;
      boundary = -1;
      boundaryUsed = 0;
    }
    used += size;
    if (CODE_BREAK_AFTER.test(segment)) {
      boundary = index + segment.length;
      boundaryUsed = used;
    }
  }
  return starts;
}
