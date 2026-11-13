import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';

import {
  WORKSPACE_INTERFACE_VERSION,
  type UnsubscribeWorkspace,
  type Workspace,
  type WorkspaceAttention,
  type WorkspaceIdentity,
} from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  HarnessInvocationIdentity,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
  WorkspaceHarnessAdapterHost,
} from '@buildframe/workspace/harness-interaction';

import {
  HARNESS_ADAPTER_PROTOCOL_VERSION,
  LOCAL_RUNTIME_PROTOCOL_VERSION,
  type LocalRuntimeClientRole,
  type RuntimeCodeIdentity,
  type RuntimeGeneration,
} from './contracts.js';
import { FramedSocket } from './framing.js';
import {
  BOOTSTRAP_TIMEOUT_MS,
  CLIENT_ROLES,
  MAX_PENDING_OPERATIONS,
  MAX_SUBSCRIPTIONS,
  bootstrapAcceptedFrame,
  harnessBridgeEvidenceIdentity,
  isClientRole,
  isRuntimeCodeIdentity,
  isRuntimeGeneration,
  parseBootstrapFrame,
  parseClientSessionFrame,
  parseHarnessAdapterClientFrame,
  type BootstrapRejectedFrame,
  type ClientSessionFrame,
  type HarnessAdapterClientFrame,
  type HarnessAdapterDirectiveObservationFrame,
  type HarnessAdapterEvidenceFrame,
  type HarnessAdapterEstablishFrame,
  type WorkspaceOperationFrame,
  type WorkspaceSubscribeFrame,
} from './protocol.js';
import {
  RuntimeLocationProblem,
  preparePrivateRuntimeDirectory,
  removeOwnedEndpoint,
  runtimeLocationForWorkspace,
  secureBoundEndpoint,
  type RuntimeLocation,
} from './runtimeLocation.js';

export type LocalRuntimeServerErrorCode =
  | 'invalid-runtime-generation'
  | 'invalid-runtime-code-identity'
  | 'workspace-interface-unavailable'
  | 'unsupported-platform'
  | 'runtime-directory-insecure'
  | 'runtime-already-active'
  | 'runtime-listen-failed';

export class LocalRuntimeServerError extends Error {
  readonly code: LocalRuntimeServerErrorCode;

  constructor(code: LocalRuntimeServerErrorCode) {
    super(code);
    this.name = 'LocalRuntimeServerError';
    this.code = code;
  }
}

export interface StartLocalRuntimeServerRequest {
  readonly workspace: Workspace;
  readonly runtimeGeneration: RuntimeGeneration;
  readonly runtimeCodeIdentity: RuntimeCodeIdentity;
  /** Runtime-only P13 seam; required before the harness-adapter role is accepted. */
  readonly harnessAdapters?: WorkspaceHarnessAdapterHost;
  readonly allowedRoles?: readonly LocalRuntimeClientRole[];
}

/** Launcher-only runtime control. Workflow clients never receive this Interface. */
export interface LocalRuntimeServer {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly runtimeGeneration: RuntimeGeneration;
  dispose(): Promise<void>;
}

interface ActiveSubscription {
  readonly unsubscribe: UnsubscribeWorkspace;
  sequence: number;
}

interface PendingDirective {
  readonly resolve: (observation: HarnessDirectiveObservation) => void;
  readonly reject: () => void;
  readonly directive: CommittedHarnessDirective;
}

class RemoteReviewedHarnessAdapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  readonly #peer: FramedSocket;
  readonly #runtimeGeneration: RuntimeGeneration;
  readonly #pendingDirectives = new Map<string, PendingDirective>();
  readonly #outstandingInvocations = new Set<string>();
  readonly #disconnectOccurrenceIdentity = `hadc_${randomUUID()}`;
  #sink: HarnessEvidenceSink | undefined;
  #nextDirectiveIdentity = 1;
  #closed = false;

  constructor(
    manifest: ReviewedCapabilityManifest,
    attachment: ReviewedHarnessAttachment,
    peer: FramedSocket,
    runtimeGeneration: RuntimeGeneration,
  ) {
    this.manifest = manifest;
    this.attachment = attachment;
    this.#peer = peer;
    this.#runtimeGeneration = runtimeGeneration;
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    if (this.#sink !== undefined) {
      throw new TypeError('Harness Adapter transport was already connected');
    }
    this.#sink = sink;
    return Object.freeze({
      perform: async (directive: CommittedHarnessDirective) => await this.#perform(directive),
      release: (reason: 'replaced') => {
        // Say why before closing, so the session does not reconnect and take the connection back.
        this.#peer.send({ type: 'harness.adapter.released', reason });
        this.#peer.destroy();
      },
    });
  }

  async acceptEvidence(frame: HarnessAdapterEvidenceFrame): Promise<HarnessEvidenceAcknowledgement> {
    if (this.#sink === undefined || this.#closed) {
      return {
        status: 'refused',
        evidenceIdentity: frame.evidence.evidenceIdentity,
        reason: 'state-unavailable',
      };
    }
    const acknowledgement = await this.#sink.accept(frame.evidence);
    if (
      acknowledgement.status === 'applied' &&
      frame.evidence.kind !== 'harness.availability.observed' &&
      frame.evidence.kind !== 'harness.invocation.start-observed'
    ) {
      this.#outstandingInvocations.delete(frame.evidence.invocationIdentity);
    }
    return acknowledgement;
  }

  acceptObservation(frame: HarnessAdapterDirectiveObservationFrame): void {
    const pending = this.#pendingDirectives.get(frame.requestId);
    if (pending === undefined) throw new TypeError('Unknown Harness directive');
    this.#pendingDirectives.delete(frame.requestId);
    if (frame.observation.status === 'proven-not-dispatched') {
      if (
        pending.directive.kind === 'harness.direct-review.dispatch' ||
        pending.directive.kind === 'harness.direct-review-message.dispatch'
      ) {
        this.#outstandingInvocations.delete(pending.directive.invocationIdentity);
      }
    }
    pending.resolve(frame.observation);
  }

  async disconnect(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pendingDirectives.values()) pending.reject();
    this.#pendingDirectives.clear();
    if (this.#sink === undefined) return;

    const attachmentIdentity = this.attachment.attachmentIdentity;
    await this.#sink.accept({
      kind: 'harness.availability.observed',
      evidenceIdentity: harnessBridgeEvidenceIdentity(
        this.#runtimeGeneration,
        attachmentIdentity,
        this.#disconnectOccurrenceIdentity,
      ),
      attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    for (const invocationIdentity of [...this.#outstandingInvocations]) {
      await this.#sink.accept({
        kind: 'harness.invocation.correlation-lost',
        evidenceIdentity: harnessBridgeEvidenceIdentity(
          this.#runtimeGeneration,
          attachmentIdentity,
          this.#disconnectOccurrenceIdentity,
          invocationIdentity,
        ),
        attachmentIdentity,
        invocationIdentity: invocationIdentity as HarnessInvocationIdentity,
        reason: 'attachment-lost',
      });
      this.#outstandingInvocations.delete(invocationIdentity);
    }
  }

  #perform(directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> {
    if (this.#closed || this.#pendingDirectives.size >= MAX_PENDING_OPERATIONS) {
      return Promise.reject(new Error('Harness Adapter transport unavailable'));
    }
    const requestId = `had_${this.#nextDirectiveIdentity.toString(36)}`;
    this.#nextDirectiveIdentity += 1;
    return new Promise((resolve, reject) => {
      this.#pendingDirectives.set(requestId, {
        resolve,
        reject: () => reject(new Error('Harness Adapter transport disconnected')),
        directive,
      });
      if (
        (directive.kind === 'harness.direct-review.dispatch' ||
          directive.kind === 'harness.direct-review-message.dispatch') &&
        this.#peer.send({
          type: 'harness.adapter.directive',
          requestId,
          directive,
        })
      ) {
        this.#outstandingInvocations.add(directive.invocationIdentity);
        return;
      }
      if (
        directive.kind === 'harness.direct-invocation.interrupt' &&
        this.#peer.send({
          type: 'harness.adapter.directive',
          requestId,
          directive,
        })
      ) {
        return;
      }
      this.#pendingDirectives.delete(requestId);
      reject(new Error('Harness Adapter transport disconnected'));
    });
  }
}

