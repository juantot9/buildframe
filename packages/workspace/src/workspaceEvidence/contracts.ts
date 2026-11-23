import type {
  ContextSelectionVerifyRequest,
  ContextSelectionVerifyView,
  ContextSourceCaptureRequest,
  ContextSourceCaptureView,
  ContextSourceContentRequest,
  ContextSourceContentView,
  ContextSourceManifestRequest,
  ContextSourceManifestView,
  ContextSourceResolutionRequest,
  ContextSourceResolutionView,
} from '../contextEvidence.js';
import { deepFreeze } from '../recordCodec.js';
import type { WorkspaceIdentity } from '../baseTypes.js';

export const MEBIBYTE: number = 1024 * 1024;

const DEFAULT_LIMITS: WorkspaceEvidenceLimits = Object.freeze({
  formatVersion: 1,
  maxManifestFiles: 100_000,
  maxManifestBytes: 64 * MEBIBYTE,
  maxCapturedContentBytes: 50 * MEBIBYTE,
  maxCapturedFileBytes: 50 * MEBIBYTE,
  maxVerifiedContentBytes: 128 * MEBIBYTE,
  maxVerifiedFileBytes: 128 * MEBIBYTE,
  maxManifestWindowFiles: 64,
  maxContentWindowBytes: 256 * 1024,
  maxCaptureAttempts: 3,
  maxContextCandidates: 250_000,
});

export type WorkspaceVerificationState = 'current' | 'stale' | 'unverified';

export type WorkspaceVerificationReason =
  | 'captured-coherently'
  | 'head-moved'
  | 'manifest-changed'
  | 'content-changed'
  | 'capture-incomplete'
  | 'inspection-failed'
  | 'unstable-workspace'
  | 'evidence-not-retained';

export interface WorkspaceVerification {
  readonly state: WorkspaceVerificationState;
  readonly observedAt: string;
  readonly reason: WorkspaceVerificationReason;
}

export interface EvidencePath {
  /** Exact repository-relative path bytes. */
  readonly bytesBase64: string;
  /** Escaped presentation only; never path identity. */
  readonly display: string;
}

/** Package-private current-checkout enumeration consumed by Review projections. */
export interface CurrentRepositoryFile {
  readonly fileIdentity: string;
  readonly path: EvidencePath;
}

export type CurrentRepositoryFiles =
  | { readonly status: 'available'; readonly files: readonly CurrentRepositoryFile[] }
  | { readonly status: 'unavailable'; readonly reason: 'inspection-failed' };

/** Bounded current working-tree content for one unchanged repository file. */
export type CurrentRepositoryFileContent =
  | {
      readonly status: 'available';
      readonly bytesBase64: string;
      readonly byteLength: number;
      readonly totalByteLength: number;
      readonly firstLine: number;
      readonly lineCount: number;
      readonly totalLines: number;
      readonly truncated: boolean;
    }
  | { readonly status: 'unsupported'; readonly classification: 'binary' | 'unrenderable' }
  | { readonly status: 'too-large' }
  | { readonly status: 'unavailable' };

export type EvidenceSideKind = 'regular' | 'symlink' | 'gitlink' | 'special' | 'unknown';

export type EvidenceContentClassification = 'text' | 'binary' | 'unrenderable' | 'unknown';

export type EvidenceContentAvailability = 'captured' | 'not-captured' | 'unavailable';

export type EvidenceContentLimitation =
  | 'aggregate-capture-limit'
  | 'file-capture-limit'
  | 'aggregate-verification-limit'
  | 'file-verification-limit'
  | 'missing-object'
  | 'unsupported-file-kind'
  | 'unsupported-content-filter'
  | 'large-file-payload-unavailable'
  | 'unmerged-index'
  | 'read-failed';

export interface EvidenceContentIdentity {
  readonly algorithm: 'sha256';
  readonly value: string;
}

export interface GitObjectIdentity {
  readonly algorithm: 'sha1' | 'sha256' | 'unknown';
  readonly value: string;
}

export interface EvidenceSymlinkTarget {
  readonly byteLength: number;
  readonly contentIdentity: EvidenceContentIdentity;
  /** Exact target bytes, never bytes read through the target. */
  readonly bytesBase64: string;
}

