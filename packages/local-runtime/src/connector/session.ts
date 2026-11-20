import path from 'node:path';

import type {
  CommittedHarnessDirective,
  HarnessAvailability,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';

import { harnessBridgeEvidenceIdentity } from '../protocol.js';
import { runAttachLoop, type AttachLoop, type ConnectRuntime } from './attachLoop.js';
import type {
  ConnectorDispatchDirective,
  ConnectorHost,
  ConnectorHostFact,
  ConnectorScheduler,
  ConnectorSession,
  ConnectorStatus,
  ConnectorTurn,
  ConnectorTurnRelease,
  OpenConnectorSessionOptions,
} from './contracts.js';
import { EvidenceOutbox } from './evidenceOutbox.js';
import { ConnectorIdentities, exactReviewMessageText, responseResult } from './turnEvidence.js';

const DEFAULT_MAXIMUM_TEXT_BYTES = 768 * 1024;
const DEFAULT_PENDING_SUBMIT_TIMEOUT_MS = 10_000;

type PendingAnswer = 'taken' | 'refused' | 'withdrawn' | 'unknown';

interface TrackedTurn extends ConnectorTurn {
  phase: ConnectorTurn['phase'];
  turnId: string | undefined;
  startApplied: boolean;
  prepared: boolean;
  timer: unknown;
  answer: ((answer: PendingAnswer) => void) | undefined;
}

export const realTimers: ConnectorScheduler = {
  set: (delayMilliseconds, callback) => {
    const timer = setTimeout(callback, delayMilliseconds);
    (timer as { unref?: () => void }).unref?.();
    return timer;
  },
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * One connected harness session. The host reports native facts; this module
 * alone decides correlation, conservatively: an outcome belongs to a Send only
 * when its own turn started, nothing else entered before that start or joined
 * the turn, and no other turn began. Anything else is reported unknown.
 */
class OpenConnectorSession implements ConnectorSession {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  readonly #host: ConnectorHost;
  readonly #scheduler: ConnectorScheduler;
  readonly #ids: ConnectorIdentities;
  readonly #outbox = new EvidenceOutbox();
  readonly #maximumTextBytes: number;
  readonly #pendingTimeoutMs: number;
  readonly #connect: ConnectRuntime;
  #turn: TrackedTurn | undefined;
  #hostRunning = false;
  #foreignPending = false;
  #ended = false;
  #reportedAvailability: string;
  #facts: Promise<void> = Promise.resolve();
  #controller: AbortController | undefined;
  #loop: AttachLoop | undefined;

  constructor(options: OpenConnectorSessionOptions, connect: ConnectRuntime) {
    this.manifest = options.manifest;
    this.#host = options.host;
    this.#scheduler = options.scheduler ?? realTimers;
    this.#maximumTextBytes = options.maximumTextBytes ?? DEFAULT_MAXIMUM_TEXT_BYTES;
    this.#pendingTimeoutMs = options.pendingSubmitTimeoutMs ?? DEFAULT_PENDING_SUBMIT_TIMEOUT_MS;
    this.#connect = connect;
    this.#ids = new ConnectorIdentities(
      options.naming,
      [options.workspaceIdentity, options.hostVersion, options.sessionIdentity],
      options.sessionEpoch,
    );
    const availability = this.#availability();
    this.#reportedAvailability = availabilityKey(availability);
    this.attachment = Object.freeze<ReviewedHarnessAttachment>({
      evidenceIdentity: this.#ids.attachmentEvidenceIdentity,
      attachmentIdentity: this.#ids.attachmentIdentity,
      workspaceIdentity: options.workspaceIdentity,
      hostVersion: options.hostVersion,
      destination: {
        harnessLabel: options.manifest.adapterDisplayName,
        sessionLabel: options.sessionLabel,
        // basename: the checkout is `C:\...\repo` on Windows.
        repositoryLabel: path.basename(options.canonicalCheckout) || 'workspace',
        canonicalCheckout: options.canonicalCheckout,
      },
      availability,
    });
  }

  get turn(): ConnectorTurn | undefined {
    return this.#turn;
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.#outbox.connect(sink);
    return Object.freeze({
      perform: async (directive: CommittedHarnessDirective) => await this.#perform(directive),
    });
  }

  attach(onStatus?: (status: ConnectorStatus) => void): Promise<ConnectorStatus> {
    if (this.#loop === undefined) {
      this.#controller = new AbortController();
      this.#loop = runAttachLoop({
        connect: this.#connect,
        target: { adapter: this, workspaceIdentity: this.attachment.workspaceIdentity, ...this.#runtimeHooks() },
        signal: this.#controller.signal,
        scheduler: this.#scheduler,
        onStatus,
      });
    }
    return this.#loop.first;
  }

  async close(): Promise<void> {
    const loop = this.#loop;
    if (loop === undefined) return;
    this.#controller?.abort();
    await loop.connection()?.dispose();
    await loop.done;
  }

  observe(fact: ConnectorHostFact): Promise<void> {
    return this.#serial(async () => await this.#apply(fact));
  }

  /** Facts and timer decisions run one at a time, in the order they arrive. */
  #serial(step: () => Promise<void>): Promise<void> {
    this.#facts = this.#facts.then(step).catch(() => undefined);
    return this.#facts;
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.#outbox.flush();
    await this.#emitAvailability(this.#availability(), `runtime-connected:${runtimeGeneration}`);
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    const occurrence = this.#ids.nextBridgeLossOccurrence();
    const attachmentIdentity = this.attachment.attachmentIdentity;
    await this.#outbox.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: harnessBridgeEvidenceIdentity(runtimeGeneration, attachmentIdentity, occurrence),
      attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    const turn = this.#turn;
    if (turn === undefined) return;
    if (turn.phase === 'submitting') {
      this.#abandonPending(turn);
      return;
    }
    // The user's session keeps running; only BuildFrame's correlation ends.
    this.#finish(turn, 'lost');
    await this.#outbox.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: harnessBridgeEvidenceIdentity(
        runtimeGeneration,
        attachmentIdentity,
        occurrence,
        turn.invocationIdentity,
      ),
      attachmentIdentity,
      invocationIdentity: turn.invocationIdentity,
      reason: 'attachment-lost',
    });
  }

  #runtimeHooks(): Pick<ConnectorSession, 'runtimeConnected' | 'runtimeDisconnected'> {
    return {
      runtimeConnected: async generation => await this.runtimeConnected(generation),
      runtimeDisconnected: async generation => await this.runtimeDisconnected(generation),
    };
  }

  async #perform(directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> {
    if (directive.attachmentIdentity !== this.attachment.attachmentIdentity) {
      throw new TypeError(`${this.manifest.adapterDisplayName} Adapter received another Attachment occurrence`);
    }
    if (directive.kind === 'harness.direct-invocation.interrupt') {
      const turn = this.#turn;
      if (turn === undefined || turn.invocationIdentity !== directive.invocationIdentity) {
        throw new Error(`${this.manifest.adapterDisplayName} Adapter lost the Invocation interruption correlation`);
      }
      await this.#host.interrupt(turn);
      return { status: 'accepted-for-observation' };
    }

    const refuse = this.#ids.notDispatched.bind(this.#ids, directive);
    if (directive.kind !== 'harness.direct-review-message.dispatch' && this.#host.render === undefined) {
      return refuse('capability-withdrawn');
    }
    if (!this.manifest.reviewedHostVersions.includes(this.attachment.hostVersion)) {
      return refuse('capability-withdrawn');
    }
    if (this.#ended) return refuse('host-unavailable');
    let busy: boolean;
    try {
      busy = this.#turn !== undefined || this.#hostBusy();
    } catch {
      return refuse('capability-withdrawn');
    }
    if (busy) return refuse('harness-rejected');

    const dispatchId = this.#ids.dispatchId(directive);
    let text: string;
    try {
      text =
        directive.kind === 'harness.direct-review-message.dispatch'
          ? exactReviewMessageText(directive)
          : this.#host.render!(directive, dispatchId);
    } catch {
      return refuse('capability-withdrawn');
    }
    if (Buffer.byteLength(text, 'utf8') > this.#maximumTextBytes) return refuse('capability-withdrawn');

    const turn: TrackedTurn = {
      dispatchId,
      invocationIdentity: directive.invocationIdentity,
      directive,
      text,
      phase: 'submitted',
      turnId: undefined,
      startApplied: false,
      prepared: false,
      timer: undefined,
      answer: undefined,
    };
    try {
      if (this.#host.prepare?.(turn) === false) return refuse('capability-withdrawn');
    } catch {
      return refuse('capability-withdrawn');
    }
    turn.prepared = true;
    // Native events raised inside submit must already see this turn.
    this.#turn = turn;
    this.#armNoStart(turn);
    let receipt: ReturnType<ConnectorHost['submit']>;
    try {
      receipt = this.#host.submit(turn);
    } catch {
      receipt = 'harness-rejected';
    }
    if (receipt === 'taken') return { status: 'accepted-for-observation' };
    if (receipt !== 'pending') {
      this.#finish(turn, 'refused');
      return refuse(receipt);
    }
    return await this.#awaitPending(turn, refuse);
  }

  async #awaitPending(
    turn: TrackedTurn,
    refuse: (reason: 'harness-rejected' | 'host-unavailable') => HarnessDirectiveObservation,
  ): Promise<HarnessDirectiveObservation> {
    this.#clearTimer(turn);
    turn.phase = 'submitting';
    const answered = new Promise<PendingAnswer>(resolve => {
      turn.answer = answer => {
        if (turn.answer === undefined) return;
        turn.answer = undefined;
        this.#clearTimer(turn);
        resolve(answer);
      };
    });
    turn.timer = this.#scheduler.set(this.#pendingTimeoutMs, () => this.#abandonPending(turn));
    const answer = await answered;
    if (answer === 'taken') return { status: 'accepted-for-observation' };
    this.#finish(turn, 'refused');
    if (answer === 'unknown') {
      // The host may have taken it. Report the loss once this observation has
      // left, so the Invocation exists before its evidence arrives.
      this.#scheduler.set(0, () => {
        void this.#emitLost(turn, 'correlation-lost').catch(() => undefined);
      });
      return { status: 'accepted-for-observation' };
    }
    return refuse(answer === 'refused' ? 'harness-rejected' : 'host-unavailable');
  }

  /** Settles an unanswered pending submit: proven untaken, or taken with an unknown result. */
  #abandonPending(turn: TrackedTurn): void {
    if (turn.phase !== 'submitting' || turn.answer === undefined) return;
    let withdrawn = false;
    try {
      withdrawn = this.#host.withdraw?.(turn) === true;
    } catch {
      withdrawn = false;
    }
    turn.answer(withdrawn ? 'withdrawn' : 'unknown');
  }

  async #apply(fact: ConnectorHostFact): Promise<void> {
    if (this.#ended) return;
    const turn = this.#turn;
    switch (fact.type) {
      case 'own-input-taken':
        if (turn?.phase === 'submitting' && turn.answer !== undefined) {
          turn.answer('taken');
          turn.phase = 'submitted';
          this.#armNoStart(turn);
        }
        break;
      case 'own-input-refused':
        if (turn?.phase === 'submitting') turn.answer?.('refused');
        break;
      case 'own-input-unknown':
        if (turn?.phase === 'submitting') turn.answer?.('unknown');
        else if (turn !== undefined) await this.#lose(turn, 'correlation-lost');
        break;
      case 'own-input-dropped':
        if (turn?.phase === 'submitted') await this.#reject(turn, 'dropped');
        else if (turn?.phase === 'started') await this.#lose(turn, 'correlation-lost');
        break;
      case 'input':
        if (fact.joins === 'next-turn') this.#foreignPending = true;
        if (turn?.phase === 'submitted' || (turn?.phase === 'started' && fact.joins === 'this-turn')) {
          await this.#lose(turn, 'correlation-lost');
        }
        break;
      case 'turn-started':
        this.#hostRunning = true;
        this.#foreignPending = false;
        if (turn?.phase === 'submitted' && fact.own) await this.#start(turn, fact.turnId);
        else if (turn?.phase === 'submitted' || turn?.phase === 'started') await this.#lose(turn, 'correlation-lost');
        break;
      case 'turn-ended':
        this.#hostRunning = false;
        if (turn?.phase === 'started') {
          const sameTurn = turn.turnId === undefined || fact.turnId === undefined || turn.turnId === fact.turnId;
          if (sameTurn && fact.outcome !== 'unknown' && turn.startApplied) {
            await this.#settle(turn, fact.outcome, fact.answer);
          } else {
            await this.#lose(turn, 'terminal-evidence-lost');
          }
        } else if (turn?.phase === 'submitted') {
          await this.#lose(turn, 'correlation-lost');
        }
        break;
      case 'session-ending':
        await this.#endSession();
        return;
    }
    await this.#reportAvailability();
  }

  async #endSession(): Promise<void> {
    this.#ended = true;
    await this.#emitAvailability({ status: 'blocked', reason: 'host-unavailable' }, 'session-ending');
    const turn = this.#turn;
    if (turn === undefined) return;
    if (turn.phase === 'submitting') {
      this.#abandonPending(turn);
      return;
    }
    this.#finish(turn, 'ended');
    await this.#outbox.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: this.#ids.turnEvidence(turn.directive, turn.dispatchId, 'session-replaced'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: turn.invocationIdentity,
      reason: 'attachment-lost',
    });
  }

  #armNoStart(turn: TrackedTurn): void {
    this.#clearTimer(turn);
    turn.timer = this.#scheduler.set(turn.directive.capabilitySnapshot.capability.noStartTimeoutMs, () => {
      void this.#serial(async () => await this.#noStart(turn));
    });
  }

  #clearTimer(turn: TrackedTurn): void {
    if (turn.timer === undefined) return;
    this.#scheduler.clear(turn.timer);
    turn.timer = undefined;
  }

  /** No start in time: a proven rejection only when the host says it is idle; otherwise unknown. */
  async #noStart(turn: TrackedTurn): Promise<void> {
    if (this.#turn !== turn || turn.phase !== 'submitted') return;
    let idle = false;
    try {
      idle = this.#host.isIdle?.() === true;
    } catch {
      idle = false;
    }
    if (idle) await this.#reject(turn, 'no-start');
    else await this.#lose(turn, 'correlation-lost');
  }

  async #start(turn: TrackedTurn, turnId: string | undefined): Promise<void> {
    this.#clearTimer(turn);
    turn.phase = 'started';
    turn.turnId = turnId;
    const acknowledgement = await this.#emitTurn(turn, 'start', { kind: 'harness.invocation.start-observed' });
    turn.startApplied = acknowledgement?.status === 'applied';
  }

  async #settle(
    turn: TrackedTurn,
    outcome: 'ended-normally' | 'failed' | 'interrupted',
    answer: string | undefined,
  ): Promise<void> {
    const result = outcome === 'ended-normally' ? responseResult(turn.directive, answer) : undefined;
    await this.#emitTurn(turn, 'terminal', {
      kind: 'harness.invocation.terminal-observed',
      outcome,
      ...(result === undefined ? {} : { result }),
      ...(outcome === 'failed' ? { reason: 'harness-failed' } : {}),
      ...(outcome === 'interrupted' ? { reason: 'interruption-observed' } : {}),
    });
    this.#finish(turn, 'settled');
  }

  async #reject(turn: TrackedTurn, phase: string): Promise<void> {
    this.#finish(turn, 'rejected');
    await this.#emitTurn(turn, phase, { kind: 'harness.invocation.rejected', reason: 'harness-rejected' });
  }

  async #lose(turn: TrackedTurn, reason: 'correlation-lost' | 'terminal-evidence-lost'): Promise<void> {
    if (this.#turn !== turn) return;
    this.#finish(turn, 'lost');
    await this.#emitLost(turn, reason);
  }

  async #emitLost(turn: TrackedTurn, reason: 'correlation-lost' | 'terminal-evidence-lost'): Promise<void> {
    await this.#emitTurn(turn, reason, { kind: 'harness.invocation.correlation-lost', reason });
  }

  /** Stops tracking a turn exactly once, releasing anything the host prepared for it. */
  #finish(turn: TrackedTurn, how: ConnectorTurnRelease): void {
    if (this.#turn !== turn) return;
    this.#clearTimer(turn);
    this.#turn = undefined;
    if (!turn.prepared) return;
    turn.prepared = false;
    try {
      this.#host.release?.(turn, how);
    } catch {
      // A failed release never changes what is reported.
    }
  }

  async #emitTurn(
    turn: TrackedTurn,
    phase: string,
    evidence: DistributiveOmit<
      Exclude<NormalizedHarnessEvidence, { readonly kind: 'harness.availability.observed' }>,
      'evidenceIdentity' | 'attachmentIdentity' | 'invocationIdentity'
    >,
  ): Promise<HarnessEvidenceAcknowledgement | undefined> {
    return await this.#outbox.emit({
      ...evidence,
      evidenceIdentity: this.#ids.turnEvidence(turn.directive, turn.dispatchId, phase),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: turn.invocationIdentity,
    } as NormalizedHarnessEvidence);
  }

  #hostBusy(): boolean {
    if (this.#hostRunning || this.#foreignPending) return true;
    return this.#host.isIdle !== undefined && !this.#host.isIdle();
  }

  #availability(): HarnessAvailability {
    if (this.#ended) return { status: 'blocked', reason: 'host-unavailable' };
    let busy: boolean;
    try {
      busy = this.#turn !== undefined || this.#hostBusy();
    } catch {
      busy = true;
    }
    return busy ? { status: 'blocked', reason: 'busy' } : { status: 'available' };
  }

  async #reportAvailability(): Promise<void> {
    const availability = this.#availability();
    const key = availabilityKey(availability);
    if (key === this.#reportedAvailability) return;
    this.#reportedAvailability = key;
    await this.#emitAvailability(availability, `native-${key}`);
  }

  async #emitAvailability(availability: HarnessAvailability, phase: string): Promise<void> {
    await this.#outbox.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: this.#ids.availability(phase),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability,
    });
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function availabilityKey(availability: HarnessAvailability): string {
  return availability.status === 'blocked' ? availability.reason : availability.status;
}

export function createConnectorSession(
  options: OpenConnectorSessionOptions,
  connect: ConnectRuntime,
): ConnectorSession {
  return new OpenConnectorSession(options, connect);
}

export type { ConnectorDispatchDirective };