function bootstrapRejection(
  code: BootstrapRejectedFrame['code'],
  receivedProtocolVersion?: number,
  receivedWorkspaceInterfaceVersion?: number,
): BootstrapRejectedFrame {
  const frame: BootstrapRejectedFrame = {
    type: 'bootstrap.rejected',
    code,
  };
  if (receivedProtocolVersion !== undefined) {
    return {
      ...frame,
      supportedProtocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      receivedProtocolVersion,
    };
  }
  if (receivedWorkspaceInterfaceVersion !== undefined) {
    return {
      ...frame,
      supportedWorkspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
      receivedWorkspaceInterfaceVersion,
    };
  }
  return frame;
}

/**
 * One Workspace serves every client, so it stays in the foreground while any
 * client is, or while none has said; only all-background clients slow it.
 */
class SharedRuntimeAttention {
  readonly #workspace: Workspace;
  readonly #reports = new Map<object, WorkspaceAttention>();
  #current: WorkspaceAttention = 'foreground';

  constructor(workspace: Workspace) {
    this.#workspace = workspace;
  }

  report(client: object, attention: WorkspaceAttention | undefined): void {
    if (attention === undefined) this.#reports.delete(client);
    else this.#reports.set(client, attention);
    const reports = [...this.#reports.values()];
    const next = reports.length > 0 && !reports.includes('foreground') ? 'background' : 'foreground';
    if (next === this.#current) return;
    this.#current = next;
    this.#workspace.setAttention(next);
  }
}

class RuntimeClientConnection {
  readonly #socket: Socket;
  readonly #peer: FramedSocket;
  readonly #workspace: Workspace;
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #runtimeGeneration: RuntimeGeneration;
  readonly #runtimeCodeIdentity: RuntimeCodeIdentity;
  readonly #allowedRoles: ReadonlySet<LocalRuntimeClientRole>;
  readonly #harnessAdapters: WorkspaceHarnessAdapterHost | undefined;
  readonly #attention: SharedRuntimeAttention;
  readonly #onClosed: () => void;
  readonly #onRuntimeCodeMismatch: () => void;
  readonly #subscriptions = new Map<string, ActiveSubscription>();
  readonly #requestIdentities = new Set<string>();
  #accepted = false;
  #closed = false;
  #role: LocalRuntimeClientRole | undefined;
  #remoteAdapter: RemoteReviewedHarnessAdapter | undefined;
  #pendingOperations = 0;
  #operationTail: Promise<void> = Promise.resolve();
  #sessionMutationBarrier: Promise<void> = Promise.resolve();
  readonly #activeSessionReads = new Set<Promise<void>>();
  #closeComplete: Promise<void> = Promise.resolve();
  #bootstrapTimer: NodeJS.Timeout | undefined;

  constructor(
    socket: Socket,
    workspace: Workspace,
    workspaceIdentity: WorkspaceIdentity,
    runtimeGeneration: RuntimeGeneration,
    runtimeCodeIdentity: RuntimeCodeIdentity,
    allowedRoles: ReadonlySet<LocalRuntimeClientRole>,
    harnessAdapters: WorkspaceHarnessAdapterHost | undefined,
    attention: SharedRuntimeAttention,
    onClosed: () => void,
    onRuntimeCodeMismatch: () => void,
  ) {
    this.#socket = socket;
    this.#workspace = workspace;
    this.#workspaceIdentity = workspaceIdentity;
    this.#runtimeGeneration = runtimeGeneration;
    this.#runtimeCodeIdentity = runtimeCodeIdentity;
    this.#allowedRoles = allowedRoles;
    this.#harnessAdapters = harnessAdapters;
    this.#attention = attention;
    this.#onClosed = onClosed;
    this.#onRuntimeCodeMismatch = onRuntimeCodeMismatch;
    this.#peer = new FramedSocket(socket, {
      onFrame: frame => this.#accept(frame),
      onClose: () => this.#close(),
    });
    this.#bootstrapTimer = setTimeout(() => {
      this.#peer.destroy();
    }, BOOTSTRAP_TIMEOUT_MS);
    this.#bootstrapTimer.unref();
  }

  dispose(): void {
    this.#peer.destroy();
  }

  async disposeGracefully(): Promise<void> {
    this.#peer.destroy();
    await this.#closeComplete;
  }

  #accept(frame: unknown): void {
    if (!this.#accepted) {
      this.#acceptBootstrap(frame);
      return;
    }

    if (this.#role === 'harness-adapter') {
      const parsed = parseHarnessAdapterClientFrame(frame);
      if (parsed === undefined) {
        this.#peer.protocolError('unexpected-frame');
        return;
      }
      this.#acceptHarnessAdapterFrame(parsed);
      return;
    }

    const parsed = parseClientSessionFrame(frame);
    if (parsed === undefined) {
      this.#peer.protocolError('unexpected-frame');
      return;
    }
    this.#acceptSessionFrame(parsed);
  }

  #acceptBootstrap(frame: unknown): void {
    const bootstrap = parseBootstrapFrame(frame);
    if (bootstrap === undefined) {
      this.#rejectBootstrap(bootstrapRejection('invalid-bootstrap'));
      return;
    }
    if (bootstrap.protocolVersion !== LOCAL_RUNTIME_PROTOCOL_VERSION) {
      this.#rejectBootstrap(bootstrapRejection('protocol-incompatible', bootstrap.protocolVersion, undefined));
      return;
    }
    if (bootstrap.workspaceInterfaceVersion !== WORKSPACE_INTERFACE_VERSION) {
      this.#rejectBootstrap(
        bootstrapRejection('workspace-interface-incompatible', undefined, bootstrap.workspaceInterfaceVersion),
      );
      return;
    }
    if (bootstrap.workspaceIdentity !== this.#workspaceIdentity) {
      this.#rejectBootstrap(bootstrapRejection('workspace-mismatch'));
      return;
    }
    if (
      !isClientRole(bootstrap.role) ||
      !this.#allowedRoles.has(bootstrap.role) ||
      (bootstrap.role === 'harness-adapter' && this.#harnessAdapters === undefined)
    ) {
      this.#rejectBootstrap(bootstrapRejection('role-rejected'));
      return;
    }
    if (bootstrap.runtimeCodeIdentity !== undefined && bootstrap.runtimeCodeIdentity !== this.#runtimeCodeIdentity) {
      this.#rejectBootstrap(bootstrapRejection('runtime-code-mismatch'), this.#onRuntimeCodeMismatch);
      return;
    }

    this.#accepted = true;
    this.#role = bootstrap.role;
    if (this.#bootstrapTimer !== undefined) {
      clearTimeout(this.#bootstrapTimer);
      this.#bootstrapTimer = undefined;
    }
    this.#peer.send(bootstrapAcceptedFrame(this.#workspaceIdentity, bootstrap.role, this.#runtimeGeneration));
  }

  #rejectBootstrap(frame: BootstrapRejectedFrame, afterFlush?: () => void): void {
    this.#peer.send(frame);
    if (afterFlush === undefined) {
      this.#socket.end();
      return;
    }

    let requested = false;
    const requestReplacement = (): void => {
      if (requested) return;
      requested = true;
      this.#socket.off('close', requestReplacement);
      afterFlush();
    };
    this.#socket.once('close', requestReplacement);
    this.#socket.end(requestReplacement);
  }

  #acceptSessionFrame(frame: ClientSessionFrame): void {
    if (frame.type === 'workspace.operation') {
      this.#queueOperation(frame);
      return;
    }
    if (frame.type === 'workspace.subscribe') {
      this.#subscribe(frame);
      return;
    }
    if (frame.type === 'workspace.attention') {
      this.#attention.report(this, frame.attention);
      return;
    }
    this.#unsubscribe(frame.subscriptionId);
  }

  #acceptHarnessAdapterFrame(frame: HarnessAdapterClientFrame): void {
    if (frame.type === 'harness.adapter.establish') {
      this.#establishHarnessAdapter(frame);
      return;
    }
    if (frame.type === 'harness.adapter.evidence') {
      this.#acceptHarnessEvidence(frame);
      return;
    }
    try {
      this.#remoteAdapter?.acceptObservation(frame);
      if (this.#remoteAdapter === undefined) {
        this.#peer.protocolError('unexpected-frame');
      }
    } catch {
      this.#peer.protocolError('unexpected-frame');
    }
  }

  #establishHarnessAdapter(frame: HarnessAdapterEstablishFrame): void {
    if (
      this.#remoteAdapter !== undefined ||
      this.#harnessAdapters === undefined ||
      this.#pendingOperations >= MAX_PENDING_OPERATIONS
    ) {
      this.#peer.protocolError('unexpected-frame');
      return;
    }
    const adapter = new RemoteReviewedHarnessAdapter(
      frame.manifest,
      frame.attachment,
      this.#peer,
      this.#runtimeGeneration,
    );
    this.#remoteAdapter = adapter;
    this.#pendingOperations += 1;
    this.#operationTail = this.#operationTail
      .then(async () => {
        const result = await this.#harnessAdapters?.establish(adapter);
        if (result === undefined) throw new Error('Harness Adapter host unavailable');
        this.#peer.send({
          type: 'harness.adapter.established',
          adapterProtocolVersion: HARNESS_ADAPTER_PROTOCOL_VERSION,
          requestId: frame.requestId,
          result,
        });
      })
      .catch(() => {
        this.#peer.destroy();
      })
      .finally(() => {
        this.#pendingOperations -= 1;
      });
  }

  #acceptHarnessEvidence(frame: HarnessAdapterEvidenceFrame): void {
    if (this.#remoteAdapter === undefined || this.#pendingOperations >= MAX_PENDING_OPERATIONS) {
      this.#peer.protocolError('unexpected-frame');
      return;
    }
    this.#pendingOperations += 1;
    this.#operationTail = this.#operationTail
      .then(async () => {
        const acknowledgement = await this.#remoteAdapter?.acceptEvidence(frame);
        if (acknowledgement === undefined) {
          throw new Error('Harness Adapter unavailable');
        }
        this.#peer.send({
          type: 'harness.adapter.evidence-acknowledgement',
          requestId: frame.requestId,
          acknowledgement,
        });
      })
      .catch(() => {
        this.#peer.destroy();
      })
      .finally(() => {
        this.#pendingOperations -= 1;
      });
  }

  #queueOperation(frame: WorkspaceOperationFrame): void {
    if (this.#requestIdentities.has(frame.requestId) || this.#subscriptions.has(frame.requestId)) {
      this.#peer.protocolError('unexpected-frame');
      return;
    }
    if (this.#pendingOperations >= MAX_PENDING_OPERATIONS) {
      this.#peer.protocolError('too-many-pending-operations');
      return;
    }

    this.#requestIdentities.add(frame.requestId);
    this.#pendingOperations += 1;

    const predecessor =
      frame.operation === 'execute'
        ? Promise.all([this.#sessionMutationBarrier, ...this.#activeSessionReads]).then(() => undefined)
        : this.#sessionMutationBarrier;
    const operation = predecessor.then(async () => {
      try {
        const result =
          frame.operation === 'execute'
            ? await this.#workspace.execute(frame.payload)
            : await this.#workspace.read(frame.payload);
        return { status: 'completed' as const, result };
      } catch {
        return { status: 'rejected' as const };
      }
    });
    const completion = operation.then(() => undefined);
    if (frame.operation === 'execute') {
      this.#sessionMutationBarrier = completion;
    } else {
      this.#activeSessionReads.add(completion);
      void completion.then(() => {
        this.#activeSessionReads.delete(completion);
      });
    }

    // Computation follows semantic read/command barriers, while this separate
    // tail retains accepted result-frame order and the graceful-close barrier.
    this.#operationTail = this.#operationTail
      .then(async () => {
        try {
          const outcome = await operation;
          if (outcome.status === 'completed') {
            this.#peer.send({
              type: 'workspace.result',
              requestId: frame.requestId,
              result: outcome.result,
            });
          } else {
            this.#peer.send({
              type: 'workspace.error',
              requestId: frame.requestId,
              code: 'workspace-call-rejected',
            });
          }
        } finally {
          this.#pendingOperations -= 1;
          this.#requestIdentities.delete(frame.requestId);
        }
      })
      .catch(() => {
        this.#peer.destroy();
      });
  }

  #subscribe(frame: WorkspaceSubscribeFrame): void {
    if (this.#subscriptions.has(frame.subscriptionId) || this.#requestIdentities.has(frame.subscriptionId)) {
      this.#peer.protocolError('unexpected-frame');
      return;
    }
    if (this.#subscriptions.size >= MAX_SUBSCRIPTIONS) {
      this.#peer.protocolError('too-many-subscriptions');
      return;
    }

    this.#peer.send({
      type: 'workspace.subscribed',
      subscriptionId: frame.subscriptionId,
    });

    const active: ActiveSubscription = {
      unsubscribe: () => {},
      sequence: 0,
    };
    this.#subscriptions.set(frame.subscriptionId, active);
    try {
      const unsubscribe = this.#workspace.subscribe(frame.scope, update => {
        const current = this.#subscriptions.get(frame.subscriptionId);
        if (current === undefined) return;
        current.sequence += 1;
        this.#peer.send({
          type: 'workspace.update',
          subscriptionId: frame.subscriptionId,
          sequence: current.sequence,
          update,
        });
      });
      this.#subscriptions.set(frame.subscriptionId, {
        unsubscribe,
        sequence: active.sequence,
      });
    } catch {
      this.#subscriptions.delete(frame.subscriptionId);
      this.#peer.send({
        type: 'workspace.subscription-error',
        subscriptionId: frame.subscriptionId,
        code: 'workspace-subscription-rejected',
      });
    }
  }

  #unsubscribe(subscriptionId: string): void {
    const subscription = this.#subscriptions.get(subscriptionId);
    if (subscription !== undefined) {
      this.#subscriptions.delete(subscriptionId);
      try {
        subscription.unsubscribe();
      } catch {
        // The semantic subscription is already detached from this connection.
      }
    }
    // This acknowledgement follows every previously queued update on the
    // server-to-client stream, allowing the client to retire its race tombstone.
    this.#peer.send({
      type: 'workspace.unsubscribed',
      subscriptionId,
    });
  }

  #close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#bootstrapTimer !== undefined) {
      clearTimeout(this.#bootstrapTimer);
      this.#bootstrapTimer = undefined;
    }
    for (const subscriptionId of [...this.#subscriptions.keys()]) {
      this.#unsubscribe(subscriptionId);
    }
    this.#attention.report(this, undefined);
    this.#closeComplete = this.#operationTail
      .then(async () => await this.#remoteAdapter?.disconnect())
      .catch(() => undefined)
      .then(() => this.#onClosed());
  }
}

class OpenLocalRuntimeServer implements LocalRuntimeServer {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly runtimeGeneration: RuntimeGeneration;
  readonly #server: Server;
  readonly #location: RuntimeLocation;
  readonly #ownedEndpoint: Awaited<ReturnType<typeof secureBoundEndpoint>>;
  readonly #connections: Set<RuntimeClientConnection>;
  readonly #activityListeners: Set<() => void>;
  readonly #replacementSignal: AbortSignal;
  #disposed: Promise<void> | undefined;

  constructor(
    workspaceIdentity: WorkspaceIdentity,
    runtimeGeneration: RuntimeGeneration,
    server: Server,
    location: RuntimeLocation,
    ownedEndpoint: Awaited<ReturnType<typeof secureBoundEndpoint>>,
    connections: Set<RuntimeClientConnection>,
    activityListeners: Set<() => void>,
    replacementSignal: AbortSignal,
  ) {
    this.workspaceIdentity = workspaceIdentity;
    this.runtimeGeneration = runtimeGeneration;
    this.#server = server;
    this.#location = location;
    this.#ownedEndpoint = ownedEndpoint;
    this.#connections = connections;
    this.#activityListeners = activityListeners;
    this.#replacementSignal = replacementSignal;
  }

  waitForIdleGrace(
    idleMilliseconds: number,
    signal: AbortSignal,
  ): Promise<'idle' | 'cancelled' | 'replacement-requested'> {
    if (!Number.isSafeInteger(idleMilliseconds) || idleMilliseconds < 0) {
      return Promise.reject(new TypeError('idleMilliseconds must be bounded'));
    }

    return new Promise<'idle' | 'cancelled' | 'replacement-requested'>(resolve => {
      let timer: NodeJS.Timeout | undefined;
      let settled = false;
      const finish = (result: 'idle' | 'cancelled' | 'replacement-requested'): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        this.#activityListeners.delete(evaluate);
        signal.removeEventListener('abort', onAbort);
        this.#replacementSignal.removeEventListener('abort', onReplacement);
        resolve(result);
      };
      const evaluate = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (this.#connections.size === 0) {
          timer = setTimeout(() => finish('idle'), idleMilliseconds);
        }
      };
      const onAbort = (): void => finish('cancelled');
      const onReplacement = (): void => finish('replacement-requested');

      this.#activityListeners.add(evaluate);
      signal.addEventListener('abort', onAbort, { once: true });
      this.#replacementSignal.addEventListener('abort', onReplacement, { once: true });
      if (signal.aborted) onAbort();
      else if (this.#replacementSignal.aborted) onReplacement();
      else evaluate();
    });
  }

  dispose(): Promise<void> {
    return this.disposeAfterDrain(async () => {});
  }

  disposeAfterDrain(beforeEndpointRelease: () => Promise<void>): Promise<void> {
    this.#disposed ??= this.#disposeOnce(beforeEndpointRelease);
    return this.#disposed;
  }

  async #disposeOnce(beforeEndpointRelease: () => Promise<void>): Promise<void> {
    const closed = new Promise<void>(resolve => {
      this.#server.close(() => resolve());
    });
    await Promise.all([...this.#connections].map(async connection => connection.disposeGracefully()));
    await closed;
    try {
      await beforeEndpointRelease();
    } finally {
      await removeOwnedEndpoint(this.#location, this.#ownedEndpoint);
    }
  }
}

function mapLocationProblem(error: RuntimeLocationProblem): LocalRuntimeServerError {
  if (error.code === 'unsupported-platform') {
    return new LocalRuntimeServerError('unsupported-platform');
  }
  return new LocalRuntimeServerError('runtime-directory-insecure');
}

async function listen(server: Server, endpoint: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(endpoint);
  });
}

