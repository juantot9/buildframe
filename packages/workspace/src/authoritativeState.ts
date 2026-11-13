import { Worker } from 'node:worker_threads';

import type {
  AuthoritativeStateErrorCode,
  StateCommitRequest,
  StateCommitResult,
  StateContentReadRequest,
  StateContentReadResult,
  StateMigrationCheckpoint,
  StateReadRequest,
  StateReadResult,
  StateStatus,
  StateTestFailpoint,
  StateWorkerData,
  StateWorkerRequest,
  StateWorkerResponse,
} from './authoritativeStateProtocol.js';
import type { WorkspaceIdentity } from './workspace.js';

export type {
  AuthoritativeStateErrorCode,
  StateCommitRequest,
  StateCommitResult,
  StateContentReadRequest,
  StateContentReadResult,
  StateReadRequest,
  StateReadResult,
  StateRecord,
  StateRecordWrite,
  StateStatus,
  StateTestFailpoint,
} from './authoritativeStateProtocol.js';

const IDENTITY_MAX_LENGTH = 512;
const KIND_MAX_LENGTH = 256;
const ROLE_MAX_LENGTH = 256;
const MAX_CONTENT_WINDOWS = 128;
const MAX_CONTENT_WINDOW_BYTES = 256 * 1024;
const MAX_CONTENT_READ_BYTES = 1024 * 1024;
const DEFAULT_STATE_REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_STATE_REQUEST_TIMEOUT_MILLISECONDS = 3_600_000;

export class AuthoritativeStateError extends Error {
  readonly code: AuthoritativeStateErrorCode;

  constructor(code: AuthoritativeStateErrorCode) {
    super(code);
    this.name = 'AuthoritativeStateError';
    this.code = code;
  }
}

/** Private construction input owned by the Workspace implementation. */
export interface OpenAuthoritativeStateRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly privateStateDirectory: string;
  /** Deterministic transaction fault injection for State contract tests only. */
  readonly testControl?: {
    readonly failpoint?: StateTestFailpoint;
    /** Contract tests may pause this exact command after Durable Commit. */
    readonly pauseAfterCommitCommandIdentity?: string;
    /** Contract tests may shorten the owner-side deadline deterministically. */
    readonly requestTimeoutMilliseconds?: number;
    /** Process-kill probes pause the private worker at this exact checkpoint. */
    readonly pauseAtMigrationCheckpoint?: StateMigrationCheckpoint;
    readonly onMigrationCheckpoint?: (checkpoint: StateMigrationCheckpoint) => void;
  };
}

/**
 * The private State Interface. Semantic owners submit one complete transition;
 * no caller receives SQLite, transaction, table, repository, or generation
 * mechanics.
 */
export interface AuthoritativeState {
  commit(request: StateCommitRequest): Promise<StateCommitResult>;
  read(request: StateReadRequest): Promise<StateReadResult>;
  readContent(request: StateContentReadRequest): Promise<StateContentReadResult>;
  status(): Promise<StateStatus>;
  close(): Promise<void>;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: AuthoritativeStateError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface PartialWorkerResponse {
  readonly kind?: StateWorkerResponse['kind'];
  readonly id?: number;
  readonly code?: AuthoritativeStateErrorCode;
  readonly checkpoint?: StateMigrationCheckpoint;
  readonly value?: unknown;
}

function validText(value: string, maximumLength: number): boolean {
  return value.length > 0 && value.length <= maximumLength && value.trim() === value && !value.includes('\u0000');
}

function requireIdentity(value: string, label: string): void {
  if (!validText(value, IDENTITY_MAX_LENGTH)) {
    throw new TypeError(`${label} must be a bounded non-empty identity`);
  }
}

function requireKind(value: string, label: string): void {
  if (!validText(value, KIND_MAX_LENGTH)) {
    throw new TypeError(`${label} must be a bounded non-empty kind`);
  }
}

function requireVersion(value: number, label: string, allowZero: boolean): void {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new TypeError(`${label} must be a safe integer`);
  }
}

