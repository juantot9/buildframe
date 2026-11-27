import type { ReviewedCapabilityManifest } from '@buildframe/workspace/harness-interaction';

import type { PublicIntegrationManifest } from './wire.js';

/** The longest answer an integration sends; a longer one is cut and flagged so a turn end fits one frame. */
export const PUBLIC_ANSWER_MAXIMUM_BYTES: number = 512 * 1024;

/**
 * How long an accepted Message may wait for its turn to start. Accepted means
 * the harness runs it as its own turn once it is free, so this is longer than
 * a reviewed connector's; past it the outcome is unknown, never refused.
 */
export const PUBLIC_NO_START_TIMEOUT_MS: number = 120_000;

/** Every Unverified Integration's implementation identity starts with this. */
export const UNVERIFIED_IMPLEMENTATION_PREFIX: string = 'unverified:';

const UNVERIFIED_LIMITATION =
  'This integration is unverified: BuildFrame has not reviewed it, so what it reports about each turn is its own claim.';
const WRITE_LIMITATION =
  'The harness may modify the workspace with whatever tools its session has; BuildFrame communicates the authority and bounds nothing.';
const DELIVERY_LIMITATION = 'Each Review Message is accepted for the harness to run as its own turn once it is free.';

/**
 * The internal Capability Manifest for a public one. Unverified integrations
 * get the same authority choice a reviewed connector without enforcement has:
 * workspace-write, communicated. Only Review Messages are delivered; a Review
 * of Questions goes to connectors that render it.
 */
export function unverifiedCapabilityManifest(manifest: PublicIntegrationManifest): ReviewedCapabilityManifest {
  return Object.freeze<ReviewedCapabilityManifest>({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: `${UNVERIFIED_IMPLEMENTATION_PREFIX}${manifest.name}`,
    adapterDisplayName: manifest.name,
    reviewedHostVersions: Object.freeze([manifest.version]),
    capabilities: Object.freeze([
      {
        contractVersion: 1,
        capabilityIdentity: 'unverified-direct-workspace-write-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority: 'workspace-write',
        effectConstraint: { strength: 'communicated', scope: 'harness-tools', limitation: WRITE_LIMITATION },
        evidenceProfile: {
          dispatchRejection: 'correlated',
          start: 'correlated',
          normalEnd: 'correlated',
          failure: 'correlated',
          interruption: 'correlated',
          replay: 'unavailable',
        },
        interruption: { route: 'direct-request' },
        artifactResultContract: {
          contractVersion: 1,
          contractIdentity: 'unverified-final-answer-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: PUBLIC_ANSWER_MAXIMUM_BYTES,
        },
        noStartTimeoutMs: PUBLIC_NO_START_TIMEOUT_MS,
        knownLimitations: [
          UNVERIFIED_LIMITATION,
          WRITE_LIMITATION,
          DELIVERY_LIMITATION,
          ...(manifest.canInterrupt ? [] : ['This integration cannot interrupt a running turn.']),
          'Normal settlement proves only the turn lifecycle the integration reported, not that the Message was understood or applied.',
        ],
      },
    ]),
  });
}
