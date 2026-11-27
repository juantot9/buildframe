import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';

import type { Workspace } from '@buildframe/workspace';
import type {
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
  WorkspaceHarnessAdapterHost,
} from '@buildframe/workspace/harness-interaction';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RuntimeCodeIdentity, RuntimeGeneration } from '../../src/contracts.js';
import { publicIntegrationEndpoint } from '../../src/publicIntegration/endpoint.js';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/server.js';
import { messageDirective, RecordingSink, WORKSPACE_IDENTITY } from './connectorFixtures.js';

const CHECKOUT = '/semantic/checkout';

function workspace(): Workspace {
  return {
    execute: async () => ({}) as never,
    read: async () =>
      ({
        kind: 'workspace.identity',
        interfaceVersion: 1,
        workspaceIdentity: WORKSPACE_IDENTITY,
        canonicalCheckout: CHECKOUT,
      }) as never,
    subscribe: () => () => {},
    setAttention: () => {},
  };
}

/** Attaches whatever connects and records its evidence, as the Workspace would. */
class RecordingHost implements WorkspaceHarnessAdapterHost {
  adapter: ReviewedHarnessAdapter | undefined;
  connection: ReviewedHarnessConnection | undefined;
  readonly sink = new RecordingSink();

  async establish(adapter: ReviewedHarnessAdapter) {
    this.adapter = adapter;
    this.connection = adapter.connect(this.sink);
    return {
      status: 'established' as const,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      compatibilityIdentity: `hcp_${'4'.repeat(64)}` as never,
      stateVersion: 1,
    };
  }
}

/** An outside integration speaking the public wire by hand. */
class Integration {
  readonly received: Record<string, unknown>[] = [];
  closed = false;
  readonly #socket: Socket;
  #buffer = '';

  constructor(socket: Socket) {
    this.#socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.#buffer += chunk;
      let newline = this.#buffer.indexOf('\n');
      while (newline >= 0) {
        this.received.push(JSON.parse(this.#buffer.slice(0, newline)) as Record<string, unknown>);
        this.#buffer = this.#buffer.slice(newline + 1);
        newline = this.#buffer.indexOf('\n');
      }
    });
    socket.on('close', () => (this.closed = true));
  }

  static async open(): Promise<Integration> {
    const socket = connect(publicIntegrationEndpoint(WORKSPACE_IDENTITY).socket);
    await new Promise<void>((resolve, reject) => socket.once('connect', resolve).once('error', reject));
    return new Integration(socket);
  }

  send(message: object): void {
    this.#socket.write(`${JSON.stringify(message)}\n`);
  }

  async next(predicate: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
    await waitFor(() => this.received.some(predicate), 'a message from BuildFrame');
    return this.received.find(predicate)!;
  }

  close(): void {
    this.#socket.destroy();
  }
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const initialize = (manifest: object = {}, extra: object = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'buildframe/initialize',
  params: {
    protocolVersion: 1,
    workspace: WORKSPACE_IDENTITY,
    manifest: { name: 'proto-harness', version: '0.0.1', level: 'full', canInterrupt: true, ...manifest },
    session: { id: 'session-abcdef12', name: 'Fix the parser' },
    ...extra,
  },
});

