import type { ReviewIdentity } from '../reviewing/index.js';
import type { EvidencePath } from '../workspaceEvidence/index.js';
import type { WORKSPACE_PROJECTION_VERSION } from './limits.js';

/**
 * Any text in any file of a Review's code, the way `git grep` finds it: the
 * code as it is now for a live Review, or the compared commit's files for a
 * fixed one. Fixed text, ignoring case; binaries and ignored files skipped.
 */
export interface ReviewCodeSearchViewRequest {
  readonly kind: 'review.code-search';
  readonly reviewIdentity: ReviewIdentity;
  readonly query: string;
  /** Only this file (exact path bytes); every file when absent. */
  readonly pathBytesBase64?: string;
}

export interface ReviewCodeSearchMatch {
  readonly path: EvidencePath;
  /** One-based. */
  readonly line: number;
  /** The matching line, cut to 512 bytes. */
  readonly text: string;
}

/** What a code search looked in, so a result never passes for the Snapshot when it isn't. */
export type ReviewCodeSearchSource =
  | { readonly kind: 'now' }
  | { readonly kind: 'commit'; readonly objectIdentity: string; readonly abbreviatedObjectIdentity: string };

export type ReviewCodeSearchView =
  | {
      readonly kind: 'review.code-search';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly query: string;
      readonly searched: ReviewCodeSearchSource;
      /** At most 200, in path then line order. */
      readonly matches: readonly ReviewCodeSearchMatch[];
      /** Every matching line, counted even past the matches returned. */
      readonly totalMatches: number;
    }
  | {
      readonly kind: 'review.code-search';
      readonly status: 'not-found' | 'unavailable';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly query: string;
      readonly reason: 'review-not-found' | 'inspection-failed' | 'unsearchable-path';
    };
