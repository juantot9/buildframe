import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assessReviewMessageCommitment,
  reviewMessageAcknowledgementIdentity,
  type ReviewMessageCommitmentAssessmentInput,
} from '../../src/harness-interaction/commitmentPolicy.js';
import type {
  HarnessAcknowledgementRequirementIdentity,
  HarnessAttachmentIdentity,
  HarnessInvocationIdentity,
} from '../../src/harness-interaction/contracts.js';
import type { ReviewBasisIdentity, ReviewIdentity } from '../../src/reviewing/index.js';

function identity(prefix: string, seed: string): string {
  return `${prefix}_${createHash('sha256').update(seed).digest('hex')}`;
}

function invocation(seed: string): HarnessInvocationIdentity {
  return identity('hin', seed) as HarnessInvocationIdentity;
}

function input(
  overrides: Partial<ReviewMessageCommitmentAssessmentInput> = {},
): ReviewMessageCommitmentAssessmentInput {
  return {
    stateVersion: 7,
    reviewIdentity: identity('rev', 'review') as ReviewIdentity,
    originReviewBasisIdentity: identity('rbs', 'basis') as ReviewBasisIdentity,
    attachmentIdentity: identity('att', 'attachment') as HarnessAttachmentIdentity,
    destinationFingerprint: createHash('sha256').update('destination').digest('hex'),
    representation: 'live-repository-reference',
    outgoingMaterial: new TextEncoder().encode('Please review this line.\n\nreview.txt:1'),
    activeInvocationIdentities: [],
    unresolvedInvocationIdentities: [],
    ...overrides,
  };
}

describe('Review Message commitment policy', () => {
  it('assesses an ordinary exact message as direct with no requirements', () => {
    const assessment = assessReviewMessageCommitment(input());
    expect(assessment.status).toBe('direct');
    if (assessment.status === 'blocked') throw new Error('Ordinary message was blocked');
    expect(assessment.requirements).toEqual([]);
  });

  it('sends secret-looking text and credential-like locations directly, without scanning', () => {
    const secret = 'sk-' + 'a'.repeat(40);
    const assessment = assessReviewMessageCommitment(
      input({
        representation: 'saved-origin',
        outgoingMaterial: new TextEncoder().encode(
          `Is this key still valid? ${secret}\napi_key = "abcdefghijklmnop"\n\n.env:3`,
        ),
      }),
    );
    expect(assessment.status).toBe('direct');
    if (assessment.status === 'blocked') throw new Error('Secret-looking message was blocked');
    expect(assessment.requirements).toEqual([]);
  });

  it('gates on each unresolved earlier turn, in a stable order', () => {
    const first = invocation('first');
    const second = invocation('second');
    const assessment = assessReviewMessageCommitment(input({ unresolvedInvocationIdentities: [second, first] }));
    expect(assessment.status).toBe('gate');
    if (assessment.status === 'blocked') throw new Error('Gate assessment blocked');
    expect(assessment.requirements.map(item => item.kind)).toEqual([
      'unresolved-invocation-risk',
      'unresolved-invocation-risk',
    ]);
    expect(assessment.requirements.map(item => item.invocationIdentity)).toEqual([first, second].sort());
    for (const requirement of assessment.requirements) {
      expect(requirement.requirementIdentity).toMatch(/^hgr_[0-9a-f]{64}$/u);
    }
  });

  it('binds a requirement to the exact bytes, destination, and state version', () => {
    const unresolved = { unresolvedInvocationIdentities: [invocation('prior')] };
    const requirementOf = (overrides: Partial<ReviewMessageCommitmentAssessmentInput>) => {
      const assessment = assessReviewMessageCommitment(input({ ...unresolved, ...overrides }));
      if (assessment.status === 'blocked') throw new Error('Gate assessment blocked');
      return assessment.requirements[0]!.requirementIdentity;
    };
    const baseline = requirementOf({});
    expect(requirementOf({})).toBe(baseline);
    expect(requirementOf({ outgoingMaterial: new TextEncoder().encode('Different text') })).not.toBe(baseline);
    expect(
      requirementOf({ destinationFingerprint: createHash('sha256').update('other-destination').digest('hex') }),
    ).not.toBe(baseline);
    expect(requirementOf({ stateVersion: 8 })).not.toBe(baseline);
  });

  it('blocks active work, invalid input, and too many unresolved turns', () => {
    const active = assessReviewMessageCommitment(input({ activeInvocationIdentities: [invocation('active')] }));
    expect(active.status).toBe('blocked');
    if (active.status !== 'blocked') throw new Error('Active invocation was not blocked');
    expect(active.reason).toBe('active-invocation');

    const activeAndUnresolved = assessReviewMessageCommitment(
      input({
        activeInvocationIdentities: [invocation('both')],
        unresolvedInvocationIdentities: [invocation('both')],
      }),
    );
    expect(activeAndUnresolved.status).toBe('blocked');
    if (activeAndUnresolved.status !== 'blocked') throw new Error('Duplicate identity was not blocked');
    expect(activeAndUnresolved.reason).toBe('invalid-assessment-input');

    const malformed = assessReviewMessageCommitment(input({ outgoingMaterial: new Uint8Array() }));
    expect(malformed.status).toBe('blocked');
    if (malformed.status !== 'blocked') throw new Error('Empty material was not blocked');
    expect(malformed.reason).toBe('invalid-assessment-input');

    const tooMany = assessReviewMessageCommitment(
      input({
        unresolvedInvocationIdentities: Array.from({ length: 17 }, (_, index) => invocation(`lost ${index}`)),
      }),
    );
    expect(tooMany.status).toBe('blocked');
    if (tooMany.status !== 'blocked') throw new Error('Requirement limit was not enforced');
    expect(tooMany.reason).toBe('requirement-limit');
  });

  it('derives one stable acknowledgment identity per requirement', () => {
    const requirement = identity('hgr', 'requirement') as HarnessAcknowledgementRequirementIdentity;
    const first = reviewMessageAcknowledgementIdentity(requirement);
    expect(first).toBe(reviewMessageAcknowledgementIdentity(requirement));
    expect(first).toMatch(/^hsa_[0-9a-f]{64}$/u);
  });
});
