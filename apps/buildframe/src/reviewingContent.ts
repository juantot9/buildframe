import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';
import type { ReviewLiveFileContentView } from '@buildframe/workspace/projection';

export type AvailableReviewLiveFileContentView = Extract<ReviewLiveFileContentView, { readonly status: 'available' }>;

/** Whole source lines of one bounded window; no phantom line after a trailing LF. */
export function reviewLiveContentLines(view: AvailableReviewLiveFileContentView): readonly string[] {
  const lines = decodeBytesBase64(view.content.bytesBase64).toString('utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.length === 0 ? [''] : lines;
}

export function contentWindowContainsLine(view: AvailableReviewLiveFileContentView, line: number): boolean {
  return line >= view.content.firstLine && line < view.content.firstLine + view.content.lineCount;
}
