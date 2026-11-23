import type {
  CapturedReviewSnapshot,
  ProjectedReviewCapture,
  ReviewIdentity,
  ReviewIndexPayload,
} from '../reviewing/index.js';
import type { WorkspaceProjectionViewScope, WorkspaceProjectionViewUpdate } from './contracts.js';

export interface LoadedIndex {
  readonly stateVersion: number;
  readonly payload: ReviewIndexPayload;
}

export interface IndexedReviewSearchChange {
  readonly fileIdentity: string;
  readonly fileAbsolute: number;
  readonly displayPath: string;
  readonly rowIdentity: string;
  readonly rowAbsolute: number;
  readonly change: 'addition' | 'deletion';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly text: string;
  readonly normalizedText: string;
}

export interface IndexedReviewSearchFile {
  readonly fileIdentity: string;
  readonly fileAbsolute: number;
  readonly displayPath: string;
  readonly normalizedPath: string;
  readonly changes: readonly IndexedReviewSearchChange[];
}

export interface ReviewSearchIndex {
  readonly reviewSnapshotIdentity: string;
  readonly files: readonly IndexedReviewSearchFile[];
  readonly unsearchableChangeFiles: number;
}

export interface ProjectionSubscription {
  readonly scope: WorkspaceProjectionViewScope;
  readonly onUpdate: (update: WorkspaceProjectionViewUpdate) => void;
  active: boolean;
  scheduled: boolean;
  refreshRequested: boolean;
  lastDeliveredVersion: number;
  lastDeliveredLiveIdentity: string | undefined;
}

export interface LiveCaptureEntry {
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly captured: CapturedReviewSnapshot;
  readonly projection: ProjectedReviewCapture;
}

export class ProjectionVersionChanged extends Error {}

export class ProjectionRecordsInvalid extends Error {}
