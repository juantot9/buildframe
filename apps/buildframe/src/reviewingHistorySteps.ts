import type { ReviewHistoryPoint, ReviewHistoryStep } from '@buildframe/workspace/projection';
import type { ReviewMessageIdentity } from '@buildframe/workspace/reviewing';

import { headMoveSentence } from './reviewingHeadMoves.js';
import type { ReviewingApplicationState } from './reviewingModel.js';

/** The Review's history steps: their keys, the ones [ and ] visit, and how they read. */

function historyPointKey(point: ReviewHistoryPoint): string {
  return point.kind === 'sent' || point.kind === 'answered'
    ? `${point.kind}:${point.reviewMessageIdentity}`
    : point.kind;
}

export function historyStepKey(from: ReviewHistoryPoint, to: ReviewHistoryPoint): string {
  return `${historyPointKey(from)}>${historyPointKey(to)}`;
}

/** The steps [ and ] visit: those that changed code, oldest first; undefined without history. */
export function navigableHistorySteps(state: ReviewingApplicationState): readonly ReviewHistoryStep[] | undefined {
  return state.review?.history?.steps.filter(step => step.changes.status === 'changed');
}

/** The newest step in which HEAD moved; undefined when it never did. */
export function latestHeadMoveStep(state: ReviewingApplicationState): ReviewHistoryStep | undefined {
  return [...(state.review?.history?.steps ?? [])].reverse().find(step => step.headMove !== undefined);
}

/** How a step reads in titles ("during #3") and in its notice; a HEAD move in it leads the notice. */
export function historyStepText(
  step: ReviewHistoryStep,
  messages: readonly ReviewMessageIdentity[],
): { readonly label: string; readonly description: string } {
  const text = historyStepWords(step, messages);
  return step.headMove === undefined
    ? text
    : { ...text, description: `${headMoveSentence(step.headMove, text.label)} ${text.description}` };
}

export function historyStepWords(
  step: ReviewHistoryStep,
  messages: readonly ReviewMessageIdentity[],
): { readonly label: string; readonly description: string } {
  const ordinalOf = (point: ReviewHistoryPoint): number =>
    point.kind === 'sent' || point.kind === 'answered' ? messages.indexOf(point.reviewMessageIdentity) + 1 : 0;
  const ordinals = step.messageOrdinals;
  if (step.kind === 'answer') {
    return {
      label: `during #${ordinals[0]}`,
      description: `Everything that changed while #${ordinals[0]} was answered, by the agent or anyone else.`,
    };
  }
  if (step.kind === 'outside') {
    const label =
      step.to.kind !== 'now'
        ? `before #${ordinalOf(step.to)}`
        : step.from.kind === 'start'
          ? 'outside answers'
          : `after #${ordinalOf(step.from)}`;
    return { label, description: 'Changed outside any answer, most likely by you.' };
  }
  const named = ordinals.length === 1 ? `#${ordinals[0]}` : `#${ordinals[0]}–#${ordinals.at(-1)}`;
  if (step.from.kind === 'sent' && step.to.kind !== 'answered') {
    return {
      label: `since ${named} was sent`,
      description: `Everything that changed since ${named} was sent, by the agent or anyone else. It has no answer yet.`,
    };
  }
  return {
    label: `around ${named}`,
    description: `Everything that changed around ${named}, by the agent or anyone else. BuildFrame didn't keep the code when it was sent, so edits outside the answer are included.`,
  };
}
