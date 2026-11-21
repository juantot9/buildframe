import type { ReviewProjectedFile } from '@buildframe/workspace/projection';

import type { ReviewViewBundle, ReviewingApplicationState } from './reviewingModel.js';

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
): readonly ReviewFileTreeNode[] {
  const root: ReviewFileTreeDirectory = {
    path: '',
    depth: -1,
    directories: new Map(),
    files: [],
    firstFlat: 0,
  };
  const changedDirectories = new Set<string>();
  files.forEach((file, flat) => {
    const slash = file.displayPath.lastIndexOf('/');
    const parts = slash < 0 ? [] : file.displayPath.slice(0, slash).split('/');
    let current = root;
    let prefix = '';
    parts.forEach((segment, depth) => {
      prefix = `${prefix}${segment}/`;
      let next = current.directories.get(prefix);
      if (next === undefined) {
        next = { path: prefix, depth, directories: new Map(), files: [], firstFlat: flat };
        current.directories.set(prefix, next);
      }
      next.firstFlat = Math.min(next.firstFlat, flat);
      if (file.status !== 'unchanged') changedDirectories.add(prefix);
      current = next;
    });
    current.files.push({ file, flat });
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
      const isCollapsed = collapsed.has(child.path);
      nodes.push({
        kind: 'directory',
        directory: child.path,
        collapsed: isCollapsed,
        depth: child.depth,
        flat: child.firstFlat,
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
