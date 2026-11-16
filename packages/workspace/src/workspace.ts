import type { AuthoritativeState } from './authoritativeState.js';
import { HarnessInteractionOwner } from './harness-interaction/harnessInteraction.js';
import type {
  HarnessInteractionCommand,
  HarnessInteractionCommandResult,
  HarnessInteractionView,
  HarnessInteractionViewFor,
  HarnessInteractionViewRequest,
  HarnessInteractionViewScope,
  HarnessInteractionViewUpdate,
  HarnessInteractionViewUpdateFor,
  WorkspaceHarnessAdapterHost,
} from './harness-interaction/contracts.js';
import {
  LegacyReviewImportOwner,
  type LegacyReviewCommand,
  type LegacyReviewCommandResult,
  type LegacyReviewImportView,
  type LegacyReviewImportViewFor,
  type LegacyReviewImportViewRequest,
} from './legacyReviewImport/index.js';
import {
  WorkspaceProjection,
  type WorkspaceProjectionView,
  type WorkspaceProjectionViewFor,
  type WorkspaceProjectionViewRequest,
  type WorkspaceProjectionViewScope,
  type WorkspaceProjectionViewUpdate,
  type WorkspaceProjectionViewUpdateFor,
} from './projection/index.js';
import { ReviewingOwner, type ReviewingCommand, type ReviewingCommandResult } from './reviewing/index.js';
import { resolveWorkspaceIdentity } from './workspaceIdentity.js';
import { workspaceInvalidationSource, type SubscribeToWorkspaceInvalidation } from './workspaceInvalidation.js';
import {
  WorkspaceEvidence,
  type WorkspaceEvidenceView,
  type WorkspaceEvidenceViewFor,
  type WorkspaceEvidenceViewRequest,
} from './workspaceEvidence/index.js';

declare const workspaceIdentityBrand: unique symbol;

/** A stable opaque identity for one canonical Git worktree. */
export type WorkspaceIdentity = string & {
  readonly [workspaceIdentityBrand]: 'WorkspaceIdentity';
};

export const WORKSPACE_INTERFACE_VERSION: 1 = 1;

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

/**
 * Whether someone is looking at the Workspace's live views. In the
 * background the Workspace checks the working tree less often between
 * file-watcher reports; back in the foreground it checks at once.
 */
export type WorkspaceAttention = 'foreground' | 'background';

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

export interface WorkspaceBootstrapRequest {
  /** A directory at or below the Git working-tree root. */
  readonly startPath: string;
}

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

export interface WorkspaceBootstrapReady {
  readonly status: 'ready';
  readonly workspace: Workspace;
}

export interface WorkspaceBootstrapRejected {
  readonly status: 'rejected';
  readonly diagnostic: WorkspaceBootstrapDiagnostic;
}

export type WorkspaceBootstrapResult = WorkspaceBootstrapReady | WorkspaceBootstrapRejected;

const harnessInteractionOwners = new WeakMap<Workspace, HarnessInteractionOwner>();
const gitDirectories = new WeakMap<Workspace, string>();

class OpenWorkspace implements Workspace {
  readonly #identityView: WorkspaceIdentityView;
  readonly #evidence: WorkspaceEvidence;
  readonly #legacyReviewImport: LegacyReviewImportOwner | undefined;
  readonly #reviewing: ReviewingOwner | undefined;
  readonly #projection: WorkspaceProjection | undefined;
  readonly #harnessInteraction: HarnessInteractionOwner | undefined;

