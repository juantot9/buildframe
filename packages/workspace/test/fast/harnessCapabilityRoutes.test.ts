import { describe, expect, it } from 'vitest';

import { MAX_REVIEW_RESPONSE_BYTES } from '../../src/harness-interaction/limits.js';
import {
  isDirectReviewCapability,
  isUserPullReviewCapability,
  normalizeCapability,
} from '../../src/harness-interaction/normalization.js';

const ARTIFACT_RESULT_CONTRACT = {
  contractVersion: 1,
  contractIdentity: 'settled-final-assistant-review-response-v1',
  artifactKind: 'review-response',
  source: 'settled-final-assistant-text',
  completeness: 'all-final-text-blocks-after-correlated-user-message',
  maximumBytes: MAX_REVIEW_RESPONSE_BYTES,
};

const WRITE_CONSTRAINT = {
  strength: 'communicated',
  scope: 'harness-tools',
  limitation: 'BuildFrame communicates the authority and does not bound the effects of the session tools.',
};

function userPullCapability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: 1,
    capabilityIdentity: 'harness-user-pull-review-v1',
    handoffKind: 'submit-review-batch',
    route: 'user-pull',
    authority: 'workspace-write',
    effectConstraint: WRITE_CONSTRAINT,
    evidenceProfile: {
      submission: 'correlated',
      normalEnd: 'correlated',
      failure: 'correlated',
      interruption: 'unavailable',
      replay: 'unavailable',
    },
    artifactResultContract: ARTIFACT_RESULT_CONTRACT,
    knownLimitations: ['The Harness may modify the workspace with the tools available in this session.'],
    ...overrides,
  };
}

function directCapability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: 1,
    capabilityIdentity: 'harness-direct-review-v1',
    handoffKind: 'submit-review-batch',
    route: 'direct',
    authority: 'workspace-write',
    effectConstraint: WRITE_CONSTRAINT,
    evidenceProfile: {
      dispatchRejection: 'correlated',
      start: 'correlated',
      normalEnd: 'correlated',
      failure: 'correlated',
      interruption: 'correlated',
      replay: 'unavailable',
    },
    interruption: { route: 'direct-request' },
    artifactResultContract: ARTIFACT_RESULT_CONTRACT,
    noStartTimeoutMs: 30_000,
    knownLimitations: ['The Harness may modify the workspace with the tools available in this session.'],
    ...overrides,
  };
}

describe('reviewed Capability routes', () => {
  it('normalizes a user-pull contract and narrows it by route', () => {
    const capability = normalizeCapability(userPullCapability());

    expect(capability.route).toBe('user-pull');
    expect(isUserPullReviewCapability(capability)).toBe(true);
    expect(isDirectReviewCapability(capability)).toBe(false);
    if (!isUserPullReviewCapability(capability)) throw new Error('expected a user-pull capability');
    expect(capability.evidenceProfile).toEqual({
      submission: 'correlated',
      normalEnd: 'correlated',
      failure: 'correlated',
      interruption: 'unavailable',
      replay: 'unavailable',
    });
  });

  it('still normalizes a direct contract unchanged', () => {
    const capability = normalizeCapability(directCapability());

    expect(isDirectReviewCapability(capability)).toBe(true);
    if (!isDirectReviewCapability(capability)) throw new Error('expected a direct capability');
    expect(capability.interruption).toEqual({ route: 'direct-request' });
    expect(capability.noStartTimeoutMs).toBe(30_000);
    expect(capability.evidenceProfile.dispatchRejection).toBe('correlated');
  });

  it('refuses a user-pull contract that claims interruption or replay', () => {
    for (const claim of ['correlated', 'uncorrelated', 'available'] as const) {
      expect(() =>
        normalizeCapability(
          userPullCapability({
            evidenceProfile: {
              submission: 'correlated',
              normalEnd: 'correlated',
              failure: 'correlated',
              interruption: claim,
              replay: 'unavailable',
            },
          }),
        ),
      ).toThrow(TypeError);
    }
    expect(() =>
      normalizeCapability(
        userPullCapability({
          evidenceProfile: {
            submission: 'correlated',
            normalEnd: 'correlated',
            failure: 'correlated',
            interruption: 'unavailable',
            replay: 'correlated',
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it('refuses a user-pull contract carrying direct-only dispatch fields', () => {
    expect(() => normalizeCapability(userPullCapability({ interruption: { route: 'direct-request' } }))).toThrow(
      TypeError,
    );
    expect(() => normalizeCapability(userPullCapability({ noStartTimeoutMs: 30_000 }))).toThrow(TypeError);
    expect(() =>
      normalizeCapability(
        userPullCapability({
          evidenceProfile: {
            dispatchRejection: 'correlated',
            submission: 'correlated',
            normalEnd: 'correlated',
            failure: 'correlated',
            interruption: 'unavailable',
            replay: 'unavailable',
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it('refuses a direct contract that omits its dispatch guarantees', () => {
    // The separate contracts exist so a direct Adapter cannot quietly declare
    // the weaker user-pull profile by leaving fields out.
    const { interruption: _interruption, ...withoutInterruption } = directCapability();
    expect(() => normalizeCapability(withoutInterruption)).toThrow(TypeError);
    expect(() =>
      normalizeCapability(
        directCapability({
          evidenceProfile: {
            dispatchRejection: 'correlated',
            start: 'correlated',
            normalEnd: 'correlated',
            failure: 'correlated',
            interruption: 'unavailable',
            replay: 'unavailable',
          },
        }),
      ),
    ).toThrow(TypeError);
  });

  it('refuses an unknown route rather than coercing it', () => {
    expect(() => normalizeCapability(userPullCapability({ route: 'push' }))).toThrow(TypeError);
    expect(() => normalizeCapability(directCapability({ route: 'user-pull' }))).toThrow(TypeError);
    expect(() => normalizeCapability('not a record')).toThrow(TypeError);
  });
});
