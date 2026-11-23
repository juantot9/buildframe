import type { ReviewHistoryStep } from '@buildframe/workspace/projection';

import { fitDisplayCellsEnd } from './displayCells.js';

/** How Reviewing names a commit and a HEAD move in its words. */

export type HeadMove = NonNullable<ReviewHistoryStep['headMove']>;
export type HeadMoveCommit = HeadMove['to'];

/** A commit's short hash, as git prints it by default. */
export function shortHash(commit: HeadMoveCommit): string {
  return commit.objectIdentity.slice(0, 7);
}

/** A commit in a sentence: its subject first, in plain words, then its short hash. */
export function commitName(commit: HeadMoveCommit): string {
  const subject = fitDisplayCellsEnd(commit.subject.trim(), 40, '…');
  return subject === '' ? shortHash(commit) : `“${subject}” (${shortHash(commit)})`;
}

/** A HEAD move in a note: "committed f32adef", "3 commits, newest f32adef", "HEAD moved to f32adef". */
export function headMoveNote(move: HeadMove): string {
  if (move.kind === 'moved') return `HEAD moved to ${shortHash(move.to)}`;
  return move.count === 1 ? `committed ${shortHash(move.to)}` : `${move.count} commits, newest ${shortHash(move.to)}`;
}

/** What happened to HEAD in a step, as one sentence: "“Tidy” (f32adef) was committed during #1." */
export function headMoveSentence(move: HeadMove, label: string): string {
  if (move.kind === 'moved') return `HEAD moved to ${commitName(move.to)} ${label}.`;
  return move.count === 1
    ? `${commitName(move.to)} was committed ${label}.`
    : `${move.count} commits were made ${label}, the newest ${commitName(move.to)}.`;
}
