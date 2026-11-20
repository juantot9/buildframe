import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  HarnessEvidenceSink,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import {
  openConnectorSession,
  type ConnectorHostFact,
  type ConnectorScheduler,
  type ConnectorSession,
} from '@buildframe/local-runtime/harness-adapter';

import { CodexRpcError, type CodexNotification } from './appServerClient.js';
import { createCodexCapabilityManifest, RESULT_MAXIMUM_BYTES } from './capability.js';

const MAX_PROMPT_BYTES = 768 * 1024;
/** An idle thread starts a queued Message at once; leave room for a slow server. */
const ADMISSION_TIMEOUT_MS = 10_000;

/** What the adapter asks of Codex's app-server; `CodexAppServerClient` provides it. */
export interface CodexServerPort {
  request(method: string, params?: unknown): Promise<unknown>;
}

export interface CreateCodexAdapterRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  /** Codex's thread ID (`CODEX_THREAD_ID`). */
  readonly threadId: string;
  readonly sessionEpoch: string;
  readonly server: CodexServerPort;
  /** Whether the thread was idle when the helper subscribed. */
  readonly idle: boolean;
  readonly scheduler?: ConnectorScheduler;
}

interface OwnMessage {
  readonly id: string;
  readonly text: string;
  taken: boolean;
  turnId: string | undefined;
  answer: string | undefined;
}

const OUTCOME = {
  completed: 'ended-normally',
  failed: 'failed',
  interrupted: 'interrupted',
} as const;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function userText(item: Record<string, unknown>): string {
  const content = Array.isArray(item.content) ? item.content : [];
  return content.map(part => text(record(part).text) ?? '').join('');
}

/**
 * One connected Codex thread. Codex names the turn on every event and echoes
 * BuildFrame's `clientUserMessageId` on its user message, so correlation is
 * by ID: a user message with another client ID on BuildFrame's turn is input
 * that joined it, and every other turn is someone else's.
 */
export class CodexReviewedAdapter implements ReviewedHarnessAdapter {
  readonly session: ConnectorSession;
  readonly #threadId: string;
  readonly #server: CodexServerPort;
  #idle: boolean;
  /** Turns already reported to the kit as started, ours or not. */
  readonly #announced = new Set<string>();
  #own: OwnMessage | undefined;

  constructor(request: CreateCodexAdapterRequest) {
    this.#threadId = request.threadId;
    this.#server = request.server;
    this.#idle = request.idle;
    this.session = openConnectorSession({
      manifest: createCodexCapabilityManifest(request.hostVersion),
      workspaceIdentity: request.workspaceIdentity,
      canonicalCheckout: request.canonicalCheckout,
      hostVersion: request.hostVersion,
      sessionIdentity: request.threadId,
      sessionEpoch: request.sessionEpoch,
      sessionLabel: `Codex session ${request.threadId.slice(-8)}`,
      naming: {
        attachmentSeed: 'codex-attachment-v1',
        attachmentEvidence: 'codex-attachment',
        namespace: 'codex',
        turnPrefix: 'cdx',
      },
      maximumTextBytes: MAX_PROMPT_BYTES,
      pendingSubmitTimeoutMs: ADMISSION_TIMEOUT_MS,
      ...(request.scheduler === undefined ? {} : { scheduler: request.scheduler }),
      host: {
        isIdle: () => this.#idle,
        submit: turn => {
          const own: OwnMessage = {
            id: turn.dispatchId,
            text: turn.text,
            taken: false,
            turnId: undefined,
            answer: undefined,
          };
          this.#own = own;
          void this.#enqueue(own);
          return 'pending';
        },
        interrupt: async turn => {
          if (turn.turnId === undefined) throw new Error('Codex turn is not known yet');
          await this.#server.request('turn/interrupt', { threadId: this.#threadId, turnId: turn.turnId });
        },
        release: () => {
          this.#own = undefined;
        },
      },
    });
  }

  get manifest(): ReviewedHarnessAdapter['manifest'] {
    return this.session.manifest;
  }

  get attachment(): ReviewedHarnessAdapter['attachment'] {
    return this.session.attachment;
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    return this.session.connect(sink);
  }

