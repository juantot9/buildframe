import type { WorkspaceIdentity } from '@buildframe/workspace';
import { sha256, sha256Parts } from '@buildframe/workspace/sha256';
import type {
  CommittedHarnessDirective,
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessAvailability,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';

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

export interface ClaudeAdapterScheduler {
  set(delayMilliseconds: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

export interface CreateClaudeDirectAdapterRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  readonly sessionIdentity: string;
  readonly sessionEpoch: string;
  readonly channel: ClaudeModChannel;
  readonly scheduler?: ClaudeAdapterScheduler;
}

type ModAnswer = 'called' | 'refused' | 'withdrawn' | 'lost';

interface ActiveDispatch {
  readonly directive: DispatchDirectReviewMessageInvocationDirective;
  readonly dispatchId: string;
  phase: 'awaiting-mod' | 'submitted' | 'started';
  /** Native turn identity, once a matching `turn.start` names it. */
  turnId: string | undefined;
  timeoutHandle: unknown;
  answer: ((answer: ModAnswer) => void) | undefined;
}

function defaultScheduler(): ClaudeAdapterScheduler {
  return {
    set: (delayMilliseconds, callback) => {
      const timer = setTimeout(callback, delayMilliseconds);
      timer.unref();
      return timer;
    },
    clear: handle => clearTimeout(handle as NodeJS.Timeout),
  };
}

/** Decodes the exact committed Review Message bytes, refusing any material that does not round-trip. */
export function exactClaudeReviewMessageText(directive: DispatchDirectReviewMessageInvocationDirective): string {
  const material = directive.disclosure.outgoingMaterial;
  const bytes = Buffer.from(material.bytesBase64, 'base64');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (
    bytes.toString('base64') !== material.bytesBase64 ||
    bytes.byteLength !== material.byteLength ||
    [...text].length !== material.characterLength ||
    sha256(bytes) !== material.sha256 ||
    material.sha256 !== directive.disclosure.sha256
  ) {
    throw new TypeError('Invalid exact Review Message material');
  }
  return text;
}

function terminalOutcome(reason: ClaudeTurnCompleteReason): {
  readonly outcome: 'ended-normally' | 'failed' | 'interrupted';
  readonly reason?: 'harness-failed' | 'interruption-observed';
} {
  if (reason === 'answer') return { outcome: 'ended-normally' };
  if (reason === 'aborted') return { outcome: 'interrupted', reason: 'interruption-observed' };
  return { outcome: 'failed', reason: 'harness-failed' };
}

/** An empty or oversized answer settles the lifecycle without a Response, as Pi does. */
function responseText(
  answer: string | undefined,
  maximumBytes: number,
): { readonly body: string; readonly byteLength: number; readonly sha256: string } | undefined {
  if (answer === undefined || answer.length === 0) return undefined;
  const byteLength = Buffer.byteLength(answer, 'utf8');
  if (byteLength > maximumBytes) return undefined;
  return { body: answer, byteLength, sha256: sha256(answer) };
}

function bridgeEvidenceIdentity(
  runtimeGeneration: string,
  attachmentIdentity: HarnessAttachmentIdentity,
  occurrenceIdentity: string,
  invocationIdentity?: string,
): string {
  return invocationIdentity === undefined
    ? `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:disconnected`
    : `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:${invocationIdentity}:correlation-lost`;
}

/**
 * One explicitly attached Claude Code conversation. The Mod reports native
 * facts; this Adapter alone decides correlation, and decides it
 * conservatively: a Send owns the next turn only when Claude was idle, no other
 * prompt entered in between, and the turn began with the submitted text.
 */
export class ClaudeDirectAdapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedHarnessAdapter['manifest'];
  readonly attachment: ReviewedHarnessAttachment;
  readonly #channel: ClaudeModChannel;
  readonly #scheduler: ClaudeAdapterScheduler;
  readonly #sessionEpoch: string;
  readonly #pendingEvidence = new Map<string, NormalizedHarnessEvidence>();
  #sink: HarnessEvidenceSink | undefined;
  #active: ActiveDispatch | undefined;
  #turnRunning = false;
  #foreignPending = false;
  #ended = false;
  #reportedAvailability = 'available';
  #availabilitySequence = 0;
  #bridgeLossSequence = 0;
  #flushing = false;

  constructor(request: CreateClaudeDirectAdapterRequest) {
    this.manifest = createClaudeDirectCapabilityManifest(request.hostVersion);
    this.#channel = request.channel;
    this.#scheduler = request.scheduler ?? defaultScheduler();
    this.#sessionEpoch = request.sessionEpoch;
    const attachmentIdentity = `att_${sha256Parts([
      'claude-direct-attachment-v1',
      request.workspaceIdentity,
      request.hostVersion,
      request.sessionIdentity,
      request.sessionEpoch,
    ])}` as HarnessAttachmentIdentity;
    this.attachment = Object.freeze<ReviewedHarnessAttachment>({
      evidenceIdentity: `claude-direct-attachment:${sha256Parts([attachmentIdentity, request.sessionEpoch])}`,
      attachmentIdentity,
      workspaceIdentity: request.workspaceIdentity,
      hostVersion: request.hostVersion,
      destination: {
        harnessLabel: this.manifest.adapterDisplayName,
        sessionLabel: `Claude session ${request.sessionIdentity.slice(0, 8)}`,
        repositoryLabel: request.canonicalCheckout.split('/').filter(Boolean).at(-1) ?? 'workspace',
        canonicalCheckout: request.canonicalCheckout,
      },
      // The connect command runs only while Claude is idle.
      availability: { status: 'available' },
    });
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.#sink = sink;
    return Object.freeze({
      perform: async (directive: CommittedHarnessDirective) => await this.#perform(directive),
    });
  }

  /** Applies one ordered native fact from the Mod. */
  async observe(fact: ClaudeModFact): Promise<void> {
    if (this.#ended) return;
    const active = this.#active;
    switch (fact.type) {
      case 'submit-refused':
        if (active?.dispatchId === fact.dispatchId && active.phase === 'awaiting-mod') active.answer?.('refused');
        break;
      case 'submit-called':
        if (active?.dispatchId === fact.dispatchId && active.phase === 'awaiting-mod') {
          active.phase = 'submitted';
          // Answering clears the Mod-answer timer, so the start window is armed after it.
          active.answer?.('called');
          this.#armNoStart(active);
        }
        break;
      case 'submit-resolved':
        if (active?.dispatchId !== fact.dispatchId || active.phase === 'awaiting-mod') break;
        if (!fact.entered) {
          if (active.phase === 'submitted') await this.#reject(active);
          else await this.#loseCorrelation(active, 'correlation-lost');
        } else if (active.phase === 'submitted') {
          // Claude skips this Mod's own hooks for events raised inside its call,
          // so the resolution may be the only start signal: a prompt submitted
          // while idle enters as the new turn.
          await this.#start(active, undefined);
        }
        break;
      case 'submit-threw':
        if (active?.dispatchId === fact.dispatchId && active.phase === 'submitted') {
          await this.#loseCorrelation(active, 'correlation-lost');
        }
        break;
      case 'foreign-prompt':
        this.#foreignPending = true;
        if (active?.phase === 'submitted') await this.#loseCorrelation(active, 'correlation-lost');
        break;
      case 'turn-start':
        this.#turnRunning = true;
        this.#foreignPending = false;
        if (active?.phase === 'submitted') {
          if (fact.matchesPending) await this.#start(active, fact.turnId);
          else await this.#loseCorrelation(active, 'correlation-lost');
        } else if (active?.phase === 'started') {
          await this.#loseCorrelation(active, 'correlation-lost');
        }
        break;
      case 'turn-complete':
        this.#turnRunning = false;
        if (active?.phase === 'started' && (active.turnId === undefined || active.turnId === fact.turnId)) {
          await this.#settle(active, fact.reason, fact.answer);
        } else if (active?.phase === 'started') {
          await this.#loseCorrelation(active, 'terminal-evidence-lost');
        } else if (active?.phase === 'submitted') {
          // A turn this Adapter never saw start was still running at dispatch.
          await this.#loseCorrelation(active, 'correlation-lost');
        }
        break;
      case 'abort-failed':
        // Interruption is a request; the turn's own end remains the evidence.
        break;
      case 'session-ending':
        await this.detach();
        return;
    }
    await this.#reportAvailability();
  }

  /** The Mod went away (session end, `/clear`, reload, or lost polling). */
  async detach(): Promise<void> {
    if (this.#ended) return;
    this.#ended = true;
    await this.#emitAvailability({ status: 'blocked', reason: 'host-unavailable' }, 'session-ending');
    const active = this.#active;
    if (active === undefined) return;
    if (active.phase === 'awaiting-mod') {
      this.#answerUntaken(active);
      return;
    }
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: this.#evidenceIdentity(active, 'session-replaced'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason: 'attachment-lost',
    });
    this.#finishActive(active);
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.#flushEvidence();
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: this.#availabilityIdentity(`runtime-connected:${runtimeGeneration}`),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability: this.#availability(),
    });
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    this.#bridgeLossSequence += 1;
    const occurrenceIdentity = `client-${this.#bridgeLossSequence.toString(36)}`;
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: bridgeEvidenceIdentity(
        runtimeGeneration,
        this.attachment.attachmentIdentity,
        occurrenceIdentity,
      ),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    const active = this.#active;
    if (active === undefined) return;
    if (active.phase === 'awaiting-mod') {
      this.#answerUntaken(active);
      return;
    }
    // The user's conversation keeps running; only BuildFrame's correlation ends.
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: bridgeEvidenceIdentity(
        runtimeGeneration,
        this.attachment.attachmentIdentity,
        occurrenceIdentity,
        active.directive.invocationIdentity,
      ),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason: 'attachment-lost',
    });
    this.#finishActive(active);
  }

  async #perform(directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> {
    if (directive.attachmentIdentity !== this.attachment.attachmentIdentity) {
      throw new TypeError('Claude Adapter received another Attachment occurrence');
    }
    if (directive.kind === 'harness.direct-invocation.interrupt') {
      const active = this.#active;
      if (
        active === undefined ||
        active.directive.invocationIdentity !== directive.invocationIdentity ||
        active.turnId === undefined
      ) {
        throw new Error('Claude Adapter lost the Invocation interruption correlation');
      }
      if (!this.#channel.deliver({ type: 'abort', dispatchId: active.dispatchId, turnId: active.turnId })) {
        throw new Error('Claude abort request was unavailable');
      }
      return { status: 'accepted-for-observation' };
    }

    const rejection = (reason: 'harness-rejected' | 'host-unavailable' | 'capability-withdrawn') => ({
      status: 'proven-not-dispatched' as const,
      evidenceIdentity: `claude-dispatch:${sha256Parts([
        this.attachment.attachmentIdentity,
        directive.invocationIdentity,
        reason,
      ])}`,
      reason,
    });
    // This route carries exact Review Message text only.
    if (directive.kind !== 'harness.direct-review-message.dispatch') return rejection('capability-withdrawn');
    if (!this.manifest.reviewedHostVersions.includes(this.attachment.hostVersion)) {
      return rejection('capability-withdrawn');
    }
    if (this.#ended) return rejection('host-unavailable');
    if (this.#active !== undefined || this.#turnRunning || this.#foreignPending) return rejection('harness-rejected');

    let text: string;
    try {
      text = exactClaudeReviewMessageText(directive);
    } catch {
      return rejection('capability-withdrawn');
    }
    if (Buffer.byteLength(text, 'utf8') > MAX_CLAUDE_DIRECT_PROMPT_BYTES) return rejection('capability-withdrawn');

    const dispatchId = `cdd_${sha256Parts([
      this.attachment.attachmentIdentity,
      directive.invocationIdentity,
      this.#sessionEpoch,
    ])}`;
    const active: ActiveDispatch = {
      directive,
      dispatchId,
      phase: 'awaiting-mod',
      turnId: undefined,
      timeoutHandle: undefined,
      answer: undefined,
    };
    const answered = new Promise<ModAnswer>(resolve => {
      active.answer = answer => {
        if (active.answer === undefined) return;
        active.answer = undefined;
        this.#scheduler.clear(active.timeoutHandle);
        resolve(answer);
      };
    });
    this.#active = active;
    if (!this.#channel.deliver({ type: 'submit', dispatchId, text })) {
      this.#finishActive(active);
      return rejection('host-unavailable');
    }
    active.timeoutHandle = this.#scheduler.set(CLAUDE_MOD_ANSWER_TIMEOUT_MS, () => this.#answerUntaken(active));

    const answer = await answered;
    if (answer === 'called') return { status: 'accepted-for-observation' };
    this.#finishActive(active);
    if (answer === 'lost') {
      // The Mod took the command but its submission is unknown. Later facts
      // can no longer attach to it; report the loss after this observation
      // leaves, so the Invocation exists first.
      this.#scheduler.set(0, () => {
        void this.#emitLost(active, 'correlation-lost').catch(() => undefined);
      });
      return { status: 'accepted-for-observation' };
    }
    return rejection(answer === 'refused' ? 'harness-rejected' : 'host-unavailable');
  }

  /** Settles an unconfirmed submit: proven untaken, or taken with an unknown result. */
  #answerUntaken(active: ActiveDispatch): void {
    if (active.phase !== 'awaiting-mod' || active.answer === undefined) return;
    active.answer(this.#channel.withdraw(active.dispatchId) ? 'withdrawn' : 'lost');
  }

  #armNoStart(active: ActiveDispatch): void {
    active.timeoutHandle = this.#scheduler.set(active.directive.capabilitySnapshot.capability.noStartTimeoutMs, () => {
      // A scheduler callback has no Promise observer; contain every rejection.
      if (this.#active === active && active.phase === 'submitted') {
        void this.#loseCorrelation(active, 'correlation-lost').catch(() => undefined);
      }
    });
  }

  async #start(active: ActiveDispatch, turnId: string | undefined): Promise<void> {
    this.#scheduler.clear(active.timeoutHandle);
    active.phase = 'started';
    active.turnId = turnId;
    await this.#emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: this.#evidenceIdentity(active, 'start'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
    });
  }

  async #settle(active: ActiveDispatch, reason: ClaudeTurnCompleteReason, answer: string | undefined): Promise<void> {
    const terminal = terminalOutcome(reason);
    const resultContract = active.directive.capabilitySnapshot.capability.artifactResultContract;
    const result =
      terminal.outcome === 'ended-normally' ? responseText(answer, resultContract.maximumBytes) : undefined;
    await this.#emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: this.#evidenceIdentity(active, 'terminal'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      outcome: terminal.outcome,
      ...(result === undefined
        ? {}
        : {
            result: {
              contractVersion: 1,
              contractIdentity: resultContract.contractIdentity,
              source: resultContract.source,
              ...result,
            },
          }),
      ...(terminal.reason === undefined ? {} : { reason: terminal.reason }),
    });
    this.#finishActive(active);
  }

  async #reject(active: ActiveDispatch): Promise<void> {
    await this.#emit({
      kind: 'harness.invocation.rejected',
      evidenceIdentity: this.#evidenceIdentity(active, 'dropped'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason: 'harness-rejected',
    });
    this.#finishActive(active);
  }

  async #loseCorrelation(active: ActiveDispatch, reason: 'correlation-lost' | 'terminal-evidence-lost'): Promise<void> {
    if (this.#active !== active) return;
    this.#finishActive(active);
    await this.#emitLost(active, reason);
  }

  async #emitLost(active: ActiveDispatch, reason: 'correlation-lost' | 'terminal-evidence-lost'): Promise<void> {
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: this.#evidenceIdentity(active, reason),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason,
    });
  }

  #finishActive(active: ActiveDispatch): void {
    if (this.#active !== active) return;
    this.#scheduler.clear(active.timeoutHandle);
    this.#active = undefined;
  }

  #availability(): HarnessAvailability {
    if (this.#ended) return { status: 'blocked', reason: 'host-unavailable' };
    return this.#active !== undefined || this.#turnRunning || this.#foreignPending
      ? { status: 'blocked', reason: 'busy' }
      : { status: 'available' };
  }

  async #reportAvailability(): Promise<void> {
    const availability = this.#availability();
    const key = availability.status === 'blocked' ? availability.reason : availability.status;
    if (key === this.#reportedAvailability) return;
    this.#reportedAvailability = key;
    await this.#emitAvailability(availability, `native-${key}`);
  }

  #evidenceIdentity(active: ActiveDispatch, phase: string): string {
    return `claude-evidence:${sha256Parts([
      this.attachment.attachmentIdentity,
      active.directive.invocationIdentity,
      active.dispatchId,
      phase,
    ])}`;
  }

  async #emitAvailability(availability: HarnessAvailability, phase: string): Promise<void> {
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: this.#availabilityIdentity(phase),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability,
    });
  }

  #availabilityIdentity(phase: string): string {
    this.#availabilitySequence += 1;
    return `claude-availability:${sha256Parts([
      this.attachment.attachmentIdentity,
      this.#sessionEpoch,
      phase,
      this.#availabilitySequence.toString(36),
    ])}`;
  }

  async #emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement | undefined> {
    const sink = this.#sink;
    if (sink === undefined) {
      this.#queueEvidence(evidence);
      return undefined;
    }
    let acknowledgement: HarnessEvidenceAcknowledgement | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        acknowledgement = await sink.accept(evidence);
      } catch {
        this.#queueEvidence(evidence);
        return undefined;
      }
      if (acknowledgement.status !== 'refused' || acknowledgement.reason !== 'state-version-changed') break;
    }
    if (
      acknowledgement?.status === 'refused' &&
      (acknowledgement.reason === 'state-version-changed' || acknowledgement.reason === 'state-unavailable')
    ) {
      this.#queueEvidence(evidence);
    } else if (acknowledgement?.status === 'applied') {
      this.#pendingEvidence.delete(evidence.evidenceIdentity);
    }
    return acknowledgement;
  }

  #queueEvidence(evidence: NormalizedHarnessEvidence): void {
    if (evidence.kind === 'harness.availability.observed') {
      for (const [identity, pending] of this.#pendingEvidence) {
        if (pending.kind === 'harness.availability.observed') this.#pendingEvidence.delete(identity);
      }
    }
    if (this.#pendingEvidence.size >= 128) {
      const removable = [...this.#pendingEvidence].find(
        ([, pending]) => pending.kind === 'harness.availability.observed',
      );
      if (removable !== undefined) this.#pendingEvidence.delete(removable[0]);
      else if (evidence.kind === 'harness.availability.observed') return;
    }
    this.#pendingEvidence.set(evidence.evidenceIdentity, evidence);
  }

  async #flushEvidence(): Promise<void> {
    if (this.#flushing || this.#sink === undefined) return;
    this.#flushing = true;
    try {
      for (const evidence of [...this.#pendingEvidence.values()]) {
        if (this.#sink === undefined) return;
        let acknowledgement: HarnessEvidenceAcknowledgement;
        try {
          acknowledgement = await this.#sink.accept(evidence);
        } catch {
          return;
        }
        if (acknowledgement.status === 'applied') {
          this.#pendingEvidence.delete(evidence.evidenceIdentity);
        } else if (
          acknowledgement.reason !== 'state-version-changed' &&
          acknowledgement.reason !== 'state-unavailable'
        ) {
          this.#pendingEvidence.delete(evidence.evidenceIdentity);
        } else {
          return;
        }
      }
    } finally {
      this.#flushing = false;
    }
  }
}
