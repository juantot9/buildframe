import { kindsOf } from '../kindRoutes.js';
import type { ReviewingCommand } from './contracts.js';

/** Every command the Reviewing owner executes. */
export const REVIEWING_COMMAND_KINDS: readonly ReviewingCommand['kind'][] = kindsOf<ReviewingCommand['kind']>()([
  'review.basis.fork',
  'review.basis.git-commit.capture',
  'review.cancel',
  'review.change-observation.record',
  'review.change-set.refresh',
  'review.comparison.continue-live',
  'review.comparison.start',
  'review.complete',
  'review.context-contribution.add',
  'review.context-selection.change',
  'review.context.refresh',
  'review.current-changes.start',
  'review.legacy-question-candidate.promote',
  'review.question-batch.commit',
  'review.question-draft.create',
  'review.question-draft.revise',
  'review.question.disposition.set',
]);