export type EvidenceSpecialEntryKind = 'fifo' | 'socket' | 'character-device' | 'block-device' | 'other';

export interface EvidenceSpecialEntry {
  readonly kind: EvidenceSpecialEntryKind;
  readonly content: 'not-applicable';
}

export interface EvidenceSparseAbsence {
  readonly indexFlag: 'skip-worktree';
  readonly workingTree: 'intentionally-absent';
}

export type EvidenceGitlinkCheckout =
  | {
      readonly availability: 'available';
      readonly checkedOutCommit: GitObjectIdentity;
      readonly dirty: boolean;
      readonly untracked: boolean;
    }
  | {
      readonly availability: 'unavailable';
      readonly reason: 'not-present' | 'not-repository' | 'head-unavailable' | 'inspection-failed';
    };

export interface EvidenceGitlink {
  readonly objectIdentity: GitObjectIdentity;
  /** Present only for a working endpoint; parent content is never traversed. */
  readonly checkout?: EvidenceGitlinkCheckout;
}

export interface EvidenceGeneratedClassification {
  readonly classification: 'generated';
  readonly source: 'git-attribute';
  readonly attribute: 'linguist-generated' | 'generated';
}

export interface EvidenceLargeFilePointer {
  readonly kind: 'git-lfs-pointer-v1';
  readonly pointer: {
    readonly byteLength: number;
    readonly contentIdentity: EvidenceContentIdentity;
    readonly bytesBase64: string;
  };
  readonly declaredPayload: {
    readonly objectIdentity: EvidenceContentIdentity;
    readonly byteLength: number;
  };
  readonly sideRepresentation: 'pointer' | 'payload' | 'unverified';
  readonly localPayload: {
    readonly availability: 'available' | 'unavailable' | 'unverified';
    readonly contentAvailability: EvidenceContentAvailability;
    readonly contentIdentity?: EvidenceContentIdentity;
    readonly contentLimitation?: EvidenceContentLimitation;
  };
}

export interface CurrentChangeSide {
  readonly path: EvidencePath;
  readonly kind: EvidenceSideKind;
  readonly gitMode: string;
  readonly byteLength: number | null;
  readonly evidenceSource: 'head' | 'working-tree' | 'commit' | 'tree' | 'index';
  readonly objectIdentity?: GitObjectIdentity;
  readonly contentIdentity?: EvidenceContentIdentity;
  readonly classification: EvidenceContentClassification;
  readonly contentAvailability: EvidenceContentAvailability;
  readonly contentLimitation?: EvidenceContentLimitation;
  /** Present only when an otherwise named object is locally missing. */
  readonly objectAvailability?: 'missing';
  readonly symlinkTarget?: EvidenceSymlinkTarget;
  readonly specialEntry?: EvidenceSpecialEntry;
  readonly sparseAbsence?: EvidenceSparseAbsence;
  readonly gitlink?: EvidenceGitlink;
  readonly largeFilePointer?: EvidenceLargeFilePointer;
  readonly generated?: EvidenceGeneratedClassification;
  /** Raw bytes may be captured, but canonical filtered identity is unsupported. */
  readonly workingEvidenceLimitation?: 'unsupported-content-filter';
}

export type CurrentChangeStatus =
  | 'added'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'mode-changed'
  | 'type-changed'
  | 'staging-only';

export type CurrentChangeStage =
  | 'unchanged'
  | 'added'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'unmerged'
  | 'untracked';

export interface CurrentChangeStagingProvenance {
  readonly index: CurrentChangeStage;
  readonly workingTree: CurrentChangeStage;
}

export interface EvidenceScopeMembership {
  readonly selectionPath: EvidencePath;
  readonly selectionKind: 'file' | 'directory';
  readonly inclusion: 'ordinary' | 'explicit-ignored';
  readonly matchedSides: readonly ('old' | 'new')[];
}

export interface CurrentChangedFile {
  readonly fileIdentity: string;
  readonly status: CurrentChangeStatus;
  readonly staging: CurrentChangeStagingProvenance;
  readonly oldSide?: CurrentChangeSide;
  readonly newSide?: CurrentChangeSide;
  /** Present only when an explicit comparison scope selected this occurrence. */
  readonly scopeMembership?: readonly EvidenceScopeMembership[];
}

