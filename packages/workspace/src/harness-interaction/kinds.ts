import { kindsOf } from '../kindRoutes.js';
import type {
  HarnessInteractionCommand,
  HarnessInteractionViewRequest,
  HarnessInteractionViewScope,
} from './contracts.js';

/** Every command, view and subscription the Harness Interaction owner handles. */
export const HARNESS_COMMAND_KINDS: readonly HarnessInteractionCommand['kind'][] = kindsOf<
  HarnessInteractionCommand['kind']
>()([
  'harness.invocation.interruption.request',
  'harness.review-handoff.commit',
  'review.message.commit',
  'review.question.ask',
]);

export const HARNESS_VIEW_KINDS: readonly HarnessInteractionViewRequest['kind'][] = kindsOf<
  HarnessInteractionViewRequest['kind']
>()([
  'harness.command-result',
  'harness.connection',
  'harness.review-handoff.inspect',
  'harness.review-handoff.inspect-default',
  'harness.review-interaction',
  'harness.review-message.inspect-default',
  'harness.review-question.inspect-default',
]);

export const HARNESS_SCOPE_KINDS: readonly HarnessInteractionViewScope['kind'][] = kindsOf<
  HarnessInteractionViewScope['kind']
>()(['harness.connection', 'harness.review-interaction']);
