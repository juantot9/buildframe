import type { Workspace, WorkspaceIdentity } from '@buildframe/workspace';

export const LOCAL_RUNTIME_PROTOCOL_VERSION: 1 = 1;
/** Closed evidence/directive transport version, independent of product SemVer. */
export const HARNESS_ADAPTER_PROTOCOL_VERSION: 1 = 1;

/** The semantic role established before a client may cross the Workspace Interface. */
export type LocalRuntimeClientRole = 'tui' | 'cli' | 'harness-adapter' | 'editor-adapter';

declare const runtimeGenerationBrand: unique symbol;
declare const runtimeCodeIdentityBrand: unique symbol;

/** One opaque incarnation of a workspace runtime process. */
export type RuntimeGeneration = string & {
  readonly [runtimeGenerationBrand]: 'RuntimeGeneration';
};

/** One exact local build incarnation of the runtime-owning code. */
export type RuntimeCodeIdentity = string & {
  readonly [runtimeCodeIdentityBrand]: 'RuntimeCodeIdentity';
};

export interface ConnectWorkspaceRuntimeRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly role: LocalRuntimeClientRole;
  /** Aborting ends this connection. It never replays a Workspace call. */
  readonly signal?: AbortSignal;
}

export interface RuntimeCompatibility {
  readonly protocolVersion: typeof LOCAL_RUNTIME_PROTOCOL_VERSION;
  readonly workspaceInterfaceVersion: 1;
}

export interface WorkspaceRuntimeConnected {
  readonly status: 'connected';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly role: LocalRuntimeClientRole;
  readonly runtimeGeneration: RuntimeGeneration;
  readonly compatibility: RuntimeCompatibility;
  /** The semantic seam contains exactly execute, read, and subscribe. */
  readonly workspace: Workspace;
}

export interface RuntimeUnavailableDiagnostic {
  readonly code: 'runtime-unavailable';
  readonly reason: 'not-running' | 'connection-failed' | 'timeout' | 'cancelled' | 'insecure-runtime';
}

export interface RuntimeProtocolIncompatibleDiagnostic {
  readonly code: 'runtime-protocol-incompatible';
  readonly supportedVersion: typeof LOCAL_RUNTIME_PROTOCOL_VERSION;
  readonly receivedVersion: number;
}

export interface WorkspaceInterfaceIncompatibleDiagnostic {
  readonly code: 'workspace-interface-incompatible';
  readonly supportedVersion: 1;
  readonly receivedVersion: number;
}

export interface RuntimeWorkspaceMismatchDiagnostic {
  readonly code: 'runtime-workspace-mismatch';
}

export interface RuntimeCodeMismatchDiagnostic {
  readonly code: 'runtime-code-mismatch';
}

export interface RuntimeRoleRejectedDiagnostic {
  readonly code: 'runtime-role-rejected';
  readonly role: LocalRuntimeClientRole;
}

export interface InvalidRuntimeBootstrapDiagnostic {
  readonly code: 'invalid-runtime-bootstrap';
}

export type WorkspaceRuntimeBootstrapDiagnostic =
  | RuntimeUnavailableDiagnostic
  | RuntimeProtocolIncompatibleDiagnostic
  | WorkspaceInterfaceIncompatibleDiagnostic
  | RuntimeWorkspaceMismatchDiagnostic
  | RuntimeCodeMismatchDiagnostic
  | RuntimeRoleRejectedDiagnostic
  | InvalidRuntimeBootstrapDiagnostic;

export interface WorkspaceRuntimeRejected {
  readonly status: 'rejected';
  readonly diagnostic: WorkspaceRuntimeBootstrapDiagnostic;
}

export type ConnectWorkspaceRuntimeResult = WorkspaceRuntimeConnected | WorkspaceRuntimeRejected;

export type LocalRuntimeSessionErrorCode =
  | 'runtime-disconnected'
  | 'workspace-call-rejected'
  | 'runtime-protocol-failure';

/** A post-bootstrap session failure; no transport detail crosses this Interface. */
export class LocalRuntimeSessionError extends Error {
  readonly code: LocalRuntimeSessionErrorCode;

  constructor(code: LocalRuntimeSessionErrorCode) {
    super(code);
    this.name = 'LocalRuntimeSessionError';
    this.code = code;
  }
}