export interface WorkspaceEvidenceLimits {
  readonly formatVersion: 1;
  readonly maxManifestFiles: number;
  readonly maxManifestBytes: number;
  readonly maxCapturedContentBytes: number;
  readonly maxCapturedFileBytes: number;
  readonly maxVerifiedContentBytes: number;
  readonly maxVerifiedFileBytes: number;
  readonly maxManifestWindowFiles: number;
  readonly maxContentWindowBytes: number;
  readonly maxCaptureAttempts: number;
  readonly maxContextCandidates: number;
}

export interface CaptureCurrentChangesEvidenceRequest {
  readonly kind: 'workspace.current-changes.capture';
}

export type ReviewRevisionObjectKind = 'commit' | 'tree';

export interface ReviewComparisonFileScopeEntry {
  /** Canonical Base64 of exact repository-relative path bytes. */
  readonly pathBytesBase64: string;
  readonly inclusion: 'ordinary' | 'include-ignored';
}

export interface ReviewComparisonFileScope {
  readonly kind: 'exact-paths';
  readonly entries: readonly ReviewComparisonFileScopeEntry[];
}

interface ReviewComparisonScopeCarrier {
  readonly scope?: ReviewComparisonFileScope;
}

export type ReviewRevisionEndpointSelection =
  | {
      readonly kind: 'object';
      readonly objectKind: ReviewRevisionObjectKind;
      readonly objectIdentity: string;
    }
  | {
      readonly kind: 'local-ref';
      readonly objectKind: ReviewRevisionObjectKind;
      readonly reference: string;
    };

export type ReviewComparisonSelection =
  | ({ readonly kind: 'last-commit' } & ReviewComparisonScopeCarrier)
  | ({ readonly kind: 'head-ancestry'; readonly commitCount: number } & ReviewComparisonScopeCarrier)
  | ({
      readonly kind: 'commit';
      readonly revision: string;
      readonly parentRevision?: string;
    } & ReviewComparisonScopeCarrier)
  | ({ readonly kind: 'commit-to-head'; readonly revision: string } & ReviewComparisonScopeCarrier)
  | ({
      readonly kind: 'revision-pair';
      readonly basis: ReviewRevisionEndpointSelection;
      readonly compared: ReviewRevisionEndpointSelection;
    } & ReviewComparisonScopeCarrier)
  | ({
      readonly kind: 'local-ref-merge-base';
      readonly selectedReference: string;
      readonly comparedCommitIdentity: string;
    } & ReviewComparisonScopeCarrier)
  | ({
      readonly kind: 'revision-to-index';
      readonly basis: ReviewRevisionEndpointSelection;
    } & ReviewComparisonScopeCarrier)
  | ({
      readonly kind: 'revision-to-working-state';
      readonly basis: ReviewRevisionEndpointSelection;
    } & ReviewComparisonScopeCarrier)
  | ({ readonly kind: 'index-to-working-tree' } & ReviewComparisonScopeCarrier);

export interface CaptureReviewComparisonEvidenceRequest {
  readonly kind: 'workspace.review-comparison.capture';
  readonly selection: ReviewComparisonSelection;
}

export interface CurrentChangesManifestRequest {
  readonly kind: 'workspace.current-changes.manifest';
  readonly evidenceIdentity: string;
  readonly offset: number;
  readonly limit: number;
}

export interface CurrentChangesContentRequest {
  readonly kind: 'workspace.current-changes.content';
  readonly evidenceIdentity: string;
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  /** Absent means the endpoint-side bytes, preserving every format-1 caller. */
  readonly representation?: 'large-file-payload';
  readonly offset: number;
  readonly length: number;
}

export interface VerifyCurrentChangesEvidenceRequest {
  readonly kind: 'workspace.current-changes.verify';
  readonly evidenceIdentity: string;
}

export type WorkspaceEvidenceViewRequest =
  | CaptureCurrentChangesEvidenceRequest
  | CaptureReviewComparisonEvidenceRequest
  | CurrentChangesManifestRequest
  | CurrentChangesContentRequest
  | VerifyCurrentChangesEvidenceRequest
  | ContextSourceManifestRequest
  | ContextSourceCaptureRequest
  | ContextSourceContentRequest
  | ContextSourceResolutionRequest
  | ContextSelectionVerifyRequest;