function requireBytes(value: Uint8Array, label: string): void {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${label} must be exact binary bytes`);
  }
}

function validateCommit(request: StateCommitRequest): void {
  requireIdentity(request.commandIdentity, 'commandIdentity');
  requireVersion(request.expectedStateVersion, 'expectedStateVersion', true);
  requireKind(request.result.kind, 'result.kind');
  requireVersion(request.result.schemaVersion, 'result.schemaVersion', false);
  requireBytes(request.result.payload, 'result.payload');

  const recordIdentities = new Set<string>();
  for (const record of request.records) {
    requireIdentity(record.recordIdentity, 'recordIdentity');
    requireIdentity(record.workflowIdentity, 'workflowIdentity');
    requireKind(record.kind, 'record.kind');
    requireVersion(record.schemaVersion, 'record.schemaVersion', false);
    requireBytes(record.payload, 'record.payload');
    if (recordIdentities.has(record.recordIdentity)) {
      throw new TypeError('One transition cannot write a record twice');
    }
    recordIdentities.add(record.recordIdentity);

    if (record.recordClass === 'revisioned') {
      requireVersion(record.expectedRevision, 'expectedRevision', true);
    } else if (record.recordClass !== 'immutable') {
      throw new TypeError('Unknown State record class');
    }

    const roles = new Set<string>();
    for (const content of record.content) {
      if (!validText(content.role, ROLE_MAX_LENGTH)) {
        throw new TypeError('content.role must be a bounded non-empty role');
      }
      if (roles.has(content.role)) {
        throw new TypeError('One record cannot use a content role twice');
      }
      roles.add(content.role);
      requireBytes(content.bytes, 'content.bytes');
    }
  }
}

function validateRead(request: StateReadRequest): void {
  if (typeof request.includeContent !== 'boolean') {
    throw new TypeError('includeContent must be boolean');
  }
  for (const identity of request.recordIdentities) {
    requireIdentity(identity, 'recordIdentity');
  }
}

function validateContentRead(request: StateContentReadRequest): void {
  if (!Array.isArray(request.windows) || request.windows.length < 1 || request.windows.length > MAX_CONTENT_WINDOWS) {
    throw new TypeError('Exact-content reads require bounded windows');
  }
  let aggregateBytes = 0;
  for (const window of request.windows) {
    requireIdentity(window.recordIdentity, 'recordIdentity');
    if (!validText(window.role, ROLE_MAX_LENGTH)) {
      throw new TypeError('role must be a bounded non-empty role');
    }
    requireVersion(window.offset, 'offset', true);
    requireVersion(window.length, 'length', false);
    if (window.length > MAX_CONTENT_WINDOW_BYTES) {
      throw new TypeError('Exact-content window exceeds the private bound');
    }
    aggregateBytes += window.length;
    if (aggregateBytes > MAX_CONTENT_READ_BYTES) {
      throw new TypeError('Exact-content windows exceed the aggregate bound');
    }
  }
}

class WorkerAuthoritativeState implements AuthoritativeState {
  readonly #worker: Worker;
  readonly #requestTimeoutMilliseconds: number;
  readonly #pending = new Map<number, PendingRequest>();
  #nextRequestId = 1;
  #closed = false;
  #termination: Promise<number> | undefined;

  constructor(worker: Worker, requestTimeoutMilliseconds: number) {
    this.#worker = worker;
    this.#requestTimeoutMilliseconds = requestTimeoutMilliseconds;
    worker.on('message', (message: unknown) => this.#receive(message));
    worker.on('error', () => this.#failAll('state-unavailable'));
    worker.on('exit', () => this.#failAll('state-closed'));
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    validateCommit(request);
    return (await this.#send({ kind: 'commit', request })) as StateCommitResult;
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    validateRead(request);
    return (await this.#send({ kind: 'read', request })) as StateReadResult;
  }

  async readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    validateContentRead(request);
    return (await this.#send({
      kind: 'read-content',
      request,
    })) as StateContentReadResult;
  }

  async status(): Promise<StateStatus> {
    return (await this.#send({ kind: 'status' })) as StateStatus;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    try {
      await this.#send({ kind: 'close' });
    } finally {
      this.#closed = true;
    }
  }

  #send(
    request:
      | Omit<Extract<StateWorkerRequest, { readonly kind: 'commit' }>, 'id'>
      | Omit<Extract<StateWorkerRequest, { readonly kind: 'read' }>, 'id'>
      | Omit<Extract<StateWorkerRequest, { readonly kind: 'read-content' }>, 'id'>
      | Omit<Extract<StateWorkerRequest, { readonly kind: 'status' }>, 'id'>
      | Omit<Extract<StateWorkerRequest, { readonly kind: 'close' }>, 'id'>,
  ): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(new AuthoritativeStateError('state-closed'));
    }

    const id = this.#nextRequestId;
    this.#nextRequestId += 1;
    const message = { ...request, id } as StateWorkerRequest;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        void this.#timeout(id);
      }, this.#requestTimeoutMilliseconds);
      timer.unref();
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#worker.postMessage(message);
      } catch {
        const pending = this.#pending.get(id);
        if (pending === undefined) return;
        this.#pending.delete(id);
        clearTimeout(pending.timer);
        reject(new AuthoritativeStateError('state-unavailable'));
      }
    });
  }

  #receive(message: unknown): void {
    const response = message as PartialWorkerResponse;
    if ((response.kind !== 'result' && response.kind !== 'failed') || typeof response.id !== 'number' || this.#closed) {
      return;
    }

    const pending = this.#pending.get(response.id);
    if (!pending) return;
    this.#pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.kind === 'failed') {
      pending.reject(new AuthoritativeStateError(response.code ?? 'state-unavailable'));
    } else {
      pending.resolve(response.value);
    }
  }

  async #timeout(id: number): Promise<void> {
    if (this.#closed || !this.#pending.has(id)) return;

    this.#closed = true;
    for (const pending of this.#pending.values()) clearTimeout(pending.timer);

    // A synchronous worker cannot be interrupted at its message seam. Retire
    // the whole lifetime and wait for thread exit before reporting timeout, so
    // no writer lease or unknown in-flight operation survives the rejection.
    try {
      this.#termination ??= this.#worker.terminate();
      await this.#termination;
    } catch {
      // The lifetime remains closed even if Node cannot report termination;
      // every pending request still receives one conservative outcome.
    } finally {
      for (const [pendingId, pending] of this.#pending) {
        pending.reject(new AuthoritativeStateError(pendingId === id ? 'state-request-timeout' : 'state-closed'));
      }
      this.#pending.clear();
    }
  }

  #failAll(code: AuthoritativeStateErrorCode): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new AuthoritativeStateError(code));
    }
    this.#pending.clear();
  }
}

function workerModuleUrl(): URL {
  return import.meta.url.endsWith('.ts')
    ? new URL('./authoritativeStateWorker.ts', import.meta.url)
    : new URL('./authoritativeStateWorker.js', import.meta.url);
}

/** Opens the one production State implementation on its private worker. */
export async function openAuthoritativeState(request: OpenAuthoritativeStateRequest): Promise<AuthoritativeState> {
  requireIdentity(request.workspaceIdentity, 'workspaceIdentity');
  if (request.privateStateDirectory.length === 0) {
    throw new TypeError('privateStateDirectory must be available to the Workspace owner');
  }

  const requestTimeoutMilliseconds =
    request.testControl?.requestTimeoutMilliseconds ?? DEFAULT_STATE_REQUEST_TIMEOUT_MILLISECONDS;
  if (
    !Number.isSafeInteger(requestTimeoutMilliseconds) ||
    requestTimeoutMilliseconds < 1 ||
    requestTimeoutMilliseconds > MAXIMUM_STATE_REQUEST_TIMEOUT_MILLISECONDS
  ) {
    throw new TypeError('Authoritative State request timeout is outside its bound');
  }

  const workerData: StateWorkerData = {
    privateStateDirectory: request.privateStateDirectory,
    workspaceIdentity: request.workspaceIdentity,
    failpoint: request.testControl?.failpoint,
    pauseAfterCommitCommandIdentity: request.testControl?.pauseAfterCommitCommandIdentity,
    pauseAtMigrationCheckpoint: request.testControl?.pauseAtMigrationCheckpoint,
  };
  const worker = new Worker(workerModuleUrl(), { workerData });

  await new Promise<void>((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      const response = message as PartialWorkerResponse;
      if (response.kind === 'ready') {
        cleanup();
        resolve();
      } else if (response.kind === 'migration-checkpoint') {
        if (response.checkpoint) {
          request.testControl?.onMigrationCheckpoint?.(response.checkpoint);
        }
      } else if (response.kind === 'startup-failed') {
        cleanup();
        void worker.terminate();
        reject(new AuthoritativeStateError(response.code ?? 'state-unavailable'));
      }
    };
    const onError = (): void => {
      cleanup();
      reject(new AuthoritativeStateError('state-unavailable'));
    };
    const onExit = (): void => {
      cleanup();
      reject(new AuthoritativeStateError('state-unavailable'));
    };
    const cleanup = (): void => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
  });

  return new WorkerAuthoritativeState(worker, requestTimeoutMilliseconds);
}
