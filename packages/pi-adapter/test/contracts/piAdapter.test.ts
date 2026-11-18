import { createHash } from 'node:crypto';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  DispatchDirectReviewInvocationDirective,
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import { describe, expect, it } from 'vitest';

import {
  createPiReviewedCapabilityManifest,
  PI_REVIEWED_CAPABILITY_MANIFEST,
  type PiDirectReviewAuthority,
} from '../../src/capability.js';
import {
  CORRELATION_ENTRY_TYPE,
  PiReviewedAdapter,
  type PiAdapterScheduler,
  type PiCorrelationMarker,
  type PiNativeHost,
  type PiStoredEntry,
} from '../../src/piAdapter.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000041' as WorkspaceIdentity;

class ScriptedScheduler implements PiAdapterScheduler {
  callback: (() => void) | undefined;
  cleared = false;

  set(_delayMilliseconds: number, callback: () => void): unknown {
    this.callback = callback;
    this.cleared = false;
    return callback;
  }

  clear(_handle: unknown): void {
    this.cleared = true;
  }

  async fire(): Promise<void> {
    const callback = this.callback;
    if (callback === undefined) throw new Error('No timeout was armed');
    callback();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

class ScriptedNativeHost implements PiNativeHost {
  idle = true;
  isIdleFailure: Error | undefined;
  getActiveToolsFailure: Error | undefined;
  activeTools = ['read', 'bash', 'edit', 'write'];
  allTools = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(name => ({ name, source: 'builtin' }));
  readonly sent: string[] = [];
  readonly markers: PiCorrelationMarker[] = [];
  readonly toolSelections: string[][] = [];
  aborts = 0;

  isIdle(): boolean {
    if (this.isIdleFailure !== undefined) throw this.isIdleFailure;
    return this.idle;
  }

  getActiveTools(): readonly string[] {
    if (this.getActiveToolsFailure !== undefined) throw this.getActiveToolsFailure;
    return this.activeTools;
  }

  getAllTools() {
    return this.allTools;
  }

  setActiveTools(toolNames: readonly string[]): void {
    this.activeTools = [...toolNames];
    this.toolSelections.push([...toolNames]);
  }

  sendUserMessage(message: string): void {
    this.sent.push(message);
  }

  appendCorrelationMarker(data: PiCorrelationMarker): void {
    this.markers.push(data);
  }

  abort(): void {
    this.aborts += 1;
  }
}

class AppliedEvidenceSink implements HarnessEvidenceSink {
  readonly evidence: NormalizedHarnessEvidence[] = [];
  #stateVersion = 100;

  async accept(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    this.evidence.push(evidence);
    this.#stateVersion += 1;
    return {
      status: 'applied',
      evidenceIdentity: evidence.evidenceIdentity,
      stateVersion: this.#stateVersion,
    };
  }
}

function createAdapter(
  options: {
    readonly epoch?: string;
    readonly host?: ScriptedNativeHost;
    readonly hostVersion?: string;
    readonly scheduler?: ScriptedScheduler;
    readonly authority?: PiDirectReviewAuthority;
  } = {},
): {
  readonly adapter: PiReviewedAdapter;
  readonly host: ScriptedNativeHost;
  readonly scheduler: ScriptedScheduler;
} {
  const host = options.host ?? new ScriptedNativeHost();
  const scheduler = options.scheduler ?? new ScriptedScheduler();
  return {
    adapter: new PiReviewedAdapter({
      workspaceIdentity: WORKSPACE_IDENTITY,
      canonicalCheckout: '/canonical/repository',
      hostVersion: options.hostVersion ?? '0.80.6',
      sessionIdentity: 'pi-session-1234567890',
      sessionEpoch: options.epoch ?? 'epoch-one',
      native: host,
      scheduler,
      authority: options.authority ?? 'discussion-only',
    }),
    host,
    scheduler,
  };
}

function directive(
  attachmentIdentity: HarnessAttachmentIdentity,
  suffix = '1',
  authority: PiDirectReviewAuthority = 'discussion-only',
): DispatchDirectReviewInvocationDirective {
  const capability = createPiReviewedCapabilityManifest('0.80.6', authority).capabilities[0];
  // A Pi dispatch fixture is a direct-route Capability; the route check also
  // narrows it out of the reviewed Capability union.
  if (capability === undefined || capability.route !== 'direct') {
    throw new Error('Direct Capability fixture missing');
  }
  return {
    kind: 'harness.direct-review.dispatch',
    contractVersion: 1,
    attachmentIdentity,
    handoffIdentity: `hho_${suffix.repeat(64)}` as never,
    invocationIdentity: `hin_${suffix.repeat(64)}` as never,
    capabilitySnapshot: {
      snapshotIdentity: `hcs_${'a'.repeat(64)}` as never,
      compatibilityIdentity: `hcp_${'b'.repeat(64)}` as never,
      manifestSha256: 'c'.repeat(64),
      capability,
      availabilityAtCommit: 'available',
    },
    disclosure: {
      contractVersion: 1,
      handoffKind: 'submit-review-batch',
      authority: 'discussion-only',
      reviewIdentity: `rev_${'d'.repeat(64)}` as never,
      changeSetIdentity: 'change-set-exact',
      reviewSnapshotIdentity: `rsp_${'e'.repeat(64)}` as never,
      reviewBatchIdentity: `rbt_${'f'.repeat(64)}` as never,
      manifest: {
        formatVersion: 1,
        totalFiles: 0,
        digest: { algorithm: 'sha256', value: '0'.repeat(64) },
        files: [],
      },
      questions: [
        {
          sourceQuestionIdentity: `rqn_${'1'.repeat(64)}` as never,
          ordinal: 0,
          intent: 'question',
          body: '  Why exactly?  ',
          anchor: {
            kind: 'review.diff-line',
            reviewSnapshotIdentity: `rsp_${'e'.repeat(64)}` as never,
            fileIdentity: 'review-file',
            side: 'new',
            line: 1,
            byteOffset: 0,
            byteLength: 5,
            lineContent: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              bytesBase64: 'YWZ0ZXI=',
            },
          },
        },
      ],
      sha256: '3'.repeat(64),
      byteLength: 512,
    },
  };
}

function messageDirective(
  attachmentIdentity: HarnessAttachmentIdentity,
): DispatchDirectReviewMessageInvocationDirective {
  const capability = PI_REVIEWED_CAPABILITY_MANIFEST.capabilities[0];
  if (capability === undefined || capability.route !== 'direct') {
    throw new Error('Direct Capability fixture missing');
  }
  const text = 'Please explain this change.\n\nreview.ts:17';
  const bytes = Buffer.from(text, 'utf8');
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
      authority: 'discussion-only',
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

function connect(
  adapter: PiReviewedAdapter,
  sink = new AppliedEvidenceSink(),
): { readonly sink: AppliedEvidenceSink; readonly connection: ReviewedHarnessConnection } {
  return { sink, connection: adapter.connect(sink) };
}

async function start(
  adapter: PiReviewedAdapter,
  host: ScriptedNativeHost,
  connection: ReviewedHarnessConnection,
  value = directive(adapter.attachment.attachmentIdentity),
): Promise<DispatchDirectReviewInvocationDirective> {
  await expect(connection.perform(value)).resolves.toEqual({
    status: 'accepted-for-observation',
  });
  const prompt = host.sent[0];
  if (prompt === undefined) throw new Error('Pi prompt was not sent');
  expect(adapter.onInput({ text: prompt, source: 'extension', hasImages: false })).toEqual({
    action: 'continue',
  });
  await adapter.beforeAgentStart(prompt, false);
  host.idle = false;
  await adapter.agentStarted();
  return value;
}

function settledEntries(
  host: ScriptedNativeHost,
  prompt: string,
  stopReason: 'stop' | 'error' | 'aborted',
  provisionalError = false,
  storedMarker: unknown = host.markers[0],
): readonly PiStoredEntry[] {
  const marker = host.markers[0];
  if (marker === undefined) throw new Error('Correlation marker missing');
  return [
    {
      type: 'custom',
      customType: CORRELATION_ENTRY_TYPE,
      data: storedMarker,
    },
    { type: 'message', message: { role: 'user', content: prompt } },
    ...(provisionalError
      ? [
          {
            type: 'message',
            message: { role: 'assistant', content: [], stopReason: 'error' as const },
          },
        ]
      : []),
    {
      type: 'message',
      message: {
        role: 'assistant',
        content:
          stopReason === 'stop'
            ? [
                { type: 'text', text: 'Complete ' },
                { type: 'thinking', thinking: 'private reasoning is not the answer' },
                { type: 'text', text: 'correlated answer.' },
              ]
            : [],
        stopReason,
      },
    },
  ];
}

describe('reviewed Pi Adapter', () => {
  it('ships one exact reviewed capability and one same-Workspace session-epoch Attachment', async () => {
    const firstFixture = createAdapter({ epoch: 'epoch-one' });
    const first = firstFixture.adapter;
    const second = createAdapter({ epoch: 'epoch-two' }).adapter;

    expect(first.manifest).toEqual(PI_REVIEWED_CAPABILITY_MANIFEST);
    expect(first.manifest.reviewedHostVersions).toEqual(['0.80.6']);
    expect(first.manifest.capabilities).toHaveLength(1);
    expect(first.attachment).toMatchObject({
      evidenceIdentity: 'pi-attachment:21367cb70c5d23fc286cb8fbe404f29e9b315a23b121a4ce42e8dc27ace4f392',
      attachmentIdentity: 'att_03db5676e1368f7c65df0f9ff8f504e68e39e72509591395744999f5a0ee4c5a',
      workspaceIdentity: WORKSPACE_IDENTITY,
      hostVersion: '0.80.6',
      destination: {
        harnessLabel: 'Pi',
        canonicalCheckout: '/canonical/repository',
      },
    });
    expect(first.attachment.attachmentIdentity).not.toBe(second.attachment.attachmentIdentity);

    const attached = connect(first);
    firstFixture.host.idle = false;
    await first.agentStarted();
    firstFixture.host.idle = true;
    await first.agentSettled([]);
    firstFixture.host.idle = false;
    await first.agentStarted();
    firstFixture.host.idle = true;
    await first.agentSettled([]);
    expect(new Set(attached.sink.evidence.map(item => item.evidenceIdentity)).size).toBe(4);
  });

  it('narrows each Manifest to its admitted host and refuses hosts outside the compatibility family', () => {
    const latest = createAdapter({ hostVersion: '0.85.1' }).adapter;
    const forwardCompatible = createAdapter({ hostVersion: '0.99.0' }).adapter;

    expect(latest.manifest.reviewedHostVersions).toEqual(['0.85.1']);
    expect(latest.attachment.hostVersion).toBe('0.85.1');
    expect(forwardCompatible.manifest.reviewedHostVersions).toEqual(['0.99.0']);
    expect(() => createAdapter({ hostVersion: '0.80.5' })).toThrow(/too old/u);
    expect(() => createAdapter({ hostVersion: '0.85.2-beta.1' })).toThrow(/not a stable semantic version/u);
    expect(createAdapter({ hostVersion: '1.5.0' }).adapter.manifest.reviewedHostVersions).toEqual(['1.5.0']);
    expect(() => createAdapter({ hostVersion: '2.0.0' })).toThrow(/outside/u);
  });

  it('withdraws capability before disclosure when native compatibility reads fail', async () => {
    const fixture = createAdapter();
    const attached = connect(fixture.adapter);
    fixture.host.getActiveToolsFailure = new Error('changed native API');

    await expect(
      attached.connection.perform(directive(fixture.adapter.attachment.attachmentIdentity)),
    ).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'capability-withdrawn',
    });
    expect(fixture.host.sent).toEqual([]);
    expect(fixture.host.markers).toEqual([]);
  });

  it('sends committed Review Message bytes exactly while keeping correlation out of band', async () => {
    const { adapter, host } = createAdapter();
    const { connection } = connect(adapter);
    const exact = messageDirective(adapter.attachment.attachmentIdentity);

    await expect(connection.perform(exact)).resolves.toEqual({ status: 'accepted-for-observation' });
    expect(host.sent).toEqual(['Please explain this change.\n\nreview.ts:17']);
    expect(host.markers).toEqual([
      expect.objectContaining({
        invocationIdentity: exact.invocationIdentity,
        disclosureSha256: exact.disclosure.sha256,
      }),
    ]);
    expect(host.sent[0]).not.toContain('buildframe');
  });

  it('arms the exact built-in read gate, confines the payload, and distinguishes dispatch from native start', async () => {
    const { adapter, host } = createAdapter();
    const { sink, connection } = connect(adapter);
    const firstDirective = directive(adapter.attachment.attachmentIdentity);

    await expect(connection.perform(firstDirective)).resolves.toEqual({
      status: 'accepted-for-observation',
    });
    expect(host.activeTools).toEqual(['read', 'grep', 'find', 'ls']);
    expect(sink.evidence).toEqual([]);
    expect(adapter.onToolCall('edit')).toMatchObject({ block: true });
    expect(adapter.onToolCall('read')).toBeUndefined();

    const prompt = host.sent[0] ?? '';
    const json = prompt.match(/<buildframe-direct-review>\n([^\n]+)\n<\/buildframe-direct-review>/u)?.[1];
    expect(json).toBeDefined();
    const envelope = JSON.parse(json ?? '{}') as Record<string, unknown>;
    expect(Object.keys(envelope)).toEqual(['schema', 'correlation', 'capability', 'disclosure']);
    expect(envelope.disclosure).toEqual(firstDirective.disclosure);
    expect(prompt).not.toContain('commitmentReceiptIdentity');
    expect(prompt).not.toContain('draftIdentity');
    expect(prompt).not.toContain('stateVersion');

    await expect(connection.perform(directive(adapter.attachment.attachmentIdentity, '2'))).resolves.toMatchObject({
      status: 'proven-not-dispatched',
      reason: 'harness-rejected',
    });
    expect(host.sent).toHaveLength(1);

    expect(adapter.onInput({ text: prompt, source: 'extension', hasImages: false })).toEqual({
      action: 'continue',
    });
    await adapter.beforeAgentStart(prompt, false);
    host.idle = false;
    await adapter.agentStarted();
    // Pi reports itself busy once its own turn starts.
    expect(sink.evidence.map(item => item.kind)).toEqual([
      'harness.invocation.start-observed',
      'harness.availability.observed',
    ]);
  });

  it('defaults to workspace write and dispatches with the session tools untouched', async () => {
    const host = new ScriptedNativeHost();
    const adapter = new PiReviewedAdapter({
      workspaceIdentity: WORKSPACE_IDENTITY,
      canonicalCheckout: '/canonical/repository',
      hostVersion: '0.80.6',
      sessionIdentity: 'pi-session-1234567890',
      sessionEpoch: 'epoch-write-default',
      native: host,
    });
    expect(adapter.manifest.capabilities[0]).toMatchObject({
      capabilityIdentity: 'pi-direct-workspace-write-review-v1',
      authority: 'workspace-write',
      effectConstraint: { strength: 'communicated', scope: 'harness-tools' },
    });
    expect(PI_REVIEWED_CAPABILITY_MANIFEST.capabilities[0]?.authority).toBe('discussion-only');

    const { connection } = connect(adapter);
    const writeDirective = directive(adapter.attachment.attachmentIdentity, 'w', 'workspace-write');
    await expect(connection.perform(writeDirective)).resolves.toEqual({ status: 'accepted-for-observation' });
    expect(host.activeTools).toEqual(['read', 'bash', 'edit', 'write']);
    expect(adapter.onToolCall('edit')).toBeUndefined();
    expect(adapter.onToolCall('bash')).toBeUndefined();
    expect(host.sent[0]).toContain('may modify the workspace');

    host.idle = true;
    await adapter.agentSettled(settledEntries(host, host.sent[0] ?? '', 'stop', true));
    expect(host.activeTools).toEqual(['read', 'bash', 'edit', 'write']);
  });

  it('uses the settlement-time final assistant source across retry and derives abort races from terminal fact', async () => {
    const normal = createAdapter();
    const normalConnection = connect(normal.adapter);
    const normalDirective = await start(normal.adapter, normal.host, normalConnection.connection);
    normal.host.idle = true;
    await normal.adapter.agentSettled(settledEntries(normal.host, normal.host.sent[0] ?? '', 'stop', true));
    expect(
      [...normalConnection.sink.evidence].reverse().find(item => item.kind === 'harness.invocation.terminal-observed'),
    ).toMatchObject({
      kind: 'harness.invocation.terminal-observed',
      invocationIdentity: normalDirective.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: 'Complete correlated answer.',
        byteLength: 27,
      },
    });
    expect(normal.host.activeTools).toEqual(['read', 'bash', 'edit', 'write']);

    for (const [epoch, content] of [
      ['empty-answer', []],
      ['oversized-answer', [{ type: 'text', text: 'x'.repeat(16 * 1024 + 1) }]],
    ] as const) {
      const resultless = createAdapter({ epoch });
      const attached = connect(resultless.adapter);
      await start(resultless.adapter, resultless.host, attached.connection);
      const entries = settledEntries(resultless.host, resultless.host.sent[0] ?? '', 'stop');
      const final = entries.at(-1);
      if (final?.message === undefined) throw new Error('Final assistant missing');
      resultless.host.idle = true;
      await resultless.adapter.agentSettled([
        ...entries.slice(0, -1),
        { ...final, message: { ...final.message, content } },
      ]);
      const terminal = attached.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed');
      expect(terminal).toMatchObject({ outcome: 'ended-normally' });
      expect(terminal).not.toHaveProperty('result');
    }

    const raced = createAdapter();
    const racedConnection = connect(raced.adapter);
    const racedDirective = await start(raced.adapter, raced.host, racedConnection.connection);
    await racedConnection.connection.perform({
      kind: 'harness.direct-invocation.interrupt',
      contractVersion: 1,
      attachmentIdentity: raced.adapter.attachment.attachmentIdentity,
      invocationIdentity: racedDirective.invocationIdentity,
      interruptionIntentIdentity: `hir_${'9'.repeat(64)}` as never,
    });
    expect(raced.host.aborts).toBe(1);
    raced.host.idle = true;
    await raced.adapter.agentSettled(settledEntries(raced.host, raced.host.sent[0] ?? '', 'stop'));
    expect(
      [...racedConnection.sink.evidence].reverse().find(item => item.kind === 'harness.invocation.terminal-observed'),
    ).toMatchObject({ outcome: 'ended-normally' });

    for (const [stopReason, outcome] of [
      ['error', 'failed'],
      ['aborted', 'interrupted'],
    ] as const) {
      const fixture = createAdapter({ epoch: stopReason });
      const attached = connect(fixture.adapter);
      await start(fixture.adapter, fixture.host, attached.connection);
      fixture.host.idle = true;
      await fixture.adapter.agentSettled(settledEntries(fixture.host, fixture.host.sent[0] ?? '', stopReason));
      expect(
        [...attached.sink.evidence].reverse().find(item => item.kind === 'harness.invocation.terminal-observed'),
      ).toMatchObject({ outcome });
    }
  });

