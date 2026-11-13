import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';

import type { Workspace, WorkspaceIdentity } from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
  WorkspaceHarnessAdapterHost,
} from '@buildframe/workspace/harness-interaction';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connectWorkspaceRuntime } from '../../src/client.js';
import { connectHarnessAdapterRuntime, type HarnessAdapterRuntimeConnected } from '../../src/harnessAdapter.js';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/server.js';
import type { RuntimeCodeIdentity, RuntimeGeneration } from '../../src/contracts.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000031' as WorkspaceIdentity;
const ATTACHMENT_IDENTITY = `att_${'3'.repeat(64)}` as HarnessAttachmentIdentity;
const RUNTIME_CODE_IDENTITY = `rtc_${'3'.repeat(64)}` as RuntimeCodeIdentity;

const manifest: ReviewedCapabilityManifest = {
  schema: 'neoflow.harness-capabilities/1',
  adapterImplementationIdentity: 'scripted-runtime-adapter',
  adapterDisplayName: 'Scripted Pi',
  reviewedHostVersions: ['0.80.6'],
  capabilities: [
    {
      contractVersion: 1,
      capabilityIdentity: 'question-review',
      handoffKind: 'submit-review-batch',
      route: 'direct',
      authority: 'discussion-only',
      effectConstraint: {
        strength: 'enforced',
        scope: 'workspace-read-only',
        limitation: 'scripted',
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
      knownLimitations: ['scripted'],
    },
  ],
};

const attachment: ReviewedHarnessAttachment = {
  evidenceIdentity: 'scripted-runtime-establishment',
  attachmentIdentity: ATTACHMENT_IDENTITY,
  workspaceIdentity: WORKSPACE_IDENTITY,
  hostVersion: '0.80.6',
  destination: {
    harnessLabel: 'Scripted Pi',
    sessionLabel: 'session',
    repositoryLabel: 'repository',
    canonicalCheckout: '/semantic/checkout',
  },
  availability: { status: 'available' },
};

class ScriptedAdapter implements ReviewedHarnessAdapter {
  readonly manifest = manifest;
  readonly attachment = attachment;
  readonly directives: CommittedHarnessDirective[] = [];
  sink: HarnessEvidenceSink | undefined;

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.sink = sink;
    return {
      perform: async directive => {
        this.directives.push(directive);
        return { status: 'accepted-for-observation' };
      },
    };
  }

  async emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    if (this.sink === undefined) throw new Error('Adapter was not connected');
    return await this.sink.accept(evidence);
  }
}

class ScriptedHost implements WorkspaceHarnessAdapterHost {
  connection: ReviewedHarnessConnection | undefined;
  readonly evidence: NormalizedHarnessEvidence[] = [];
  #stateVersion = 20;

  async establish(adapter: ReviewedHarnessAdapter) {
    expect(adapter.manifest).toEqual(manifest);
    expect(adapter.attachment).toEqual(attachment);
    this.connection = adapter.connect({
      accept: async evidence => {
        this.evidence.push(evidence);
        this.#stateVersion += 1;
        return {
          status: 'applied' as const,
          evidenceIdentity: evidence.evidenceIdentity,
          stateVersion: this.#stateVersion,
        };
      },
    });
    return {
      status: 'established' as const,
      attachmentIdentity: ATTACHMENT_IDENTITY,
      compatibilityIdentity: `hcp_${'4'.repeat(64)}` as never,
      stateVersion: this.#stateVersion,
    };
  }
}

