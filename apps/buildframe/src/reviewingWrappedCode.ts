import { StyledText } from '@opentui/core';

import { codeRowStarts } from './displayCells.js';

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
