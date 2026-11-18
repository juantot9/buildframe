import type { ReviewedCapabilityManifest } from '@buildframe/workspace/harness-interaction';

/**
 * Admitted on the same policy as Claude Code: any stable OpenCode 2.x.x from
 * the oldest live-verified build upward. OpenCode 1 runs a different plugin
 * system and is not supported.
 */
export const OPENCODE_HOST_COMPATIBILITY_RANGE = '>=2.3.2 <3.0.0';
const MINIMUM_OPENCODE_MINOR = 3;
const MINIMUM_OPENCODE_PATCH = 2;

/** The versions a live session has actually been run against. */
export const VERIFIED_OPENCODE_HOST_VERSIONS: readonly string[] = Object.freeze(['2.3.2']);

const OPENCODE_HOST_VERSION = /^2\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

/** The largest Review Response kept; a longer answer settles without one. */
export const RESULT_MAXIMUM_BYTES: number = 16 * 1024;

export const OPENCODE_ADAPTER_IMPLEMENTATION_IDENTITY = 'neoflow.opencode-direct-review-adapter/1';

const WRITE_LIMITATION =
  'The Harness may modify the workspace with the tools available in this session, including its shell; BuildFrame communicates the authority and does not bound the effects of those tools.';
const DELIVERY_LIMITATION =
  'Each Review Message is submitted as the user’s own prompt only while the session is idle; prompts typed while BuildFrame’s turn runs are held until it ends.';
const CORRELATION_LIMITATION =
  'OpenCode reports outcomes per busy period, not per prompt. A held prompt that follows BuildFrame’s turn ends it; any other input that joins the turn (a steered prompt, a background agent’s report) leaves the outcome unknown.';
const RESULT_LIMITATION =
  'The Review Response is the text of the final step of the correlated turn; an empty answer or one over the bound settles the lifecycle without a Response.';
const COMPATIBILITY_LIMITATION =
  'Native compatibility is limited to stable OpenCode 2.3.2 and later 2.x.x; a host outside that range refuses attachment.';

export function isReviewedOpenCodeHostVersion(version: string): boolean {
  const match = OPENCODE_HOST_VERSION.exec(version);
  if (match === null) return false;
  const minor = Number(match[1]);
  const patch = Number(match[2]);
  return minor > MINIMUM_OPENCODE_MINOR || (minor === MINIMUM_OPENCODE_MINOR && patch >= MINIMUM_OPENCODE_PATCH);
}

/** Narrow the reviewed Manifest to one admitted OpenCode host occurrence. */
export function createOpenCodeCapabilityManifest(hostVersion: string): ReviewedCapabilityManifest {
  if (!isReviewedOpenCodeHostVersion(hostVersion)) {
    throw new TypeError(`Unsupported OpenCode ${hostVersion}`);
  }
  return Object.freeze<ReviewedCapabilityManifest>({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: OPENCODE_ADAPTER_IMPLEMENTATION_IDENTITY,
    adapterDisplayName: 'OpenCode',
    reviewedHostVersions: Object.freeze([hostVersion]),
    capabilities: Object.freeze([
      {
        contractVersion: 1,
        capabilityIdentity: 'opencode-direct-workspace-write-review-v1',
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
          contractIdentity: 'opencode-direct-final-step-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: RESULT_MAXIMUM_BYTES,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: [
          WRITE_LIMITATION,
          DELIVERY_LIMITATION,
          CORRELATION_LIMITATION,
          RESULT_LIMITATION,
          COMPATIBILITY_LIMITATION,
          'Normal settlement proves only a correlated OpenCode turn lifecycle, not that the Message was understood or applied.',
          'No directive or native effect is replayed after plugin reload, runtime, server, or session replacement.',
        ],
      },
    ]),
  });
}
