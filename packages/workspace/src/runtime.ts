import {
  AuthoritativeStateError,
  openAuthoritativeState,
  type AuthoritativeState,
  type AuthoritativeStateErrorCode,
} from './authoritativeState.js';
import type { WorkspaceHarnessAdapterHost } from './harness-interaction/contracts.js';
import {
  bootstrapWorkspace,
  openRuntimeWorkspace,
  workspaceGitDirectory,
  type Workspace,
  type WorkspaceBootstrapDiagnostic,
  type WorkspaceIdentity,
} from './workspace.js';
import { userStateDirectory } from './workspaceIdentity.js';

export interface OpenWorkspaceRuntimeOwnerRequest {
  /** A directory at or below the Git working-tree root. */
  readonly startPath: string;
}

export interface RuntimeWriterUnavailableDiagnostic {
  readonly code: 'runtime-writer-unavailable';
}

export interface RuntimeStateUnavailableDiagnostic {
  readonly code: 'runtime-state-unavailable';
  readonly reason: 'read-only-newer' | 'invalid' | 'corrupt' | 'migration-failed' | 'unavailable';
}

export type WorkspaceRuntimeOwnerDiagnostic =
  | WorkspaceBootstrapDiagnostic
  | RuntimeWriterUnavailableDiagnostic
  | RuntimeStateUnavailableDiagnostic;

/**
 * The launcher-only lifetime of one Workspace owner. State remains private;
 * readiness means its exclusive writer lease is already held.
 */
export interface WorkspaceRuntimeOwner {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly workspace: Workspace;
  /** Internal reviewed-Adapter seam; applications still receive only Workspace. */
  readonly harnessAdapters: WorkspaceHarnessAdapterHost;
  dispose(): Promise<void>;
}

export interface WorkspaceRuntimeOwnerReady {
  readonly status: 'ready';
  readonly owner: WorkspaceRuntimeOwner;
}

export interface WorkspaceRuntimeOwnerRejected {
  readonly status: 'rejected';
  readonly diagnostic: WorkspaceRuntimeOwnerDiagnostic;
}

export type OpenWorkspaceRuntimeOwnerResult = WorkspaceRuntimeOwnerReady | WorkspaceRuntimeOwnerRejected;

function mapStateFailure(
  code: AuthoritativeStateErrorCode,
): RuntimeWriterUnavailableDiagnostic | RuntimeStateUnavailableDiagnostic {
  if (code === 'writer-lease-unavailable') {
    return { code: 'runtime-writer-unavailable' };
  }
  if (code === 'state-invalid') {
    return { code: 'runtime-state-unavailable', reason: 'invalid' };
  }
  if (code === 'state-corrupt') {
    return { code: 'runtime-state-unavailable', reason: 'corrupt' };
  }
  if (code === 'state-migration-failed') {
    return { code: 'runtime-state-unavailable', reason: 'migration-failed' };
  }
  return { code: 'runtime-state-unavailable', reason: 'unavailable' };
}

class OpenWorkspaceRuntimeOwner implements WorkspaceRuntimeOwner {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly workspace: Workspace;
  readonly harnessAdapters: WorkspaceHarnessAdapterHost;
  readonly #state: AuthoritativeState;
  #disposed: Promise<void> | undefined;

  constructor(
    workspaceIdentity: WorkspaceIdentity,
    workspace: Workspace,
    harnessAdapters: WorkspaceHarnessAdapterHost,
    state: AuthoritativeState,
  ) {
    this.workspaceIdentity = workspaceIdentity;
    this.workspace = workspace;
    this.harnessAdapters = harnessAdapters;
    this.#state = state;
  }

  dispose(): Promise<void> {
    this.#disposed ??= this.#state.close();
    return this.#disposed;
  }
}

/**
 * Opens the complete runtime-owned Workspace lifetime. This is a deployment
 * seam, not the application-facing Workspace Interface.
 */
export async function openWorkspaceRuntimeOwner(
  request: OpenWorkspaceRuntimeOwnerRequest,
): Promise<OpenWorkspaceRuntimeOwnerResult> {
  const bootstrapped = await bootstrapWorkspace({ startPath: request.startPath });
  if (bootstrapped.status === 'rejected') return bootstrapped;

  const identity = await bootstrapped.workspace.read({
    kind: 'workspace.identity',
  });

  let state: AuthoritativeState;
  try {
    state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(request.startPath),
    });
  } catch (error) {
    return {
      status: 'rejected',
      diagnostic:
        error instanceof AuthoritativeStateError
          ? mapStateFailure(error.code)
          : { code: 'runtime-state-unavailable', reason: 'unavailable' },
    };
  }

  try {
    const status = await state.status();
    if (status.access !== 'read-write') {
      await state.close();
      return {
        status: 'rejected',
        diagnostic: {
          code: 'runtime-state-unavailable',
          reason: 'read-only-newer',
        },
      };
    }
  } catch (error) {
    await state.close().catch(() => undefined);
    return {
      status: 'rejected',
      diagnostic:
        error instanceof AuthoritativeStateError
          ? mapStateFailure(error.code)
          : { code: 'runtime-state-unavailable', reason: 'unavailable' },
    };
  }

  const assembly = openRuntimeWorkspace(
    identity.workspaceIdentity,
    identity.canonicalCheckout,
    state,
    {},
    workspaceGitDirectory(bootstrapped.workspace),
  );
  return {
    status: 'ready',
    owner: new OpenWorkspaceRuntimeOwner(
      identity.workspaceIdentity,
      assembly.workspace,
      assembly.harnessAdapters,
      state,
    ),
  };
}
