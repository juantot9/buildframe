import type { WorkspaceIdentity } from '../workspace.js';
import type {
  LegacyReviewCandidateDecisionIdentity,
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewMovedSourceAssociationIdentity,
  LegacyReviewQueueCandidateDecision,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceDecision,
  LegacyReviewSourceDecisionIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from './contracts.js';
import { importRecordIdentity } from './records.js';
import os from 'node:os';
import path from 'node:path';

/** Package-private durable identity helpers for semantic State contracts. */
export function legacyReviewImportIndexIdentity(workspaceIdentity: WorkspaceIdentity): string {
  return importRecordIdentity('lmi', workspaceIdentity);
}

export function legacyReviewSourceOccurrenceIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceIdentity: LegacyReviewSourceIdentity,
  digest: string,
): LegacyReviewSourceOccurrenceIdentity {
  return importRecordIdentity('lso', workspaceIdentity, sourceIdentity, digest) as LegacyReviewSourceOccurrenceIdentity;
}

export function legacyReviewQueueCandidateIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  legacyAnnotationIdentity: string,
): LegacyReviewQueueCandidateIdentity {
  return importRecordIdentity(
    'lgc',
    workspaceIdentity,
    sourceOccurrenceIdentity,
    legacyAnnotationIdentity,
  ) as LegacyReviewQueueCandidateIdentity;
}

export function legacyReviewCandidateDecisionIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  candidateIdentity: LegacyReviewQueueCandidateIdentity,
  decision: LegacyReviewQueueCandidateDecision,
): LegacyReviewCandidateDecisionIdentity {
  return importRecordIdentity(
    'lcd',
    workspaceIdentity,
    sourceOccurrenceIdentity,
    candidateIdentity,
    decision,
  ) as LegacyReviewCandidateDecisionIdentity;
}

export function legacyReviewCandidatePromotionIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  candidateIdentity: LegacyReviewQueueCandidateIdentity,
): LegacyReviewCandidatePromotionIdentity {
  return importRecordIdentity(
    'lcp',
    workspaceIdentity,
    sourceOccurrenceIdentity,
    candidateIdentity,
  ) as LegacyReviewCandidatePromotionIdentity;
}

export function legacyReviewMovedSourceAssociationIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceIdentity: LegacyReviewSourceIdentity,
  digest: string,
): LegacyReviewMovedSourceAssociationIdentity {
  return importRecordIdentity(
    'lma',
    workspaceIdentity,
    sourceIdentity,
    digest,
  ) as LegacyReviewMovedSourceAssociationIdentity;
}

export function legacyReviewSourceDecisionIdentity(
  workspaceIdentity: WorkspaceIdentity,
  sourceIdentity: LegacyReviewSourceIdentity,
  digest: string,
  decision: LegacyReviewSourceDecision,
): LegacyReviewSourceDecisionIdentity {
  return importRecordIdentity(
    'lsd',
    workspaceIdentity,
    sourceIdentity,
    digest,
    decision,
  ) as LegacyReviewSourceDecisionIdentity;
}

export function legacyReviewImportCommandRecordIdentity(commandIdentity: string): string {
  return importRecordIdentity('lmc', commandIdentity);
}

/** Preserve the old product's state-base rule independently of v1 State. */
export function legacyReviewStateDirectory(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory: string = os.homedir(),
): string {
  const configured = environment.XDG_STATE_HOME?.trim();
  return configured === undefined || configured.length === 0
    ? path.join(homeDirectory, '.local', 'state')
    : path.resolve(configured);
}
