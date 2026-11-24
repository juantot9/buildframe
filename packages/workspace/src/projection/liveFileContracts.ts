import type { ReviewIdentity } from '../reviewing/index.js';
import type { EvidencePath } from '../workspaceEvidence/index.js';
import type { ReviewProjectedFile } from './contracts.js';
import type { WORKSPACE_PROJECTION_VERSION } from './limits.js';

/** The current Review's live changes laid over every repository file: as one list, or one folder at a time. */

export interface ReviewLiveFilesViewRequest {
  readonly kind: 'review.live-files';
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewLiveFileItem {
  /** Stable path-row identity. Changed rows separately retain the Diff file identity. */
  readonly fileIdentity: string;
  readonly path: EvidencePath;
  readonly status: ReviewProjectedFile['status'] | 'unchanged';
  readonly changedFile?: ReviewProjectedFile;
}

/** Why the live file list or a live folder can't be read. */
export interface ReviewLiveFileListUnavailable<Kind extends string, Reason extends string = never> {
  readonly kind: Kind;
  readonly status: 'unavailable' | 'not-found' | 'fixed' | 'moved';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly reason:
    | 'inspection-failed'
    | 'review-not-found'
    | 'review-not-current'
    | 'fixed-comparison'
    | 'live-changes-moved'
    | Reason;
}

export type ReviewLiveFilesView =
  | {
      readonly kind: 'review.live-files';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      readonly files: {
        readonly total: number;
        readonly offset: number;
        readonly items: readonly ReviewLiveFileItem[];
        readonly nextOffset: number | null;
      };
    }
  | ReviewLiveFileListUnavailable<'review.live-files'>;

export interface ReviewLiveFolderViewRequest {
  readonly kind: 'review.live-folder';
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  /** Exact repository-relative path bytes of the folder, without a trailing slash; empty for the top. */
  readonly pathBytesBase64: string;
  readonly offset: number;
  readonly limit: number;
}

/** A folder and how many files sit anywhere beneath it. */
export interface ReviewLiveFolderSummary {
  readonly path: EvidencePath;
  readonly files: number;
  readonly changedFiles: number;
}

/**
 * One row of a folder: a subfolder with its counts, or a file. Rows that hold
 * changes come first, then the rest, each in path-byte order, a subfolder
 * sorting as its path with a trailing slash.
 */
export type ReviewLiveFolderEntry =
  | ({ readonly kind: 'folder' } & ReviewLiveFolderSummary)
  | { readonly kind: 'file'; readonly file: ReviewLiveFileItem };

export type ReviewLiveFolderView =
  | {
      readonly kind: 'review.live-folder';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      readonly folder: ReviewLiveFolderSummary;
      readonly entries: {
        readonly total: number;
        readonly offset: number;
        readonly items: readonly ReviewLiveFolderEntry[];
        readonly nextOffset: number | null;
      };
    }
  | ReviewLiveFileListUnavailable<'review.live-folder', 'folder-not-found'>;

/** Many whole folders in one read, so loading a tree is one message rather than one per folder. */
export interface ReviewLiveFoldersViewRequest {
  readonly kind: 'review.live-folders';
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  /** Exact path bytes of each folder, as in `review.live-folder`; at most 512. */
  readonly pathsBytesBase64: readonly string[];
}

export interface ReviewLiveFolderContents {
  readonly folder: ReviewLiveFolderSummary;
  /** Every row of the folder, in `review.live-folder` order. */
  readonly entries: readonly ReviewLiveFolderEntry[];
}

export type ReviewLiveFoldersView =
  | {
      readonly kind: 'review.live-folders';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      /** Whole folders, in the order asked, as many as fit one read's row and byte bounds. */
      readonly folders: readonly ReviewLiveFolderContents[];
      /** Asked for but not there. */
      readonly missing: readonly string[];
      /** Left for the next read: they didn't fit this one. */
      readonly remaining: readonly string[];
      /** Larger than one read on their own: page them with `review.live-folder`. */
      readonly tooLarge: readonly string[];
    }
  | ReviewLiveFileListUnavailable<'review.live-folders'>;

export interface ReviewLiveFileContentViewRequest {
  readonly kind: 'review.live-file-content';
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly pathBytesBase64: string;
  /** One-based source line to include; defaults to the start of the file. */
  readonly anchorLine?: number;
}

export type ReviewLiveFileContentView =
  | {
      readonly kind: 'review.live-file-content';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      readonly path: EvidencePath;
      readonly content: {
        readonly encoding: 'utf8';
        readonly bytesBase64: string;
        readonly byteLength: number;
        readonly totalByteLength: number;
        /** Absolute one-based line of the first complete line in this window. */
        readonly firstLine: number;
        readonly lineCount: number;
        readonly totalLines: number;
        readonly truncated: boolean;
      };
    }
  | {
      readonly kind: 'review.live-file-content';
      readonly status: 'unavailable' | 'not-found' | 'fixed' | 'moved';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      readonly reason:
        | 'binary'
        | 'unrenderable'
        | 'too-large'
        | 'file-unavailable'
        | 'inspection-failed'
        | 'review-not-found'
        | 'review-not-current'
        | 'fixed-comparison'
        | 'live-changes-moved';
    };
