import { createHash, randomUUID } from 'node:crypto';

import type { Workspace } from '@buildframe/workspace';
import type {
  HarnessEvidenceSink,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
  WorkspaceHarnessAdapterHost,
} from '@buildframe/workspace/harness-interaction';

import { connectorSessionLabel } from '../connector/indicator.js';
import { createConnectorSession } from '../connector/session.js';
import type { ConnectorHostFact, ConnectorSession, ConnectorTurn } from '../connector/contracts.js';
import type { FramedSocket } from '../framing.js';
import { PUBLIC_ANSWER_MAXIMUM_BYTES, unverifiedCapabilityManifest } from './manifest.js';
import {
  classifyPublicFrame,
  isStopReason,
  messageIdOf,
  outcomeOfStopReason,
  parseInitializeParams,
  PUBLIC_ERROR,
  PUBLIC_INTEGRATION_PROTOCOL_VERSION,
  recordOf,
  type PublicInitializeParams,
} from './wire.js';

interface Pending {
  readonly settle: (response: { readonly result?: unknown; readonly error?: unknown }) => void;
}

/**
 * One integration on the public wire, inside the runtime. Its messages become
 * the connector kit's native facts, so correlation is decided exactly as for
 * the reviewed connectors; the kit's session is the Adapter the Workspace
 * attaches, marked unverified by its manifest.
 */
export class PublicIntegrationConnection {
  readonly #peer: FramedSocket;
  readonly #workspace: Workspace;
  readonly #host: WorkspaceHarnessAdapterHost;
  readonly #runtimeGeneration: string;
  /** Ends the socket after what was sent has been written. */
  readonly #end: () => void;
  readonly #pending = new Map<number, Pending>();
  #nextId = 1;
  #state: 'new' | 'initializing' | 'established' | 'closed' = 'new';
  #session: ConnectorSession | undefined;
  #canInterrupt = false;
  /** Notifications apply one at a time, in arrival order. */
  #facts: Promise<void> = Promise.resolve();

  constructor(
    peer: FramedSocket,
    workspace: Workspace,
    host: WorkspaceHarnessAdapterHost,
    runtimeGeneration: string,
    end: () => void,
  ) {
    this.#end = end;
    this.#peer = peer;
    this.#workspace = workspace;
    this.#host = host;
    this.#runtimeGeneration = runtimeGeneration;
  }

  accept(frame: unknown): void {
    if (this.#state === 'closed') return;
    const incoming = classifyPublicFrame(frame);
    switch (incoming.kind) {
      case 'invalid':
        this.#error(incoming.id ?? null, PUBLIC_ERROR.invalidRequest, 'Not a JSON-RPC 2.0 message');
        return;
      case 'response': {
        const pending = typeof incoming.id === 'number' ? this.#pending.get(incoming.id) : undefined;
        if (pending === undefined) return;
        this.#pending.delete(incoming.id as number);
        pending.settle(incoming);
        return;
      }
      case 'request':
        if (incoming.method === 'buildframe/initialize') {
          void this.#initialize(incoming.id, incoming.params);
          return;
        }
        this.#error(
          incoming.id,
          this.#state === 'established' ? PUBLIC_ERROR.methodNotFound : PUBLIC_ERROR.notInitialized,
          `Unknown method ${incoming.method}`,
        );
        return;
      case 'notification':
        if (this.#session !== undefined) this.#notify(this.#session, incoming.method, incoming.params);
        return;
    }
  }

  /** The integration's socket closed: open Messages become unknown and the Attachment unavailable. */
  async disconnect(): Promise<void> {
    if (this.#state === 'closed') return;
    this.#state = 'closed';
    for (const pending of this.#pending.values()) pending.settle({ error: { message: 'disconnected' } });
    this.#pending.clear();
    await this.#facts;
    await this.#session?.runtimeDisconnected(this.#runtimeGeneration);
  }

  async #initialize(id: string | number, raw: unknown): Promise<void> {
    if (this.#state !== 'new') {
      this.#error(id, PUBLIC_ERROR.notInitialized, 'Already initialized');
      return;
    }
    const params = parseInitializeParams(raw);
    if (params === undefined) {
      this.#error(id, PUBLIC_ERROR.invalidParams, 'Invalid buildframe/initialize params');
      return;
    }
    if (params.protocolVersion !== PUBLIC_INTEGRATION_PROTOCOL_VERSION || params.manifest.level !== 'full') {
      this.#error(id, PUBLIC_ERROR.unsupported, 'Only protocol version 1 at the full level is supported', {
        protocolVersions: [PUBLIC_INTEGRATION_PROTOCOL_VERSION],
        levels: ['full'],
      });
      return;
    }
    this.#state = 'initializing';
    try {
      const identity = await this.#workspace.read({ kind: 'workspace.identity' });
      if (params.workspace !== identity.workspaceIdentity) {
        this.#refuse(id, 'workspace-mismatch');
        return;
      }
      const session = this.#openSession(params, identity.workspaceIdentity, identity.canonicalCheckout);
      const adapter = this.#adapter(session);
      // The Workspace may still be recording another change; that refusal only asks to try again.
      let result = await this.#host.establish(adapter);
      for (
        let retry = 0;
        retry < 3 && result.status === 'refused' && result.reason === 'state-version-changed';
        retry += 1
      ) {
        result = await this.#host.establish(adapter);
      }
      // The socket may have closed while the Workspace decided.
      if ((this.#state as string) === 'closed') return;
      if (result.status === 'refused') {
        this.#refuse(id, result.reason);
        return;
      }
      this.#session = session;
      this.#canInterrupt = params.manifest.canInterrupt;
      this.#state = 'established';
      this.#peer.send({
        jsonrpc: '2.0',
        id,
        result: { protocolVersion: PUBLIC_INTEGRATION_PROTOCOL_VERSION, trust: 'unverified' },
      });
    } catch {
      this.#refuse(id, 'state-unavailable');
    }
  }

