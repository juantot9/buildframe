import { createConnection, type Socket } from 'node:net';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  HarnessAttachmentEstablishment,
  HarnessAttachmentRefusalReason,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';

import {
  HARNESS_ADAPTER_PROTOCOL_VERSION,
  LOCAL_RUNTIME_PROTOCOL_VERSION,
  type RuntimeGeneration,
  type WorkspaceRuntimeBootstrapDiagnostic,
} from './contracts.js';
import { FramedSocket, type FramedSocketCloseCode } from './framing.js';
import {
  BOOTSTRAP_TIMEOUT_MS,
  parseBootstrapAcceptedFrame,
  parseBootstrapRejectedFrame,
  parseHarnessAdapterServerFrame,
  type BootstrapRejectedFrame,
  type HarnessAdapterServerFrame,
} from './protocol.js';
import type { ConnectorSession, OpenConnectorSessionOptions } from './connector/contracts.js';
import { createConnectorSession } from './connector/session.js';
import {
  RuntimeLocationProblem,
  runtimeLocationForWorkspace,
  validatePrivateRuntimeEndpoint,
  type RuntimeLocation,
} from './runtimeLocation.js';

export interface ConnectHarnessAdapterRuntimeRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly adapter: ReviewedHarnessAdapter;
  /** Aborting detaches this Adapter occurrence and never replays a directive. */
  readonly signal?: AbortSignal;
}

export interface HarnessAdapterEstablishmentDiagnostic {
  readonly code: 'harness-adapter-establishment-refused';
  readonly reason: HarnessAttachmentRefusalReason;
}

export interface HarnessAdapterInvalidDiagnostic {
  readonly code: 'harness-adapter-invalid';
}

export type HarnessAdapterRuntimeDiagnostic =
  | WorkspaceRuntimeBootstrapDiagnostic
  | HarnessAdapterEstablishmentDiagnostic
  | HarnessAdapterInvalidDiagnostic;

export interface HarnessAdapterRuntimeRejected {
  readonly status: 'rejected';
  readonly diagnostic: HarnessAdapterRuntimeDiagnostic;
}

/** `replaced`: another session in this checkout connected; do not reconnect. */
export type HarnessAdapterRuntimeCloseReason =
  | 'runtime-disconnected'
  | 'runtime-protocol-failure'
  | 'disposed'
  | 'replaced';

export interface HarnessAdapterRuntimeConnected {
  readonly status: 'connected';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly runtimeGeneration: RuntimeGeneration;
  readonly establishment: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }>;
  readonly closed: Promise<HarnessAdapterRuntimeCloseReason>;
  dispose(): Promise<void>;
}

export type ConnectHarnessAdapterRuntimeResult = HarnessAdapterRuntimeConnected | HarnessAdapterRuntimeRejected;

interface PendingEvidence {
  readonly resolve: (acknowledgement: HarnessEvidenceAcknowledgement) => void;
}

function mapLocationProblem(error: RuntimeLocationProblem): WorkspaceRuntimeBootstrapDiagnostic {
  if (error.code === 'runtime-endpoint-missing') {
    return { code: 'runtime-unavailable', reason: 'not-running' };
  }
  return { code: 'runtime-unavailable', reason: 'insecure-runtime' };
}

function mapBootstrapRejection(frame: BootstrapRejectedFrame): WorkspaceRuntimeBootstrapDiagnostic {
  if (frame.code === 'protocol-incompatible' && frame.supportedProtocolVersion !== undefined) {
    return {
      code: 'runtime-protocol-incompatible',
      supportedVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      receivedVersion: frame.supportedProtocolVersion,
    };
  }
  if (frame.code === 'workspace-interface-incompatible' && frame.supportedWorkspaceInterfaceVersion !== undefined) {
    return {
      code: 'workspace-interface-incompatible',
      supportedVersion: 1,
      receivedVersion: frame.supportedWorkspaceInterfaceVersion,
    };
  }
  if (frame.code === 'workspace-mismatch') {
    return { code: 'runtime-workspace-mismatch' };
  }
  if (frame.code === 'role-rejected') {
    return { code: 'runtime-role-rejected', role: 'harness-adapter' };
  }
  return { code: 'invalid-runtime-bootstrap' };
}