  /** Applies one app-server notification, in the order Codex sent them. */
  async observe(notification: CodexNotification): Promise<void> {
    const params = record(notification.params);
    if (params.threadId !== this.#threadId) return;
    const own = this.#own;
    switch (notification.method) {
      case 'thread/status/changed':
        this.#idle = record(params.status).type === 'idle';
        return;
      case 'turn/started':
        this.#idle = false;
        return;
      case 'item/started':
      case 'item/completed': {
        const turnId = text(params.turnId);
        const item = record(params.item);
        if (turnId === undefined) return;
        if (item.type === 'userMessage') {
          const clientId = text(item.clientId);
          if (own !== undefined && clientId === own.id) {
            await this.#ownMessage(own, turnId, userText(item));
            return;
          }
          // Someone else's words: joining BuildFrame's turn spoils it; otherwise they start their own.
          if (own?.turnId === turnId) await this.#fact({ type: 'input', joins: 'this-turn' });
          else await this.#announce(turnId);
          return;
        }
        if (own?.turnId === turnId) {
          if (item.type === 'agentMessage' && notification.method === 'item/completed') own.answer = text(item.text);
          return;
        }
        // A turn that starts with something other than a user message (a `!` command) is not ours.
        await this.#announce(turnId);
        return;
      }
      case 'turn/completed': {
        this.#idle = true;
        const turn = record(params.turn);
        const turnId = text(turn.id);
        if (turnId === undefined || !this.#announced.delete(turnId)) return;
        const status = text(turn.status);
        if (own?.turnId !== turnId) {
          await this.#fact({ type: 'turn-ended', outcome: 'unknown', turnId });
          return;
        }
        const outcome =
          status === 'completed' || status === 'failed' || status === 'interrupted' ? OUTCOME[status] : 'unknown';
        const answer = outcome === 'ended-normally' ? own.answer : undefined;
        await this.#fact({
          type: 'turn-ended',
          outcome,
          turnId,
          ...(answer !== undefined && answer.length > 0 && Buffer.byteLength(answer, 'utf8') <= RESULT_MAXIMUM_BYTES
            ? { answer }
            : {}),
        });
        return;
      }
    }
  }

  /** The connection to Codex dropped: whatever was in flight can no longer be followed. */
  async connectionLost(): Promise<void> {
    const own = this.#own;
    if (own === undefined) return;
    if (!own.taken) await this.#fact({ type: 'own-input-unknown' });
    else
      await this.#fact({
        type: 'turn-ended',
        outcome: 'unknown',
        ...(own.turnId === undefined ? {} : { turnId: own.turnId }),
      });
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeConnected(runtimeGeneration);
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeDisconnected(runtimeGeneration);
  }

  async sessionEnding(): Promise<void> {
    await this.session.observe({ type: 'session-ending' });
  }

  async #enqueue(own: OwnMessage): Promise<void> {
    try {
      await this.#server.request('thread/queue/add', {
        threadId: this.#threadId,
        input: [{ type: 'text', text: own.text, text_elements: [] }],
        clientUserMessageId: own.id,
      });
    } catch (error) {
      // Refused means never queued; a lost answer leaves it unknown, and it is never resent.
      if (this.#own === own && !own.taken) {
        own.taken = true;
        await this.#fact(
          error instanceof CodexRpcError ? { type: 'own-input-refused' } : { type: 'own-input-unknown' },
        );
      }
      return;
    }
    // An idle thread starts it at once; after an interrupt Codex's queue waits for a start.
    await this.#server.request('thread/queue/start', { threadId: this.#threadId }).catch(() => undefined);
  }

  async #ownMessage(own: OwnMessage, turnId: string, admitted: string): Promise<void> {
    if (own.turnId !== undefined) return;
    if (admitted !== own.text) {
      own.taken = true;
      await this.#fact({ type: 'own-input-unknown' });
      return;
    }
    if (!own.taken) {
      own.taken = true;
      await this.#fact({ type: 'own-input-taken' });
    }
    own.turnId = turnId;
    this.#announced.add(turnId);
    await this.#fact({ type: 'turn-started', own: true, turnId });
  }

  async #announce(turnId: string): Promise<void> {
    if (this.#announced.has(turnId)) return;
    this.#announced.add(turnId);
    await this.#fact({ type: 'turn-started', own: false, turnId });
  }

  async #fact(fact: ConnectorHostFact): Promise<void> {
    await this.session.observe(fact);
  }
}
