import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type {
  HarnessAcknowledgementIdentity,
  HarnessAcknowledgementRequirementIdentity,
  HarnessAttachmentIdentity,
  HarnessInvocationIdentity,
  ReviewMessageAcknowledgementRequirementView,
  ReviewMessageCommitmentAssessmentView,
} from './contracts.js';
import type { ReviewBasisIdentity, ReviewIdentity } from '../reviewing/index.js';

const MAX_IDENTITY_BYTES = 512;
const MAX_OUTGOING_BYTES = 768 * 1024;
const MAX_REQUIREMENTS = 16;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REVIEW_PATTERN = /^rev_[0-9a-f]{64}$/u;
const REVIEW_BASIS_PATTERN = /^rbs_[0-9a-f]{64}$/u;
const ATTACHMENT_PATTERN = /^att_[0-9a-f]{64}$/u;
const INVOCATION_PATTERN = /^hin_[0-9a-f]{64}$/u;
const REQUIREMENT_PATTERN = /^hgr_[0-9a-f]{64}$/u;

/**
 * A Review Message goes to the Harness exactly as the user wrote it: its text
 * and the files it names are never scanned for secrets. The only thing a
 * commit may need to confirm is that an earlier turn to the same session
 * never reported back, so sending now may repeat work.
 */
export interface ReviewMessageCommitmentAssessmentInput {
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  /** Digest of the complete normalized destination, including Attachment Identity. */
  readonly destinationFingerprint: string;
  readonly representation: 'live-repository-reference' | 'saved-origin';
  readonly outgoingMaterial: Uint8Array;
  readonly activeInvocationIdentities: readonly HarnessInvocationIdentity[];
  readonly unresolvedInvocationIdentities: readonly HarnessInvocationIdentity[];
}

export type ReviewMessageCommitmentBlockerReason =
  | 'invalid-assessment-input'
  | 'active-invocation'
  | 'requirement-limit';

export type ReviewMessageCommitmentAssessment =
  | ReviewMessageCommitmentAssessmentView
  | {
      readonly status: 'blocked';
      readonly assessmentIdentity: string;
      readonly reason: ReviewMessageCommitmentBlockerReason;
      readonly blockerIdentities: readonly string[];
    };

function stableIdentity(prefix: string, value: unknown): string {
  return `${prefix}_${sha256(`neoflow-review-message-commitment-v1\0${JSON.stringify(value)}`)}`;
}

function assessmentIdentity(value: unknown): string {
  return sha256(`neoflow-review-message-commitment-assessment-v1\0${JSON.stringify(value)}`);
}

function boundedText(value: unknown, maximum = MAX_IDENTITY_BYTES): value is string {
  return (
    typeof value === 'string' &&
    Buffer.byteLength(value) > 0 &&
    Buffer.byteLength(value) <= maximum &&
    value.trim() === value &&
    !value.includes('\u0000')
  );
}

function uniqueValidIdentities(values: readonly string[], pattern: RegExp): boolean {
  return (
    values.length <= 512 &&
    new Set(values).size === values.length &&
    values.every(value => boundedText(value) && pattern.test(value))
  );
}

function blocked(
  reason: ReviewMessageCommitmentBlockerReason,
  blockerIdentities: readonly string[],
): ReviewMessageCommitmentAssessment {
  const ordered = [...new Set(blockerIdentities)].sort();
  return deepFreeze({
    status: 'blocked',
    assessmentIdentity: assessmentIdentity({ reason, blockerIdentities: ordered }),
    reason,
    blockerIdentities: ordered,
  });
}

export function reviewMessageAcknowledgementIdentity(
  requirementIdentity: HarnessAcknowledgementRequirementIdentity,
): HarnessAcknowledgementIdentity {
  if (!REQUIREMENT_PATTERN.test(requirementIdentity)) {
    throw new TypeError('Invalid Review Message acknowledgement requirement identity');
  }
  return stableIdentity('hsa', requirementIdentity) as HarnessAcknowledgementIdentity;
}

/** Pure, fail-closed assessment of one already-composed Review Message proposal. */
export function assessReviewMessageCommitment(
  input: ReviewMessageCommitmentAssessmentInput,
): ReviewMessageCommitmentAssessment {
  if (
    !Number.isSafeInteger(input.stateVersion) ||
    input.stateVersion < 0 ||
    !REVIEW_PATTERN.test(input.reviewIdentity) ||
    !REVIEW_BASIS_PATTERN.test(input.originReviewBasisIdentity) ||
    !ATTACHMENT_PATTERN.test(input.attachmentIdentity) ||
    !SHA256_PATTERN.test(input.destinationFingerprint) ||
    (input.representation !== 'live-repository-reference' && input.representation !== 'saved-origin') ||
    !(input.outgoingMaterial instanceof Uint8Array) ||
    input.outgoingMaterial.byteLength === 0 ||
    input.outgoingMaterial.byteLength > MAX_OUTGOING_BYTES ||
    !uniqueValidIdentities(input.activeInvocationIdentities, INVOCATION_PATTERN) ||
    !uniqueValidIdentities(input.unresolvedInvocationIdentities, INVOCATION_PATTERN) ||
    input.activeInvocationIdentities.some(identity => input.unresolvedInvocationIdentities.includes(identity))
  ) {
    return blocked('invalid-assessment-input', []);
  }
  if (input.activeInvocationIdentities.length > 0) {
    return blocked('active-invocation', input.activeInvocationIdentities);
  }

  const binding = {
    contractVersion: 1,
    reviewIdentity: input.reviewIdentity,
    originReviewBasisIdentity: input.originReviewBasisIdentity,
    attachmentIdentity: input.attachmentIdentity,
    destinationFingerprint: input.destinationFingerprint,
    representation: input.representation,
    outgoingMaterialSha256: sha256(input.outgoingMaterial),
  } as const;
  const requirements: ReviewMessageAcknowledgementRequirementView[] = [...input.unresolvedInvocationIdentities]
    .sort()
    .map(invocationIdentity => ({
      requirementIdentity: stableIdentity('hgr', {
        kind: 'unresolved-invocation-risk',
        binding,
        stateVersion: input.stateVersion,
        invocationIdentity,
      }) as HarnessAcknowledgementRequirementIdentity,
      kind: 'unresolved-invocation-risk' as const,
      invocationIdentity,
    }));
  if (requirements.length > MAX_REQUIREMENTS) {
    return blocked(
      'requirement-limit',
      requirements.map(requirement => requirement.invocationIdentity),
    );
  }
  const status = requirements.length === 0 ? ('direct' as const) : ('gate' as const);
  return deepFreeze({
    assessmentIdentity: assessmentIdentity({ binding, status, requirements }),
    status,
    requirements,
  });
}
