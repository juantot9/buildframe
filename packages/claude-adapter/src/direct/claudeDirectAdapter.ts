import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  HarnessEvidenceSink,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import {
  exactReviewMessageText,
  connectorSessionLabel,
  openConnectorSession,
  type ConnectorHostFact,
  type ConnectorScheduler,
  type ConnectorSession,
} from '@buildframe/local-runtime/harness-adapter';

import { createClaudeDirectCapabilityManifest } from './capability.js';
import type { ClaudeModCommand, ClaudeModFact, ClaudeTurnCompleteReason } from './modProtocol.js';

export const MAX_CLAUDE_DIRECT_PROMPT_BYTES: number = 768 * 1024;
/** How long a taken submit command may stay unconfirmed before its outcome is unknown. */
export const CLAUDE_MOD_ANSWER_TIMEOUT_MS = 10_000;

/** The Mod side of the helper, as the Adapter sees it. */
export interface ClaudeModChannel {
  /** Queues one command for the Mod; false when no Mod is polling. */
  deliver(command: ClaudeModCommand): boolean;
  /** Removes a submit the Mod has not taken yet; true only when it is proven untaken. */
  withdraw(dispatchId: string): boolean;
}

export type ClaudeAdapterScheduler = ConnectorScheduler;

export interface CreateClaudeDirectAdapterRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  readonly sessionIdentity: string;
  readonly sessionEpoch: string;
  readonly channel: ClaudeModChannel;
  readonly scheduler?: ClaudeAdapterScheduler;
}

/** Decodes the exact committed Review Message bytes, refusing any material that does not round-trip. */
export const exactClaudeReviewMessageText: typeof exactReviewMessageText = exactReviewMessageText;

const TERMINAL_OUTCOME: Readonly<Record<ClaudeTurnCompleteReason, 'ended-normally' | 'failed' | 'interrupted'>> = {
  answer: 'ended-normally',
  aborted: 'interrupted',
  refusal: 'failed',
  error: 'failed',
};

/**
 * One explicitly attached Claude Code conversation. The Mod reports native
 * facts; this glue translates them for the connector kit, which decides
 * correlation. Claude's two-step submit (the Mod takes the command, then
 * calls submit) answers the kit's pending receipt.
 */
export class ClaudeDirectAdapter implements ReviewedHarnessAdapter {
  readonly session: ConnectorSession;
  readonly #channel: ClaudeModChannel;

  constructor(request: CreateClaudeDirectAdapterRequest) {
    this.#channel = request.channel;
    this.session = openConnectorSession({
      manifest: createClaudeDirectCapabilityManifest(request.hostVersion),
      workspaceIdentity: request.workspaceIdentity,
      canonicalCheckout: request.canonicalCheckout,
      hostVersion: request.hostVersion,
      sessionIdentity: request.sessionIdentity,
      sessionEpoch: request.sessionEpoch,
      sessionLabel: connectorSessionLabel(undefined, request.sessionIdentity.slice(0, 8)),
      naming: {
        attachmentSeed: 'claude-direct-attachment-v1',
        attachmentEvidence: 'claude-direct-attachment',
        namespace: 'claude',
        turnPrefix: 'cdd',
      },
      maximumTextBytes: MAX_CLAUDE_DIRECT_PROMPT_BYTES,
      pendingSubmitTimeoutMs: CLAUDE_MOD_ANSWER_TIMEOUT_MS,
      ...(request.scheduler === undefined ? {} : { scheduler: request.scheduler }),
      host: {
        submit: turn =>
          this.#channel.deliver({ type: 'submit', dispatchId: turn.dispatchId, text: turn.text })
            ? 'pending'
            : 'host-unavailable',
        withdraw: turn => this.#channel.withdraw(turn.dispatchId),
        interrupt: turn => {
          if (turn.turnId === undefined) {
            throw new Error('Claude Adapter lost the Invocation interruption correlation');
          }
          if (!this.#channel.deliver({ type: 'abort', dispatchId: turn.dispatchId, turnId: turn.turnId })) {
            throw new Error('Claude abort request was unavailable');
          }
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

  /** Applies one ordered native fact from the Mod. */
  async observe(fact: ClaudeModFact): Promise<void> {
    const translated = this.#translate(fact);
    if (translated !== undefined) await this.session.observe(translated);
  }

  /** The Mod went away (session end, `/clear`, reload, or lost polling). */
  async detach(): Promise<void> {
    await this.session.observe({ type: 'session-ending' });
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeConnected(runtimeGeneration);
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeDisconnected(runtimeGeneration);
  }

  #translate(fact: ClaudeModFact): ConnectorHostFact | undefined {
    const turn = this.session.turn;
    const ours = 'dispatchId' in fact && turn?.dispatchId === fact.dispatchId;
    switch (fact.type) {
      case 'submit-refused':
        return ours ? { type: 'own-input-refused' } : undefined;
      case 'submit-called':
        return ours ? { type: 'own-input-taken' } : undefined;
      case 'submit-resolved':
        if (!ours) return undefined;
        if (!fact.entered) return { type: 'own-input-dropped' };
        // Claude skips this Mod's own hooks for events raised inside its call,
        // so the resolution may be the only start signal: a prompt submitted
        // while idle enters as the new turn.
        return turn?.phase === 'submitted' ? { type: 'turn-started', own: true } : undefined;
      case 'submit-threw':
        return ours && turn?.phase === 'submitted' ? { type: 'own-input-unknown' } : undefined;
      case 'foreign-prompt':
        return { type: 'input', joins: 'next-turn' };
      case 'turn-start':
        return { type: 'turn-started', own: fact.matchesPending, turnId: fact.turnId };
      case 'turn-complete':
        return {
          type: 'turn-ended',
          outcome: TERMINAL_OUTCOME[fact.reason],
          turnId: fact.turnId,
          ...(fact.answer === undefined ? {} : { answer: fact.answer }),
        };
      case 'abort-failed':
        // Interruption is a request; the turn's own end remains the evidence.
        return undefined;
      case 'session-ending':
        return { type: 'session-ending' };
    }
  }
}
