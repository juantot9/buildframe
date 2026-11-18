import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  DispatchDirectReviewInvocationDirective,
  DispatchDirectReviewMessageInvocationDirective,
  HarnessInvocationIdentity,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
} from '@buildframe/workspace/harness-interaction';

import type { HarnessAdapterRuntimeDiagnostic } from '../harnessAdapter.js';

export type ConnectorDispatchDirective =
  | DispatchDirectReviewInvocationDirective
  | DispatchDirectReviewMessageInvocationDirective;

export interface ConnectorScheduler {
  set(delayMilliseconds: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

/** One BuildFrame Send while the kit tracks it, from submit until it settles. */
export interface ConnectorTurn {
  /** Stable per Invocation and session epoch; a host that names inputs up front can use it as their ID. */
  readonly dispatchId: string;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly directive: ConnectorDispatchDirective;
  /** Exactly what `submit` must put into the session. */
  readonly text: string;
  readonly phase: 'submitting' | 'submitted' | 'started';
  readonly turnId: string | undefined;
  /** Whether the Workspace applied this turn's start evidence. */
  readonly startApplied: boolean;
}

/**
 * What became of one submit, decided before `submit` returns. `pending`: the
 * host answers later with an `own-input-taken`, `own-input-refused` or
 * `own-input-unknown` fact, and must implement `withdraw`.
 */
export type ConnectorSubmitReceipt = 'taken' | 'pending' | 'harness-rejected' | 'host-unavailable';

/** Why the kit stopped tracking a turn. */
export type ConnectorTurnRelease = 'settled' | 'rejected' | 'lost' | 'refused' | 'ended';

/** The host port: everything the kit needs a native session to do. */
export interface ConnectorHost {
  /**
   * Puts `turn.text` into the session as one user input, unchanged, at most
   * once. Synchronous; throwing counts as `harness-rejected`. Native events it
   * raises while running see the turn as `submitted`.
   */
  submit(turn: ConnectorTurn): ConnectorSubmitReceipt;
  /** Takes back a `pending` submit; true only when it is proven never taken. */
  withdraw?(turn: ConnectorTurn): boolean;
  /** Stops the running turn; throws when the host cannot. */
  interrupt(turn: ConnectorTurn): void | Promise<void>;
  /** When present, decides busy and whether a no-start timeout proves a rejection. */
  isIdle?(): boolean;
  /** Text for directive kinds other than a Review Message; absent means Review Messages only. */
  render?(directive: DispatchDirectReviewInvocationDirective, dispatchId: string): string;
  /** Narrows the session before submit (Pi's read-only tools); false or throw refuses the Send. */
  prepare?(turn: ConnectorTurn): boolean;
  /** Called once when the kit stops tracking a prepared turn, before its loss evidence. */
  release?(turn: ConnectorTurn, how: ConnectorTurnRelease): void;
}

/** Native facts, in the order the host saw them. The kit alone decides correlation. */
export type ConnectorHostFact =
  | { readonly type: 'turn-started'; readonly own: boolean; readonly turnId?: string }
  | {
      readonly type: 'turn-ended';
      readonly outcome: 'ended-normally' | 'failed' | 'interrupted' | 'unknown';
      readonly turnId?: string;
      /** The final answer text, when the host can read it exactly. */
      readonly answer?: string;
    }
  /** Input BuildFrame did not send: joining the running turn, or waiting for the next one. */
  | { readonly type: 'input'; readonly joins: 'this-turn' | 'next-turn' }
  /** Answers to a `pending` submit. */
  | { readonly type: 'own-input-taken' }
  | { readonly type: 'own-input-refused' }
  /** Proof our submitted input never entered the session. */
  | { readonly type: 'own-input-dropped' }
  /** Our submitted input may or may not have entered. */
  | { readonly type: 'own-input-unknown' }
  | { readonly type: 'session-ending' };

export type ConnectorStatus =
  | { readonly kind: 'connected'; readonly first: boolean; readonly text: string }
  | {
      readonly kind: 'retrying';
      readonly first: boolean;
      readonly text: string;
      readonly cause: 'runtime-unavailable' | 'runtime-disconnected';
      /** Why the runtime is unavailable, e.g. `runtime unavailable`, for hosts that word their own line. */
      readonly label?: string;
      readonly diagnostic?: HarnessAdapterRuntimeDiagnostic;
    }
  | {
      readonly kind: 'refused';
      readonly first: boolean;
      readonly text: string;
      readonly label: string;
      readonly diagnostic: HarnessAdapterRuntimeDiagnostic;
    }
  /** Another session in this checkout connected; this one never reconnects. */
  | { readonly kind: 'replaced'; readonly first: boolean; readonly text: string }
  | { readonly kind: 'cancelled'; readonly first: boolean; readonly text: string };

/** Identity prefixes; each connector keeps its own so stored identities never collide. */
export interface ConnectorNaming {
  /** Seed of the attachment identity hash, e.g. `pi-attachment-v1`. */
  readonly attachmentSeed: string;
  /** Prefix of the attachment establishment evidence, e.g. `pi-attachment`. */
  readonly attachmentEvidence: string;
  /** Prefix of evidence, availability and dispatch identities, e.g. `pi`. */
  readonly namespace: string;
  /** Prefix of turn dispatch IDs, e.g. `pic`. */
  readonly turnPrefix: string;
}

export interface OpenConnectorSessionOptions {
  readonly manifest: ReviewedCapabilityManifest;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  readonly sessionIdentity: string;
  /** Fresh per `/buildframe`; makes each connection its own Attachment. */
  readonly sessionEpoch: string;
  readonly sessionLabel: string;
  readonly naming: ConnectorNaming;
  readonly host: ConnectorHost;
  readonly scheduler?: ConnectorScheduler;
  /** Defaults to 768 KiB. */
  readonly maximumTextBytes?: number;
  /** How long a `pending` submit may stay unanswered before it is withdrawn; defaults to 10 s. */
  readonly pendingSubmitTimeoutMs?: number;
}

/** One connected harness session: the reviewed Adapter plus its connection to BuildFrame. */
export interface ConnectorSession extends ReviewedHarnessAdapter {
  /** Starts keeping the session connected; resolves with the first status. Never throws. */
  attach(onStatus?: (status: ConnectorStatus) => void): Promise<ConnectorStatus>;
  /** Applies one native fact. Facts are applied in call order; never throws. */
  observe(fact: ConnectorHostFact): Promise<void>;
  /** The Send in flight, if any. */
  readonly turn: ConnectorTurn | undefined;
  /** Stops reconnecting and disconnects without session-ending evidence. */
  close(): Promise<void>;
  /** Driven by `attach`; public so a connector's tests can run without a runtime. */
  runtimeConnected(runtimeGeneration: string): Promise<void>;
  runtimeDisconnected(runtimeGeneration: string): Promise<void>;
}
