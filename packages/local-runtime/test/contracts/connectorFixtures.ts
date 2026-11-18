import { createHash } from 'node:crypto';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
} from '@buildframe/workspace/harness-interaction';

import type {
  ConnectorHost,
  ConnectorScheduler,
  ConnectorTurn,
  OpenConnectorSessionOptions,
} from '../../src/connector/contracts.js';

export const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000293' as WorkspaceIdentity;
export const HOST_VERSION = '1.0.0';
export const NO_START_MS = 30_000;

export const MANIFEST: ReviewedCapabilityManifest = {
  schema: 'neoflow.harness-capabilities/1',
  adapterImplementationIdentity: 'buildframe.test-connector/1',
  adapterDisplayName: 'Test Harness',
  reviewedHostVersions: [HOST_VERSION],
  capabilities: [
    {
      contractVersion: 1,
      capabilityIdentity: 'test-direct-review-v1',
      handoffKind: 'submit-review-batch',
      route: 'direct',
      authority: 'workspace-write',
      effectConstraint: { strength: 'communicated', scope: 'harness-tools', limitation: 'Test limitation.' },
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
        contractIdentity: 'test-final-answer-v1',
        artifactKind: 'review-response',
        source: 'settled-final-assistant-text',
        completeness: 'all-final-text-blocks-after-correlated-user-message',
        maximumBytes: 64,
      },
      noStartTimeoutMs: NO_START_MS,
      knownLimitations: [],
    },
  ],
};

export function messageDirective(
  attachmentIdentity: HarnessAttachmentIdentity,
  suffix = '5',
  text = 'Explain review.ts:17 as written.\r\n  café',
): DispatchDirectReviewMessageInvocationDirective {
  const capability = MANIFEST.capabilities[0];
  if (capability?.route !== 'direct') throw new Error('Direct Capability fixture missing');
  const bytes = Buffer.from(text, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return {
    kind: 'harness.direct-review-message.dispatch',
    contractVersion: 1,
    attachmentIdentity,
    handoffIdentity: `hho_${suffix.repeat(64)}` as never,
    invocationIdentity: `hin_${suffix.repeat(64)}` as never,
    capabilitySnapshot: {
      snapshotIdentity: `hcs_${'6'.repeat(64)}` as never,
      compatibilityIdentity: `hcp_${'7'.repeat(64)}` as never,
      manifestSha256: '8'.repeat(64),
      capability,
      availabilityAtCommit: 'available',
    },
    disclosure: {
      contractVersion: 1,
      handoffKind: 'submit-review-batch',
      payloadKind: 'review-message',
      authority: 'workspace-write',
      outgoingMaterial: {
        outgoingMaterialIdentity: `rmo_${'d'.repeat(64)}` as never,
        representation: 'live-repository-reference',
        encoding: 'utf8',
        bytesBase64: bytes.toString('base64'),
        byteLength: bytes.byteLength,
        characterLength: [...text].length,
        sha256: digest,
      },
      sha256: digest,
      byteLength: bytes.byteLength,
      characterLength: [...text].length,
    },
  };
}

/** Applies everything, unless told to refuse the next acknowledgements. */
export class RecordingSink implements HarnessEvidenceSink {
  readonly accepted: NormalizedHarnessEvidence[] = [];
  readonly refusals: HarnessEvidenceAcknowledgement[] = [];
  #stateVersion = 100;

  async accept(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    const refusal = this.refusals.shift();
    if (refusal !== undefined) return refusal;
    this.accepted.push(evidence);
    this.#stateVersion += 1;
    return { status: 'applied', evidenceIdentity: evidence.evidenceIdentity, stateVersion: this.#stateVersion };
  }

  /** Invocation evidence only, as `kind` or `kind:reason`. */
  turnEvidence(): string[] {
    return this.accepted.flatMap(item => {
      if (item.kind === 'harness.availability.observed') return [];
      return ['reason' in item && item.reason !== undefined ? `${item.kind}:${item.reason}` : item.kind];
    });
  }
}

export class ScriptedHost implements ConnectorHost {
  readonly submitted: string[] = [];
  readonly released: string[] = [];
  receipt: 'taken' | 'pending' | 'harness-rejected' | 'host-unavailable' = 'taken';
  isIdle?: () => boolean;
  interrupted = 0;

  submit(turn: ConnectorTurn): 'taken' | 'pending' | 'harness-rejected' | 'host-unavailable' {
    this.submitted.push(turn.text);
    return this.receipt;
  }

  withdraw(): boolean {
    return true;
  }

  interrupt(): void {
    this.interrupted += 1;
  }

  release(_turn: ConnectorTurn, how: string): void {
    this.released.push(how);
  }
}

export class ManualScheduler implements ConnectorScheduler {
  readonly armed = new Map<number, { readonly delay: number; readonly callback: () => void }>();
  #next = 1;

  set(delayMilliseconds: number, callback: () => void): unknown {
    const handle = this.#next++;
    this.armed.set(handle, { delay: delayMilliseconds, callback });
    return handle;
  }

  clear(handle: unknown): void {
    this.armed.delete(handle as number);
  }

  fire(delayMilliseconds: number): void {
    for (const [handle, timer] of [...this.armed]) {
      if (timer.delay !== delayMilliseconds) continue;
      this.armed.delete(handle);
      timer.callback();
    }
  }
}

export function sessionOptions(
  host: ConnectorHost,
  scheduler: ConnectorScheduler,
  epoch = 'epoch-1',
): OpenConnectorSessionOptions {
  return {
    manifest: MANIFEST,
    workspaceIdentity: WORKSPACE_IDENTITY,
    canonicalCheckout: '/repositories/example',
    hostVersion: HOST_VERSION,
    sessionIdentity: 'session-1',
    sessionEpoch: epoch,
    sessionLabel: 'Test session',
    naming: {
      attachmentSeed: 'test-attachment-v1',
      attachmentEvidence: 'test-attachment',
      namespace: 'test',
      turnPrefix: 'tst',
    },
    host,
    scheduler,
  };
}

export async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise(resolve => setImmediate(resolve));
}
