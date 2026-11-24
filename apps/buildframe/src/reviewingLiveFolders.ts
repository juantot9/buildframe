import type { Workspace } from '@buildframe/workspace';
import type {
  ReviewLiveFileItem,
  ReviewLiveFilesView,
  ReviewLiveFolderContents,
  ReviewLiveFolderSummary,
  ReviewLiveFolderView,
  ReviewLiveFoldersView,
} from '@buildframe/workspace/projection';
import type { ReviewIdentity } from '@buildframe/workspace/reviewing';

import type { ReviewViewBundle } from './reviewingModel.js';

/**
 * All files, a folder at a time. The Review loads the top folder and every
 * folder on the way to a change; any other folder is one closed row until it
 * is opened, which reads just that folder. The loaded folders become the one
 * file list the Files pane already draws.
 */

/** The most rows one folder read returns (the Workspace's bound). */
const FOLDER_WINDOW = 1_000;
/** The most folders one batched read asks for (the Workspace's bound). */
const FOLDERS_PER_READ = 512;

export interface LiveFolder {
  readonly summary: ReviewLiveFolderSummary;
  readonly folders: readonly ReviewLiveFolderSummary[];
  readonly files: readonly ReviewLiveFileItem[];
}

/** The loaded folders, by path with a trailing slash as the Files pane names them ('' for the top). */
export interface LiveFolders {
  readonly liveChangesIdentity: string;
  readonly loaded: ReadonlyMap<string, LiveFolder>;
}

/** A folder that isn't loaded: one closed row, with how many files it holds and how many changed. */
export interface UnloadedFolder {
  readonly directory: string;
  readonly pathBytesBase64: string;
  readonly files: number;
  readonly changedFiles: number;
}

export function folderDirectory(display: string): string {
  return display === '' ? '' : `${display}/`;
}

/** The path bytes of every folder above a file, the top first. */
export function foldersAbove(pathBytesBase64: string): readonly string[] {
  const bytes = Buffer.from(pathBytesBase64, 'base64');
  const folders = [''];
  for (let slash = bytes.indexOf(0x2f); slash >= 0; slash = bytes.indexOf(0x2f, slash + 1)) {
    folders.push(bytes.subarray(0, slash).toString('base64'));
  }
  return folders;
}

type FolderRead =
  | { readonly status: 'available'; readonly stateVersion: number; readonly folder: LiveFolder }
  | { readonly status: 'gone' }
  | {
      readonly status: 'failed';
      readonly view: Exclude<ReviewLiveFolderView | ReviewLiveFoldersView, { readonly status: 'available' }>;
    };

function folderOf(contents: ReviewLiveFolderContents): LiveFolder {
  const folders: ReviewLiveFolderSummary[] = [];
  const files: ReviewLiveFileItem[] = [];
  for (const entry of contents.entries) {
    if (entry.kind === 'file') files.push(entry.file);
    else folders.push({ path: entry.path, files: entry.files, changedFiles: entry.changedFiles });
  }
  return { summary: contents.folder, folders, files };
}

/** Whole folders, many per read; a folder too large for one read is paged on its own. */
async function readFolders(
  workspace: Workspace,
  reviewIdentity: ReviewIdentity,
  liveChangesIdentity: string,
  paths: readonly string[],
): Promise<readonly FolderRead[]> {
  const reads: FolderRead[] = [];
  for (let pending = [...paths]; pending.length > 0;) {
    const view: ReviewLiveFoldersView = await workspace.read({
      kind: 'review.live-folders',
      reviewIdentity,
      liveChangesIdentity,
      pathsBytesBase64: pending.slice(0, FOLDERS_PER_READ),
    });
    if (view.status !== 'available') return [{ status: 'failed', view }];
    for (const contents of view.folders) {
      reads.push({ status: 'available', stateVersion: view.stateVersion, folder: folderOf(contents) });
    }
    for (const path of view.tooLarge)
      reads.push(await readFolder(workspace, reviewIdentity, liveChangesIdentity, path));
    pending = [...view.remaining, ...pending.slice(FOLDERS_PER_READ)];
  }
  return reads;
}

async function readFolder(
  workspace: Workspace,
  reviewIdentity: ReviewIdentity,
  liveChangesIdentity: string,
  pathBytesBase64: string,
): Promise<FolderRead> {
  const folders: ReviewLiveFolderSummary[] = [];
  const files: ReviewLiveFileItem[] = [];
  let summary: ReviewLiveFolderSummary | undefined;
  let stateVersion = -1;
  for (let offset: number | null = 0; offset !== null;) {
    const view: ReviewLiveFolderView = await workspace.read({
      kind: 'review.live-folder',
      reviewIdentity,
      liveChangesIdentity,
      pathBytesBase64,
      offset,
      limit: FOLDER_WINDOW,
    });
    if (view.status !== 'available') {
      // A folder can go away between reads; it is just not listed any more.
      return view.reason === 'folder-not-found' ? { status: 'gone' } : { status: 'failed', view };
    }
    if (stateVersion >= 0 && view.stateVersion !== stateVersion)
      return readFolder(workspace, reviewIdentity, liveChangesIdentity, pathBytesBase64);
    stateVersion = view.stateVersion;
    summary = view.folder;
    for (const entry of view.entries.items) {
      if (entry.kind === 'file') files.push(entry.file);
      else folders.push({ path: entry.path, files: entry.files, changedFiles: entry.changedFiles });
    }
    offset = view.entries.nextOffset;
  }
  return { status: 'available', stateVersion, folder: { summary: summary!, folders, files } };
}

