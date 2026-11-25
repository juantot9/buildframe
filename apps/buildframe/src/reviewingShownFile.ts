import type {
  ReviewHistoryPoint,
  ReviewMessageListItem,
  ReviewProjectedDiffRow,
} from '@buildframe/workspace/projection';

import { reviewingFiles } from './reviewingFileList.js';
import type { ReviewViewBundle, ReviewingApplicationState } from './reviewingModel.js';

/** The file the panes show: its Diff, its path, and the Messages on its lines. */

/** The Diff the panes show: one stretch of history while it is shown, else the Review's. */
export function shownDiff(state: ReviewingApplicationState): ReviewViewBundle['diff'] {
  return state.shownStep === undefined ? state.review?.diff : state.shownStep.diff;
}

/** The path the shown Diff or unchanged content belongs to, as base64 bytes. */
export function shownFilePath(state: ReviewingApplicationState): string | undefined {
  const changes = state.shownStep;
  if (changes !== undefined) {
    return changes.files?.find(file => file.fileIdentity === state.selectedFileIdentity)?.path.bytesBase64;
  }
  const file = reviewingFiles(state.review, state.fileScope).find(
    candidate => candidate.fileIdentity === state.selectedFileIdentity,
  );
  return file?.pathBytesBase64;
}

/** The Messages anchored on the shown file's lines, by the side of the Diff they belong to. */
export interface LineMessages {
  readonly old: ReadonlyMap<number, readonly ReviewMessageListItem[]>;
  readonly new: ReadonlyMap<number, readonly ReviewMessageListItem[]>;
}

/**
 * Where the shown file's Messages sit. A Message's line is a line of the code
 * as it was when it was sent. At now that is read against the current code; on
 * a past step only a Message sent at one of the step's ends can be placed: on
 * the old side when the step starts at its send, on the new side when it ends
 * there.
 */
export function messagesOnLines(state: ReviewingApplicationState): LineMessages {
  const old = new Map<number, ReviewMessageListItem[]>();
  const next = new Map<number, ReviewMessageListItem[]>();
  const path = shownFilePath(state);
  if (path === undefined) return { old, new: next };
  const step = state.shownStep;
  const sentAt = (point: ReviewHistoryPoint, item: ReviewMessageListItem): boolean =>
    point.kind === 'sent' && point.reviewMessageIdentity === item.reviewMessageIdentity;
  for (const item of state.review?.messages.messages.items ?? []) {
    if (item.location.file.bytesBase64 !== path) continue;
    const side = step === undefined || sentAt(step.to, item) ? next : sentAt(step.from, item) ? old : undefined;
    if (side === undefined) continue;
    const line = side.get(item.location.line);
    if (line === undefined) side.set(item.location.line, [item]);
    else line.push(item);
  }
  return { old, new: next };
}

/** The Messages anchored on one Diff row. */
export function rowMessages(lines: LineMessages, row: ReviewProjectedDiffRow): readonly ReviewMessageListItem[] {
  return [
    ...(row.oldLine === undefined ? [] : (lines.old.get(row.oldLine) ?? [])),
    ...(row.newLine === undefined ? [] : (lines.new.get(row.newLine) ?? [])),
  ];
}
