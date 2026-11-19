import type { Socket } from 'node:net';

import {
  WORKSPACE_INTERFACE_VERSION,
  type UnsubscribeWorkspace,
  type Workspace,
  type WorkspaceAttention,
  type WorkspaceCommand,
  type WorkspaceCommandResult,
  type WorkspaceViewFor,
  type WorkspaceViewRequest,
  type WorkspaceViewScope,
  type WorkspaceViewUpdate,
  type WorkspaceViewUpdateFor,
} from '@buildframe/workspace';

import {
  LOCAL_RUNTIME_PROTOCOL_VERSION,
  LocalRuntimeSessionError,
  type ConnectWorkspaceRuntimeRequest,
  type ConnectWorkspaceRuntimeResult,
  type RuntimeCodeIdentity,
  type RuntimeGeneration,
  type WorkspaceRuntimeBootstrapDiagnostic,
} from './contracts.js';
import { connectRuntimeEndpoint, endpointConnectionFailure } from './endpointConnection.js';
import { FramedSocket, type FramedSocketCloseCode } from './framing.js';
import {
  BOOTSTRAP_TIMEOUT_MS,
  isRuntimeCodeIdentity,
  parseBootstrapAcceptedFrame,
  parseBootstrapRejectedFrame,
  parseServerSessionFrame,
  type BootstrapRejectedFrame,
  type RuntimeCodeMismatchPolicy,
  type ServerSessionFrame,
} from './protocol.js';
import {
  RuntimeLocationProblem,
  runtimeLocationForWorkspace,
  validatePrivateRuntimeEndpoint,
  type RuntimeLocation,
} from './runtimeLocation.js';

interface PendingCall {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: LocalRuntimeSessionError) => void;
}

interface ClientSubscription {
  readonly onUpdate: (update: WorkspaceViewUpdate) => void;
  sequence: number;
  accepted: boolean;
}

function freezeSemanticValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;

  const pending: object[] = [value];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const nested of Object.values(current)) {
      if (typeof nested === 'object' && nested !== null) pending.push(nested);
    }
    Object.freeze(current);
  }
  return value;
}

class RemoteWorkspaceConnection {
  readonly #peer: FramedSocket;
  readonly #pending = new Map<string, PendingCall>();
  readonly #subscriptions = new Map<string, ClientSubscription>();
  readonly #retiredSubscriptions = new Set<string>();
  #nextIdentity = 1;
  #closed = false;

  constructor(peer: FramedSocket) {
    this.#peer = peer;
  }

  call(operation: 'execute' | 'read', payload: unknown): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(new LocalRuntimeSessionError('runtime-disconnected'));
    }

    const requestId = this.#newIdentity('req');
    return new Promise<unknown>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      const sent = this.#peer.send({
        type: 'workspace.operation',
        requestId,
        operation,
        payload,
      });
      if (!sent) {
        this.#pending.delete(requestId);
        reject(new LocalRuntimeSessionError('runtime-disconnected'));
      }
    });
  }

  subscribe(scope: WorkspaceViewScope, onUpdate: (update: WorkspaceViewUpdate) => void): UnsubscribeWorkspace {
    if (this.#closed) return () => {};

    const subscriptionId = this.#newIdentity('sub');
    this.#subscriptions.set(subscriptionId, {
      onUpdate,
      sequence: 0,
      accepted: false,
    });
    if (
      !this.#peer.send({
        type: 'workspace.subscribe',
        subscriptionId,
        scope,
      })
    ) {
      this.#subscriptions.delete(subscriptionId);
      return () => {};
    }

    let subscribed = true;
    return (): void => {
      if (!subscribed) return;
      subscribed = false;
      this.#subscriptions.delete(subscriptionId);
      this.#retiredSubscriptions.add(subscriptionId);
      if (!this.#closed) {
        this.#peer.send({
          type: 'workspace.unsubscribe',
          subscriptionId,
        });
      }
    };
  }

  setAttention(attention: WorkspaceAttention): void {
    if (this.#closed) return;
    this.#peer.send({ type: 'workspace.attention', attention });
  }

  accept(frame: unknown): void {
    const parsed = parseServerSessionFrame(frame);
    if (parsed === undefined) {
      this.#protocolFailure();
      return;
    }
    this.#acceptParsed(parsed);
  }

  close(_code: FramedSocketCloseCode): void {
    if (this.#closed) return;
    this.#closed = true;
    const error = new LocalRuntimeSessionError('runtime-disconnected');
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#subscriptions.clear();
    this.#retiredSubscriptions.clear();
  }

  #acceptParsed(frame: ServerSessionFrame): void {
    if (frame.type === 'protocol.error') {
      this.#protocolFailure();
      return;
    }

    if (frame.type === 'workspace.result' || frame.type === 'workspace.error') {
      const pending = this.#pending.get(frame.requestId);
      if (pending === undefined) {
        this.#protocolFailure();
        return;
      }
      this.#pending.delete(frame.requestId);
      if (frame.type === 'workspace.error') {
        pending.reject(new LocalRuntimeSessionError('workspace-call-rejected'));
      } else {
        pending.resolve(freezeSemanticValue(frame.result));
      }
      return;
    }

    if (frame.type === 'workspace.unsubscribed') {
      if (!this.#retiredSubscriptions.delete(frame.subscriptionId)) {
        this.#protocolFailure();
      }
      return;
    }

    const subscription = this.#subscriptions.get(frame.subscriptionId);
    if (subscription === undefined) {
      // The server acknowledgement follows updates already queued before
      // cancellation. Until it arrives, discard only that known retired stream
      // while keeping unknown updates fail-closed.
      if (this.#retiredSubscriptions.has(frame.subscriptionId)) return;
      if (frame.type === 'workspace.update') this.#protocolFailure();
      return;
    }

    if (frame.type === 'workspace.subscribed') {
      if (subscription.accepted) {
        this.#protocolFailure();
        return;
      }
      subscription.accepted = true;
      return;
    }
    if (frame.type === 'workspace.subscription-error') {
      this.#subscriptions.delete(frame.subscriptionId);
      return;
    }
    if (!subscription.accepted || frame.sequence !== subscription.sequence + 1) {
      this.#protocolFailure();
      return;
    }

    subscription.sequence = frame.sequence;
    subscription.onUpdate(freezeSemanticValue(frame.update) as WorkspaceViewUpdate);
  }

  #protocolFailure(): void {
    if (this.#closed) return;
    this.#closed = true;
    const error = new LocalRuntimeSessionError('runtime-protocol-failure');
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    this.#subscriptions.clear();
    this.#peer.destroy();
  }

  #newIdentity(prefix: 'req' | 'sub'): string {
    const identity = `${prefix}_${this.#nextIdentity.toString(36)}`;
    this.#nextIdentity += 1;
    return identity;
  }
}

