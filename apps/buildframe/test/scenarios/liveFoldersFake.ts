import type {
  ReviewLiveFileItem,
  ReviewLiveFilesView,
  ReviewLiveFolderEntry,
  ReviewLiveFoldersView,
  ReviewLiveFoldersViewRequest,
} from '@buildframe/workspace/projection';

/**
 * `review.live-folders` for a fake Workspace, built from the whole live file
 * list it already serves: each asked-for folder whole, changes first.
 */
export function liveFoldersOf(request: ReviewLiveFoldersViewRequest, all: ReviewLiveFilesView): ReviewLiveFoldersView {
  if (all.status !== 'available') return { ...all, kind: 'review.live-folders' };
  const files = all.files.items;
  const folderOf = (display: string): string => display.slice(0, Math.max(0, display.lastIndexOf('/')));
  const under = (folder: string, item: ReviewLiveFileItem): boolean =>
    folder === '' || item.path.display.startsWith(`${folder}/`);
  const summary = (folder: string) => {
    const inside = files.filter(item => under(folder, item));
    return {
      path: { bytesBase64: Buffer.from(folder).toString('base64'), display: folder },
      files: inside.length,
      changedFiles: inside.filter(item => item.status !== 'unchanged').length,
    };
  };
  const folders: { folder: ReturnType<typeof summary>; entries: ReviewLiveFolderEntry[] }[] = [];
  const missing: string[] = [];
  for (const path of request.pathsBytesBase64) {
    const folder = Buffer.from(path, 'base64').toString('utf8');
    const inside = files.filter(item => under(folder, item));
    if (folder !== '' && inside.length === 0) {
      missing.push(path);
      continue;
    }
    const depth = folder === '' ? 0 : folder.split('/').length;
    const children = [
      ...new Set(
        inside
          .map(item => item.path.display.split('/'))
          .filter(parts => parts.length > depth + 1)
          .map(parts => parts.slice(0, depth + 1).join('/')),
      ),
    ];
    const entries: ReviewLiveFolderEntry[] = [
      ...children.map(child => ({ kind: 'folder' as const, ...summary(child) })),
      ...inside.filter(item => folderOf(item.path.display) === folder).map(file => ({ kind: 'file' as const, file })),
    ];
    folders.push({ folder: summary(folder), entries });
  }
  return {
    kind: 'review.live-folders',
    status: 'available',
    projectionVersion: 1,
    stateVersion: all.stateVersion,
    reviewIdentity: all.reviewIdentity,
    liveChangesIdentity: all.liveChangesIdentity,
    folders,
    missing,
    remaining: [],
    tooLarge: [],
  };
}
