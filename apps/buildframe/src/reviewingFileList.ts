import type { ReviewProjectedFile } from '@buildframe/workspace/projection';

import type { ReviewViewBundle, ReviewingApplicationState } from './reviewingModel.js';
import { unloadedFolders, type UnloadedFolder } from './reviewingLiveFolders.js';

/** The Files pane's list: the files a Review shows, and the tree they're drawn as. */

export interface ReviewingFileItem {
  readonly fileIdentity: string;
  readonly displayPath: string;
  readonly pathBytesBase64: string;
  readonly status: ReviewProjectedFile['status'] | 'unchanged';
  readonly diffFileIdentity?: string;
}

export function reviewingFiles(
  review: ReviewViewBundle | undefined,
  scope: ReviewingApplicationState['fileScope'],
): readonly ReviewingFileItem[] {
  if (review === undefined) return [];
  if (scope === 'all' && review.source.kind === 'live' && review.liveFiles?.status === 'available') {
    return review.liveFiles.files.items.map(file => ({
      fileIdentity: file.fileIdentity,
      displayPath: file.path.display,
      pathBytesBase64: file.path.bytesBase64,
      status: file.status,
      ...(file.changedFile === undefined ? {} : { diffFileIdentity: file.changedFile.fileIdentity }),
    }));
  }
  return manifestFileItems(review.manifest.manifest.files);
}

/** Changed files as the Files pane lists them. */
export function manifestFileItems(
  files: ReviewViewBundle['manifest']['manifest']['files'],
): readonly ReviewingFileItem[] {
  return files.map(file => {
    const side = file.newSide ?? file.oldSide;
    if (side === undefined) throw new TypeError('Projected Review file has no side');
    return {
      fileIdentity: file.fileIdentity,
      displayPath: file.displayPath,
      pathBytesBase64: side.pathBytesBase64,
      status: file.status,
      diffFileIdentity: file.fileIdentity,
    };
  });
}

/** One navigable row of the Files tree: a folder node or a file. */
export type ReviewFileTreeNode =
  | {
      readonly kind: 'directory';
      readonly directory: string;
      readonly collapsed: boolean;
      readonly depth: number;
      /** Flat index of the first file beneath this folder. */
      readonly flat: number;
      /** Changed files anywhere beneath, so a closed folder can say where the changes are. */
      readonly changedFiles: number;
      /** Not read yet: opening it loads it. */
      readonly unloaded?: { readonly pathBytesBase64: string };
    }
  | {
      readonly kind: 'file';
      readonly file: ReviewingFileItem;
      readonly flat: number;
      readonly depth: number;
    };

interface ReviewFileTreeDirectory {
  readonly path: string;
  readonly depth: number;
  readonly directories: Map<string, ReviewFileTreeDirectory>;
  readonly files: { readonly file: ReviewingFileItem; readonly flat: number }[];
  firstFlat: number;
  changedFiles: number;
  unloaded?: UnloadedFolder;
}

/**
 * Flattens a bounded file window into a neo-tree-style node list. The window
 * may group changed files before unchanged ones, so the tree is assembled by
 * directory rather than by assuming one global path order: every directory
 * appears exactly once, and each level lists changed content before unchanged
 * content in path order.
 */
