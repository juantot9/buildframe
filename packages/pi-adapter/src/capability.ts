import type { ReviewedCapabilityManifest } from '@buildframe/workspace/harness-interaction';

import {
  assessPiHostVersion,
  MINIMUM_PI_HOST_VERSION,
  PI_HOST_COMPATIBILITY_RANGE,
  piHostCompatibilityLabel,
  VERIFIED_PI_HOST_VERSIONS,
} from './piHostCompatibility.js';

export const PI_ADAPTER_IMPLEMENTATION_IDENTITY = 'neoflow.pi-question-review-adapter/1';

/** Default authority: the owner expects an attached Harness to be able to edit. */
export type PiDirectReviewAuthority = 'workspace-write' | 'discussion-only';

const GATE_LIMITATION =
  'Enforced only across Pi-registered agent tools for this request; trusted extensions and operating-system effects remain outside this constraint.';
const WRITE_LIMITATION =
  'The Harness may modify the workspace with the tools available in this session, including its shell; BuildFrame communicates the authority and does not bound the effects of those tools.';
const COMPATIBILITY_LIMITATION =
  `Native compatibility is live-probed on Pi ${VERIFIED_PI_HOST_VERSIONS.join(', ')}; ` +
  `other stable ${PI_HOST_COMPATIBILITY_RANGE} releases use the same fail-closed compatibility contract.`;

/** Narrow the generic reviewed Manifest to one admitted Pi host occurrence. */
export function createPiReviewedCapabilityManifest(
  hostVersion: string,
  authority: PiDirectReviewAuthority = 'workspace-write',
): ReviewedCapabilityManifest {
  const compatibility = assessPiHostVersion(hostVersion);
  if (compatibility.status === 'unsupported') {
    throw new TypeError(`Unsupported ${piHostCompatibilityLabel(compatibility)}`);
  }
  return Object.freeze<ReviewedCapabilityManifest>({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: PI_ADAPTER_IMPLEMENTATION_IDENTITY,
    adapterDisplayName: 'Pi',
    reviewedHostVersions: Object.freeze([hostVersion]),
    capabilities: Object.freeze([
      {
        contractVersion: 1,
        capabilityIdentity:
          authority === 'workspace-write' ? 'pi-direct-workspace-write-review-v1' : 'pi-direct-question-only-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority,
        effectConstraint:
          authority === 'workspace-write'
            ? {
                strength: 'communicated',
                scope: 'harness-tools',
                limitation: WRITE_LIMITATION,
              }
            : {
                strength: 'enforced',
                scope: 'workspace-read-only',
                limitation: GATE_LIMITATION,
              },
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
          contractIdentity: 'pi-settled-final-assistant-review-response-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: 16 * 1024,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: [
          authority === 'workspace-write' ? WRITE_LIMITATION : GATE_LIMITATION,
          COMPATIBILITY_LIMITATION,
          'Pi submission return is not start or acceptance evidence; an observed correlated agent_start is required.',
          'A Review Response is captured only from all finalized text blocks of the correlated settlement-time final assistant message when it fits the 16 KiB Result bound.',
          'Normal settlement proves only a correlated Pi terminal lifecycle, not that the captured Response is correct.',
          'No directive or native effect is replayed after Adapter, runtime, or session replacement.',
        ],
      },
    ]),
  });
}

/** Baseline fixture and minimum-host probe Manifest. Live Adapters narrow to their actual host. */
export const PI_REVIEWED_CAPABILITY_MANIFEST: ReviewedCapabilityManifest = createPiReviewedCapabilityManifest(
  MINIMUM_PI_HOST_VERSION,
  'discussion-only',
);