export interface CurrentChangesComparisonBasis {
  readonly kind: 'head';
  readonly selector: 'HEAD';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly objectIdentity: string | null;
  readonly state: 'resolved' | 'unborn';
}

export interface CurrentChangesComparedState {
  readonly kind: 'effective-working-state';
  readonly staged: 'included';
  readonly unstaged: 'included';
  readonly nonIgnoredUntracked: 'included';
  readonly ignoredUntracked: 'excluded';
}

export interface ReviewComparisonCommitEndpoint {
  readonly kind: 'commit';
  readonly selector: string;
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly objectIdentity: string;
  readonly abbreviatedObjectIdentity: string;
  readonly subject: string;
  /** Exact endpoint projection for the declared file scope. */
  readonly scopeFingerprint?: string;
}

export interface ReviewComparisonTreeEndpoint {
  readonly kind: 'tree';
  readonly selector: string;
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly objectIdentity: string;
  readonly abbreviatedObjectIdentity: string;
  /** Exact endpoint projection for the declared file scope. */
  readonly scopeFingerprint?: string;
}

export type ReviewComparisonRevisionEndpoint = ReviewComparisonCommitEndpoint | ReviewComparisonTreeEndpoint;

export interface ReviewComparisonEmptyTreeEndpoint {
  readonly kind: 'empty-tree';
  readonly selector: 'root parent';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly objectIdentity: null;
  readonly scopeFingerprint?: string;
}

export interface ReviewComparisonIndexEndpoint {
  readonly kind: 'index';
  readonly selector: 'index';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly entryCount: number;
  readonly indexFingerprint: string;
}

export interface ReviewComparisonWorkingStateEndpoint {
  readonly kind: 'effective-working-state';
  readonly selector: 'effective-working-state';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly staged: 'included';
  readonly unstaged: 'included';
  readonly nonIgnoredUntracked: 'included';
  readonly ignoredUntracked: 'excluded';
  /** Explicit exact-scope exceptions; blanket ignored discovery stays excluded. */
  readonly explicitlyScopedIgnoredUntracked?: 'included';
  readonly entryCount: number;
  readonly workingFingerprint: string;
}

export interface ReviewComparisonWorkingTreeEndpoint {
  readonly kind: 'working-tree';
  readonly selector: 'working-tree';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly entryCount: number;
  readonly workingFingerprint: string;
}

declare const reviewComparisonResolutionIdentityBrand: unique symbol;

export type ReviewComparisonResolutionIdentity = string & {
  readonly [reviewComparisonResolutionIdentityBrand]: 'ReviewComparisonResolutionIdentity';
};

export interface ReviewComparisonDynamicInput {
  readonly kind: 'local-ref';
  readonly role: 'basis' | 'compared' | 'merge-base-reference';
  readonly reference: string;
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly referenceObjectIdentity: string;
  readonly resolvedObjectKind: ReviewRevisionObjectKind;
  readonly resolvedObjectIdentity: string;
}

export type ReviewComparisonBasis =
  | CurrentChangesComparisonBasis
  | ReviewComparisonRevisionEndpoint
  | ReviewComparisonEmptyTreeEndpoint
  | ReviewComparisonIndexEndpoint;

export type ReviewComparedState =
  | CurrentChangesComparedState
  | ReviewComparisonRevisionEndpoint
  | ReviewComparisonWorkingStateEndpoint
  | ReviewComparisonWorkingTreeEndpoint
  | ReviewComparisonIndexEndpoint;

export interface CurrentChangesManifestSummary {
  readonly formatVersion: 1;
  readonly totalFiles: number;
  readonly digest: EvidenceContentIdentity;
  /** Optional format-1 witness for local availability observations. */
  readonly inspectabilityFingerprint?: string;
}

export interface CurrentChangesCaptureReadyView {
  readonly kind: 'workspace.current-changes.capture';
  readonly status: 'captured';
  readonly evidenceIdentity: string;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly basis: CurrentChangesComparisonBasis;
  readonly comparedState: CurrentChangesComparedState;
  readonly manifest: CurrentChangesManifestSummary;
  readonly verification: WorkspaceVerification;
  readonly captureAttempts: number;
  readonly capturedContentBytes: number;
  readonly limits: WorkspaceEvidenceLimits;
}

