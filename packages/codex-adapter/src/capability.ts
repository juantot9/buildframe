import type { ReviewedCapabilityManifest } from '@buildframe/workspace/harness-interaction';

/**
 * Codex's shared server updates itself, independently of the installed CLI,
 * about once a day. So any 0.x release from the oldest live-verified one up is
 * admitted, and every connection checks live that the methods the connector
 * relies on still answer (see `checkCodexServer`); a server that fails the
 * check is refused.
 */
export const CODEX_HOST_COMPATIBILITY_RANGE = '>=0.170.0 <1.0.0';
const MINIMUM_CODEX_MINOR = 170;

/** The versions a live session has actually been run against. */
export const VERIFIED_CODEX_HOST_VERSIONS: readonly string[] = Object.freeze(['0.170.0', '0.171.0']);

const CODEX_HOST_VERSION = /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

/** The largest Review Response kept; a longer answer settles without one. */
export const RESULT_MAXIMUM_BYTES: number = 16 * 1024;

export const CODEX_ADAPTER_IMPLEMENTATION_IDENTITY = 'neoflow.codex-direct-review-adapter/1';

const WRITE_LIMITATION =
  'The Harness may modify the workspace with the tools available in this session, including its shell; BuildFrame communicates the authority and does not bound the effects of those tools.';
const DELIVERY_LIMITATION =
  'Each Review Message enters Codex’s queue only while the session is idle and runs as its own turn, under the session’s approvals and sandbox.';
const CORRELATION_LIMITATION =
  'Every Codex event names its turn. Input that joins BuildFrame’s turn (the user pressing Enter while it runs) leaves the outcome unknown; input queued with Tab waits for it.';
const RESULT_LIMITATION =
  'The Review Response is the final agent message of the correlated turn; an empty answer or one over the bound settles the lifecycle without a Response.';
const COMPATIBILITY_LIMITATION =
  'Codex 0.170.0 and later 0.x are admitted after a live check of the methods BuildFrame uses; the shared server updates itself, so a version can be accepted before it is verified.';

/** The version in an app-server `userAgent` (`codex-tui/0.171.0 (Mac OS …) …`), if it has one. */
export function codexVersionFromUserAgent(userAgent: string): string | undefined {
  return /^[\w.-]+\/(\d+\.\d+\.\d+)(?=[\s;(]|$)/u.exec(userAgent)?.[1];
}

export function isReviewedCodexHostVersion(version: string): boolean {
  const match = CODEX_HOST_VERSION.exec(version);
  return match !== null && Number(match[1]) >= MINIMUM_CODEX_MINOR;
}

/** Narrow the reviewed Manifest to one admitted Codex host occurrence. */
export function createCodexCapabilityManifest(hostVersion: string): ReviewedCapabilityManifest {
  if (!isReviewedCodexHostVersion(hostVersion)) throw new TypeError(`Unsupported Codex ${hostVersion}`);
  return Object.freeze<ReviewedCapabilityManifest>({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: CODEX_ADAPTER_IMPLEMENTATION_IDENTITY,
    adapterDisplayName: 'Codex',
    reviewedHostVersions: Object.freeze([hostVersion]),
    capabilities: Object.freeze([
      {
        contractVersion: 1,
        capabilityIdentity: 'codex-direct-workspace-write-review-v1',
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
          contractIdentity: 'codex-direct-final-agent-message-v1',
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
          'Normal settlement proves only a correlated Codex turn lifecycle, not that the Message was understood or applied.',
          'No directive or native effect is replayed after a Codex server update or restart, or a helper or runtime restart.',
        ],
      },
    ]),
  });
}