export function reviewFileTreeNodes(
  files: readonly ReviewingFileItem[],
  collapsedDirectories: readonly string[],
  unloadedFolders: readonly UnloadedFolder[] = [],
): readonly ReviewFileTreeNode[] {
  const root: ReviewFileTreeDirectory = {
    path: '',
    depth: -1,
    directories: new Map(),
    files: [],
    firstFlat: 0,
    changedFiles: 0,
  };
  const changedDirectories = new Set<string>();
  /** The folder for a path, and every folder above it, created as needed. */
  const directoryOf = (folderPath: string, flat: number, changed: number): ReviewFileTreeDirectory => {
    let current = root;
    let prefix = '';
    for (const [depth, segment] of (folderPath === '' ? [] : folderPath.split('/')).entries()) {
      prefix = `${prefix}${segment}/`;
      let next = current.directories.get(prefix);
      if (next === undefined) {
        next = { path: prefix, depth, directories: new Map(), files: [], firstFlat: flat, changedFiles: 0 };
        current.directories.set(prefix, next);
      }
      next.firstFlat = Math.min(next.firstFlat, flat);
      next.changedFiles += changed;
      if (changed > 0) changedDirectories.add(prefix);
      current = next;
    }
    return current;
  };
  files.forEach((file, flat) => {
    const slash = file.displayPath.lastIndexOf('/');
    const folder = directoryOf(
      slash < 0 ? '' : file.displayPath.slice(0, slash),
      flat,
      file.status === 'unchanged' ? 0 : 1,
    );
    folder.files.push({ file, flat });
  });
  // An unloaded folder sorts among its siblings by name; it starts no file of its own.
  unloadedFolders.forEach((folder, index) => {
    directoryOf(folder.directory.slice(0, -1), files.length + index, folder.changedFiles).unloaded = folder;
  });

  const collapsed = new Set(collapsedDirectories);
  const nodes: ReviewFileTreeNode[] = [];
  const emit = (directory: ReviewFileTreeDirectory): void => {
    type ParentEntry =
      | { readonly kind: 'directory'; readonly directory: ReviewFileTreeDirectory }
      | { readonly kind: 'file'; readonly file: ReviewingFileItem; readonly flat: number };
    const entries: ParentEntry[] = [
      ...[...directory.directories.values()].map(entry => ({ kind: 'directory' as const, directory: entry })),
      ...directory.files.map(entry => ({ kind: 'file' as const, file: entry.file, flat: entry.flat })),
    ];
    const entryChanged = (entry: ParentEntry): boolean =>
      entry.kind === 'directory' ? changedDirectories.has(entry.directory.path) : entry.file.status !== 'unchanged';
    entries.sort((left, right) => {
      const changedOrder = Number(entryChanged(right)) - Number(entryChanged(left));
      if (changedOrder !== 0) return changedOrder;
      const leftPath = left.kind === 'directory' ? left.directory.path : left.file.displayPath;
      const rightPath = right.kind === 'directory' ? right.directory.path : right.file.displayPath;
      return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });
    for (const entry of entries) {
      if (entry.kind === 'file') {
        nodes.push({ kind: 'file', file: entry.file, flat: entry.flat, depth: directory.depth + 1 });
        continue;
      }
      const child = entry.directory;
      const isCollapsed = child.unloaded !== undefined || collapsed.has(child.path);
      nodes.push({
        kind: 'directory',
        directory: child.path,
        collapsed: isCollapsed,
        depth: child.depth,
        flat: child.firstFlat,
        changedFiles: child.changedFiles,
        ...(child.unloaded === undefined ? {} : { unloaded: { pathBytesBase64: child.unloaded.pathBytesBase64 } }),
      });
      if (!isCollapsed) emit(child);
    }
  };
  emit(root);
  return nodes;
}

/** The first file in the order the Files pane shows them (folders sorted, changed first). */
export function firstListedFile(
  files: readonly ReviewingFileItem[],
  collapsedDirectories: readonly string[],
): ReviewingFileItem | undefined {
  const node = reviewFileTreeNodes(files, collapsedDirectories).find(entry => entry.kind === 'file');
  return node?.kind === 'file' ? node.file : files[0];
}

/** The Files tree a Review shows: in All files, with a closed row for each folder not loaded yet. */
export function reviewTreeNodes(
  review: ReviewViewBundle | undefined,
  scope: ReviewingApplicationState['fileScope'],
  collapsedDirectories: readonly string[],
): readonly ReviewFileTreeNode[] {
  const files = reviewingFiles(review, scope);
  const allShown = scope === 'all' && review?.source.kind === 'live' && review.liveFiles?.status === 'available';
  return reviewFileTreeNodes(files, collapsedDirectories, allShown ? unloadedFolders(review.liveFolders) : []);
}
