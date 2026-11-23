import type {
  HarnessInteractionCommand,
  HarnessInteractionCommandResult,
  HarnessInteractionView,
  HarnessInteractionViewFor,
  HarnessInteractionViewRequest,
  HarnessInteractionViewScope,
  HarnessInteractionViewUpdate,
  HarnessInteractionViewUpdateFor,
} from './harness-interaction/contracts.js';
import type {
  LegacyReviewCommand,
  LegacyReviewCommandResult,
  LegacyReviewImportView,
  LegacyReviewImportViewFor,
  LegacyReviewImportViewRequest,
} from './legacyReviewImport/index.js';
import type {
  WorkspaceProjectionView,
  WorkspaceProjectionViewFor,
  WorkspaceProjectionViewRequest,
  WorkspaceProjectionViewScope,
  WorkspaceProjectionViewUpdateFor,
} from './projection/index.js';
import type { ReviewingCommand, ReviewingCommandResult } from './reviewing/index.js';
import type {
  WorkspaceEvidenceView,
  WorkspaceEvidenceViewFor,
  WorkspaceEvidenceViewRequest,
} from './workspaceEvidence/index.js';
import type { WORKSPACE_INTERFACE_VERSION, WorkspaceAttention, WorkspaceIdentity } from './baseTypes.js';

/**
 * The Workspace Interface's public types: its commands, views, scopes and
 * updates, joined from each owner's own. A new owner adds its types here and
 * its routes in workspace.ts.
 */

/** Closed semantic command family owned behind the Workspace Interface. */
export type WorkspaceCommand = ReviewingCommand | HarnessInteractionCommand | LegacyReviewCommand;
export type WorkspaceCommandResult =
  | ReviewingCommandResult
  | HarnessInteractionCommandResult
  | LegacyReviewCommandResult;

export interface WorkspaceIdentityViewRequest {
  readonly kind: 'workspace.identity';
}

export type WorkspaceViewRequest =
  | WorkspaceIdentityViewRequest
  | LegacyReviewImportViewRequest
  | WorkspaceEvidenceViewRequest
  | WorkspaceProjectionViewRequest
  | HarnessInteractionViewRequest;

export interface WorkspaceIdentityView {
  readonly kind: 'workspace.identity';
  readonly interfaceVersion: typeof WORKSPACE_INTERFACE_VERSION;
  readonly workspaceIdentity: WorkspaceIdentity;
  /** A locator for presentation and attachment checks, never the Workspace Identity. */
  readonly canonicalCheckout: string;
}

export type WorkspaceView =
  | WorkspaceIdentityView
  | LegacyReviewImportView
  | WorkspaceEvidenceView
  | WorkspaceProjectionView
  | HarnessInteractionView;

export type WorkspaceViewFor<Request extends WorkspaceViewRequest> = Request extends WorkspaceIdentityViewRequest
  ? WorkspaceIdentityView
  : Request extends LegacyReviewImportViewRequest
    ? LegacyReviewImportViewFor<Request>
    : Request extends WorkspaceEvidenceViewRequest
      ? WorkspaceEvidenceViewFor<Request>
      : Request extends WorkspaceProjectionViewRequest
        ? WorkspaceProjectionViewFor<Request>
        : Request extends HarnessInteractionViewRequest
          ? HarnessInteractionViewFor<Request>
          : never;

export interface WorkspaceIdentityViewScope {
  readonly kind: 'workspace.identity';
}

export type WorkspaceViewScope =
  | WorkspaceIdentityViewScope
  | WorkspaceProjectionViewScope
  | HarnessInteractionViewScope;
export type WorkspaceViewUpdate = WorkspaceIdentityView | WorkspaceProjectionView | HarnessInteractionViewUpdate;
export type WorkspaceViewUpdateFor<Scope extends WorkspaceViewScope> = Scope extends WorkspaceIdentityViewScope
  ? WorkspaceIdentityView
  : Scope extends WorkspaceProjectionViewScope
    ? WorkspaceProjectionViewUpdateFor<Scope>
    : Scope extends HarnessInteractionViewScope
      ? HarnessInteractionViewUpdateFor<Scope>
      : never;
export type UnsubscribeWorkspace = () => void;

/** The only application-facing Interface for one Workspace Identity. */
export interface Workspace {
  execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult>;
  read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>>;
  subscribe<Scope extends WorkspaceViewScope>(
    scope: Scope,
    onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): UnsubscribeWorkspace;
  /** This caller's latest attention; the Workspace starts in the foreground. */
  setAttention(attention: WorkspaceAttention): void;
}
