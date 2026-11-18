import type { ReviewedCapabilityManifest } from '@buildframe/workspace/harness-interaction';

/**
 * Direct delivery runs through a native Claude Code Mod and is admitted on its
 * own policy: any stable Claude Code 2.x.x from the oldest live-verified
 * build upward. A version outside
 * that range refuses attachment rather than guessing.
 */
export const CLAUDE_DIRECT_HOST_COMPATIBILITY_RANGE = '>=2.1.310 <3.0.0';
const MINIMUM_CLAUDE_DIRECT_HOST_MINOR = 1;
const MINIMUM_CLAUDE_DIRECT_HOST_PATCH = 310;

/** The versions a live session has actually been run against. */
export const REVIEWED_CLAUDE_DIRECT_HOST_VERSIONS: readonly string[] = Object.freeze([
  '2.1.310',
  '2.1.311',
  '2.1.317',
  '2.1.322',
]);

const CLAUDE_DIRECT_HOST_VERSION = /^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export const CLAUDE_DIRECT_ADAPTER_IMPLEMENTATION_IDENTITY = 'neoflow.claude-code-direct-review-adapter/1';

const WRITE_LIMITATION =
  'The Harness may modify the workspace with the tools available in this session, including its shell; BuildFrame communicates the authority and does not bound the effects of those tools.';
const DELIVERY_LIMITATION =
  'Each Review Message is submitted as the user’s own turn in the attached conversation only while Claude is idle; a busy session refuses the Send instead of queuing it.';
const CORRELATION_LIMITATION =
  'Claude exposes no submission receipt. Start and end are correlated only when no other prompt enters between the Send and its turn; any overlap leaves the outcome unknown.';
const RESULT_LIMITATION =
  'The Review Response is Claude’s final visible text of the correlated turn, as its turn.complete event reports it; an empty answer or one over the bound settles the lifecycle without a Response.';
const COMPATIBILITY_LIMITATION =
  'Native compatibility is limited to stable Claude Code 2.1.310 and later 2.x.x; a host outside that range refuses attachment.';

export function isReviewedClaudeDirectHostVersion(version: string): boolean {
  const match = CLAUDE_DIRECT_HOST_VERSION.exec(version);
  if (match === null) return false;
  const minor = Number(match[1]);
  const patch = Number(match[2]);
  return (
    minor > MINIMUM_CLAUDE_DIRECT_HOST_MINOR ||
    (minor === MINIMUM_CLAUDE_DIRECT_HOST_MINOR && patch >= MINIMUM_CLAUDE_DIRECT_HOST_PATCH)
  );
}

/** Narrow the reviewed Manifest to one admitted Claude Code host occurrence. */
export function createClaudeDirectCapabilityManifest(hostVersion: string): ReviewedCapabilityManifest {
  if (!isReviewedClaudeDirectHostVersion(hostVersion)) {
    throw new TypeError(`Unsupported Claude Code ${hostVersion} for Direct delivery`);
  }
  return Object.freeze<ReviewedCapabilityManifest>({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: CLAUDE_DIRECT_ADAPTER_IMPLEMENTATION_IDENTITY,
    adapterDisplayName: 'Claude Code',
    reviewedHostVersions: Object.freeze([hostVersion]),
    capabilities: Object.freeze([
      {
        contractVersion: 1,
        capabilityIdentity: 'claude-code-direct-workspace-write-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority: 'workspace-write',
        effectConstraint: {
          strength: 'communicated',
          scope: 'harness-tools',
          limitation: WRITE_LIMITATION,
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
          contractIdentity: 'claude-code-direct-final-answer-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: 16 * 1024,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: [
          WRITE_LIMITATION,
          DELIVERY_LIMITATION,
          CORRELATION_LIMITATION,
          RESULT_LIMITATION,
          COMPATIBILITY_LIMITATION,
          'Normal settlement proves only a correlated Claude turn lifecycle, not that the Message was understood or applied.',
          'No directive or native effect is replayed after Mod, helper, runtime, or session replacement.',
        ],
      },
    ]),
  });
}
