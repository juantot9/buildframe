import type { ReviewBatchIdentity, ReviewIdentity, ReviewMessageIdentity } from '../reviewing/index.js';
import type {
  HarnessAttachmentIdentity,
  HarnessCommandRejectionReason,
  HarnessHandoffView,
  HarnessInteractionCommand,
  HarnessInteractionCommandRejected,
  HarnessInvocationView,
  UserPullPreparationView,
} from './contracts.js';
import type {
  HarnessHandoffIndexEntry,
  HarnessIndexPayload,
  HarnessInvocationIndexEntry,
  PreparedInspection,
  PreparedUserPullInspection,
  UserPullPreparationIndexEntry,
} from './internalTypes.js';
import { MAX_PROJECTED_EVIDENCE_IDENTITIES } from './limits.js';
import { cloneFrozen } from './utils.js';

export function rejected(
  command: HarnessInteractionCommand,
  stateVersion: number,
  reason: HarnessCommandRejectionReason,
  blockerIdentities?: readonly string[],
): HarnessInteractionCommandRejected {
  return cloneFrozen({
    kind: 'harness.command.rejected',
    status: 'rejected',
    commandIdentity: command.commandIdentity,
    stateVersion,
    reason,
    ...(blockerIdentities === undefined ? {} : { blockerIdentities: [...blockerIdentities] }),
  });
}

export function unavailableInspection(
  stateVersion: number,
  reviewIdentity: ReviewIdentity,
  reviewBatchIdentity: ReviewBatchIdentity,
  attachmentIdentity: HarnessAttachmentIdentity,
  reason: HarnessCommandRejectionReason,
  blockerIdentities?: readonly string[],
): PreparedInspection {
  return {
    view: cloneFrozen({
      kind: 'harness.review-handoff.inspection',
      status: 'unavailable',
      stateVersion,
      reviewIdentity,
      reviewBatchIdentity,
      attachmentIdentity,
      reason,
      ...(blockerIdentities === undefined ? {} : { blockerIdentities: [...blockerIdentities] }),
    }),
  };
}

export function unavailableUserPullInspection(
  stateVersion: number,
  reviewIdentity: ReviewIdentity,
  reviewBatchIdentity: ReviewBatchIdentity,
  attachmentIdentity: HarnessAttachmentIdentity,
  reason: HarnessCommandRejectionReason,
  blockerIdentities?: readonly string[],
): PreparedUserPullInspection {
  return {
    view: cloneFrozen({
      kind: 'harness.user-pull.review-handoff.inspection',
      status: 'unavailable',
      stateVersion,
      reviewIdentity,
      reviewBatchIdentity,
      attachmentIdentity,
      reason,
      ...(blockerIdentities === undefined ? {} : { blockerIdentities: [...blockerIdentities] }),
    }),
  };
}

export function projectionUserPullPreparation(
  stateVersion: number,
  entry: UserPullPreparationIndexEntry,
  index: HarnessIndexPayload,
): Exclude<UserPullPreparationView, { readonly status: 'not-found' }> {
  const handoff = index.handoffs.find(candidate => candidate.handoffIdentity === entry.handoffIdentity);
  if (handoff === undefined) throw new TypeError('User Pull Preparation Handoff is unavailable');
  const invocation =
    entry.invocationIdentity === undefined
      ? undefined
      : index.invocations.find(candidate => candidate.invocationIdentity === entry.invocationIdentity);
  if (entry.invocationIdentity !== undefined && invocation === undefined) {
    throw new TypeError('User Pull Preparation Invocation is unavailable');
  }
  return cloneFrozen({
    kind: 'harness.user-pull.preparation',
    status: entry.status,
    stateVersion,
    attachmentIdentity: entry.attachmentIdentity,
    preparationIdentity: entry.preparationIdentity,
    handoffIdentity: entry.handoffIdentity,
    reviewIdentity: entry.reviewIdentity,
    reviewBatchIdentity: entry.reviewBatchIdentity,
    disclosure: handoff.disclosure,
    ...(entry.disclosedDeadline === undefined ? {} : { disclosedDeadline: entry.disclosedDeadline }),
    liveArmCount: entry.status === 'prepared' ? entry.armedOccurrenceIdentities.length : 0,
    ...(entry.invocationIdentity === undefined ? {} : { invocationIdentity: entry.invocationIdentity }),
    ...(invocation?.startObservationDeadline === undefined
      ? {}
      : { startObservationDeadline: invocation.startObservationDeadline }),
    ...(entry.terminalReason === undefined ? {} : { terminalReason: entry.terminalReason }),
  });
}

export function projectionInvocation(entry: HarnessInvocationIndexEntry): HarnessInvocationView {
  return cloneFrozen({
    invocationIdentity: entry.invocationIdentity,
    handoffIdentity: entry.handoffIdentity,
    attachmentIdentity: entry.attachmentIdentity,
    status: entry.status,
    missingStartEvidence: entry.status === 'awaiting-start',
    missingTerminalEvidence: entry.status === 'awaiting-start' || entry.status === 'active',
    totalEvidence: entry.evidenceIdentities.length,
    evidenceIdentities: entry.evidenceIdentities.slice(-MAX_PROJECTED_EVIDENCE_IDENTITIES),
    interruptionIntentIdentities: [...entry.interruptionIntentIdentities],
    ...(entry.startObservationDeadline === undefined
      ? {}
      : { startObservationDeadline: entry.startObservationDeadline }),
    ...(entry.terminalReason === undefined ? {} : { terminalReason: entry.terminalReason }),
    ...(entry.responseIdentity === undefined ? {} : { responseIdentity: entry.responseIdentity }),
  });
}

export function projectionHandoff(
  entry: HarnessHandoffIndexEntry,
  reviewMessageIdentity: ReviewMessageIdentity | undefined,
): HarnessHandoffView {
  return cloneFrozen({
    handoffIdentity: entry.handoffIdentity,
    reviewBatchIdentity: entry.reviewBatchIdentity,
    ...(reviewMessageIdentity === undefined ? {} : { reviewMessageIdentity }),
    attachmentIdentity: entry.attachmentIdentity,
    commitmentReceiptIdentity: entry.commitmentReceiptIdentity,
    capabilitySnapshotIdentity: entry.capabilitySnapshotIdentity,
    disclosure: entry.disclosure,
  });
}