  #openSession(params: PublicInitializeParams, workspaceIdentity: string, canonicalCheckout: string): ConnectorSession {
    const sessionIdentity = params.session?.id ?? params.manifest.name;
    return createConnectorSession(
      {
        manifest: unverifiedCapabilityManifest(params.manifest),
        workspaceIdentity: workspaceIdentity as Parameters<typeof createConnectorSession>[0]['workspaceIdentity'],
        canonicalCheckout,
        hostVersion: params.manifest.version,
        sessionIdentity,
        sessionEpoch: randomUUID(),
        sessionLabel: connectorSessionLabel(params.session?.name, sessionIdentity.slice(-8)),
        naming: {
          attachmentSeed: 'unverified-attachment-v1',
          attachmentEvidence: 'unverified-attachment',
          namespace: 'unverified',
          turnPrefix: 'msg',
        },
        host: {
          submit: turn => this.#deliver(turn),
          withdraw: () => false,
          interrupt: async turn => await this.#interrupt(turn),
        },
      },
      () => Promise.reject(new Error('A public integration connects from outside')),
    );
  }

  /** The kit's session as the Workspace sees it, plus the release a takeover sends. */
  #adapter(session: ConnectorSession): ReviewedHarnessAdapter {
    return {
      manifest: session.manifest,
      attachment: session.attachment,
      connect: (sink: HarnessEvidenceSink): ReviewedHarnessConnection => {
        const connection = session.connect(sink);
        return Object.freeze({
          perform: connection.perform,
          release: () => {
            this.#peer.send({ jsonrpc: '2.0', method: 'buildframe/released', params: { reason: 'replaced' } });
            this.#end();
          },
        });
      },
    };
  }

  #deliver(turn: ConnectorTurn): 'pending' | 'host-unavailable' {
    const sha256 = createHash('sha256').update(turn.text, 'utf8').digest('hex');
    const sent = this.#request('message/deliver', { messageId: turn.dispatchId, text: turn.text, sha256 }, response => {
      const result = recordOf(response.result);
      const fact: ConnectorHostFact =
        result.accepted === true
          ? { type: 'own-input-taken' }
          : result.notDelivered !== undefined
            ? { type: 'own-input-refused' }
            : { type: 'own-input-unknown' };
      this.#observe(fact);
    });
    return sent ? 'pending' : 'host-unavailable';
  }

  async #interrupt(turn: ConnectorTurn): Promise<void> {
    if (!this.#canInterrupt) throw new Error('This integration cannot interrupt');
    await new Promise<void>((resolve, reject) => {
      const sent = this.#request('turn/interrupt', { messageId: turn.dispatchId }, response =>
        recordOf(response.result).requested === true ? resolve() : reject(new Error('Interrupt refused')),
      );
      if (!sent) reject(new Error('Integration disconnected'));
    });
  }

  #notify(session: ConnectorSession, method: string, params: unknown): void {
    const messageId = messageIdOf(params);
    if (messageId === false) return;
    const own = messageId !== undefined && messageId === session.turn?.dispatchId;
    // An event naming a Message BuildFrame isn't tracking is dropped.
    if (messageId !== undefined && !own) return;
    const values = recordOf(params);
    if (method === 'turn/started') {
      this.#observe({ type: 'turn-started', own });
    } else if (method === 'turn/ended' && isStopReason(values.stopReason)) {
      const answer =
        typeof values.answer === 'string' &&
        values.answerTruncated !== true &&
        Buffer.byteLength(values.answer, 'utf8') <= PUBLIC_ANSWER_MAXIMUM_BYTES
          ? values.answer
          : undefined;
      this.#observe({
        type: 'turn-ended',
        outcome: outcomeOfStopReason(values.stopReason),
        ...(answer === undefined ? {} : { answer }),
      });
    } else if (method === 'turn/lost' && own) {
      this.#observe({ type: 'turn-ended', outcome: 'unknown' });
    }
    // session/status is shown, never used to decide delivery; unknown notifications are ignored.
  }

  #observe(fact: ConnectorHostFact): void {
    const session = this.#session;
    if (session === undefined) return;
    this.#facts = this.#facts.then(async () => await session.observe(fact)).catch(() => undefined);
  }

  #request(method: string, params: object, settle: Pending['settle']): boolean {
    if (this.#state === 'closed') return false;
    const id = this.#nextId;
    this.#nextId += 1;
    this.#pending.set(id, { settle });
    if (this.#peer.send({ jsonrpc: '2.0', id, method, params })) return true;
    this.#pending.delete(id);
    return false;
  }

  #refuse(id: string | number, reason: string): void {
    this.#error(id, PUBLIC_ERROR.refused, `BuildFrame refused this integration: ${reason}`, { reason });
    this.#state = 'closed';
    this.#end();
  }

  #error(id: string | number | null, code: number, message: string, data?: object): void {
    this.#peer.send({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });
  }
}
