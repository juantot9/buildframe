import {
  type CurrentChangedFile,
  type CurrentChangesCaptureReadyView,
  type EvidenceContentAvailability,
  type EvidenceContentClassification,
  type EvidenceContentIdentity,
  type EvidenceContentLimitation,
  type EvidenceGeneratedClassification,
  type EvidenceGitlink,
  type EvidenceLineEndingConversion,
  type EvidenceScopeMembership,
  type EvidenceSideKind,
  type EvidenceSparseAbsence,
  type EvidenceSpecialEntry,
  type EvidenceSpecialEntryKind,
  type EvidenceSymlinkTarget,
  type GitObjectIdentity,
  type ReviewComparisonCaptureReadyView,
  type ReviewComparisonDynamicInput,
  type ReviewComparisonFileScopeEntry,
  type ReviewComparisonSelection,
} from './contracts.js';

export interface RawStatusEntry {
  readonly recordKind: 'ordinary' | 'rename' | 'untracked';
  readonly indexCode: string;
  readonly workingCode: string;
  readonly headMode: string;
  readonly indexMode: string;
  readonly workingMode: string;
  readonly headObject: string | null;
  readonly indexObject: string | null;
  readonly path: Buffer;
  readonly oldPath: Buffer | null;
  readonly renameKind: 'rename' | 'copy' | null;
}

export interface Inspection {
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly headObject: string | null;
  readonly statusFingerprint: string;
  readonly entries: readonly RawStatusEntry[];
  readonly index: IndexEnumeration;
}

export interface RawCommitDiffEntry {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldObject: string | null;
  readonly newObject: string | null;
  readonly path: Buffer;
  readonly oldPath: Buffer | null;
  readonly renameKind: 'rename' | 'copy' | null;
}

export interface ResolvedCommit {
  readonly kind: 'commit';
  readonly selector: string;
  readonly objectIdentity: string;
  readonly parents: readonly string[];
  readonly subject: string;
}

export interface ResolvedTree {
  readonly kind: 'tree';
  readonly selector: string;
  readonly objectIdentity: string;
}

export type ResolvedRevisionEndpoint = ResolvedCommit | ResolvedTree;

type PairedComparisonForm =
  | {
      readonly kind: 'revision-to-index';
      readonly basis: ResolvedRevisionEndpoint;
    }
  | {
      readonly kind: 'revision-to-working-state';
      readonly basis: ResolvedRevisionEndpoint;
    }
  | { readonly kind: 'index-to-working-tree' };

export interface ResolvedScopeEntry {
  readonly path: Buffer;
  readonly inclusion: ReviewComparisonFileScopeEntry['inclusion'];
}

export interface ResolvedFileScope {
  readonly entries: readonly ResolvedScopeEntry[];
  readonly explicitIgnoredPaths: ReadonlySet<string>;
}

export interface ResolvedReviewComparison {
  readonly selection: ReviewComparisonSelection;
  readonly basis?: ResolvedRevisionEndpoint | null;
  readonly compared?: ResolvedRevisionEndpoint;
  readonly workingComparison?: PairedComparisonForm;
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly rootComparison: boolean;
  readonly comparisonDynamicInputs: readonly ReviewComparisonDynamicInput[];
  readonly exactResolution: boolean;
  fileScope?: ResolvedFileScope;
  basisScopeFingerprint?: string;
  comparedScopeFingerprint?: string;
}

export interface GitObjectMetadata {
  readonly objectType: string | null;
  readonly byteLength: number | null;
  readonly missing: boolean;
}

export interface IndexRecord {
  readonly mode: string;
  readonly oid: string;
  readonly stage: number;
  readonly path: Buffer;
  readonly skipWorktree: boolean;
}

export interface TreeRecord {
  readonly mode: string;
  readonly objectKind: 'blob' | 'commit' | 'unknown';
  readonly oid: string;
  readonly path: Buffer;
}

export interface UnstagedRecord {
  readonly path: Buffer;
  readonly deleted: boolean;
}

export interface IndexEnumeration {
  readonly records: readonly IndexRecord[];
  readonly canonical: Buffer;
  readonly entryCount: number;
  readonly unmergedPaths: ReadonlySet<string>;
}

export interface UnstagedEnumeration {
  readonly paths: ReadonlyMap<string, UnstagedRecord>;
  readonly canonical: Buffer;
}

export interface UntrackedEnumeration {
  /** Untracked files; never a nested repository's contents. */
  readonly paths: readonly Buffer[];
  /** Nested repositories Git reported without descending, as directory paths. */
  readonly nestedRepositories: readonly Buffer[];
  readonly canonical: Buffer;
}

export interface TreeEnumeration {
  readonly records: readonly TreeRecord[];
}