async function connectSocket(endpoint: string, signal: AbortSignal | undefined): Promise<Socket> {
  return await new Promise<Socket>((resolve, reject) => {
    const socket = createConnection(endpoint);
    const timer = setTimeout(() => finish(new Error('timeout')), BOOTSTRAP_TIMEOUT_MS);
    timer.unref();
    const onConnect = (): void => finish(undefined, socket);
    const onError = (): void => finish(new Error('connection-failed'));
    const onAbort = (): void => finish(new Error('cancelled'));
    const finish = (error: Error | undefined, connected?: Socket): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
      if (error !== undefined || connected === undefined) {
        socket.destroy();
        reject(error ?? new Error('connection-failed'));
      } else {
        resolve(connected);
      }
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
  });
}

class RemoteHarnessAdapterSession implements HarnessAdapterRuntimeConnected {
  readonly status = 'connected' as const;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly runtimeGeneration: RuntimeGeneration;
  readonly establishment: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }>;
  readonly closed: Promise<HarnessAdapterRuntimeCloseReason>;
  readonly #peer: FramedSocket;
  readonly #connection: ReviewedHarnessConnection;
  readonly #pendingEvidence = new Map<string, PendingEvidence>();
  #nextEvidenceIdentity = 1;
  #closeReason: HarnessAdapterRuntimeCloseReason | undefined;
  #resolveClosed!: (reason: HarnessAdapterRuntimeCloseReason) => void;

  constructor(options: {
    readonly workspaceIdentity: WorkspaceIdentity;
    readonly runtimeGeneration: RuntimeGeneration;
    readonly establishment: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }>;
    readonly peer: FramedSocket;
    readonly connection: ReviewedHarnessConnection;
  }) {
    this.workspaceIdentity = options.workspaceIdentity;
    this.runtimeGeneration = options.runtimeGeneration;
    this.establishment = options.establishment;
    this.#peer = options.peer;
    this.#connection = options.connection;
    this.closed = new Promise(resolve => {
      this.#resolveClosed = resolve;
    });
  }

  accept(frame: unknown): void {
    const parsed = parseHarnessAdapterServerFrame(frame);
    if (parsed === undefined || parsed.type === 'protocol.error') {
      this.close('runtime-protocol-failure');
      return;
    }
    this.#acceptParsed(parsed);
  }

  closeFromPeer(code: FramedSocketCloseCode): void {
    this.close(code === 'disconnected' ? 'runtime-disconnected' : 'runtime-protocol-failure');
  }

  async dispose(): Promise<void> {
    this.close('disposed');
    await this.closed;
  }

  evidenceSink(): HarnessEvidenceSink {
    return Object.freeze({
      accept: async (evidence: NormalizedHarnessEvidence) => await this.#sendEvidence(evidence),
    });
  }

  #acceptParsed(frame: Exclude<HarnessAdapterServerFrame, { type: 'protocol.error' }>): void {
    if (frame.type === 'harness.adapter.evidence-acknowledgement') {
      const pending = this.#pendingEvidence.get(frame.requestId);
      if (pending === undefined) {
        this.close('runtime-protocol-failure');
        return;
      }
      this.#pendingEvidence.delete(frame.requestId);
      pending.resolve(frame.acknowledgement);
      return;
    }
    if (frame.type === 'harness.adapter.established') {
      this.close('runtime-protocol-failure');
      return;
    }
    if (frame.type === 'harness.adapter.released') {
      this.close('replaced');
      return;
    }
    void this.#performDirective(frame.requestId, frame.directive);
  }

  async #performDirective(
    requestId: string,
    directive: Parameters<ReviewedHarnessConnection['perform']>[0],
  ): Promise<void> {
    let observation: HarnessDirectiveObservation;
    try {
      observation = await this.#connection.perform(directive);
    } catch {
      this.close('runtime-disconnected');
      return;
    }
    if (
      !this.#peer.send({
        type: 'harness.adapter.directive-observation',
        requestId,
        observation,
      })
    ) {
      this.close('runtime-disconnected');
    }
  }

  #sendEvidence(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    if (this.#closeReason !== undefined || this.#pendingEvidence.size >= 64) {
      return Promise.resolve({
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: 'state-unavailable',
      });
    }
    const requestId = `hae_${this.#nextEvidenceIdentity.toString(36)}`;
    this.#nextEvidenceIdentity += 1;
    return new Promise(resolve => {
      this.#pendingEvidence.set(requestId, { resolve });
      if (
        !this.#peer.send({
          type: 'harness.adapter.evidence',
          requestId,
          evidence,
        })
      ) {
        this.#pendingEvidence.delete(requestId);
        resolve({
          status: 'refused',
          evidenceIdentity: evidence.evidenceIdentity,
          reason: 'state-unavailable',
        });
        this.close('runtime-disconnected');
      }
    });
  }

  private close(reason: HarnessAdapterRuntimeCloseReason): void {
    if (this.#closeReason !== undefined) return;
    this.#closeReason = reason;
    for (const [requestId, pending] of this.#pendingEvidence) {
      this.#pendingEvidence.delete(requestId);
      pending.resolve({ status: 'refused', reason: 'state-unavailable' });
    }
    this.#peer.destroy();
    this.#resolveClosed(reason);
  }
}

