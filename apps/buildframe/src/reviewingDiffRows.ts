import type { ReviewProjectedDiffRow } from '@buildframe/workspace/projection';

/** Diff rows as the side-by-side layout pairs them, and where a selection sits among drawn rows. */

export interface SidePair {
  readonly old?: ReviewProjectedDiffRow;
  readonly next?: ReviewProjectedDiffRow;
}

export function sidePairs(rows: readonly ReviewProjectedDiffRow[]): readonly SidePair[] {
  const pairs: SidePair[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (row === undefined) break;
    if (row.kind === 'context') {
      pairs.push({ old: row, next: row });
      index += 1;
      continue;
    }
    const deletions: ReviewProjectedDiffRow[] = [];
    while (rows[index]?.kind === 'deletion') deletions.push(rows[index++]!);
    const additions: ReviewProjectedDiffRow[] = [];
    while (rows[index]?.kind === 'addition') additions.push(rows[index++]!);
    for (let offset = 0; offset < Math.max(deletions.length, additions.length); offset += 1) {
      pairs.push({
        ...(deletions[offset] === undefined ? {} : { old: deletions[offset] }),
        ...(additions[offset] === undefined ? {} : { next: additions[offset] }),
      });
    }
  }
  return pairs;
}

/** Where the selection starts, in rows, and how many rows it spans: one running total. */
export function selectionSpan(
  items: readonly { readonly size: number }[],
  first: number,
  last: number,
): { readonly selectionStart?: number; readonly selectionSize?: number } {
  if (first < 0) return {};
  let start = 0;
  for (let index = 0; index < first; index += 1) start += items[index]!.size;
  if (last < first) return { selectionStart: start };
  let size = 0;
  for (let index = first; index <= last; index += 1) size += items[index]!.size;
  return { selectionStart: start, selectionSize: size };
}