describe('the public integration wire', () => {
  let scratch: string;
  let original: string | undefined;
  const servers = new Set<LocalRuntimeServer>();
  const integrations = new Set<Integration>();

  beforeEach(async () => {
    original = process.env.XDG_RUNTIME_DIR;
    scratch = await mkdtemp('/tmp/buildframe-public-wire-');
    process.env.XDG_RUNTIME_DIR = scratch;
  });

  afterEach(async () => {
    for (const integration of integrations) integration.close();
    integrations.clear();
    await Promise.all([...servers].map(async server => server.dispose()));
    servers.clear();
    if (original === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = original;
    await rm(scratch, { recursive: true, force: true });
  });

  async function start(): Promise<RecordingHost> {
    const host = new RecordingHost();
    servers.add(
      await startLocalRuntimeServer({
        workspace: workspace(),
        runtimeGeneration: `rtg_${randomUUID()}` as RuntimeGeneration,
        runtimeCodeIdentity: `rtc_${'3'.repeat(64)}` as RuntimeCodeIdentity,
        harnessAdapters: host,
      }),
    );
    return host;
  }

  async function open(): Promise<Integration> {
    const integration = await Integration.open();
    integrations.add(integration);
    return integration;
  }

  it('attaches an integration as unverified and carries one Message through its turn', async () => {
    const host = await start();
    const integration = await open();
    integration.send(initialize());
    const ready = await integration.next(message => message.id === 1);
    expect(ready).toEqual({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, trust: 'unverified' } });
    expect(host.adapter?.manifest.adapterImplementationIdentity).toBe('unverified:proto-harness');
    expect(host.adapter?.attachment.destination).toMatchObject({
      harnessLabel: 'proto-harness',
      sessionLabel: 'Fix the parser',
      canonicalCheckout: CHECKOUT,
    });

    const directive = messageDirective(host.adapter!.attachment.attachmentIdentity);
    const observation = host.connection!.perform(directive);
    const deliver = await integration.next(message => message.method === 'message/deliver');
    const text = 'Explain review.ts:17 as written.\r\n  café';
    expect(deliver.params).toEqual({
      messageId: expect.stringMatching(/^msg_/u),
      text,
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    });
    const messageId = (deliver.params as { messageId: string }).messageId;
    integration.send({ jsonrpc: '2.0', id: deliver.id, result: { accepted: true } });
    await expect(observation).resolves.toEqual({ status: 'accepted-for-observation' });

    // Turn events are notifications; one naming another Message is dropped.
    integration.send({ jsonrpc: '2.0', method: 'turn/started', params: { messageId: 'msg_someone-else' } });
    integration.send({ jsonrpc: '2.0', method: 'turn/started', params: { messageId } });
    integration.send({ method: 'turn/ended', params: { messageId, stopReason: 'end_turn', answer: 'Done.' } });
    await waitFor(() => host.sink.turnEvidence().length === 2, 'start and end');
    expect(host.sink.turnEvidence()).toEqual([
      'harness.invocation.start-observed',
      'harness.invocation.terminal-observed',
    ]);
    const terminal = host.sink.accepted.find(item => item.kind === 'harness.invocation.terminal-observed');
    expect(terminal).toMatchObject({ outcome: 'ended-normally', result: { body: 'Done.' } });
  });

  it('interrupts in two steps and loses the turn when the integration goes away', async () => {
    const host = await start();
    const integration = await open();
    integration.send(initialize());
    await integration.next(message => message.id === 1);
    const directive = messageDirective(host.adapter!.attachment.attachmentIdentity);
    const observation = host.connection!.perform(directive);
    const deliver = await integration.next(message => message.method === 'message/deliver');
    const messageId = (deliver.params as { messageId: string }).messageId;
    integration.send({ jsonrpc: '2.0', id: deliver.id, result: { accepted: true } });
    await observation;
    integration.send({ jsonrpc: '2.0', method: 'turn/started', params: { messageId } });
    await waitFor(() => host.sink.turnEvidence().length === 1, 'start');

    const interrupted = host.connection!.perform({
      kind: 'harness.direct-invocation.interrupt',
      contractVersion: 1,
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      interruptionIntentIdentity: `hii_${'9'.repeat(64)}` as never,
    });
    const interrupt = await integration.next(message => message.method === 'turn/interrupt');
    expect(interrupt.params).toEqual({ messageId });
    integration.send({ jsonrpc: '2.0', id: interrupt.id, result: { requested: true } });
    await expect(interrupted).resolves.toEqual({ status: 'accepted-for-observation' });

    integration.close();
    await waitFor(() => host.sink.turnEvidence().length === 2, 'the loss');
    expect(host.sink.turnEvidence()[1]).toBe('harness.invocation.correlation-lost:attachment-lost');
  });

  it('tells a replaced integration why before closing it', async () => {
    const host = await start();
    const integration = await open();
    integration.send(initialize());
    await integration.next(message => message.id === 1);
    host.connection!.release!('replaced');
    const released = await integration.next(message => message.method === 'buildframe/released');
    expect(released).toEqual({ jsonrpc: '2.0', method: 'buildframe/released', params: { reason: 'replaced' } });
    await waitFor(() => integration.closed, 'the close');
  });

  it('answers mistakes with JSON-RPC errors and refuses another checkout', async () => {
    await start();
    const integration = await open();
    integration.send({ jsonrpc: '2.0', id: 7, method: 'turn/interrupt', params: {} });
    expect(await integration.next(message => message.id === 7)).toMatchObject({ error: { code: -32002 } });
    integration.send(initialize({ level: 'basic' }));
    expect(await integration.next(message => message.id === 1)).toMatchObject({
      error: { code: -32003, data: { levels: ['full'] } },
    });
    integration.send({ ...initialize(), id: 2, params: { ...initialize().params, manifest: { name: '' } } });
    expect(await integration.next(message => message.id === 2)).toMatchObject({ error: { code: -32602 } });
    integration.send({ ...initialize({}, { workspace: 'wsp_another' }), id: 3 });
    expect(await integration.next(message => message.id === 3)).toMatchObject({
      error: { code: -32001, data: { reason: 'workspace-mismatch' } },
    });
    await waitFor(() => integration.closed, 'the close');
  });
});