/**
 * Starts only the semantic IPC server. P08 owns process convergence, writer
 * readiness, idle policy, and replacement after failure.
 */
export async function startLocalRuntimeServer(request: StartLocalRuntimeServerRequest): Promise<LocalRuntimeServer> {
  if (!isRuntimeGeneration(request.runtimeGeneration)) {
    throw new LocalRuntimeServerError('invalid-runtime-generation');
  }
  if (!isRuntimeCodeIdentity(request.runtimeCodeIdentity)) {
    throw new LocalRuntimeServerError('invalid-runtime-code-identity');
  }

  let identityView;
  try {
    identityView = await request.workspace.read({ kind: 'workspace.identity' });
  } catch {
    throw new LocalRuntimeServerError('workspace-interface-unavailable');
  }
  if (identityView.kind !== 'workspace.identity' || identityView.interfaceVersion !== WORKSPACE_INTERFACE_VERSION) {
    throw new LocalRuntimeServerError('workspace-interface-unavailable');
  }

  const allowedRoles = new Set(request.allowedRoles ?? CLIENT_ROLES);
  if (allowedRoles.size === 0 || [...allowedRoles].some(role => !isClientRole(role))) {
    throw new LocalRuntimeServerError('workspace-interface-unavailable');
  }

  let location: RuntimeLocation;
  try {
    location = runtimeLocationForWorkspace(identityView.workspaceIdentity);
    await preparePrivateRuntimeDirectory(location);
  } catch (error) {
    if (error instanceof RuntimeLocationProblem) throw mapLocationProblem(error);
    throw new LocalRuntimeServerError('runtime-directory-insecure');
  }

  const workspace = request.workspace;
  const connections = new Set<RuntimeClientConnection>();
  const attention = new SharedRuntimeAttention(workspace);
  const activityListeners = new Set<() => void>();
  const replacement = new AbortController();
  const notifyActivity = (): void => {
    for (const listener of [...activityListeners]) listener();
  };
  const server = createServer(socket => {
    let connection: RuntimeClientConnection;
    connection = new RuntimeClientConnection(
      socket,
      workspace,
      identityView.workspaceIdentity,
      request.runtimeGeneration,
      request.runtimeCodeIdentity,
      allowedRoles,
      request.harnessAdapters,
      attention,
      () => {
        connections.delete(connection);
        notifyActivity();
      },
      () => replacement.abort(),
    );
    connections.add(connection);
    notifyActivity();
  });

  try {
    await listen(server, location.endpoint);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
    throw new LocalRuntimeServerError(code === 'EADDRINUSE' ? 'runtime-already-active' : 'runtime-listen-failed');
  }

  let ownedEndpoint;
  try {
    ownedEndpoint = await secureBoundEndpoint(location);
  } catch (error) {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (error instanceof RuntimeLocationProblem) throw mapLocationProblem(error);
    throw new LocalRuntimeServerError('runtime-directory-insecure');
  }

  return new OpenLocalRuntimeServer(
    identityView.workspaceIdentity,
    request.runtimeGeneration,
    server,
    location,
    ownedEndpoint,
    connections,
    activityListeners,
    replacement.signal,
  );
}

/** Private process-lifecycle hook; not re-exported by the launcher Interface. */
export function waitForLocalRuntimeServerIdle(
  server: LocalRuntimeServer,
  idleMilliseconds: number,
  signal: AbortSignal,
): Promise<'idle' | 'cancelled' | 'replacement-requested'> {
  if (!(server instanceof OpenLocalRuntimeServer)) {
    return Promise.reject(new TypeError('Unknown Local Runtime server'));
  }
  return server.waitForIdleGrace(idleMilliseconds, signal);
}

/** Keeps the owned endpoint present until the Workspace writer is released. */
export function disposeLocalRuntimeServerAfterDrain(
  server: LocalRuntimeServer,
  beforeEndpointRelease: () => Promise<void>,
): Promise<void> {
  if (!(server instanceof OpenLocalRuntimeServer)) {
    return Promise.reject(new TypeError('Unknown Local Runtime server'));
  }
  return server.disposeAfterDrain(beforeEndpointRelease);
}
