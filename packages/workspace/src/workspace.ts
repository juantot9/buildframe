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
import { HARNESS_COMMAND_KINDS, HARNESS_SCOPE_KINDS, HARNESS_VIEW_KINDS } from './harness-interaction/kinds.js';
import { KindRoutes } from './kindRoutes.js';
import type { WorkspaceBootstrapDiagnostic } from './workspaceBootstrapDiagnostics.js';
import { LEGACY_REVIEW_COMMAND_KINDS, LEGACY_REVIEW_VIEW_KINDS } from './legacyReviewImport/kinds.js';
import { PROJECTION_SCOPE_KINDS, PROJECTION_VIEW_KINDS } from './projection/kinds.js';
import { REVIEWING_COMMAND_KINDS } from './reviewing/kinds.js';
import { EVIDENCE_VIEW_KINDS } from './workspaceEvidence/kinds.js';
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

export type {
  UnsupportedPlatformDiagnostic,
  PathUnavailableDiagnostic,
  NotGitWorktreeDiagnostic,
  BareGitRepositoryDiagnostic,
  GitInspectionFailedDiagnostic,
  WorkspaceMarkerInvalidDiagnostic,
  WorkspaceMarkerMissingDiagnostic,
  WorkspaceRegistryInvalidDiagnostic,
  WorkspaceIdentityCollisionDiagnostic,
  WorkspaceRegistryBusyDiagnostic,
  WorkspaceAuthorityUnavailableDiagnostic,
  WorkspaceBootstrapDiagnostic,
} from './workspaceBootstrapDiagnostics.js';

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

/** A Workspace opened without State serves identity and evidence only. */
function writer<Owner>(owner: Owner | undefined): Owner {
  if (owner === undefined) throw new TypeError('This Workspace requires the runtime-owned writer');
  return owner;
}

class OpenWorkspace implements Workspace {
  readonly #identityView: WorkspaceIdentityView;
  readonly #evidence: WorkspaceEvidence;
  readonly #legacyReviewImport: LegacyReviewImportOwner | undefined;
  readonly #reviewing: ReviewingOwner | undefined;
  readonly #projection: WorkspaceProjection | undefined;
  readonly #harnessInteraction: HarnessInteractionOwner | undefined;
  readonly #commands: KindRoutes<(command: never) => Promise<WorkspaceCommandResult>>;
  readonly #views: KindRoutes<(request: never) => Promise<unknown>>;
  readonly #scopes: KindRoutes<(scope: never, onUpdate: never) => UnsubscribeWorkspace>;

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
            ...(internal.onLiveChangesCapture === undefined
              ? {}
              : { onLiveChangesCapture: internal.onLiveChangesCapture }),
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
            onCommittedStateVersion: stateVersion => this.#publishCommitted(stateVersion, 'harness-interaction'),
            ...(internal.afterHarnessCommitBeforeDirective === undefined
              ? {}
              : {
                  afterCommitBeforeDirective: internal.afterHarnessCommitBeforeDirective,
                }),
          });
    if (this.#harnessInteraction !== undefined) {
      harnessInteractionOwners.set(this, this.#harnessInteraction);
    }
    // Each owner declares its kinds; a kind with two owners fails here.
    const legacy = (): LegacyReviewImportOwner => writer(this.#legacyReviewImport);
    const harness = (): HarnessInteractionOwner => writer(this.#harnessInteraction);
    const projection = (): WorkspaceProjection => writer(this.#projection);
    this.#commands = new KindRoutes<(command: never) => Promise<WorkspaceCommandResult>>('command', [
      [
        REVIEWING_COMMAND_KINDS,
        async (command: ReviewingCommand) => this.#announce(await writer(this.#reviewing).execute(command)),
      ],
      [
        LEGACY_REVIEW_COMMAND_KINDS,
        async (command: LegacyReviewCommand) => this.#announce(await legacy().execute(command)),
      ],
      // Harness Interaction also commits outside commands, so it announces its own commits.
      [HARNESS_COMMAND_KINDS, async (command: HarnessInteractionCommand) => await harness().execute(command)],
    ]);
    this.#views = new KindRoutes<(request: never) => Promise<unknown>>('view', [
      [['workspace.identity'], async () => this.#identityView],
      [EVIDENCE_VIEW_KINDS, async (request: WorkspaceEvidenceViewRequest) => await this.#evidence.read(request)],
      [LEGACY_REVIEW_VIEW_KINDS, async (request: LegacyReviewImportViewRequest) => await legacy().read(request)],
      [HARNESS_VIEW_KINDS, async (request: HarnessInteractionViewRequest) => await harness().read(request)],
      [PROJECTION_VIEW_KINDS, async (request: WorkspaceProjectionViewRequest) => await projection().read(request)],
    ]);
    this.#scopes = new KindRoutes<(scope: never, onUpdate: never) => UnsubscribeWorkspace>('subscription', [
      [
        ['workspace.identity'],
        (_scope: WorkspaceIdentityViewScope, onUpdate: (update: WorkspaceIdentityView) => void) =>
          this.#subscribeIdentity(onUpdate),
      ],
      [
        HARNESS_SCOPE_KINDS,
        (scope: HarnessInteractionViewScope, onUpdate: (update: HarnessInteractionViewUpdate) => void) =>
          harness().subscribe(scope, onUpdate),
      ],
      [
        PROJECTION_SCOPE_KINDS,
        (scope: WorkspaceProjectionViewScope, onUpdate: (update: WorkspaceProjectionViewUpdate) => void) =>
          projection().subscribe(scope, onUpdate),
      ],
    ]);
  }

  /** The one path a committed State version takes to every owner that serves live views. */
  #publishCommitted(stateVersion: number, committedBy?: 'harness-interaction'): void {
    this.#projection?.publishCommittedVersion(stateVersion);
    if (committedBy !== 'harness-interaction') this.#harnessInteraction?.publishCommittedVersion(stateVersion);
  }

  #announce<Result extends WorkspaceCommandResult>(result: Result): Result {
    if (result.status === 'accepted') this.#publishCommitted(result.stateVersion);
    return result;
  }

  #subscribeIdentity(onUpdate: (update: WorkspaceIdentityView) => void): UnsubscribeWorkspace {
    let subscribed = true;
    queueMicrotask(() => {
      if (subscribed) onUpdate(this.#identityView);
    });
    return (): void => {
      subscribed = false;
    };
  }

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    return await this.#commands.route(command?.kind, 'command')(command as never);
  }

  async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
    return (await this.#views.route(request?.kind, 'view')(request as never)) as WorkspaceViewFor<Request>;
  }

  subscribe<Scope extends WorkspaceViewScope>(
    scope: Scope,
    onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): UnsubscribeWorkspace {
    return this.#scopes.route(scope?.kind, 'subscription')(scope as never, onUpdate as never);
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
  /** Private observation seam: counts full live recaptures. */
  readonly onLiveChangesCapture?: () => void;
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