function workspace(): Workspace {
  return {
    execute: async () => ({}) as never,
    read: async () =>
      ({
        kind: 'workspace.identity',
        interfaceVersion: 1,
        workspaceIdentity: WORKSPACE_IDENTITY,
        canonicalCheckout: '/semantic/checkout',
      }) as never,
    subscribe: () => () => {},
    setAttention: () => {},
  };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('reviewed Harness Adapter runtime role', () => {
  let scratch: string;
  let originalRuntimeDirectory: string | undefined;
  const servers = new Set<LocalRuntimeServer>();
  const connections = new Set<HarnessAdapterRuntimeConnected>();

  beforeEach(async () => {
    originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
    // Keep this root short: macOS os.tmpdir() can push the Unix endpoint past
    // its 100-byte bound, selecting a shared fallback outside this fixture.
    scratch = await mkdtemp('/tmp/buildframe-harness-adapter-runtime-');
    process.env.XDG_RUNTIME_DIR = scratch;
  });

  afterEach(async () => {
    await Promise.all([...connections].map(async value => value.dispose()));
    connections.clear();
    await Promise.all([...servers].map(async value => value.dispose()));
    servers.clear();
    if (originalRuntimeDirectory === undefined) {
      delete process.env.XDG_RUNTIME_DIR;
    } else {
      process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    }
    await rm(scratch, { recursive: true, force: true });
  });

  async function start(host?: WorkspaceHarnessAdapterHost): Promise<void> {
    const server = await startLocalRuntimeServer({
      workspace: workspace(),
      runtimeGeneration: `rtg_${randomUUID()}` as RuntimeGeneration,
      runtimeCodeIdentity: RUNTIME_CODE_IDENTITY,
      ...(host === undefined ? {} : { harnessAdapters: host }),
    });
    servers.add(server);
  }

  it('carries only exact P13 directives, evidence, acknowledgements, and conservative disconnect facts', async () => {
    const host = new ScriptedHost();
    await start(host);
    await expect(
      connectWorkspaceRuntime({
        workspaceIdentity: WORKSPACE_IDENTITY,
        role: 'harness-adapter',
      }),
    ).resolves.toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'runtime-role-rejected',
        role: 'harness-adapter',
      },
    });
    const adapter = new ScriptedAdapter();
    const result = await connectHarnessAdapterRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      adapter,
    });
    expect(result.status).toBe('connected');
    if (result.status !== 'connected') return;
    connections.add(result);

    const directive = {
      kind: 'harness.direct-review-message.dispatch',
      contractVersion: 1,
      attachmentIdentity: ATTACHMENT_IDENTITY,
      handoffIdentity: `hho_${'5'.repeat(64)}`,
      invocationIdentity: `hin_${'6'.repeat(64)}`,
      capabilitySnapshot: { exact: 'frozen' },
      disclosure: { exact: 'accepted-only' },
    } as unknown as CommittedHarnessDirective;
    const observation = await host.connection?.perform(directive);
    expect(observation).toEqual({ status: 'accepted-for-observation' });
    expect(adapter.directives).toEqual([directive]);
    expect(Object.keys(adapter.directives[0] ?? {})).toEqual(Object.keys(directive));

    const startEvidence = {
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'scripted-native-start',
      attachmentIdentity: ATTACHMENT_IDENTITY,
      invocationIdentity: `hin_${'6'.repeat(64)}`,
    } as NormalizedHarnessEvidence;
    await expect(adapter.emit(startEvidence)).resolves.toMatchObject({
      status: 'applied',
      evidenceIdentity: 'scripted-native-start',
    });
    expect(host.evidence).toEqual([startEvidence]);

    connections.delete(result);
    await result.dispose();
    await waitFor(() => host.evidence.length === 3, 'Harness Adapter disconnect evidence');
    expect(host.evidence.slice(1).map(item => item.kind)).toEqual([
      'harness.availability.observed',
      'harness.invocation.correlation-lost',
    ]);
    expect(host.evidence[2]).toMatchObject({
      invocationIdentity: `hin_${'6'.repeat(64)}`,
      reason: 'attachment-lost',
    });
  });

  it('closes a released session as replaced, so it does not reconnect', async () => {
    const host = new ScriptedHost();
    await start(host);
    const result = await connectHarnessAdapterRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      adapter: new ScriptedAdapter(),
    });
    expect(result.status).toBe('connected');
    if (result.status !== 'connected') return;
    connections.add(result);
    // The core releases a session when a newer one in the checkout connects.
    host.connection?.release?.('replaced');
    await expect(result.closed).resolves.toBe('replaced');
    // The runtime still reports the transport loss for the released session.
    await waitFor(() => host.evidence.length === 1, 'released session disconnect evidence');
    expect(host.evidence[0]).toMatchObject({
      kind: 'harness.availability.observed',
      availability: { status: 'blocked', reason: 'disconnected' },
    });
  });

  it('rejects the reserved Adapter role when the runtime has no P13 host', async () => {
    await start();
    const result = await connectHarnessAdapterRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      adapter: new ScriptedAdapter(),
    });
    expect(result).toEqual({
      status: 'rejected',
      diagnostic: {
        code: 'runtime-role-rejected',
        role: 'harness-adapter',
      },
    });
  });
});
