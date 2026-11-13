import { createHash } from 'node:crypto';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import { describe, expect, it } from 'vitest';

import {
  CLAUDE_DIRECT_ADAPTER_IMPLEMENTATION_IDENTITY,
  createClaudeDirectCapabilityManifest,
} from '../../src/direct/capability.js';
import {
  CLAUDE_MOD_ANSWER_TIMEOUT_MS,
  ClaudeDirectAdapter,
  type ClaudeAdapterScheduler,
  type ClaudeModChannel,
} from '../../src/direct/claudeDirectAdapter.js';
import type { ClaudeModCommand } from '../../src/direct/modProtocol.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000259' as WorkspaceIdentity;
const HOST_VERSION = '2.1.310';
const TEXT = 'Please explain this change.\n\n  café 👋\r\nreview.ts:17';

class ScriptedChannel implements ClaudeModChannel {
  modPresent = true;
  readonly delivered: ClaudeModCommand[] = [];
  readonly untaken = new Set<string>();

  deliver(command: ClaudeModCommand): boolean {
    if (!this.modPresent) return false;
    this.delivered.push(command);
    if (command.type === 'submit') this.untaken.add(command.dispatchId);
    return true;
  }

  withdraw(dispatchId: string): boolean {
    return this.untaken.delete(dispatchId);
  }

  take(): Extract<ClaudeModCommand, { type: 'submit' }> {
    const command = this.delivered.at(-1);
    if (command?.type !== 'submit') throw new Error('No submit was delivered');
    this.untaken.delete(command.dispatchId);
    return command;
  }
}

class ScriptedScheduler implements ClaudeAdapterScheduler {
  readonly armed = new Map<number, { readonly delay: number; readonly callback: () => void }>();
  #next = 1;

  set(delayMilliseconds: number, callback: () => void): unknown {
    const handle = this.#next;
    this.#next += 1;
    this.armed.set(handle, { delay: delayMilliseconds, callback });
    return handle;
  }

  clear(handle: unknown): void {
    this.armed.delete(handle as number);
  }

  async fire(delayMilliseconds: number): Promise<void> {
    const due = [...this.armed].filter(([, timer]) => timer.delay === delayMilliseconds);
    if (due.length === 0) throw new Error(`No ${delayMilliseconds}ms timer was armed`);
    for (const [handle, timer] of due) {
      this.armed.delete(handle);
      timer.callback();
    }
    await settle();
  }
}

class AppliedEvidenceSink implements HarnessEvidenceSink {
  readonly evidence: NormalizedHarnessEvidence[] = [];
  #stateVersion = 100;