/** Changed files first, then the rest, each in path-byte order: the order of the whole live file list. */
function fileOrder(files: readonly ReviewLiveFileItem[]): readonly ReviewLiveFileItem[] {
  const keyed = files.map(file => ({
    file,
    changed: file.status !== 'unchanged',
    key: Buffer.from(file.path.bytesBase64, 'base64').toString('latin1'),
  }));
  keyed.sort(
    (left, right) =>
      Number(right.changed) - Number(left.changed) || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );
  return keyed.map(entry => entry.file);
}

/** The loaded folders as the live file list the Files pane draws. */
function filesView(reviewIdentity: ReviewIdentity, stateVersion: number, folders: LiveFolders): ReviewLiveFilesView {
  const items = fileOrder([...folders.loaded.values()].flatMap(folder => folder.files));
  return {
    kind: 'review.live-files',
    status: 'available',
    projectionVersion: 1,
    stateVersion,
    reviewIdentity,
    liveChangesIdentity: folders.liveChangesIdentity,
    files: { total: items.length, offset: 0, items, nextOffset: null },
  };
}

/**
 * Reads the given folders (path bytes, '' for the top), and returns them with
 * the file list they make. A failed read returns its reason as the file list's.
 * The state version is -1 when the folders were read at different versions.
 */
export async function readLiveFolders(
  workspace: Workspace,
  reviewIdentity: ReviewIdentity,
  liveChangesIdentity: string,
  paths: readonly string[],
): Promise<{ readonly liveFiles: ReviewLiveFilesView; readonly liveFolders?: LiveFolders }> {
  const reads = await readFolders(workspace, reviewIdentity, liveChangesIdentity, [...new Set(paths)]);
  const failed = reads.find(read => read.status === 'failed');
  if (failed?.status === 'failed') {
    const { reason, ...view } = failed.view;
    return {
      liveFiles: {
        ...view,
        kind: 'review.live-files',
        reason: reason === 'folder-not-found' ? 'live-changes-moved' : reason,
      },
    };
  }
  const loaded = new Map<string, LiveFolder>();
  const versions = new Set<number>();
  for (const read of reads) {
    if (read.status !== 'available') continue;
    loaded.set(folderDirectory(read.folder.summary.path.display), read.folder);
    versions.add(read.stateVersion);
  }
  const stateVersion = versions.size === 1 ? [...versions][0]! : -1;
  const liveFolders: LiveFolders = { liveChangesIdentity, loaded };
  return { liveFiles: filesView(reviewIdentity, stateVersion, liveFolders), liveFolders };
}

/**
 * The folders a live Review loads: the top, every folder on the way to a
 * changed file or the file asked for, and whichever were loaded before.
 */
export function foldersToLoad(
  changedPaths: readonly string[],
  requestedPath: string | undefined,
  previous: LiveFolders | undefined,
): readonly string[] {
  const paths = new Set<string>(['']);
  for (const path of [...changedPaths, ...(requestedPath === undefined ? [] : [requestedPath])]) {
    for (const folder of foldersAbove(path)) paths.add(folder);
  }
  for (const folder of previous?.loaded.values() ?? []) paths.add(folder.summary.path.bytesBase64);
  return [...paths];
}

/** The Review with more folders loaded, if it still shows the live changes they were read from. */
export function withLoadedFolders(
  review: ReviewViewBundle,
  read: { readonly liveFiles: ReviewLiveFilesView; readonly liveFolders?: LiveFolders },
): ReviewViewBundle | undefined {
  const known = review.liveFolders;
  const more = read.liveFolders;
  if (known === undefined || more === undefined || known.liveChangesIdentity !== more.liveChangesIdentity) {
    return undefined;
  }
  const liveFolders: LiveFolders = { ...known, loaded: new Map([...known.loaded, ...more.loaded]) };
  return {
    ...review,
    liveFolders,
    liveFiles: filesView(review.manifest.header.reviewIdentity, review.liveFiles?.stateVersion ?? -1, liveFolders),
  };
}

/** Every subfolder of a loaded folder that is not loaded itself. */
export function unloadedFolders(folders: LiveFolders | undefined): readonly UnloadedFolder[] {
  if (folders === undefined) return [];
  const unloaded: UnloadedFolder[] = [];
  for (const folder of folders.loaded.values()) {
    for (const child of folder.folders) {
      const directory = folderDirectory(child.path.display);
      if (folders.loaded.has(directory)) continue;
      unloaded.push({
        directory,
        pathBytesBase64: child.path.bytesBase64,
        files: child.files,
        changedFiles: child.changedFiles,
      });
    }
  }
  return unloaded;
}

/**
 * Opening a closed folder reads just that folder. Resolves to the Review with
 * it loaded, or undefined when the Review moved on while it was read.
 */
export async function loadOpenedFolder(
  workspace: Workspace,
  review: () => ReviewViewBundle | undefined,
  pathBytesBase64: string,
): Promise<ReviewViewBundle | undefined> {
  const shown = review();
  const folders = shown?.liveFolders;
  if (shown === undefined || folders === undefined) return undefined;
  const read = await readLiveFolders(workspace, shown.manifest.header.reviewIdentity, folders.liveChangesIdentity, [
    pathBytesBase64,
  ]).catch(() => undefined);
  const current = review();
  return read === undefined || current === undefined ? undefined : withLoadedFolders(current, read);
}
