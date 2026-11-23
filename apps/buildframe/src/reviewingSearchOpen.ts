import type { ReviewSearchItem, ReviewSearchView } from '@buildframe/workspace/projection';
import type { ReviewSnapshotIdentity } from '@buildframe/workspace/reviewing';

import { DIFF_WINDOW_SIZE, LIVE_FILE_WINDOW_SIZE, MANIFEST_WINDOW_SIZE } from './reviewingLimits.js';
import type { ReviewLoadTarget, ReviewSelectionHint, ReviewViewBundle } from './reviewingModel.js';

/** Where a chosen search result opens, and what it selects there. */
export function searchResultTarget(
  review: ReviewViewBundle,
  searchView: Extract<ReviewSearchView, { readonly status: 'available' }>,
  result: ReviewSearchItem,
): { readonly target: ReviewLoadTarget; readonly selection: ReviewSelectionHint } {
  const reviewIdentity = review.manifest.header.reviewIdentity;
  const questionOffset = review.questions.list.offset;
  const selection = {
    fileIdentity: result.fileIdentity,
    rowAbsolute: result.kind === 'change' ? result.rowAbsolute : 0,
  };
  if (result.kind === 'unchanged-file') {
    // An unchanged file lives only in the live list of every file, so it opens there.
    return {
      target: {
        reviewIdentity,
        liveFilesOffset: Math.floor(result.fileAbsolute / LIVE_FILE_WINDOW_SIZE) * LIVE_FILE_WINDOW_SIZE,
        manifestOffset: review.manifest.manifest.offset,
        fileIdentity: result.fileIdentity,
        fileAbsolute: result.fileAbsolute,
        diffOffset: 0,
        questionOffset,
      },
      selection,
    };
  }
  return {
    target: {
      reviewIdentity,
      // Search results and previews address the immutable saved Snapshot.
      // Opening that same source preserves the result's file/row identities
      // even when the working tree has moved since the search was indexed.
      reviewSnapshotIdentity: searchView.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      manifestOffset: Math.floor(result.fileAbsolute / MANIFEST_WINDOW_SIZE) * MANIFEST_WINDOW_SIZE,
      fileIdentity: result.fileIdentity,
      diffOffset: result.kind === 'change' ? Math.floor(result.rowAbsolute / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE : 0,
      questionOffset,
    },
    selection,
  };
}