  it('matches stored correlation markers by all five scalar fields independent of key order', async () => {
    const reordered = createAdapter({ epoch: 'reordered-marker' });
    const reorderedConnection = connect(reordered.adapter);
    const reorderedDirective = await start(reordered.adapter, reordered.host, reorderedConnection.connection);
    const marker = reordered.host.markers[0];
    if (marker === undefined) throw new Error('Correlation marker missing');
    const storedMarker = {
      disclosureSha256: marker.disclosureSha256,
      correlationIdentity: marker.correlationIdentity,
      invocationIdentity: marker.invocationIdentity,
      attachmentIdentity: marker.attachmentIdentity,
      schema: marker.schema,
    };
    expect(Object.keys(storedMarker)).toEqual([
      'disclosureSha256',
      'correlationIdentity',
      'invocationIdentity',
      'attachmentIdentity',
      'schema',
    ]);

    reordered.host.idle = true;
    await reordered.adapter.agentSettled(
      settledEntries(reordered.host, reordered.host.sent[0] ?? '', 'stop', false, storedMarker),
    );
    expect(
      reorderedConnection.sink.evidence.find(item => item.kind === 'harness.invocation.terminal-observed'),
    ).toMatchObject({
      kind: 'harness.invocation.terminal-observed',
      invocationIdentity: reorderedDirective.invocationIdentity,
      outcome: 'ended-normally',
      result: { body: 'Complete correlated answer.' },
    });
    expect(reorderedConnection.sink.evidence.some(item => item.kind === 'harness.invocation.correlation-lost')).toBe(
      false,
    );

    const fields = [
      'schema',
      'attachmentIdentity',
      'invocationIdentity',
      'correlationIdentity',
      'disclosureSha256',
    ] as const satisfies readonly (keyof PiCorrelationMarker)[];
    for (const field of fields) {
      const mismatch = createAdapter({ epoch: `marker-mismatch-${field}` });
      const mismatchConnection = connect(mismatch.adapter);
      const mismatchDirective = await start(mismatch.adapter, mismatch.host, mismatchConnection.connection);
      const exactMarker = mismatch.host.markers[0];
      if (exactMarker === undefined) throw new Error('Correlation marker missing');
      mismatch.host.idle = true;
      await mismatch.adapter.agentSettled(
        settledEntries(mismatch.host, mismatch.host.sent[0] ?? '', 'stop', false, {
          ...exactMarker,
          [field]: `${exactMarker[field]}-mismatch`,
        }),
      );
      expect(mismatchConnection.sink.evidence.at(-2), field).toMatchObject({
        kind: 'harness.invocation.correlation-lost',
        invocationIdentity: mismatchDirective.invocationIdentity,
        reason: 'terminal-evidence-lost',
      });
      expect(
        mismatchConnection.sink.evidence.some(item => item.kind === 'harness.invocation.terminal-observed'),
        field,
      ).toBe(false);
    }
  });