function createRemoteWorkspace(connection: RemoteWorkspaceConnection): Workspace {
  return Object.freeze({
    async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
      return (await connection.call('execute', command)) as WorkspaceCommandResult;
    },
    async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
      return (await connection.call('read', request)) as WorkspaceViewFor<Request>;
    },
    subscribe<Scope extends WorkspaceViewScope>(
      scope: Scope,
      onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
    ): UnsubscribeWorkspace {
      return connection.subscribe(scope, onUpdate as (update: WorkspaceViewUpdate) => void);
    },
    setAttention(attention: WorkspaceAttention): void {
      connection.setAttention(attention);
    },
  });
}

function mapLocationProblem(error: RuntimeLocationProblem): WorkspaceRuntimeBootstrapDiagnostic {
  if (error.code === 'runtime-endpoint-missing') {
    return { code: 'runtime-unavailable', reason: 'not-running' };
  }
  return { code: 'runtime-unavailable', reason: 'insecure-runtime' };
}

function mapBootstrapRejection(
  frame: BootstrapRejectedFrame,
  request: ConnectWorkspaceRuntimeRequest,
): WorkspaceRuntimeBootstrapDiagnostic {
  if (
    frame.code === 'protocol-incompatible' &&
    frame.supportedProtocolVersion !== undefined &&
    frame.receivedProtocolVersion !== undefined
  ) {
    return {
      code: 'runtime-protocol-incompatible',
      supportedVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      receivedVersion: frame.supportedProtocolVersion,
    };
  }
  if (
    frame.code === 'workspace-interface-incompatible' &&
    frame.supportedWorkspaceInterfaceVersion !== undefined &&
    frame.receivedWorkspaceInterfaceVersion !== undefined
  ) {
    return {
      code: 'workspace-interface-incompatible',
      supportedVersion: WORKSPACE_INTERFACE_VERSION,
      receivedVersion: frame.supportedWorkspaceInterfaceVersion,
    };
  }
  if (frame.code === 'workspace-mismatch') {
    return { code: 'runtime-workspace-mismatch' };
  }
  if (frame.code === 'runtime-code-mismatch') {
    return { code: 'runtime-code-mismatch' };
  }
  if (frame.code === 'role-rejected') {
    return { code: 'runtime-role-rejected', role: request.role };
  }
  return { code: 'invalid-runtime-bootstrap' };
}

interface DiscoverWorkspaceRuntimeRequest extends ConnectWorkspaceRuntimeRequest {
  readonly runtimeCodeIdentity: RuntimeCodeIdentity;
  /** `retire` (the default) asks a runtime from another build to step aside; `report` only learns of it. */
  readonly runtimeCodeMismatch?: RuntimeCodeMismatchPolicy;
}

