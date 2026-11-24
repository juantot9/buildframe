import { StyledText } from '@opentui/core';

import { codeRowStarts, displayCellSlice, displayCells } from './displayCells.js';
import type { ReviewingApplicationState } from './reviewingModel.js';

/**
 * Breaks code into explicit rows at token boundaries (see `codeRowStarts`), so
 * the rendered rows and `wrappedDiffRowHeight` come from one calculation. A
 * space where a row would start becomes the break, so continuations line up.
 */
export function wrappedCode(source: string | StyledText, width: number): string | StyledText {
  const plain = typeof source === 'string' ? source : source.chunks.map(chunk => chunk.text).join('');
  const starts = codeRowStarts(plain, width);
  if (starts.length === 0) return source;
  if (typeof source === 'string') {
    return [0, ...starts]
      .map((start, index) =>
        plain.slice(index > 0 && plain[start] === ' ' ? start + 1 : start, starts[index] ?? plain.length),
      )
      .join('\n');
  }
  let offset = 0;
  return new StyledText(
    source.chunks.map(chunk => {
      const chunkStart = offset;
      offset += chunk.text.length;
      const inside = starts.filter(start => start >= chunkStart && start < offset);
      if (inside.length === 0) return chunk;
      let text = '';
      let from = chunkStart;
      for (const start of inside) {
        text += `${chunk.text.slice(from - chunkStart, start - chunkStart)}\n`;
        from = plain[start] === ' ' ? start + 1 : start;
      }
      return { ...chunk, text: text + chunk.text.slice(from - chunkStart) };
    }),
  );
}

/** A code line as the Diff draws it: wrapped into rows, or cut to the width at the sideways offset. */
export function clippedCode(
  state: Pick<ReviewingApplicationState, 'wrapDiffLines' | 'diffHorizontalOffset' | 'presentation'>,
  source: string | StyledText,
  width: number,
): string | StyledText {
  if (state.wrapDiffLines) return wrappedCode(source, width);
  const plain = typeof source === 'string' ? source : source.chunks.map(chunk => chunk.text).join('');
  const offset = state.diffHorizontalOffset;
  const left = offset > 0 ? (state.presentation.ascii ? '<' : '‹') : '';
  const available = Math.max(1, width - left.length - 1);
  const slice = displayCellSlice(plain, offset, available);
  const shown = plain.slice(slice.start, slice.end);
  const clipped = displayCells(plain) > offset + available;
  const right = clipped ? (state.presentation.ascii ? '>' : '›') : '';
  if (typeof source === 'string') return `${left}${slice.padding}${shown}${right}`;
  let index = 0;
  return new StyledText([
    { __isChunk: true, text: left + slice.padding },
    ...source.chunks.flatMap(chunk => {
      const start = Math.max(0, slice.start - index);
      const end = Math.min(chunk.text.length, slice.end - index);
      index += chunk.text.length;
      return end <= start ? [] : [{ ...chunk, text: chunk.text.slice(start, end) }];
    }),
    { __isChunk: true, text: right },
  ]);
}