  constructor(
    workspaceIdentity: WorkspaceIdentity,
    canonicalCheckout: string,
    state?: AuthoritativeState,
    internal: RuntimeWorkspaceInternalOptions = {},
    gitDirectory?: string,
  ) {
    this.#identityView = Object.freeze({
      kind: 'workspace.identity',
      interfaceVersion: WORKSPACE_INTERFACE_VERSION,
      workspaceIdentity,
      canonicalCheckout,
    });
    this.#evidence = new WorkspaceEvidence({
      workspaceIdentity,
      canonicalCheckout,
      ...(gitDirectory === undefined ? {} : { gitDirectory }),
      ...(internal.evidenceLimits === undefined ? {} : { limits: internal.evidenceLimits }),
    });
    if (gitDirectory !== undefined) gitDirectories.set(this, gitDirectory);
    this.#legacyReviewImport =
      state === undefined
        ? undefined
        : new LegacyReviewImportOwner({
            workspaceIdentity,
            canonicalCheckout,
            state,
            ...(internal.legacyReviewStateDirectory === undefined
              ? {}
              : { legacyStateDirectory: internal.legacyReviewStateDirectory }),
            ...(internal.legacyReviewImportMaximumOccurrences === undefined
              ? {}
              : {
                  maximumOccurrences: internal.legacyReviewImportMaximumOccurrences,
                }),
            ...(internal.legacyReviewSourceTestControl === undefined
              ? {}
              : { sourceTestControl: internal.legacyReviewSourceTestControl }),
          });
    this.#projection =
      state === undefined
        ? undefined
        : new WorkspaceProjection({
            workspaceIdentity,
            state,
            evidence: this.#evidence,
            subscribeToEvidenceInvalidation:
              internal.subscribeToEvidenceInvalidation ?? workspaceInvalidationSource(canonicalCheckout),
            ...(internal.liveFallbackVerificationMilliseconds === undefined
              ? {}
              : {
                  liveFallbackVerificationMilliseconds: internal.liveFallbackVerificationMilliseconds,
                }),
            ...(internal.liveBackgroundFallbackVerificationMilliseconds === undefined
              ? {}
              : {
                  liveBackgroundFallbackVerificationMilliseconds:
                    internal.liveBackgroundFallbackVerificationMilliseconds,
                }),
            ...(internal.onSnapshotEvidenceIdentityCacheSize === undefined
              ? {}
              : {
                  onSnapshotEvidenceIdentityCacheSize: internal.onSnapshotEvidenceIdentityCacheSize,
                }),
          });
    this.#reviewing =
      state === undefined || this.#legacyReviewImport === undefined
        ? undefined
        : new ReviewingOwner({
            workspaceIdentity,
            canonicalCheckout,
            state,
            evidence: this.#evidence,
            legacyReviewImport: this.#legacyReviewImport,
            onCurrentChangesCaptured: (reviewIdentity, captured) =>
              this.#projection?.adoptLiveCapture(reviewIdentity, captured),
          });
    this.#harnessInteraction =
      state === undefined
        ? undefined
        : new HarnessInteractionOwner({
            workspaceIdentity,
            canonicalCheckout,
            state,
            evidence: this.#evidence,
            onCommittedStateVersion: stateVersion => {
              this.#projection?.publishCommittedVersion(stateVersion);
            },
            ...(internal.afterHarnessCommitBeforeDirective === undefined
              ? {}
              : {
                  afterCommitBeforeDirective: internal.afterHarnessCommitBeforeDirective,
                }),
            ...(internal.harnessNow === undefined ? {} : { now: internal.harnessNow }),
          });
    if (this.#harnessInteraction !== undefined) {
      harnessInteractionOwners.set(this, this.#harnessInteraction);
    }
  }

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    if (
      this.#reviewing === undefined ||
      this.#harnessInteraction === undefined ||
      this.#legacyReviewImport === undefined
    ) {
      throw new TypeError('Workspace commands require the runtime-owned writer');
    }
    if (
      command.kind === 'legacy-review.source.import' ||
      command.kind === 'legacy-review.source.decision.set' ||
      command.kind === 'legacy-review.queue-candidate.decision.set' ||
      command.kind === 'legacy-review.moved-receipt-source.associate-and-import'
    ) {
      const result = await this.#legacyReviewImport.execute(command);
      if (result.status === 'accepted') {
        this.#projection?.publishCommittedVersion(result.stateVersion);
        this.#harnessInteraction.publishCommittedVersion(result.stateVersion);
      }
      return result;
    }
    if (
      command.kind.startsWith('harness.') ||
      command.kind === 'review.question.ask' ||
      command.kind === 'review.message.commit'
    ) {
      return await this.#harnessInteraction.execute(command);
    }
    const result = await this.#reviewing.execute(command);
    if (result.status === 'accepted') {
      this.#projection?.publishCommittedVersion(result.stateVersion);
      this.#harnessInteraction.publishCommittedVersion(result.stateVersion);
    }
    return result;
  }

  async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
    if (request.kind === 'workspace.identity') {
      return this.#identityView as WorkspaceViewFor<Request>;
    }
    if (
      request.kind === 'legacy-review.sources' ||
      request.kind === 'legacy-review.receipt-history' ||
      request.kind === 'legacy-review.receipt-batch' ||
      request.kind === 'legacy-review.queue-candidates' ||
      request.kind === 'legacy-review.queue-candidate' ||
      request.kind === 'legacy-review.moved-receipt-sources' ||
      request.kind === 'legacy-review.moved-receipt-source'
    ) {
      if (this.#legacyReviewImport === undefined) {
        throw new TypeError('Legacy Review projections require the runtime-owned writer');
      }
      return (await this.#legacyReviewImport.read(request)) as WorkspaceViewFor<Request>;
    }
    if (
      request.kind.startsWith('workspace.current-changes.') ||
      request.kind.startsWith('workspace.context.') ||
      request.kind === 'workspace.review-comparison.capture'
    ) {
      return (await this.#evidence.read(request as WorkspaceEvidenceViewRequest)) as WorkspaceViewFor<Request>;
    }
    if (request.kind.startsWith('harness.')) {
      if (this.#harnessInteraction === undefined) {
        throw new TypeError('Harness projections require the runtime-owned writer');
      }
      return (await this.#harnessInteraction.read(
        request as HarnessInteractionViewRequest,
      )) as WorkspaceViewFor<Request>;
    }
    if (this.#projection === undefined) {
      throw new TypeError('Workspace projections require the runtime-owned writer');
    }
    return (await this.#projection.read(request as WorkspaceProjectionViewRequest)) as WorkspaceViewFor<Request>;
  }

  subscribe<Scope extends WorkspaceViewScope>(
    scope: Scope,
    onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): UnsubscribeWorkspace {
    if (scope.kind === 'workspace.identity') {
      let subscribed = true;
      queueMicrotask(() => {
        if (subscribed) {
          onUpdate(this.#identityView as WorkspaceViewUpdateFor<Scope>);
        }
      });
      return (): void => {
        subscribed = false;
      };
    }
    if (scope.kind.startsWith('harness.')) {
      if (this.#harnessInteraction === undefined) {
        throw new TypeError('Harness projections require the runtime-owned writer');
      }
      return this.#harnessInteraction.subscribe(
        scope as HarnessInteractionViewScope,
        onUpdate as (update: HarnessInteractionViewUpdate) => void,
      );
    }
    if (this.#projection === undefined) {
      throw new TypeError('Workspace projections require the runtime-owned writer');
    }
    return this.#projection.subscribe(
      scope as WorkspaceProjectionViewScope,
      onUpdate as (update: WorkspaceProjectionViewUpdate) => void,
    );
  }

  setAttention(attention: WorkspaceAttention): void {
    if (attention !== 'foreground' && attention !== 'background') {
      throw new TypeError('Invalid Workspace attention');
    }
    this.#projection?.setAttention(attention);
  }
}