async function connectWorkspaceRuntimeInternal(
  request: ConnectWorkspaceRuntimeRequest,
  runtimeCodeIdentity?: RuntimeCodeIdentity,
  runtimeCodeMismatch: RuntimeCodeMismatchPolicy = 'retire',
): Promise<ConnectWorkspaceRuntimeResult> {
  if (request.role === 'harness-adapter') {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-role-rejected', role: request.role },
    };
  }
  if (request.signal?.aborted === true) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }
  if (runtimeCodeIdentity !== undefined && !isRuntimeCodeIdentity(runtimeCodeIdentity)) {
    return {
      status: 'rejected',
      diagnostic: { code: 'invalid-runtime-bootstrap' },
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
    socket = await connectRuntimeEndpoint(location, request.signal);
  } catch (error) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: endpointConnectionFailure(error) },
    };
  }

  let acceptBootstrap: (frame: unknown) => void = () => {};
  let closeBootstrap: (code: FramedSocketCloseCode) => void = () => {};
  let session: RemoteWorkspaceConnection | undefined;
  let connectionClosed = false;
  let connectionAborted = false;
  let peer!: FramedSocket;
  const onAbort = (): void => {
    connectionAborted = true;
    peer.destroy();
  };
  peer = new FramedSocket(socket, {
    onFrame: frame => {
      if (session === undefined) acceptBootstrap(frame);
      else session.accept(frame);
    },
    onClose: code => {
      request.signal?.removeEventListener('abort', onAbort);
      connectionClosed = true;
      if (session === undefined) closeBootstrap(code);
      else session.close(code);
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
    | { readonly status: 'accepted'; readonly runtimeGeneration: RuntimeGeneration }
    | { readonly status: 'rejected'; readonly diagnostic: WorkspaceRuntimeBootstrapDiagnostic }
  >(resolve => {
    let settled = false;
    const finish = (
      result:
        | { readonly status: 'accepted'; readonly runtimeGeneration: RuntimeGeneration }
        | { readonly status: 'rejected'; readonly diagnostic: WorkspaceRuntimeBootstrapDiagnostic },
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({
        status: 'rejected',
        diagnostic: { code: 'runtime-unavailable', reason: 'timeout' },
      });
      peer.destroy();
    }, BOOTSTRAP_TIMEOUT_MS);
    timer.unref();

    acceptBootstrap = (frame: unknown): void => {
      const accepted = parseBootstrapAcceptedFrame(frame);
      if (accepted !== undefined) {
        if (accepted.workspaceIdentity !== request.workspaceIdentity || accepted.role !== request.role) {
          finish({
            status: 'rejected',
            diagnostic: { code: 'invalid-runtime-bootstrap' },
          });
          peer.destroy();
          return;
        }
        finish({
          status: 'accepted',
          runtimeGeneration: accepted.runtimeGeneration as RuntimeGeneration,
        });
        return;
      }

      const rejected = parseBootstrapRejectedFrame(frame);
      finish({
        status: 'rejected',
        diagnostic:
          rejected === undefined ? { code: 'invalid-runtime-bootstrap' } : mapBootstrapRejection(rejected, request),
      });
      peer.destroy();
    };
    closeBootstrap = (): void => {
      finish({
        status: 'rejected',
        diagnostic: { code: 'runtime-unavailable', reason: 'connection-failed' },
      });
    };

    peer.send({
      type: 'bootstrap',
      protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
      workspaceIdentity: request.workspaceIdentity,
      role: request.role,
      ...(runtimeCodeIdentity === undefined
        ? {}
        : {
            runtimeCodeIdentity,
            runtimeCodeMismatch,
          }),
    });
  });

  if (connectionAborted) {
    peer.destroy();
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }
  if (bootstrap.status === 'rejected') {
    peer.destroy();
    return bootstrap;
  }
  if (connectionClosed) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'connection-failed' },
    };
  }

  session = new RemoteWorkspaceConnection(peer);

  return {
    status: 'connected',
    workspaceIdentity: request.workspaceIdentity,
    role: request.role,
    runtimeGeneration: bootstrap.runtimeGeneration,
    compatibility: Object.freeze({
      protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
    }),
    workspace: createRemoteWorkspace(session),
  };
}

/** Connects to an existing runtime without exposing discovery or framing. */
export async function connectWorkspaceRuntime(
  request: ConnectWorkspaceRuntimeRequest,
): Promise<ConnectWorkspaceRuntimeResult> {
  return await connectWorkspaceRuntimeInternal(request);
}

/** Private launcher path: matching is proven before any Workspace call exists. */
export async function discoverWorkspaceRuntime(
  request: DiscoverWorkspaceRuntimeRequest,
): Promise<ConnectWorkspaceRuntimeResult> {
  return await connectWorkspaceRuntimeInternal(
    request,
    request.runtimeCodeIdentity,
    request.runtimeCodeMismatch ?? 'retire',
  );
}
