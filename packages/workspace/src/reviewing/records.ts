import type { StateRecordWrite } from '../authoritativeState.js';
import type { LegacyQuestionCandidatePromotionPreparationRejectionReason } from '../legacyReviewImport/index.js';
import { deepFreeze } from '../recordCodec.js';
import type { ReviewingCommand, ReviewingCommandRejected, ReviewingCommandRejectionReason } from './contracts.js';
import type { ReviewIdentity } from './identities.js';
import type { ReviewIndexEntry, ReviewIndexPayload } from './internalTypes.js';
import { encode } from './utils.js';

export function revisionedRecord(
  recordIdentity_: string,
  workflowIdentity: string,
  kind: string,
  expectedRevision: number,
  payload: unknown,
): StateRecordWrite {
  return {
    recordClass: 'revisioned',
    recordIdentity: recordIdentity_,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    expectedRevision,
    payload: encode(payload),
    content: [],
  };
}

export function rejected(
  command: ReviewingCommand,
  stateVersion: number,
  reason: ReviewingCommandRejectionReason,
  blockerIdentities?: readonly string[],
): ReviewingCommandRejected {
  return deepFreeze({
    kind: 'review.command.rejected',
    status: 'rejected',
    commandIdentity: command.commandIdentity,
    stateVersion,
    reason,
    ...(blockerIdentities === undefined ? {} : { blockerIdentities: [...blockerIdentities] }),
  });
}

export function legacyPromotionRejectionReason(
  reason: LegacyQuestionCandidatePromotionPreparationRejectionReason,
): ReviewingCommandRejectionReason {
  switch (reason) {
    case 'state-version-mismatch':
      return 'state-version-mismatch';
    case 'source-occurrence-not-imported':
      return 'legacy-source-occurrence-not-imported';
    case 'candidate-source-unavailable':
      return 'legacy-candidate-source-unavailable';
    case 'candidate-source-digest-mismatch':
      return 'legacy-candidate-source-digest-mismatch';
    case 'candidate-not-found':
      return 'legacy-candidate-not-found';
    case 'candidate-intent-unsupported':
      return 'legacy-candidate-intent-unsupported';
    case 'candidate-already-promoted':
      return 'legacy-candidate-already-promoted';
    case 'candidate-promotion-limit':
      return 'legacy-candidate-promotion-limit';
  }
}

export function replaceReview(index: ReviewIndexPayload, replacement: ReviewIndexEntry): ReviewIndexPayload {
  return {
    formatVersion: 1,
    reviews: index.reviews.map(entry => (entry.reviewIdentity === replacement.reviewIdentity ? replacement : entry)),
  };
}

export function replaceCurrentReview(index: ReviewIndexPayload, replacement: ReviewIndexEntry): ReviewIndexPayload {
  return {
    formatVersion: 1,
    ...(index.currentReviewIdentity === undefined ? {} : { currentReviewIdentity: index.currentReviewIdentity }),
    reviews: index.reviews.map(entry => (entry.reviewIdentity === replacement.reviewIdentity ? replacement : entry)),
  };
}

export function activeReview(index: ReviewIndexPayload, reviewIdentity: ReviewIdentity): ReviewIndexEntry | undefined {
  return index.reviews.find(entry => entry.reviewIdentity === reviewIdentity && entry.status === 'active');
}
