import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  HarnessEvidenceSink,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import {
  connectorSessionLabel,
  openConnectorSession,
  type ConnectorHostFact,
  type ConnectorScheduler,
  type ConnectorSession,
} from '@buildframe/local-runtime/harness-adapter';

import { createOpenCodeCapabilityManifest, RESULT_MAXIMUM_BYTES } from './capability.js';

const MAX_PROMPT_BYTES = 768 * 1024;
/** OpenCode answers a prompt once it is admitted; that is quick, but leave room for other plugins' hooks. */
const ADMISSION_TIMEOUT_MS = 10_000;

/** What the adapter needs from one OpenCode session. */
export interface OpenCodeNativeSession {
  /** `ctx.session.prompt` with BuildFrame's message ID; resolves with the admitted text. */
  prompt(input: { readonly id: string; readonly text: string }): Promise<{ readonly text: string }>;
  /** `ctx.session.interrupt`; resolves whether an execution was stopped. */
  interrupt(): Promise<boolean>;
}

/** One OpenCode event for this session, as `ctx.event.subscribe` delivers it. */
export interface OpenCodeEvent {
  readonly type: string;
  readonly data?: unknown;
}

export interface CreateOpenCodeAdapterRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  /** OpenCode's session ID. */
  readonly sessionIdentity: string;
  /** The session's title, when it has one. */
  readonly sessionName?: string | undefined;
  readonly sessionEpoch: string;
  readonly native: OpenCodeNativeSession;
  readonly scheduler?: ConnectorScheduler;
}

type Delivery = 'steer' | 'queue';

/** BuildFrame's own prompt while the kit tracks it. */
interface OwnPrompt {
  readonly id: string;
  readonly text: string;
  admitted: boolean;
  delivered: boolean;
  /** How the last step of BuildFrame's turn finished, and the message that step wrote. */
  lastFinish: string | undefined;
  lastMessage: string | undefined;
  readonly texts: Map<string, Map<number, string>>;
}

function field(data: unknown, name: string): unknown {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[name] : undefined;
}

function text(data: unknown, name: string): string | undefined {
  const value = field(data, name);
  return typeof value === 'string' ? value : undefined;
}

/**
 * One attached OpenCode session. OpenCode's events become facts for the
 * connector kit, which decides correlation. OpenCode-specific proof stays
 * here: BuildFrame's prompt carries BuildFrame's own message ID, and since
 * OpenCode reports outcomes per busy period, a held (queued) prompt delivered
 * after BuildFrame's final step is what ends BuildFrame's turn.
 */
export class OpenCodeReviewedAdapter implements ReviewedHarnessAdapter {
  readonly session: ConnectorSession;
  readonly #native: OpenCodeNativeSession;
  readonly #pending = new Set<string>();
  readonly #deliveries = new Map<string, Delivery>();
  #running = false;
  /** Whether the kit was told a turn started in this busy period. */
  #turnOpen = false;
  #own: OwnPrompt | undefined;

