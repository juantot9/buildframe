import type { ReviewMessageListItem, ReviewProjectedQuestionItem } from '@buildframe/workspace/projection';

import { agentName, messageState, type ReviewingApplicationState } from './reviewingModel.js';
import { messageBadge, type StatusBadge } from './reviewingStatus.js';

/** The words Reviewing uses for where a Message or Question stands. */

export function invocationLifecycleLabel(status: string): string {
  switch (status) {
    case 'awaiting-start':
      return 'Waiting to start';
    case 'active':
      return 'Active';
    case 'rejected':
      return 'Did not start';
    case 'ended-normally':
      return 'Turn ended—no complete Response captured';
    case 'failed':
      return 'Failed';
    case 'interrupted':
      return 'Interrupted';
    case 'unresolved':
      return 'Outcome unknown';
    default:
      return 'Not sent yet';
  }
}

export function stateBadge(state: ReviewingApplicationState, item: ReviewMessageListItem): StatusBadge {
  return messageBadge(messageState(state, item), state.animationFrame, state.presentation.ascii);
}

/** One sentence for a Message without a Response: what is happening and, if stuck, what to do. */
export function messageOutcomeLabel(state: ReviewingApplicationState, item: ReviewMessageListItem): string {
  const agent = agentName(state);
  const lowerAgent = agent === 'The agent' ? 'the agent' : agent;
  const badge = stateBadge(state, item);
  switch (messageState(state, item)) {
    case 'answered':
      return `${badge.glyph} Answered.`;
    case 'working':
      return `${badge.glyph} ${agent} is working on it. Press x to interrupt.`;
    case 'stopping':
      return `${badge.glyph} Asked ${lowerAgent} to stop; waiting for it.`;
    case 'waiting':
      return `${badge.glyph} Waiting for ${lowerAgent} to start.`;
    case 'interrupted':
      return `${badge.glyph} Interrupted before it finished. Press r to send it again.`;
    case 'failed':
      return `${badge.glyph} ${agent} reported an error; its window has the details. Press r to send it again.`;
    case 'not-sent':
      return `${badge.glyph} ${agent} didn’t take this Message. Press r to send it again.`;
    case 'unknown':
      return `${badge.glyph} BuildFrame never heard back about this Message. Check ${lowerAgent}, or press r to send it again.`;
    case 'no-answer':
      return `${badge.glyph} The turn ended without a reply. Press r to send it again.`;
    case 'not-loaded':
      return `${badge.glyph} BuildFrame hasn’t loaded what happened to this Message.`;
  }
}

export function questionStateLabel(state: ReviewingApplicationState, item: ReviewProjectedQuestionItem): string {
  if (item.kind === 'question-draft') return `historical draft r${item.revision}`;
  if (item.response !== undefined) return 'Response captured';
  if (item.historicalDisposition !== undefined) return `historical ${item.historicalDisposition}`;
  if (state.review === undefined) return 'Not sent to the agent';
  const handoff = state.review.harnessInteraction.handoffs.find(
    candidate => candidate.reviewBatchIdentity === item.reviewBatchIdentity,
  );
  if (handoff === undefined) return 'Not sent to the agent';
  const invocation = state.review.harnessInteraction.invocations.find(
    candidate => candidate.handoffIdentity === handoff.handoffIdentity,
  );
  if (invocation === undefined) return 'Not sent to the agent';
  return invocationLifecycleLabel(invocation.status);
}

export function responseSize(item: ReviewProjectedQuestionItem): string | undefined {
  if (item.kind !== 'question' || item.response === undefined) return undefined;
  const bytes = item.response.body.totalByteLength;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}
