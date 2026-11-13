import { sha256 } from '../sha256.js';
import type {
  CurrentChangesManifestSummary,
  ReviewComparedState,
  ReviewComparisonBasis,
} from '../workspaceEvidence/index.js';

export declare const reviewIdentityBrand: unique symbol;

export declare const reviewPassIdentityBrand: unique symbol;

export declare const reviewSnapshotIdentityBrand: unique symbol;

export declare const reviewBasisIdentityBrand: unique symbol;

export declare const reviewMessageIdentityBrand: unique symbol;

export declare const reviewMessageMaterialIdentityBrand: unique symbol;

export declare const reviewQuestionDraftIdentityBrand: unique symbol;

export declare const reviewQuestionIdentityBrand: unique symbol;

export declare const reviewBatchIdentityBrand: unique symbol;

export declare const reviewDispositionIdentityBrand: unique symbol;

export declare const reviewResultIdentityBrand: unique symbol;

export declare const reviewResponseIdentityBrand: unique symbol;

export declare const reviewContextSelectionIdentityBrand: unique symbol;

export declare const reviewContextRuleIdentityBrand: unique symbol;

export declare const reviewContextContributionIdentityBrand: unique symbol;

export declare const reviewSnapshotContextIdentityBrand: unique symbol;

export declare const reviewSnapshotContextItemIdentityBrand: unique symbol;

export declare const reviewSnapshotContextContentIdentityBrand: unique symbol;

export type ReviewIdentity = string & {
  readonly [reviewIdentityBrand]: 'ReviewIdentity';
};

export type ReviewPassIdentity = string & {
  readonly [reviewPassIdentityBrand]: 'ReviewPassIdentity';
};

export type ReviewSnapshotIdentity = string & {
  readonly [reviewSnapshotIdentityBrand]: 'ReviewSnapshotIdentity';
};

export type ReviewBasisIdentity = string & {
  readonly [reviewBasisIdentityBrand]: 'ReviewBasisIdentity';
};

export type ReviewMessageIdentity = string & {
  readonly [reviewMessageIdentityBrand]: 'ReviewMessageIdentity';
};

export type ReviewMessageMaterialIdentity = string & {
  readonly [reviewMessageMaterialIdentityBrand]: 'ReviewMessageMaterialIdentity';
};

export type ReviewQuestionDraftIdentity = string & {
  readonly [reviewQuestionDraftIdentityBrand]: 'ReviewQuestionDraftIdentity';
};

export type ReviewQuestionIdentity = string & {
  readonly [reviewQuestionIdentityBrand]: 'ReviewQuestionIdentity';
};

export type ReviewBatchIdentity = string & {
  readonly [reviewBatchIdentityBrand]: 'ReviewBatchIdentity';
};

export type ReviewDispositionIdentity = string & {
  readonly [reviewDispositionIdentityBrand]: 'ReviewDispositionIdentity';
};

export type ReviewResultIdentity = string & {
  readonly [reviewResultIdentityBrand]: 'ReviewResultIdentity';
};

export type ReviewResponseIdentity = string & {
  readonly [reviewResponseIdentityBrand]: 'ReviewResponseIdentity';
};

export type ReviewContextSelectionIdentity = string & {
  readonly [reviewContextSelectionIdentityBrand]: 'ReviewContextSelectionIdentity';
};

export type ReviewContextRuleIdentity = string & {
  readonly [reviewContextRuleIdentityBrand]: 'ReviewContextRuleIdentity';
};

export type ReviewContextContributionIdentity = string & {
  readonly [reviewContextContributionIdentityBrand]: 'ReviewContextContributionIdentity';
};

export type ReviewSnapshotContextIdentity = string & {
  readonly [reviewSnapshotContextIdentityBrand]: 'ReviewSnapshotContextIdentity';
};

export type ReviewSnapshotContextItemIdentity = string & {
  readonly [reviewSnapshotContextItemIdentityBrand]: 'ReviewSnapshotContextItemIdentity';
};

export type ReviewSnapshotContextContentIdentity = string & {
  readonly [reviewSnapshotContextContentIdentityBrand]: 'ReviewSnapshotContextContentIdentity';
};

export function reviewLiveChangesIdentity(
  basis: ReviewComparisonBasis,
  comparedState: ReviewComparedState,
  manifest: CurrentChangesManifestSummary,
): string {
  return `lch_${sha256(JSON.stringify([basis, comparedState, manifest.digest]))}`;
}

export function occurrenceIdentity(prefix: string, commandIdentity: string, role: string): string {
  return `${prefix}_${sha256(`neoflow-reviewing-v1\0${commandIdentity}\0${role}`)}`;
}

export function reviewingRecordIdentity(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}_${sha256(`neoflow-reviewing-v1\0${parts.join('\0')}`)}`;
}

export const stableRecordIdentity: typeof reviewingRecordIdentity = reviewingRecordIdentity;

export function reviewLiveBasisIdentity(reviewIdentity: ReviewIdentity): ReviewBasisIdentity {
  return reviewingRecordIdentity('rbs', reviewIdentity, 'live') as ReviewBasisIdentity;
}

export function reviewSnapshotBasisIdentity(
  reviewIdentity: ReviewIdentity,
  reviewSnapshotIdentity: ReviewSnapshotIdentity,
): ReviewBasisIdentity {
  return reviewingRecordIdentity(
    'rbs',
    reviewIdentity,
    'review-snapshot',
    reviewSnapshotIdentity,
  ) as ReviewBasisIdentity;
}

export function reviewGitCommitBasisIdentity(
  reviewIdentity: ReviewIdentity,
  objectIdentity: string,
): ReviewBasisIdentity {
  return reviewingRecordIdentity('rbs', reviewIdentity, 'git-commit', objectIdentity) as ReviewBasisIdentity;
}

export function reviewMessageIdentity(commandIdentity: string): ReviewMessageIdentity {
  return reviewingRecordIdentity('rmg', commandIdentity, 'review-message') as ReviewMessageIdentity;
}

export function reviewMessageMaterialIdentity(commandIdentity: string): ReviewMessageMaterialIdentity {
  return reviewingRecordIdentity(
    'rmo',
    commandIdentity,
    'review-message-outgoing-material',
  ) as ReviewMessageMaterialIdentity;
}

export function reviewContextSelectionIdentity(reviewIdentity: ReviewIdentity): ReviewContextSelectionIdentity {
  return reviewingRecordIdentity('rcs', reviewIdentity, 'context-selection') as ReviewContextSelectionIdentity;
}

export function reviewSnapshotContextIdentity(
  reviewSnapshotIdentity: ReviewSnapshotIdentity,
): ReviewSnapshotContextIdentity {
  return reviewingRecordIdentity('rsc', reviewSnapshotIdentity, 'snapshot-context') as ReviewSnapshotContextIdentity;
}

export function reviewSnapshotContextManifestWindowIdentity(
  reviewSnapshotIdentity: ReviewSnapshotIdentity,
  window: number,
): string {
  return reviewingRecordIdentity('rsw', reviewSnapshotIdentity, String(window));
}

export function reviewContextContributionIdentity(commandIdentity: string): ReviewContextContributionIdentity {
  return occurrenceIdentity('rcc', commandIdentity, 'context-contribution') as ReviewContextContributionIdentity;
}