  it('never claims a run that Pi started from a custom message', async () => {
    const { adapter, host } = createAdapter();
    const attached = connect(adapter);
    const request = directive(adapter.attachment.attachmentIdentity);
    await attached.connection.perform(request);
    const prompt = host.sent[0];
    if (prompt === undefined) throw new Error('Pi prompt was not sent');
    adapter.onInput({ text: prompt, source: 'extension', hasImages: false });
    // Pi 1.2+ reports another extension's triggered run without a prompt.
    await adapter.beforeAgentStart(undefined, false);

    expect(attached.sink.evidence.at(-2)).toMatchObject({
      kind: 'harness.invocation.correlation-lost',
      invocationIdentity: request.invocationIdentity,
      reason: 'correlation-lost',
    });
  });

  it('contains a no-start host failure as correlation loss without a rejected task', async () => {
    const fixture = createAdapter();
    const attached = connect(fixture.adapter);
    const request = directive(fixture.adapter.attachment.attachmentIdentity);
    await attached.connection.perform(request);
    fixture.host.isIdleFailure = new Error('injected no-start host failure');
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      await fixture.scheduler.fire();
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(attached.sink.evidence.at(-1)).toMatchObject({
      kind: 'harness.invocation.correlation-lost',
      invocationIdentity: request.invocationIdentity,
      reason: 'correlation-lost',
    });
    expect(fixture.host.aborts).toBe(1);
    expect(fixture.host.activeTools).toEqual(['read', 'bash', 'edit', 'write']);
    expect(fixture.scheduler.cleared).toBe(true);
    expect(fixture.adapter.ownsInvocation()).toBe(false);
  });

