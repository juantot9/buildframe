import type { WorkspaceAuthorityUnavailableDiagnostic, WorkspaceBootstrapDiagnostic } from './workspaceBootstrapDiagnostics.js';

/** A Workspace bootstrap refusal, carrying the diagnostic the caller reports. */
export class BootstrapProblem extends Error {
  readonly diagnostic: WorkspaceBootstrapDiagnostic;

  constructor(diagnostic: WorkspaceBootstrapDiagnostic) {
    super(diagnostic.code);
    this.diagnostic = diagnostic;
  }
}

export function authorityUnavailable(
  requestedPath: string,
  operation: WorkspaceAuthorityUnavailableDiagnostic['operation'],
): BootstrapProblem {
  return new BootstrapProblem({
    code: 'workspace-authority-unavailable',
    requestedPath,
    operation,
  });
}