  async accept(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    this.evidence.push(evidence);
    this.#stateVersion += 1;
    return { status: 'applied', evidenceIdentity: evidence.evidenceIdentity, stateVersion: this.#stateVersion };
  }

  invocationKinds(): string[] {
    return this.evidence.filter(item => item.kind !== 'harness.availability.observed').map(item => item.kind);
  }

  availabilities(): string[] {
    return this.evidence.flatMap(item =>
      item.kind === 'harness.availability.observed'
        ? [item.availability.status === 'blocked' ? item.availability.reason : item.availability.status]
        : [],
    );
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise(resolve => setImmediate(resolve));
}

function messageDirective(
  attachmentIdentity: HarnessAttachmentIdentity,
  suffix = '5',
  text = TEXT,
): DispatchDirectReviewMessageInvocationDirective {
  const capability = createClaudeDirectCapabilityManifest(HOST_VERSION).capabilities[0];
  if (capability === undefined || capability.route !== 'direct') throw new Error('Direct Capability fixture missing');
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

function setup(): {
  readonly adapter: ClaudeDirectAdapter;
  readonly channel: ScriptedChannel;
  readonly scheduler: ScriptedScheduler;
  readonly sink: AppliedEvidenceSink;
  readonly connection: ReviewedHarnessConnection;
} {
  const channel = new ScriptedChannel();
  const scheduler = new ScriptedScheduler();
  const adapter = new ClaudeDirectAdapter({
    workspaceIdentity: WORKSPACE_IDENTITY,
    canonicalCheckout: '/canonical/repository',
    hostVersion: HOST_VERSION,
    sessionIdentity: '3f2a9c1e-5b7d-4e8a-9c21-6d0f4b8a7e13',
    sessionEpoch: 'epoch-one',
    channel,
    scheduler,
  });
  const sink = new AppliedEvidenceSink();
  return { adapter, channel, scheduler, sink, connection: adapter.connect(sink) };
}

/** Dispatches and lets the Mod confirm the submit call, as the real Mod does. */
async function submitted(
  context: ReturnType<typeof setup>,
  directive: CommittedHarnessDirective = messageDirective(context.adapter.attachment.attachmentIdentity),
): Promise<string> {
  const performed = context.connection.perform(directive);
  const command = context.channel.take();
  await context.adapter.observe({ type: 'submit-called', dispatchId: command.dispatchId });
  await expect(performed).resolves.toEqual({ status: 'accepted-for-observation' });
  return command.dispatchId;
}

describe('Claude Direct Capability Manifest', () => {
  it('declares one exact-version workspace-write Direct capability with a bounded final-answer Response', () => {
    const manifest = createClaudeDirectCapabilityManifest(HOST_VERSION);
    expect(manifest.adapterImplementationIdentity).toBe(CLAUDE_DIRECT_ADAPTER_IMPLEMENTATION_IDENTITY);
    expect(manifest.reviewedHostVersions).toEqual([HOST_VERSION]);
    expect(manifest.capabilities).toHaveLength(1);
    expect(manifest.capabilities[0]).toMatchObject({
      route: 'direct',
      authority: 'workspace-write',
      effectConstraint: { strength: 'communicated', scope: 'harness-tools' },
      interruption: { route: 'direct-request' },
      evidenceProfile: { replay: 'unavailable' },
      artifactResultContract: { contractIdentity: 'claude-code-direct-final-answer-v1', maximumBytes: 16 * 1024 },
    });
  });

  it('admits stable Claude Code from 2.1.310 within 2.x and refuses every other host', () => {
    for (const version of ['2.1.310', '2.1.319', '2.2.0', '2.9.0']) {
      expect(createClaudeDirectCapabilityManifest(version).reviewedHostVersions).toEqual([version]);
    }
    for (const version of ['1.0.128', '2.0.0', '2.1.209', '2.1.309', '3.0.0', '2.1', '2.1.319-beta.1', '02.1.0', '']) {
      expect(() => createClaudeDirectCapabilityManifest(version)).toThrow(TypeError);
    }
  });
});

describe('Claude Direct Adapter correlation', () => {
  it('delivers exact bytes as one turn and correlates its start and normal end', async () => {
    const context = setup();
    const dispatchId = await submitted(context);
    expect(context.channel.delivered).toEqual([{ type: 'submit', dispatchId, text: TEXT }]);

    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
    await context.adapter.observe({ type: 'submit-resolved', dispatchId, entered: true });
    await context.adapter.observe({
      type: 'turn-complete',
      turnId: 'turn-1',
      reason: 'answer',
      answer: 'Done — café.',
    });

    expect(context.sink.invocationKinds()).toEqual([
      'harness.invocation.start-observed',
      'harness.invocation.terminal-observed',
    ]);
    expect(context.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed')).toMatchObject({
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'claude-code-direct-final-answer-v1',
        source: 'settled-final-assistant-text',
        body: 'Done — café.',
        byteLength: Buffer.byteLength('Done — café.', 'utf8'),
      },
    });
    expect(context.sink.availabilities()).toEqual(['busy', 'available']);
  });

  it('settles without a Response when the answer is empty, oversized, or not a normal end', async () => {
    for (const [reason, answer] of [
      ['answer', ''],
      ['answer', 'é'.repeat(9 * 1024)],
      ['answer', undefined],
      ['aborted', 'partial'],
    ] as const) {
      const context = setup();
      await submitted(context);
      await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
      await context.adapter.observe({
        type: 'turn-complete',
        turnId: 'turn-1',
        reason,
        ...(answer === undefined ? {} : { answer }),
      });
      const terminal = context.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed');
      expect(terminal).toBeDefined();
      expect(terminal).not.toHaveProperty('result');
    }
  });

  it('keeps two identical bodies as two distinct dispatches and turns', async () => {
    const context = setup();
    const attachment = context.adapter.attachment.attachmentIdentity;
    const first = await submitted(context, messageDirective(attachment, '1'));
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-1', reason: 'answer' });
    const second = await submitted(context, messageDirective(attachment, '2'));
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-2', matchesPending: true });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-2', reason: 'answer' });

    expect(first).not.toBe(second);
    const terminals = context.sink.evidence.filter(item => item.kind === 'harness.invocation.terminal-observed');
    expect(terminals.map(item => ('invocationIdentity' in item ? item.invocationIdentity : undefined))).toEqual([
      `hin_${'1'.repeat(64)}`,
      `hin_${'2'.repeat(64)}`,
    ]);
  });