/**
 * Connects one reviewed Adapter through the reserved harness-adapter role.
 * The returned Interface carries only P13 directives and evidence.
 */
export async function connectHarnessAdapterRuntime(
  request: ConnectHarnessAdapterRuntimeRequest,
): Promise<ConnectHarnessAdapterRuntimeResult> {
  if (request.signal?.aborted === true) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }

  let location: RuntimeLocation;
  try {
    location = runtimeLocationForWorkspace(request.workspaceIdentity);
    await validatePrivateRuntimeEndpoint(location);
  } catch (error) {
    return {
      status: 'rejected',
      diagnostic:
        error instanceof RuntimeLocationProblem
          ? mapLocationProblem(error)
          : { code: 'runtime-unavailable', reason: 'connection-failed' },
    };
  }

  let socket: Socket;
  try {
    socket = await connectSocket(location.endpoint, request.signal);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'connection-failed';
    return {
      status: 'rejected',
      diagnostic: {
        code: 'runtime-unavailable',
        reason: reason === 'timeout' || reason === 'cancelled' ? reason : 'connection-failed',
      },
    };
  }

  let session: RemoteHarnessAdapterSession | undefined;
  let acceptBootstrap: (frame: unknown) => void = () => {};
  let closeBootstrap: () => void = () => {};
  let preSessionClose: FramedSocketCloseCode | undefined;
  let connectionAborted = false;
  let peer!: FramedSocket;
  const onAbort = (): void => {
    connectionAborted = true;
    if (session === undefined) peer.destroy();
    else void session.dispose();
  };
  peer = new FramedSocket(socket, {
    onFrame: frame => {
      if (session === undefined) acceptBootstrap(frame);
      else session.accept(frame);
    },
    onClose: code => {
      request.signal?.removeEventListener('abort', onAbort);
      if (session === undefined) {
        preSessionClose = code;
        closeBootstrap();
      } else {
        session.closeFromPeer(code);
      }
    },
  });
  request.signal?.addEventListener('abort', onAbort, { once: true });
  const callerAborted = (): boolean => request.signal?.aborted === true;
  if (callerAborted()) onAbort();
  if (connectionAborted) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }

  const bootstrap = await new Promise<
    { readonly status: 'accepted'; readonly runtimeGeneration: RuntimeGeneration } | HarnessAdapterRuntimeRejected
  >(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      finish({
        status: 'rejected',
        diagnostic: { code: 'runtime-unavailable', reason: 'timeout' },
      });
      peer.destroy();
    }, BOOTSTRAP_TIMEOUT_MS);
    timer.unref();
    const finish = (
      result:
        | { readonly status: 'accepted'; readonly runtimeGeneration: RuntimeGeneration }
        | HarnessAdapterRuntimeRejected,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    acceptBootstrap = (frame: unknown): void => {
      const accepted = parseBootstrapAcceptedFrame(frame);
      if (
        accepted !== undefined &&
        accepted.workspaceIdentity === request.workspaceIdentity &&
        accepted.role === 'harness-adapter'
      ) {
        finish({
          status: 'accepted',
          runtimeGeneration: accepted.runtimeGeneration as RuntimeGeneration,
        });
        return;
      }
      const rejected = parseBootstrapRejectedFrame(frame);
      finish({
        status: 'rejected',
        diagnostic: rejected === undefined ? { code: 'invalid-runtime-bootstrap' } : mapBootstrapRejection(rejected),
      });
      peer.destroy();
    };
    closeBootstrap = (): void =>
      finish({
        status: 'rejected',
        diagnostic: { code: 'runtime-unavailable', reason: 'connection-failed' },
      });

    peer.send({
      type: 'bootstrap',
      protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      workspaceInterfaceVersion: 1,
      workspaceIdentity: request.workspaceIdentity,
      role: 'harness-adapter',
    });
  });
  if (connectionAborted) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }
  if (bootstrap.status === 'rejected') return bootstrap;

  let localConnection: ReviewedHarnessConnection;
  const pendingFrames: unknown[] = [];
  let acceptSessionFrame: (frame: unknown) => void = frame => {
    pendingFrames.push(frame);
  };
  acceptBootstrap = (frame): void => acceptSessionFrame(frame);
  const sink: HarnessEvidenceSink = Object.freeze({
    accept: async (evidence: NormalizedHarnessEvidence) => {
      if (session === undefined) {
        return {
          status: 'refused' as const,
          evidenceIdentity: evidence.evidenceIdentity,
          reason: 'state-unavailable' as const,
        };
      }
      return await session.evidenceSink().accept(evidence);
    },
  });
  try {
    localConnection = request.adapter.connect(sink);
    if (typeof localConnection?.perform !== 'function') {
      peer.destroy();
      return { status: 'rejected', diagnostic: { code: 'harness-adapter-invalid' } };
    }
  } catch {
    peer.destroy();
    return { status: 'rejected', diagnostic: { code: 'harness-adapter-invalid' } };
  }

  const establishment = await new Promise<HarnessAttachmentEstablishment>(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      finish({ status: 'refused', reason: 'state-unavailable' });
      peer.destroy();
    }, BOOTSTRAP_TIMEOUT_MS);
    timer.unref();
    const finish = (result: HarnessAttachmentEstablishment): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    closeBootstrap = (): void => finish({ status: 'refused', reason: 'state-unavailable' });
    acceptSessionFrame = (frame: unknown): void => {
      const parsed = parseHarnessAdapterServerFrame(frame);
      if (parsed?.type !== 'harness.adapter.established' || parsed.requestId !== 'has_1') {
        finish({ status: 'refused', reason: 'invalid-attachment' });
        peer.destroy();
        return;
      }
      acceptSessionFrame = (next): void => {
        pendingFrames.push(next);
      };
      finish(parsed.result);
    };
    for (const frame of pendingFrames.splice(0)) acceptSessionFrame(frame);
    peer.send({
      type: 'harness.adapter.establish',
      adapterProtocolVersion: HARNESS_ADAPTER_PROTOCOL_VERSION,
      requestId: 'has_1',
      manifest: request.adapter.manifest,
      attachment: request.adapter.attachment,
    });
  });
  if (connectionAborted) {
    peer.destroy();
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }
  if (establishment.status === 'refused' || preSessionClose !== undefined) {
    peer.destroy();
    return {
      status: 'rejected',
      diagnostic: {
        code: 'harness-adapter-establishment-refused',
        reason: establishment.status === 'refused' ? establishment.reason : 'state-unavailable',
      },
    };
  }

  session = new RemoteHarnessAdapterSession({
    workspaceIdentity: request.workspaceIdentity,
    runtimeGeneration: bootstrap.runtimeGeneration,
    establishment,
    peer,
    connection: localConnection,
  });
  acceptBootstrap = (frame): void => session?.accept(frame);
  for (const frame of pendingFrames.splice(0)) session.accept(frame);
  return session;
}

export { HARNESS_ADAPTER_PROTOCOL_VERSION };

/**
 * The connector kit: one connected harness session, kept connected, whose
 * host reports native facts while the kit decides correlation and evidence.
 */
export function openConnectorSession(options: OpenConnectorSessionOptions): ConnectorSession {
  return createConnectorSession(options, connectHarnessAdapterRuntime);
}

export { exactReviewMessageText } from './connector/turnEvidence.js';
export type {
  ConnectorDispatchDirective,
  ConnectorHost,
  ConnectorHostFact,
  ConnectorNaming,
  ConnectorScheduler,
  ConnectorSession,
  ConnectorStatus,
  ConnectorSubmitReceipt,
  ConnectorTurn,
  ConnectorTurnRelease,
  OpenConnectorSessionOptions,
} from './connector/contracts.js';