/** Package-private metadata handoff; absent from the Workspace Interface. */
export function workspaceGitDirectory(workspace: Workspace): string | undefined {
  return gitDirectories.get(workspace);
}

export interface RuntimeWorkspaceAssembly {
  readonly workspace: Workspace;
  readonly harnessAdapters: WorkspaceHarnessAdapterHost;
  /** Resolves work a previous runtime left in flight; run before Adapters attach. */
  readonly recoverLostInvocations: () => Promise<void>;
}

/** Internal deterministic fault seam; absent from the package Interface. */
export interface RuntimeWorkspaceInternalOptions {
  readonly afterHarnessCommitBeforeDirective?: () => void | Promise<void>;
  /** Private deterministic clock seam for User Pull expiry scenarios. */
  readonly harnessNow?: () => Date;
  /** Private override for disposable discovery of old-product receipt paths. */
  readonly legacyReviewStateDirectory?: string;
  /** Private deterministic bound seam for legacy import contract tests. */
  readonly legacyReviewImportMaximumOccurrences?: number;
  /** Private deterministic source-race seam for legacy import contracts. */
  readonly legacyReviewSourceTestControl?: import('./legacyReviewSource.js').LegacyReviewSourceTestControl;
  readonly subscribeToEvidenceInvalidation?: SubscribeToWorkspaceInvalidation;
  readonly liveFallbackVerificationMilliseconds?: number;
  readonly liveBackgroundFallbackVerificationMilliseconds?: number;
  /** Private deterministic observation seam for bounded Projection cache tests. */
  readonly onSnapshotEvidenceIdentityCacheSize?: (size: number) => void;
  /** Private small-limit seam, so scale contracts need no huge repositories. */
  readonly evidenceLimits?: Partial<import('./workspaceEvidence/contracts.js').WorkspaceEvidenceLimits>;
}

/** State-private assembly used only by the launcher-owned runtime lifetime. */
export function openRuntimeWorkspace(
  workspaceIdentity: WorkspaceIdentity,
  canonicalCheckout: string,
  state: AuthoritativeState,
  internal: RuntimeWorkspaceInternalOptions = {},
  gitDirectory?: string,
): RuntimeWorkspaceAssembly {
  const workspace = new OpenWorkspace(workspaceIdentity, canonicalCheckout, state, internal, gitDirectory);
  const harnessInteraction = harnessInteractionOwners.get(workspace);
  if (harnessInteraction === undefined) {
    throw new TypeError('Harness Adapter hosting requires the runtime-owned writer');
  }
  return {
    workspace,
    harnessAdapters: harnessInteraction.adapterHost,
    recoverLostInvocations: async () => await harnessInteraction.recoverLostInvocations(),
  };
}

/**
 * Resolves one supported Git worktree and opens its closed Workspace Interface.
 * Expected bootstrap failures are returned as typed diagnostics and never throw.
 */
export async function bootstrapWorkspace(request: WorkspaceBootstrapRequest): Promise<WorkspaceBootstrapResult> {
  const resolved = await resolveWorkspaceIdentity(request.startPath);
  if (resolved.status === 'rejected') return resolved;

  return {
    status: 'ready',
    workspace: new OpenWorkspace(
      resolved.workspaceIdentity,
      resolved.canonicalCheckout,
      undefined,
      {},
      resolved.gitDirectory,
    ),
  };
}