export interface CurrentChangesCaptureUnverifiedView {
  readonly kind: 'workspace.current-changes.capture';
  readonly status: 'unverified';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly verification: WorkspaceVerification;
  readonly captureAttempts: number;
  readonly limits: WorkspaceEvidenceLimits;
}

export type CurrentChangesCaptureView = CurrentChangesCaptureReadyView | CurrentChangesCaptureUnverifiedView;

export type ReviewComparisonUnavailableReason =
  | 'revision-not-found'
  | 'ancestry-not-found'
  | 'merge-parent-ambiguous'
  | 'local-ref-not-found'
  | 'merge-base-not-found'
  | 'merge-base-ambiguous'
  | 'index-unavailable'
  | 'working-unavailable'
  | 'scope-path-not-found'
  | 'scope-ignored-unavailable'
  | 'scope-limit-exceeded'
  | 'inspection-failed';

export interface ReviewComparisonCaptureReadyView {
  readonly kind: 'workspace.review-comparison.capture';
  readonly status: 'captured';
  readonly evidenceIdentity: string;
  readonly workspaceIdentity: WorkspaceIdentity;
  /** Fixed revisions are canonicalized to immutable object identities. */
  readonly selection: ReviewComparisonSelection;
  readonly basis: ReviewComparisonBasis;
  readonly comparedState: ReviewComparedState;
  readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
  readonly comparisonDynamicInputs?: readonly ReviewComparisonDynamicInput[];
  readonly manifest: CurrentChangesManifestSummary;
  readonly verification: WorkspaceVerification;
  readonly captureAttempts: number;
  readonly capturedContentBytes: number;
  readonly limits: WorkspaceEvidenceLimits;
}

export interface ReviewComparisonCaptureUnavailableView {
  readonly kind: 'workspace.review-comparison.capture';
  readonly status: 'unavailable';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly selection: ReviewComparisonSelection;
  readonly reason: ReviewComparisonUnavailableReason;
  readonly verification: WorkspaceVerification;
  readonly limits: WorkspaceEvidenceLimits;
}

export type ReviewComparisonCaptureView = ReviewComparisonCaptureReadyView | ReviewComparisonCaptureUnavailableView;

export type ReviewComparisonInspection =
  | {
      readonly status: 'available';
      readonly selection: ReviewComparisonSelection;
      readonly basis: ReviewComparisonBasis;
      readonly comparedState: ReviewComparedState;
      readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
      readonly comparisonDynamicInputs?: readonly ReviewComparisonDynamicInput[];
      readonly totalFiles: number;
    }
  | {
      readonly status: 'unavailable';
      readonly selection: ReviewComparisonSelection;
      readonly reason: ReviewComparisonUnavailableReason;
    };

export interface ReviewComparisonVerificationTarget {
  readonly selection: ReviewComparisonSelection;
  readonly basis: ReviewComparisonBasis;
  readonly comparedState: ReviewComparedState;
  readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
  readonly comparisonDynamicInputs?: readonly ReviewComparisonDynamicInput[];
  readonly manifest: CurrentChangesManifestSummary;
}

export type ReviewCommitGraphRow =
  | { readonly kind: 'connector'; readonly graph: string }
  | {
      readonly kind: 'commit';
      readonly graph: string;
      readonly objectIdentity: string;
      readonly abbreviatedObjectIdentity: string;
      readonly parentIdentities: readonly string[];
      readonly decorations: string;
      readonly subject: string;
    };

export type ReviewCommitGraph =
  | {
      readonly status: 'available';
      readonly headObjectIdentity: string;
      readonly rows: readonly ReviewCommitGraphRow[];
      readonly truncated: boolean;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'revision-not-found' | 'inspection-failed';
    };

export interface CurrentChangesManifestAvailableView {
  readonly kind: 'workspace.current-changes.manifest';
  readonly status: 'available';
  readonly evidenceIdentity: string;
  readonly manifest: CurrentChangesManifestSummary;
  readonly offset: number;
  readonly files: readonly CurrentChangedFile[];
  readonly nextOffset: number | null;
}

