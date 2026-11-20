import { createHash } from 'node:crypto';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
} from '@buildframe/workspace/harness-interaction';
import { describe, expect, it } from 'vitest';

import { CodexConnectionLost, CodexRpcError, type CodexNotification } from '../../src/appServerClient.js';
import {
  codexVersionFromUserAgent,
  createCodexCapabilityManifest,
  isReviewedCodexHostVersion,
} from '../../src/capability.js';
import { CodexReviewedAdapter, type CodexServerPort } from '../../src/codexAdapter.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000303' as WorkspaceIdentity;
const THREAD = '01a1f110-a1a9-7472-a1b0-dffb5033cc44';
const TEXT = '  Please explain this change.\r\nreview.ts:17 é 🙂 $skill  ';

class FakeServer implements CodexServerPort {
  readonly requests: { method: string; params: Record<string, unknown> }[] = [];
  answer: (method: string) => Promise<unknown> = async method =>
    method === 'thread/queue/start' ? Promise.reject(new CodexRpcError(-32600, 'queue is empty')) : {};

  async request(method: string, params?: unknown): Promise<unknown> {
    this.requests.push({ method, params: params as Record<string, unknown> });
    return await this.answer(method);
  }

  get queued(): Record<string, unknown> | undefined {
    return this.requests.find(request => request.method === 'thread/queue/add')?.params;
  }
}

class Sink implements HarnessEvidenceSink {
  readonly evidence: NormalizedHarnessEvidence[] = [];
  #version = 100;

  async accept(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    this.evidence.push(evidence);
    this.#version += 1;
    return { status: 'applied', evidenceIdentity: evidence.evidenceIdentity, stateVersion: this.#version };
  }

  kinds(): string[] {
    return this.evidence.map(evidence => evidence.kind).filter(kind => kind !== 'harness.availability.observed');
  }

  last(): NormalizedHarnessEvidence | undefined {
    return this.evidence.filter(evidence => evidence.kind !== 'harness.availability.observed').at(-1);
  }
}

function messageDirective(
  attachmentIdentity: HarnessAttachmentIdentity,
): DispatchDirectReviewMessageInvocationDirective {
  const capability = createCodexCapabilityManifest('0.170.0').capabilities[0];
  if (capability === undefined || capability.route !== 'direct') throw new Error('Direct Capability fixture missing');
  const bytes = Buffer.from(TEXT, 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return {
    kind: 'harness.direct-review-message.dispatch',
    contractVersion: 1,
    attachmentIdentity,
    handoffIdentity: `hho_${'4'.repeat(64)}` as never,
    invocationIdentity: `hin_${'5'.repeat(64)}` as never,
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
        characterLength: [...TEXT].length,
        sha256: digest,
      },
      sha256: digest,
      byteLength: bytes.byteLength,
      characterLength: [...TEXT].length,
    },
  };
}

const flush = async (): Promise<void> => await new Promise(resolve => setTimeout(resolve, 0));

/** Codex app-server notifications, shaped as the experiments recorded them. */
const at = {
  turnStarted: (turnId: string): CodexNotification => ({
    method: 'turn/started',
    params: { threadId: THREAD, turn: { id: turnId, status: 'inProgress' } },
  }),
  user: (turnId: string, clientId: string, text: string): CodexNotification => ({
    method: 'item/completed',
    params: { threadId: THREAD, turnId, item: { type: 'userMessage', clientId, content: [{ type: 'text', text }] } },
  }),
  agent: (turnId: string, text: string): CodexNotification => ({
    method: 'item/completed',
    params: { threadId: THREAD, turnId, item: { type: 'agentMessage', text } },
  }),
  command: (turnId: string): CodexNotification => ({
    method: 'item/started',
    params: { threadId: THREAD, turnId, item: { type: 'commandExecution' } },
  }),
  completed: (turnId: string, status: string): CodexNotification => ({
    method: 'turn/completed',
    params: { threadId: THREAD, turn: { id: turnId, status } },
  }),
};

async function sent(server = new FakeServer(), performed: object = { status: 'accepted-for-observation' }) {
  const adapter = new CodexReviewedAdapter({
    workspaceIdentity: WORKSPACE_IDENTITY,
    canonicalCheckout: '/canonical/repository',
    hostVersion: '0.171.0',
    threadId: THREAD,
    sessionEpoch: 'epoch-one',
    server,
    idle: true,
  });
  const sink = new Sink();
  const connection = adapter.connect(sink);
  await adapter.runtimeConnected('generation-one');
  const performing = connection.perform(messageDirective(adapter.attachment.attachmentIdentity));
  await flush();
  const id = String(server.queued?.clientUserMessageId);
  const feed = async (...notifications: CodexNotification[]): Promise<void> => {
    for (const notification of notifications) await adapter.observe(notification);
  };
  return { adapter, server, sink, connection, id, feed, performing, performed };
}