  it('turns a proven idle no-start into rejection and session replacement into unresolved correlation', async () => {
    const noStart = createAdapter();
    const noStartConnection = connect(noStart.adapter);
    await noStartConnection.connection.perform(directive(noStart.adapter.attachment.attachmentIdentity));
    await noStart.scheduler.fire();
    expect(noStartConnection.sink.evidence.at(-1)).toMatchObject({
      kind: 'harness.invocation.rejected',
      reason: 'harness-rejected',
    });
    expect(noStart.host.activeTools).toEqual(['read', 'bash', 'edit', 'write']);

    const replacement = createAdapter();
    const replacementConnection = connect(replacement.adapter);
    await replacementConnection.connection.perform(directive(replacement.adapter.attachment.attachmentIdentity));
    await replacement.adapter.sessionEnding();
    expect(replacementConnection.sink.evidence.map(item => item.kind)).toEqual([
      'harness.availability.observed',
      'harness.invocation.correlation-lost',
    ]);
    expect(replacementConnection.sink.evidence.at(-1)).toMatchObject({
      reason: 'attachment-lost',
    });
    expect(replacement.host.sent).toHaveLength(1);
  });

  it('retains stable unresolved evidence across runtime replacement without replaying the Pi directive', async () => {
    const fixture = createAdapter();
    const firstEvidence: NormalizedHarnessEvidence[] = [];
    let runtimeAvailable = true;
    const firstSink: HarnessEvidenceSink = {
      accept: async evidence => {
        firstEvidence.push(evidence);
        if (!runtimeAvailable) {
          return {
            status: 'refused' as const,
            evidenceIdentity: evidence.evidenceIdentity,
            reason: 'state-unavailable' as const,
          };
        }
        return {
          status: 'applied' as const,
          evidenceIdentity: evidence.evidenceIdentity,
          stateVersion: firstEvidence.length,
        };
      },
    };
    const firstConnection = fixture.adapter.connect(firstSink);
    await start(fixture.adapter, fixture.host, firstConnection);
    runtimeAvailable = false;
    await fixture.adapter.runtimeDisconnected('rtg_first-runtime');
    expect(fixture.host.sent).toHaveLength(1);
    expect(fixture.host.aborts).toBe(1);

    const recovered = new AppliedEvidenceSink();
    fixture.adapter.connect(recovered);
    fixture.host.idle = true;
    await fixture.adapter.runtimeConnected('rtg_replacement-runtime');
    expect(fixture.host.sent).toHaveLength(1);
    expect(recovered.evidence.map(item => item.kind)).toEqual([
      'harness.availability.observed',
      'harness.invocation.correlation-lost',
      'harness.availability.observed',
    ]);
    expect(recovered.evidence[0]?.evidenceIdentity).toContain('rtg_first-runtime');
    expect(recovered.evidence[1]).toMatchObject({
      kind: 'harness.invocation.correlation-lost',
      reason: 'attachment-lost',
    });
  });
});