export interface CurrentChangesManifestUnavailableView {
  readonly kind: 'workspace.current-changes.manifest';
  readonly status: 'unavailable';
  readonly evidenceIdentity: string;
  readonly verification: WorkspaceVerification;
}

export type CurrentChangesManifestView = CurrentChangesManifestAvailableView | CurrentChangesManifestUnavailableView;

export interface CurrentChangesContentAvailableView {
  readonly kind: 'workspace.current-changes.content';
  readonly status: 'available';
  readonly evidenceIdentity: string;
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  readonly representation?: 'large-file-payload';
  readonly offset: number;
  readonly byteLength: number;
  readonly totalByteLength: number;
  readonly bytesBase64: string;
  readonly complete: boolean;
  readonly contentIdentity: EvidenceContentIdentity;
}

export interface CurrentChangesContentUnavailableView {
  readonly kind: 'workspace.current-changes.content';
  readonly status: 'unavailable';
  readonly evidenceIdentity: string;
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  readonly representation?: 'large-file-payload';
  readonly reason:
    | EvidenceContentLimitation
    | 'file-not-found'
    | 'side-not-present'
    | 'large-file-pointer-not-present'
    | 'evidence-not-retained';
}

export type CurrentChangesContentView = CurrentChangesContentAvailableView | CurrentChangesContentUnavailableView;

export interface CurrentChangesVerificationView {
  readonly kind: 'workspace.current-changes.verify';
  readonly evidenceIdentity: string;
  readonly verification: WorkspaceVerification;
}

export type WorkspaceEvidenceView =
  | CurrentChangesCaptureView
  | ReviewComparisonCaptureView
  | CurrentChangesManifestView
  | CurrentChangesContentView
  | CurrentChangesVerificationView
  | ContextSourceManifestView
  | ContextSourceCaptureView
  | ContextSourceContentView
  | ContextSourceResolutionView
  | ContextSelectionVerifyView;

export type WorkspaceEvidenceViewFor<Request extends WorkspaceEvidenceViewRequest> =
  Request extends CaptureCurrentChangesEvidenceRequest
    ? CurrentChangesCaptureView
    : Request extends CaptureReviewComparisonEvidenceRequest
      ? ReviewComparisonCaptureView
      : Request extends CurrentChangesManifestRequest
        ? CurrentChangesManifestView
        : Request extends CurrentChangesContentRequest
          ? CurrentChangesContentView
          : Request extends VerifyCurrentChangesEvidenceRequest
            ? CurrentChangesVerificationView
            : Request extends ContextSourceManifestRequest
              ? ContextSourceManifestView
              : Request extends ContextSourceCaptureRequest
                ? ContextSourceCaptureView
                : Request extends ContextSourceContentRequest
                  ? ContextSourceContentView
                  : Request extends ContextSourceResolutionRequest
                    ? ContextSourceResolutionView
                    : Request extends ContextSelectionVerifyRequest
                      ? ContextSelectionVerifyView
                      : never;

export function checkedLimits(overrides: Partial<WorkspaceEvidenceLimits> | undefined): WorkspaceEvidenceLimits {
  const candidate: WorkspaceEvidenceLimits = {
    ...DEFAULT_LIMITS,
    ...overrides,
    formatVersion: 1,
  };
  for (const [name, value] of Object.entries(candidate)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`Invalid Workspace Evidence limit: ${name}`);
    }
  }
  if (candidate.maxVerifiedContentBytes < candidate.maxCapturedContentBytes) {
    throw new TypeError('Verification limit must cover the capture limit');
  }
  if (candidate.maxVerifiedFileBytes < candidate.maxCapturedFileBytes) {
    throw new TypeError('File verification limit must cover the file capture limit');
  }
  return deepFreeze(candidate);
}

export function stage(code: string): CurrentChangeStage {
  if (code === '.' || code === ' ') return 'unchanged';
  if (code === 'A') return 'added';
  if (code === 'D') return 'deleted';
  if (code === 'M') return 'modified';
  if (code === 'R') return 'renamed';
  if (code === 'C') return 'copied';
  if (code === 'T') return 'type-changed';
  if (code === 'U') return 'unmerged';
  if (code === '?') return 'untracked';
  return 'unmerged';
}