export interface PairedEnumeration {
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly index: IndexEnumeration | null;
  readonly tree: TreeEnumeration | null;
  readonly untracked: UntrackedEnumeration | null;
  readonly unstaged: UnstagedEnumeration | null;
  readonly explicitIgnoredPaths: ReadonlySet<string>;
}

export interface PairedFacts {
  readonly scopePaths: readonly Buffer[];
  readonly factPaths: readonly Buffer[];
  readonly canonical: Buffer;
  readonly entryCount: number;
  readonly digestComplete: boolean;
}

export interface AttributeSource {
  readonly kind: 'object' | 'index' | 'working-tree';
  readonly selector?: string;
}

export interface LargeFileDraft {
  readonly pointerBytes: Buffer;
  readonly pointerIdentity: EvidenceContentIdentity;
  readonly payloadIdentity: EvidenceContentIdentity;
  readonly payloadByteLength: number;
  sideRepresentation: 'pointer' | 'payload' | 'unverified';
  payloadAvailability: 'available' | 'unavailable' | 'unverified';
  payloadContentAvailability: EvidenceContentAvailability;
  payloadContentLimitation?: EvidenceContentLimitation;
  payloadPath?: Buffer;
  payloadCapturePlanned: boolean;
  payloadContent?: Buffer;
  payloadContentIdentity?: EvidenceContentIdentity;
  payloadSharesSideContent: boolean;
}

export interface SideDraft {
  readonly pathBytes: Buffer;
  readonly kind: EvidenceSideKind;
  readonly gitMode: string;
  readonly byteLength: number | null;
  readonly evidenceSource: 'head' | 'working-tree' | 'commit' | 'tree' | 'index';
  readonly objectIdentity?: GitObjectIdentity;
  readonly workingPath?: Buffer;
  readonly objectId?: string;
  pointerObjectId?: string;
  readonly attributeSource?: AttributeSource;
  capturePlanned: boolean;
  content?: Buffer;
  contentIdentity?: EvidenceContentIdentity;
  classification: EvidenceContentClassification;
  contentAvailability: EvidenceContentAvailability;
  contentLimitation?: EvidenceContentLimitation;
  objectAvailability?: 'missing';
  symlinkTarget?: EvidenceSymlinkTarget;
  specialEntry?: EvidenceSpecialEntry;
  sparseAbsence?: EvidenceSparseAbsence;
  gitlink?: EvidenceGitlink;
  largeFile?: LargeFileDraft;
  generated?: EvidenceGeneratedClassification;
  filterDriver?: string;
  workingEvidenceLimitation?: 'unsupported-content-filter';
  /** How Git converts this working-tree file's line endings, from its attributes and core.autocrlf. */
  lineEndingRule?: EvidenceLineEndingConversion;
  /** Whether the bytes last read hold a CRLF, retained or not. */
  containsCrlf?: boolean;
}

export interface FileDraft {
  readonly raw: RawStatusEntry;
  readonly fileIdentity: string;
  readonly oldSide?: SideDraft;
  readonly newSide?: SideDraft;
  readonly scopeMembership?: readonly EvidenceScopeMembership[];
}

export interface WorkingBaseline {
  readonly fileIdentity: string;
  readonly path: Buffer;
  readonly kind: EvidenceSideKind;
  readonly gitMode: string;
  readonly specialEntryKind?: EvidenceSpecialEntryKind;
  readonly expectedBytes: number | null;
  readonly digest?: string;
  /**
   * File-system facts for a working file this capture could not digest. A
   * changed witness means the uncaptured file changed; equal facts mean it is
   * still the file the incomplete capture described.
   */
  readonly witness?: string;
}

export interface CapturedEvidence {
  readonly evidenceIdentity: string;
  readonly publicView: CurrentChangesCaptureReadyView | ReviewComparisonCaptureReadyView;
  readonly manifest: readonly CurrentChangedFile[];
  readonly contents: ReadonlyMap<string, Buffer>;
  readonly inspection?: Inspection;
  readonly workingBaselines: readonly WorkingBaseline[];
  readonly baselineComplete: boolean;
}

interface StreamedFile {
  readonly status: 'read';
  readonly bytesRead: number;
  readonly digest: string;
  readonly classification: EvidenceContentClassification;
  readonly content?: Buffer;
  readonly crlf?: true;
}

interface StreamLimit {
  readonly status: 'limit';
}

interface StreamFailed {
  readonly status: 'failed';
}

export type StreamResult = StreamedFile | StreamLimit | StreamFailed;

interface CaptureAttemptReady {
  readonly status: 'ready';
  readonly evidence: CapturedEvidence;
}

interface CaptureAttemptRetry {
  readonly status: 'retry';
}

export type CaptureAttemptResult = CaptureAttemptReady | CaptureAttemptRetry;

export interface PairedDraftPreparation {
  readonly drafts: readonly FileDraft[];
  readonly factPaths: readonly Buffer[];
  readonly scopePaths: readonly Buffer[];
}