  it('leaves the outcome unknown when another prompt enters before the Send starts', async () => {
    const context = setup();
    await submitted(context);
    await context.adapter.observe({ type: 'foreign-prompt' });
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-1', reason: 'answer' });

    expect(context.sink.invocationKinds()).toEqual(['harness.invocation.correlation-lost']);
    expect(context.sink.evidence.at(-1)?.kind).toBe('harness.availability.observed');
  });

  it('never claims a turn that began with other text', async () => {
    const context = setup();
    await submitted(context);
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: false });
    expect(context.sink.invocationKinds()).toEqual(['harness.invocation.correlation-lost']);
  });

  it('starts from the submit resolution when its own turn start is not observed', async () => {
    const context = setup();
    const dispatchId = await submitted(context);
    await context.adapter.observe({ type: 'submit-resolved', dispatchId, entered: true });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-unseen', reason: 'error' });

    expect(context.sink.invocationKinds()).toEqual([
      'harness.invocation.start-observed',
      'harness.invocation.terminal-observed',
    ]);
    expect(context.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed')).toMatchObject({
      outcome: 'failed',
      reason: 'harness-failed',
    });
  });

  it('records a native drop before entry as a proven rejection', async () => {
    const context = setup();
    const dispatchId = await submitted(context);
    await context.adapter.observe({ type: 'submit-resolved', dispatchId, entered: false });
    expect(context.sink.evidence.find(item => item.kind === 'harness.invocation.rejected')).toMatchObject({
      reason: 'harness-rejected',
    });
  });

  it('refuses without delivery while Claude is busy or another prompt waits', async () => {
    const context = setup();
    const attachment = context.adapter.attachment.attachmentIdentity;
    await context.adapter.observe({ type: 'turn-start', turnId: 'user-turn', matchesPending: false });
    await expect(context.connection.perform(messageDirective(attachment))).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'harness-rejected',
    });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'user-turn', reason: 'answer' });
    await context.adapter.observe({ type: 'foreign-prompt' });
    await expect(context.connection.perform(messageDirective(attachment))).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'harness-rejected',
    });
    expect(context.channel.delivered).toEqual([]);
  });

  it('accepts the Mod refusal as proof that nothing was submitted', async () => {
    const context = setup();
    const performed = context.connection.perform(messageDirective(context.adapter.attachment.attachmentIdentity));
    const command = context.channel.take();
    await context.adapter.observe({ type: 'submit-refused', dispatchId: command.dispatchId });
    await expect(performed).resolves.toMatchObject({ status: 'proven-not-dispatched', reason: 'harness-rejected' });
  });

  it('proves no dispatch when no Mod is polling or the command is never taken', async () => {
    const context = setup();
    const attachment = context.adapter.attachment.attachmentIdentity;
    context.channel.modPresent = false;
    await expect(context.connection.perform(messageDirective(attachment))).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'host-unavailable',
    });

    context.channel.modPresent = true;
    const performed = context.connection.perform(messageDirective(attachment));
    await settle();
    await context.scheduler.fire(CLAUDE_MOD_ANSWER_TIMEOUT_MS);
    await expect(performed).resolves.toMatchObject({ status: 'proven-not-dispatched', reason: 'host-unavailable' });
  });

  it('reports an unknown outcome when a taken command is never confirmed', async () => {
    const context = setup();
    const performed = context.connection.perform(messageDirective(context.adapter.attachment.attachmentIdentity));
    const command = context.channel.take();
    await settle();
    await context.scheduler.fire(CLAUDE_MOD_ANSWER_TIMEOUT_MS);
    await expect(performed).resolves.toEqual({ status: 'accepted-for-observation' });
    // A late confirmation can no longer attach to the abandoned dispatch.
    await context.adapter.observe({ type: 'submit-called', dispatchId: command.dispatchId });
    await context.scheduler.fire(0);
    expect(context.sink.invocationKinds()).toEqual(['harness.invocation.correlation-lost']);
  });

  it('leaves the outcome unknown when no start arrives in the observation window', async () => {
    const context = setup();
    await submitted(context);
    await context.scheduler.fire(30_000);
    expect(context.sink.invocationKinds()).toEqual(['harness.invocation.correlation-lost']);
  });

  it('interrupts exactly its own turn and records the observed interruption', async () => {
    const context = setup();
    const directive = messageDirective(context.adapter.attachment.attachmentIdentity);
    const dispatchId = await submitted(context, directive);
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-9', matchesPending: true });
    await expect(
      context.connection.perform({
        kind: 'harness.direct-invocation.interrupt',
        contractVersion: 1,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
        interruptionIntentIdentity: `hii_${'9'.repeat(64)}` as never,
      }),
    ).resolves.toEqual({ status: 'accepted-for-observation' });
    expect(context.channel.delivered.at(-1)).toEqual({ type: 'abort', dispatchId, turnId: 'turn-9' });

    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-9', reason: 'aborted' });
    expect(context.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed')).toMatchObject({
      outcome: 'interrupted',
      reason: 'interruption-observed',
    });
  });

  it('carries Review Messages only', async () => {
    const context = setup();
    const message = messageDirective(context.adapter.attachment.attachmentIdentity);
    const batch = { ...message, kind: 'harness.direct-review.dispatch' } as unknown as CommittedHarnessDirective;
    await expect(context.connection.perform(batch)).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'capability-withdrawn',
    });
    expect(context.channel.delivered).toEqual([]);
  });

  it('loses an active turn and the Attachment when the session ends', async () => {
    const context = setup();
    await submitted(context);
    await context.adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
    await context.adapter.observe({ type: 'session-ending' });
    await context.adapter.observe({ type: 'turn-complete', turnId: 'turn-1', reason: 'answer' });

    expect(context.sink.invocationKinds()).toEqual([
      'harness.invocation.start-observed',
      'harness.invocation.correlation-lost',
    ]);
    expect(context.sink.evidence.find(item => item.kind === 'harness.invocation.correlation-lost')).toMatchObject({
      reason: 'attachment-lost',
    });
    expect(context.sink.availabilities().at(-1)).toBe('host-unavailable');
    await expect(
      context.connection.perform(messageDirective(context.adapter.attachment.attachmentIdentity, '7')),
    ).resolves.toMatchObject({ status: 'proven-not-dispatched', reason: 'host-unavailable' });
  });
});
