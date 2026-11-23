import type { WorkspaceIdentity } from './baseTypes.js';

/** Why a Workspace could not be opened; every expected bootstrap failure is one of these. */
export interface UnsupportedPlatformDiagnostic {
  readonly code: 'unsupported-platform';
  readonly platform: NodeJS.Platform;
  readonly reason: 'native-windows' | 'wsl1' | 'unsupported-operating-system';
}

export interface PathUnavailableDiagnostic {
  readonly code: 'path-unavailable';
  readonly requestedPath: string;
  readonly reason: 'missing' | 'not-directory' | 'unreadable';
}

export interface NotGitWorktreeDiagnostic {
  readonly code: 'not-git-worktree';
  readonly requestedPath: string;
}

export interface BareGitRepositoryDiagnostic {
  readonly code: 'bare-git-repository';
  readonly requestedPath: string;
}

export interface GitInspectionFailedDiagnostic {
  readonly code: 'git-inspection-failed';
  readonly requestedPath: string;
  readonly reason: 'git-unavailable' | 'repository-inaccessible' | 'inconsistent-worktree' | 'inspection-failed';
}

export interface WorkspaceMarkerInvalidDiagnostic {
  readonly code: 'workspace-marker-invalid';
  readonly canonicalCheckout: string;
}

export interface WorkspaceMarkerMissingDiagnostic {
  readonly code: 'workspace-marker-missing';
  readonly canonicalCheckout: string;
}

export interface WorkspaceRegistryInvalidDiagnostic {
  readonly code: 'workspace-registry-invalid';
  readonly reason: 'malformed' | 'unsupported-version' | 'invalid-registration';
}

export interface WorkspaceIdentityCollisionDiagnostic {
  readonly code: 'workspace-identity-collision';
  readonly reason: 'duplicate-marker' | 'registered-worktree-mismatch';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly registeredCheckout: string;
  readonly attemptedCheckout: string;
}

export interface WorkspaceRegistryBusyDiagnostic {
  readonly code: 'workspace-registry-busy';
}

export interface WorkspaceAuthorityUnavailableDiagnostic {
  readonly code: 'workspace-authority-unavailable';
  readonly requestedPath: string;
  readonly operation:
    | 'resolve-user-state'
    | 'lock-registry'
    | 'read-registry'
    | 'write-registry'
    | 'read-marker'
    | 'write-marker';
}

export type WorkspaceBootstrapDiagnostic =
  | UnsupportedPlatformDiagnostic
  | PathUnavailableDiagnostic
  | NotGitWorktreeDiagnostic
  | BareGitRepositoryDiagnostic
  | GitInspectionFailedDiagnostic
  | WorkspaceMarkerInvalidDiagnostic
  | WorkspaceMarkerMissingDiagnostic
  | WorkspaceRegistryInvalidDiagnostic
  | WorkspaceIdentityCollisionDiagnostic
  | WorkspaceRegistryBusyDiagnostic
  | WorkspaceAuthorityUnavailableDiagnostic;
