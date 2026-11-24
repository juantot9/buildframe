import { validateRelativePath } from '../workspaceEvidence/index.js';
import type { ReviewLiveFolderViewRequest, ReviewLiveFoldersViewRequest } from './liveFileContracts.js';
import { LIVE_CHANGES_ID_PATTERN, MAX_LIVE_FOLDER_READ_ENTRIES, REVIEW_ID_PATTERN } from './limits.js';
import { assertWindow } from './utils.js';

/** The most folders one `review.live-folders` read asks for. */
const MAX_LIVE_FOLDERS_PER_READ = 512;

/** Folder path bytes in canonical base64: empty for the top, else a plain relative path. */
function isFolderPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const bytes = Buffer.from(path, 'base64');
  if (bytes.toString('base64') !== path) return false;
  if (bytes.byteLength === 0) return true;
  try {
    validateRelativePath(bytes);
    return true;
  } catch {
    return false;
  }
}

function assertLiveSource(request: Record<string, unknown>, label: string): void {
  if (
    typeof request.reviewIdentity !== 'string' ||
    !REVIEW_ID_PATTERN.test(request.reviewIdentity) ||
    typeof request.liveChangesIdentity !== 'string' ||
    !LIVE_CHANGES_ID_PATTERN.test(request.liveChangesIdentity)
  ) {
    throw new TypeError(`Invalid ${label} request`);
  }
}

export function normalizeLiveFolderRequest(
  request: Record<string, unknown>,
  value: unknown,
): ReviewLiveFolderViewRequest {
  assertLiveSource(request, 'Live folder');
  if (!isFolderPath(request.pathBytesBase64)) throw new TypeError('Invalid Live folder request');
  assertWindow(request.offset as number, request.limit as number, MAX_LIVE_FOLDER_READ_ENTRIES, 'Live folder');
  return value as ReviewLiveFolderViewRequest;
}

export function normalizeLiveFoldersRequest(
  request: Record<string, unknown>,
  value: unknown,
): ReviewLiveFoldersViewRequest {
  assertLiveSource(request, 'Live folders');
  const paths = request.pathsBytesBase64;
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > MAX_LIVE_FOLDERS_PER_READ ||
    !paths.every(isFolderPath)
  ) {
    throw new TypeError('Invalid Live folders request');
  }
  return value as ReviewLiveFoldersViewRequest;
}
