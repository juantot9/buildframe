import { evidencePath } from '../workspaceEvidence/index.js';
import { withinFileListBudget } from './fileListBudget.js';
import type {
  ReviewLiveFileItem,
  ReviewLiveFileListUnavailable,
  ReviewLiveFilesView,
  ReviewLiveFilesViewRequest,
  ReviewLiveFolderEntry,
  ReviewLiveFolderSummary,
  ReviewLiveFolderView,
  ReviewLiveFolderViewRequest,
} from './liveFileContracts.js';
import { WORKSPACE_PROJECTION_VERSION } from './limits.js';

/** Every repository file with the live changes laid over it, or why there is none. */
export type LiveFileListing =
  | {
      readonly status: 'available';
      readonly liveChangesIdentity: string;
      readonly files: readonly ReviewLiveFileItem[];
    }
  | Pick<ReviewLiveFileListUnavailable<string>, 'status' | 'reason'>;

/** One window of the whole live file list. */
export function liveFilesView(
  request: ReviewLiveFilesViewRequest,
  stateVersion: number,
  listing: LiveFileListing,
): ReviewLiveFilesView {
  const header = {
    kind: 'review.live-files',
    projectionVersion: WORKSPACE_PROJECTION_VERSION,
    stateVersion,
    reviewIdentity: request.reviewIdentity,
  } as const;
  if (listing.status !== 'available') {
    return { ...header, liveChangesIdentity: request.liveChangesIdentity, ...listing } as ReviewLiveFilesView;
  }
  const all = listing.files;
  const items = withinFileListBudget(all.slice(request.offset, request.offset + request.limit));
  const next = request.offset + items.length;
  return {
    ...header,
    status: 'available',
    liveChangesIdentity: listing.liveChangesIdentity,
    files: { total: all.length, offset: request.offset, items, nextOffset: next < all.length ? next : null },
  };
}

/** One window of one folder's subfolders and files. */
export function liveFolderView(
  request: ReviewLiveFolderViewRequest,
  stateVersion: number,
  listing: LiveFileListing,
): ReviewLiveFolderView {
  const header = {
    kind: 'review.live-folder',
    projectionVersion: WORKSPACE_PROJECTION_VERSION,
    stateVersion,
    reviewIdentity: request.reviewIdentity,
  } as const;
  const folder =
    listing.status === 'available'
      ? folderIndex(listing.files).get(Buffer.from(request.pathBytesBase64, 'base64').toString('latin1'))
      : undefined;
  if (listing.status !== 'available' || folder === undefined) {
    const why = listing.status === 'available' ? { status: 'not-found', reason: 'folder-not-found' } : listing;
    return { ...header, liveChangesIdentity: request.liveChangesIdentity, ...why } as ReviewLiveFolderView;
  }
  const all = entriesOf(folder);
  const items = withinFileListBudget(all.slice(request.offset, request.offset + request.limit));
  const next = request.offset + items.length;
  return {
    ...header,
    status: 'available',
    liveChangesIdentity: listing.liveChangesIdentity,
    folder: summaryOf(folder),
    entries: { total: all.length, offset: request.offset, items, nextOffset: next < all.length ? next : null },
  };
}

interface Folder {
  /** The folder's path bytes as a latin1 string, so string order is byte order; empty for the top. */
  readonly key: string;
  /** Files anywhere beneath, and how many of them changed. */
  total: number;
  changed: number;
  readonly folders: Folder[];
  readonly items: ReviewLiveFileItem[];
  entries?: readonly ReviewLiveFolderEntry[];
  summary?: ReviewLiveFolderSummary;
}

/** Built once per laid file list, so opening a folder costs only its own rows. */
const indexes = new WeakMap<readonly ReviewLiveFileItem[], ReadonlyMap<string, Folder>>();

function folderIndex(files: readonly ReviewLiveFileItem[]): ReadonlyMap<string, Folder> {
  const cached = indexes.get(files);
  if (cached !== undefined) return cached;
  const folder = (key: string): Folder => ({ key, total: 0, changed: 0, folders: [], items: [] });
  const root = folder('');
  const index = new Map<string, Folder>([['', root]]);
  for (const file of files) {
    const key = Buffer.from(file.path.bytesBase64, 'base64').toString('latin1');
    const changed = file.status !== 'unchanged' ? 1 : 0;
    let current = root;
    for (let slash = key.indexOf('/'); ; slash = key.indexOf('/', slash + 1)) {
      current.total += 1;
      current.changed += changed;
      if (slash < 0) break;
      const prefix = key.slice(0, slash);
      let next = index.get(prefix);
      if (next === undefined) {
        next = folder(prefix);
        index.set(prefix, next);
        current.folders.push(next);
      }
      current = next;
    }
    current.items.push(file);
  }
  indexes.set(files, index);
  return index;
}

function summaryOf(folder: Folder): ReviewLiveFolderSummary {
  folder.summary ??= {
    path: evidencePath(Buffer.from(folder.key, 'latin1')),
    files: folder.total,
    changedFiles: folder.changed,
  };
  return folder.summary;
}

function entriesOf(folder: Folder): readonly ReviewLiveFolderEntry[] {
  if (folder.entries !== undefined) return folder.entries;
  const rows = [
    ...folder.folders.map(child => ({
      changed: child.changed > 0,
      order: `${child.key}/`,
      entry: { kind: 'folder' as const, ...summaryOf(child) },
    })),
    ...folder.items.map(file => ({
      changed: file.status !== 'unchanged',
      order: Buffer.from(file.path.bytesBase64, 'base64').toString('latin1'),
      entry: { kind: 'file' as const, file },
    })),
  ];
  rows.sort(
    (left, right) =>
      Number(right.changed) - Number(left.changed) ||
      (left.order < right.order ? -1 : left.order > right.order ? 1 : 0),
  );
  folder.entries = rows.map(row => row.entry);
  return folder.entries;
}
