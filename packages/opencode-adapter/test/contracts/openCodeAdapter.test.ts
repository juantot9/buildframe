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

import { createOpenCodeCapabilityManifest, isReviewedOpenCodeHostVersion } from '../../src/capability.js';
import { OpenCodeReviewedAdapter, type OpenCodeEvent, type OpenCodeNativeSession } from '../../src/openCodeAdapter.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000295' as WorkspaceIdentity;
const SESSION = 'ses_0123456789abcdef';
const TEXT = '  Please explain this change.\r\nreview.ts:17 é 🙂  ';

class ScriptedSession implements OpenCodeNativeSession {
  readonly prompts: { id: string; text: string }[] = [];
  admit: (text: string) => Promise<{ readonly text: string }> = async text => ({ text });
  interrupts = 0;

  async prompt(input: { readonly id: string; readonly text: string }): Promise<{ readonly text: string }> {
    this.prompts.push({ ...input });
    return await this.admit(input.text);
  }

  async interrupt(): Promise<boolean> {
    this.interrupts += 1;
    return true;
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

  /** The last evidence about the turn itself, past availability updates. */
  last(): NormalizedHarnessEvidence | undefined {
    return this.evidence.filter(evidence => evidence.kind !== 'harness.availability.observed').at(-1);
  }
}

function messageDirective(
  attachmentIdentity: HarnessAttachmentIdentity,
): DispatchDirectReviewMessageInvocationDirective {
  const capability = createOpenCodeCapabilityManifest('2.3.2').capabilities[0];
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

/** OpenCode's events for this session, as the experiments recorded them. */
const at = {
  enqueued: (inboxID: string, text: string, delivery: 'steer' | 'queue' = 'queue'): OpenCodeEvent => ({
    type: 'session.inbox.enqueued',
    data: { sessionID: SESSION, inboxID, item: { type: 'user', payload: { text }, delivery } },
  }),
  delivered: (inboxID: string): OpenCodeEvent => ({
    type: 'session.inbox.delivered',
    data: { sessionID: SESSION, inboxID },
  }),
  cancelled: (inboxID: string): OpenCodeEvent => ({
    type: 'session.inbox.cancelled',
    data: { sessionID: SESSION, inboxID },
  }),
  started: { type: 'session.execution.started', data: { sessionID: SESSION } } as OpenCodeEvent,
  text: (message: string, ordinal: number, text: string): OpenCodeEvent => ({
    type: 'session.text.ended',
    data: { sessionID: SESSION, assistantMessageID: message, ordinal, text },
  }),
  step: (message: string, finish: string): OpenCodeEvent => ({
    type: 'session.step.ended',
    data: { sessionID: SESSION, assistantMessageID: message, finish },
  }),
  succeeded: { type: 'session.execution.succeeded', data: { sessionID: SESSION } } as OpenCodeEvent,
  failed: {
    type: 'session.execution.failed',
    data: { sessionID: SESSION, error: { type: 'provider.internal' } },
  } as OpenCodeEvent,
  interrupted: (reason: string): OpenCodeEvent => ({
    type: 'session.execution.interrupted',
    data: { sessionID: SESSION, reason },
  }),
};

async function sent(native = new ScriptedSession(), performed: object = { status: 'accepted-for-observation' }) {
  const adapter = new OpenCodeReviewedAdapter({
    workspaceIdentity: WORKSPACE_IDENTITY,
    canonicalCheckout: '/canonical/repository',
    hostVersion: '2.3.2',
    sessionIdentity: SESSION,
    sessionEpoch: 'epoch-one',
    native,
  });
  const sink = new Sink();
  const connection = adapter.connect(sink);
  await adapter.runtimeConnected('generation-one');
  await expect(connection.perform(messageDirective(adapter.attachment.attachmentIdentity))).resolves.toMatchObject(
    performed,
  );
  await flush();
  const id = native.prompts[0]?.id;
  if (id === undefined) throw new Error('No prompt was sent');
  const feed = async (...events: OpenCodeEvent[]): Promise<void> => {
    for (const event of events) await adapter.observe(event);
  };
  return { adapter, native, sink, connection, id, feed };
}

async function openTurn() {
  const fixture = await sent();
  await fixture.feed(at.enqueued(fixture.id, TEXT), at.started, at.delivered(fixture.id));
  return fixture;
}

describe('OpenCode Adapter', () => {
  it('admits stable OpenCode 2 from 2.3.2 upward only', () => {
    for (const version of ['2.3.2', '2.3.10', '2.4.0', '2.10.1'])
      expect(isReviewedOpenCodeHostVersion(version)).toBe(true);
    for (const version of ['2.3.1', '2.2.9', '1.19.6', '3.0.0', '2.3.2-beta.1', '']) {
      expect(isReviewedOpenCodeHostVersion(version)).toBe(false);
    }
    expect(() => createOpenCodeCapabilityManifest('1.19.6')).toThrow('Unsupported OpenCode 1.19.6');
  });

  it('sends the exact text, held behind nothing, under an OpenCode message ID BuildFrame chose', async () => {
    const { native, id } = await sent();
    expect(native.prompts).toEqual([{ id, text: TEXT }]);
    expect(id).toMatch(/^msg_[0-9a-f]{64}$/u);
  });

  it('settles a turn with the final step’s text, in part order', async () => {
    const { feed, sink, adapter } = await openTurn();
    expect(adapter.holdsPrompts).toBe(true);
    await feed(
      at.text('msg_a1', 0, 'Looking first. '),
      at.step('msg_a1', 'tool-calls'),
      at.text('msg_a2', 1, 'second part.'),
      at.text('msg_a2', 0, 'Final answer, '),
      at.step('msg_a2', 'stop'),
      at.succeeded,
    );
    expect(sink.kinds()).toEqual(['harness.invocation.start-observed', 'harness.invocation.terminal-observed']);
    expect(sink.last()).toMatchObject({ outcome: 'ended-normally' });
    expect(sink.last()).toMatchObject({ result: { body: 'Final answer, second part.', byteLength: 26 } });
    expect(adapter.holdsPrompts).toBe(false);
  });

  it('ends BuildFrame’s turn when a held prompt is delivered after its final step', async () => {
    const { feed, sink } = await openTurn();
    await feed(
      at.enqueued('msg_user', 'typed meanwhile', 'queue'),
      at.text('msg_a1', 0, 'Done.'),
      at.step('msg_a1', 'stop'),
    );
    await feed(at.delivered('msg_user'));
    expect(sink.last()).toMatchObject({ kind: 'harness.invocation.terminal-observed', outcome: 'ended-normally' });
    const count = sink.evidence.length;
    // The user's own turn that follows is not BuildFrame's business.
    await feed(at.step('msg_a2', 'stop'), at.succeeded);
    expect(sink.kinds().slice(count)).toEqual([]);
  });

  it('reports the outcome unknown when steered input joins the turn', async () => {
    const { feed, sink } = await openTurn();
    await feed(at.enqueued('msg_user', 'steered in', 'steer'));
    expect(sink.last()).toMatchObject({ kind: 'harness.invocation.correlation-lost' });
  });

  it('reports failure, the user’s interrupt, and a shutdown truthfully', async () => {
    const failed = await openTurn();
    await failed.feed(at.failed);
    expect(failed.sink.last()).toMatchObject({ outcome: 'failed' });

    const interrupted = await openTurn();
    await interrupted.feed(at.interrupted('user'));
    expect(interrupted.sink.last()).toMatchObject({ outcome: 'interrupted' });

    const shutdown = await openTurn();
    await shutdown.feed(at.interrupted('shutdown'));
    expect(shutdown.sink.last()).toMatchObject({ kind: 'harness.invocation.correlation-lost' });
  });

  it('refuses the Send when OpenCode admits different text under BuildFrame’s ID', async () => {
    const native = new ScriptedSession();
    native.admit = async () => ({ text: 'something sent earlier under the same ID' });
    const { adapter } = await sent(native, { status: 'proven-not-dispatched', reason: 'harness-rejected' });
    expect(adapter.session.turn).toBeUndefined();
  });

  it('interrupts through OpenCode', async () => {
    const { connection, native, adapter } = await openTurn();
    const turn = adapter.session.turn!;
    await connection.perform({
      kind: 'harness.direct-invocation.interrupt',
      contractVersion: 1,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: turn.invocationIdentity,
      interruptionIntentIdentity: `hir_${'9'.repeat(64)}` as never,
    });
    expect(native.interrupts).toBe(1);
  });
});
