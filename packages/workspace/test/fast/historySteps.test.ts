import { describe, expect, it } from 'vitest';

import type { ReviewHistoryPoint } from '../../src/projection/contracts.js';
import { historyPosition, historySteps, type HistoryPointState } from '../../src/projection/history.js';
import type { ReviewMessageIdentity } from '../../src/reviewing/index.js';

const message = (ordinal: number): ReviewMessageIdentity =>
  `rmg_${String(ordinal).padStart(26, '0')}` as ReviewMessageIdentity;
const sent = (ordinal: number): ReviewHistoryPoint => ({ kind: 'sent', reviewMessageIdentity: message(ordinal) });
const answered = (ordinal: number): ReviewHistoryPoint => ({
  kind: 'answered',
  reviewMessageIdentity: message(ordinal),
});
const state = (point: ReviewHistoryPoint, basisKey: string | undefined = 'head-1'): HistoryPointState => ({
  point,
  basisKey: point.kind === 'start' ? undefined : basisKey,
  files: [],
});
const positionFor =
  (messageCount: number) =>
  (point: ReviewHistoryPoint): number =>
    historyPosition(point, candidate => Number(candidate.reviewMessageIdentity.slice(4)), messageCount);

describe('Review history steps', () => {
  it('names each answer and the edits outside answers around it', () => {
    const steps = historySteps(
      [
        state({ kind: 'start' }),
        state(sent(1)),
        state(answered(1)),
        state(sent(2)),
        state(answered(2)),
        state({ kind: 'now' }),
      ],
      positionFor(2),
    );
    expect(steps.map(step => [step.kind, step.messageOrdinals])).toEqual([
      ['outside', []],
      ['answer', [1]],
      ['outside', []],
      ['answer', [2]],
      ['outside', []],
    ]);
    expect(steps.every(step => step.changes.status === 'unchanged')).toBe(true);
  });

  it('folds edits into a mixed step where the code at send was not kept', () => {
    // #1 and #2 were sent before BuildFrame kept the code at send.
    const steps = historySteps(
      [state({ kind: 'start' }), state(answered(1)), state(answered(2)), state(sent(3)), state(answered(3))],
      positionFor(3),
    );
    expect(steps.map(step => [step.kind, step.messageOrdinals])).toEqual([
      ['mixed', [1]],
      ['mixed', [2]],
      ['outside', []],
      ['answer', [3]],
    ]);
  });

  it('marks a Message that was never answered as mixed up to the next known point', () => {
    const steps = historySteps(
      [state({ kind: 'start' }), state(sent(1)), state(sent(2)), state({ kind: 'now' })],
      positionFor(2),
    );
    expect(steps.map(step => [step.kind, step.messageOrdinals])).toEqual([
      ['outside', []],
      ['mixed', [1]],
      ['mixed', [2]],
    ]);
  });

  it('cannot compare across a commit made in between', () => {
    const steps = historySteps(
      [state({ kind: 'start' }), state(sent(1), 'head-1'), state(answered(1), 'head-2')],
      positionFor(1),
    );
    expect(steps[0]!.changes).toEqual({ status: 'unchanged' });
    expect(steps[1]!.changes).toEqual({ status: 'unavailable', reason: 'commit-moved' });
  });
});
