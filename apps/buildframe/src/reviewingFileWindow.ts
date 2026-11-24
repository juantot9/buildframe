import type { Workspace } from '@buildframe/workspace';
import type { ReviewLiveManifestView, ReviewManifestView } from '@buildframe/workspace/projection';

import { MANIFEST_WINDOW_SIZE } from './reviewingLimits.js';
import type { ReviewLoadTarget } from './reviewingModel.js';

/**
 * A file asked for only by its path may sit in any window of the file list.
 * Find the window that holds it, so opening a Message never depends on
 * which 64 files happen to be loaded.
 */
export async function withFileWindow(workspace: Workspace, requested: ReviewLoadTarget): Promise<ReviewLoadTarget> {
  const path = requested.filePathBytesBase64;
  if (path === undefined || requested.fileIdentity !== undefined || requested.fileAbsolute !== undefined) {
    return requested;
  }
  const reviewIdentity = requested.reviewIdentity;
  const snapshot = requested.reviewSnapshotIdentity;
  let located = requested;
  // Changed files: the live list, or the saved one for a fixed comparison or a snapshot.
  let live = snapshot === undefined;
  for (let offset: number | null = 0, window = 0; offset !== null && window < 1024; window += 1) {
    const view: ReviewLiveManifestView | ReviewManifestView = live
      ? await workspace.read({
          kind: 'review.live-manifest',
          reviewIdentity,
          offset,
          limit: MANIFEST_WINDOW_SIZE,
        })
      : await workspace.read({
          kind: 'review.manifest',
          reviewIdentity,
          ...(snapshot === undefined ? {} : { reviewSnapshotIdentity: snapshot }),
          offset,
          limit: MANIFEST_WINDOW_SIZE,
        });
    if (view.status !== 'available') {
      if (live && view.status === 'fixed') {
        live = false;
        continue;
      }
      break;
    }
    if (
      view.manifest.files.some(file => file.newSide?.pathBytesBase64 === path || file.oldSide?.pathBytesBase64 === path)
    ) {
      located = { ...located, manifestOffset: view.manifest.offset };
      break;
    }
    const nextOffset: number | null = view.manifest.nextOffset;
    offset = nextOffset;
  }
  // All files list the loaded folders whole, so the file sits in the first window.
  if (requested.liveFilesOffset !== undefined) located = { ...located, liveFilesOffset: 0 };
  return located;
}
