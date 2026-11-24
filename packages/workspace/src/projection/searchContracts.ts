import type { ReviewIdentity, ReviewProjectedDiffUnavailableReason } from '../reviewing/index.js';
import type { ReviewProjectedDiffRow, ReviewProjectedFile } from './contracts.js';
import type { WORKSPACE_PROJECTION_VERSION } from './limits.js';

/** Searching a Review: by path and changed text in its saved Snapshot, and by path in every live repository file. */

export interface ReviewSearchViewRequest {
  readonly kind: 'review.search';
  readonly reviewIdentity: ReviewIdentity;
  readonly query: string;
  /**
   * The live changes the Files pane shows with every repository file: paths
   * of files they leave unchanged match too, after the saved Snapshot's results.
   */
  readonly liveChangesIdentity?: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewSearchPreviewViewRequest {
  readonly kind: 'review.search-preview';
  readonly reviewIdentity: ReviewIdentity;
  readonly fileIdentity: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewSearchSnippet {
  readonly encoding: 'utf8';
  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly truncatedBefore: boolean;
  readonly truncatedAfter: boolean;
}

export type ReviewSearchItem =
  | {
      readonly kind: 'file';
      readonly resultIdentity: string;
      readonly fileIdentity: string;
      readonly fileAbsolute: number;
      readonly displayPath: string;
    }
  | {
      /** A repository file the live changes leave unchanged; `fileAbsolute` is its place in the live file list. */
      readonly kind: 'unchanged-file';
      readonly resultIdentity: string;
      readonly fileIdentity: string;
      readonly fileAbsolute: number;
      readonly displayPath: string;
      /** Exact path bytes, so the file can be opened wherever All files has it. */
      readonly pathBytesBase64: string;
    }
  | {
      readonly kind: 'change';
      readonly resultIdentity: string;
      readonly fileIdentity: string;
      readonly fileAbsolute: number;
      readonly displayPath: string;
      readonly rowIdentity: string;
      readonly rowAbsolute: number;
      readonly change: 'addition' | 'deletion';
      readonly oldLine?: number;
      readonly newLine?: number;
      readonly snippet: ReviewSearchSnippet;
    };

export type ReviewSearchPreviewView =
  | {
      readonly kind: 'review.search-preview';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity: string;
      readonly file: ReviewProjectedFile;
      readonly window: {
        readonly totalRows: number;
        readonly offset: number;
        readonly rows: readonly ReviewProjectedDiffRow[];
      };
    }
  | {
      readonly kind: 'review.search-preview';
      readonly status: 'unavailable' | 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly fileIdentity: string;
      readonly reason: ReviewProjectedDiffUnavailableReason | 'review-not-found' | 'file-not-found';
    };

export type ReviewSearchView =
  | {
      readonly kind: 'review.search';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity: string;
      readonly query: string;
      readonly totalResults: number;
      readonly unsearchableChangeFiles: number;
      readonly offset: number;
      readonly results: readonly ReviewSearchItem[];
      readonly nextOffset: number | null;
    }
  | {
      readonly kind: 'review.search';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly query: string;
    };