  constructor(request: CreateOpenCodeAdapterRequest) {
    this.#native = request.native;
    this.session = openConnectorSession({
      manifest: createOpenCodeCapabilityManifest(request.hostVersion),
      workspaceIdentity: request.workspaceIdentity,
      canonicalCheckout: request.canonicalCheckout,
      hostVersion: request.hostVersion,
      sessionIdentity: request.sessionIdentity,
      sessionEpoch: request.sessionEpoch,
      sessionLabel: connectorSessionLabel(request.sessionName, request.sessionIdentity.slice(-8)),
      naming: {
        attachmentSeed: 'opencode-attachment-v1',
        attachmentEvidence: 'opencode-attachment',
        namespace: 'opencode',
        // Dispatch IDs read `msg_<sha256>`: a valid OpenCode message ID, so the prompt carries it.
        turnPrefix: 'msg',
      },
      maximumTextBytes: MAX_PROMPT_BYTES,
      pendingSubmitTimeoutMs: ADMISSION_TIMEOUT_MS,
      ...(request.scheduler === undefined ? {} : { scheduler: request.scheduler }),
      host: {
        isIdle: () => !this.#running && this.#pending.size === 0,
        submit: turn => {
          const own: OwnPrompt = {
            id: turn.dispatchId,
            text: turn.text,
            admitted: false,
            delivered: false,
            lastFinish: undefined,
            lastMessage: undefined,
            texts: new Map(),
          };
          this.#own = own;
          this.#native.prompt({ id: own.id, text: own.text }).then(
            admitted => this.#admitted(own, admitted.text),
            () => this.#unknownAdmission(own),
          );
          return 'pending';
        },
        interrupt: async () => {
          if (!(await this.#native.interrupt())) throw new Error('OpenCode had nothing to interrupt');
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

  /** While BuildFrame's turn is in flight, prompts the user types wait for it to end. */
  get holdsPrompts(): boolean {
    return this.session.turn !== undefined;
  }

  /** Applies one of this session's events, in the order OpenCode published them. */
  async observe(event: OpenCodeEvent): Promise<void> {
    const data = event.data;
    const own = this.#own;
    switch (event.type) {
      case 'session.inbox.enqueued': {
        const id = text(data, 'inboxID');
        if (id === undefined) return;
        this.#pending.add(id);
        const item = field(data, 'item');
        if (id === own?.id) {
          await this.#admitted(own, text(field(item, 'payload'), 'text'));
          return;
        }
        const delivery: Delivery = text(item, 'delivery') === 'queue' ? 'queue' : 'steer';
        this.#deliveries.set(id, delivery);
        if (own !== undefined)
          await this.#fact({ type: 'input', joins: delivery === 'queue' ? 'next-turn' : 'this-turn' });
        return;
      }
      case 'session.inbox.cancelled': {
        const id = text(data, 'inboxID');
        if (id === undefined) return;
        this.#pending.delete(id);
        this.#deliveries.delete(id);
        if (id === own?.id && !own.delivered) await this.#fact({ type: 'own-input-dropped' });
        return;
      }
      case 'session.inbox.delivered': {
        const id = text(data, 'inboxID');
        if (id === undefined) return;
        this.#pending.delete(id);
        if (id === own?.id) {
          own.delivered = true;
          this.#turnOpen = true;
          await this.#fact({ type: 'turn-started', own: true, turnId: id });
          return;
        }
        // A held prompt is drained only once BuildFrame's last step has ended with `stop`: its turn is over.
        if (own?.delivered === true && own.lastFinish === 'stop' && this.#deliveries.get(id) === 'queue') {
          await this.#fact({ type: 'turn-ended', outcome: 'ended-normally', turnId: own.id, ...this.#answer(own) });
        }
        this.#deliveries.delete(id);
        this.#turnOpen = true;
        await this.#fact({ type: 'turn-started', own: false });
        return;
      }
      case 'session.text.ended': {
        const message = text(data, 'assistantMessageID');
        const ordinal = field(data, 'ordinal');
        const body = text(data, 'text');
        if (own?.delivered !== true || message === undefined || typeof ordinal !== 'number' || body === undefined)
          return;
        const parts = own.texts.get(message) ?? new Map<number, string>();
        parts.set(ordinal, body);
        own.texts.set(message, parts);
        return;
      }
      case 'session.step.ended':
      case 'session.step.failed':
        if (own?.delivered !== true) return;
        own.lastFinish = event.type === 'session.step.failed' ? 'error' : text(data, 'finish');
        own.lastMessage = text(data, 'assistantMessageID');
        return;
      case 'session.execution.started':
        this.#running = true;
        return;
      case 'session.execution.succeeded':
      case 'session.execution.failed':
      case 'session.execution.interrupted':
        this.#running = false;
        if (!this.#turnOpen) return;
        this.#turnOpen = false;
        await this.#ended(event.type, text(data, 'reason'));
        return;
    }
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

  async #ended(type: string, reason: string | undefined): Promise<void> {
    const own = this.#own;
    if (own?.delivered !== true) {
      await this.#fact({ type: 'turn-ended', outcome: 'unknown' });
      return;
    }
    if (type === 'session.execution.succeeded') {
      if (own.lastFinish === 'stop') {
        await this.#fact({ type: 'turn-ended', outcome: 'ended-normally', turnId: own.id, ...this.#answer(own) });
      } else {
        await this.#fact({ type: 'turn-ended', outcome: 'failed', turnId: own.id });
      }
      return;
    }
    if (type === 'session.execution.failed') {
      await this.#fact({ type: 'turn-ended', outcome: 'failed', turnId: own.id });
      return;
    }
    // A shutdown, a replacement or an idle timeout may resume elsewhere: only the user's stop is an interruption.
    await this.#fact({ type: 'turn-ended', outcome: reason === 'user' ? 'interrupted' : 'unknown', turnId: own.id });
  }

  #answer(own: OwnPrompt): { readonly answer?: string } {
    const parts = own.lastMessage === undefined ? undefined : own.texts.get(own.lastMessage);
    if (parts === undefined) return {};
    const body = [...parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, part]) => part)
      .join('');
    return body.length === 0 || Buffer.byteLength(body, 'utf8') > RESULT_MAXIMUM_BYTES ? {} : { answer: body };
  }

  /** OpenCode admitted BuildFrame's ID: taken when the admitted text is exactly what was sent. */
  async #admitted(own: OwnPrompt, admittedText: string | undefined): Promise<void> {
    if (this.#own !== own || own.admitted) return;
    own.admitted = true;
    // A reused ID returns the earlier admission even when the text differs.
    await this.#fact(admittedText === own.text ? { type: 'own-input-taken' } : { type: 'own-input-refused' });
  }

  async #unknownAdmission(own: OwnPrompt): Promise<void> {
    if (this.#own !== own || own.admitted) return;
    own.admitted = true;
    await this.#fact({ type: 'own-input-unknown' });
  }

  async #fact(fact: ConnectorHostFact): Promise<void> {
    await this.session.observe(fact);
  }
}
