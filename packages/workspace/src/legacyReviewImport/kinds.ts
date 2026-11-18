import { kindsOf } from '../kindRoutes.js';
import type { LegacyReviewCommand, LegacyReviewImportViewRequest } from './contracts.js';

/** Every command and view the Legacy Review import owner handles. */
export const LEGACY_REVIEW_COMMAND_KINDS: readonly LegacyReviewCommand['kind'][] = kindsOf<
  LegacyReviewCommand['kind']
>()([
  'legacy-review.moved-receipt-source.associate-and-import',
  'legacy-review.queue-candidate.decision.set',
  'legacy-review.source.decision.set',
  'legacy-review.source.import',
]);

export const LEGACY_REVIEW_VIEW_KINDS: readonly LegacyReviewImportViewRequest['kind'][] = kindsOf<
  LegacyReviewImportViewRequest['kind']
>()([
  'legacy-review.moved-receipt-source',
  'legacy-review.moved-receipt-sources',
  'legacy-review.queue-candidate',
  'legacy-review.queue-candidates',
  'legacy-review.receipt-batch',
  'legacy-review.receipt-history',
  'legacy-review.sources',
]);