async function openTurn() {
  const fixture = await sent();
  await fixture.feed(at.turnStarted('turn-1'), at.user('turn-1', fixture.id, TEXT));
  await expect(fixture.performing).resolves.toEqual(fixture.performed);
  return fixture;
}

describe('Codex Adapter', () => {
  it('admits Codex 0.170.0 and later 0.x, read from the server’s user agent', () => {
    expect(codexVersionFromUserAgent('codex-tui/0.171.0 (Mac OS 27.2.1; arm64) rex/0.1 (buildframe; 0.0.0)')).toBe(
      '0.171.0',
    );
    expect(codexVersionFromUserAgent('codex_cli_rs/0.170.0')).toBe('0.170.0');
    for (const version of ['0.170.0', '0.171.0', '0.999.3']) expect(isReviewedCodexHostVersion(version)).toBe(true);
    for (const version of ['0.169.9', '1.0.0', '0.172.0-alpha.1', ''])
      expect(isReviewedCodexHostVersion(version)).toBe(false);
  });

  it('queues the exact text under BuildFrame’s client ID, then starts the queue', async () => {
    const { server, id } = await sent();
    expect(server.queued).toEqual({
      threadId: THREAD,
      input: [{ type: 'text', text: TEXT, text_elements: [] }],
      clientUserMessageId: id,
    });
    expect(id).toMatch(/^cdx_[0-9a-f]{64}$/u);
    expect(server.requests.map(request => request.method)).toEqual(['thread/queue/add', 'thread/queue/start']);
  });

  it('settles BuildFrame’s turn with its final agent message', async () => {
    const { feed, sink } = await openTurn();
    await feed(
      at.agent('turn-1', 'First thoughts.'),
      at.agent('turn-1', 'Final answer.'),
      at.completed('turn-1', 'completed'),
    );
    expect(sink.kinds()).toEqual(['harness.invocation.start-observed', 'harness.invocation.terminal-observed']);
    expect(sink.last()).toMatchObject({ outcome: 'ended-normally', result: { body: 'Final answer.' } });
  });

  it('reports failure and interruption by the turn’s status', async () => {
    const failed = await openTurn();
    await failed.feed(at.completed('turn-1', 'failed'));
    expect(failed.sink.last()).toMatchObject({ outcome: 'failed' });
    const interrupted = await openTurn();
    await interrupted.feed(at.completed('turn-1', 'interrupted'));
    expect(interrupted.sink.last()).toMatchObject({ outcome: 'interrupted' });
  });

  it('loses the turn when the user’s Enter joins it, but not for a turn of their own', async () => {
    const steered = await openTurn();
    await steered.feed(at.user('turn-1', 'tui-client-id', 'user presses Enter'));
    expect(steered.sink.last()).toMatchObject({ kind: 'harness.invocation.correlation-lost' });

    const separate = await openTurn();
    await separate.feed(at.completed('turn-1', 'completed'));
    const count = separate.sink.kinds().length;
    // The user's Tab-queued text runs as its own turn afterwards; a `!` command too.
    await separate.feed(at.turnStarted('turn-2'), at.user('turn-2', 'tui-client-id', 'user pressed Tab'));
    await separate.feed(at.completed('turn-2', 'completed'), at.turnStarted('turn-3'), at.command('turn-3'));
    expect(separate.sink.kinds().slice(count)).toEqual([]);
  });

  it('refuses a Send Codex rejects, and leaves a lost answer unknown without resending', async () => {
    const refusing = new FakeServer();
    refusing.answer = async () => Promise.reject(new CodexRpcError(-32600, 'experimental API disabled'));
    const refused = await sent(refusing);
    await expect(refused.performing).resolves.toMatchObject({ status: 'proven-not-dispatched' });

    const losing = new FakeServer();
    losing.answer = async () => Promise.reject(new CodexConnectionLost('closed'));
    const lost = await sent(losing);
    // Possibly sent: the kit accepts it, then reports that it can't be followed.
    await lost.performing;
    await flush();
    expect(lost.sink.last()).toMatchObject({ kind: 'harness.invocation.correlation-lost' });
    expect(losing.requests.filter(request => request.method === 'thread/queue/add')).toHaveLength(1);
  });

  it('interrupts BuildFrame’s exact turn', async () => {
    const { connection, server, adapter } = await openTurn();
    await connection.perform({
      kind: 'harness.direct-invocation.interrupt',
      contractVersion: 1,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: adapter.session.turn!.invocationIdentity,
      interruptionIntentIdentity: `hir_${'9'.repeat(64)}` as never,
    });
    expect(server.requests.at(-1)).toEqual({
      method: 'turn/interrupt',
      params: { threadId: THREAD, turnId: 'turn-1' },
    });
  });

  it('leaves a turn in flight unknown when the connection to Codex drops', async () => {
    const { adapter, sink } = await openTurn();
    await adapter.connectionLost();
    expect(sink.last()).toMatchObject({ kind: 'harness.invocation.correlation-lost' });
  });
});
