import type { ReviewLiveFileItem } from './liveFileContracts.js';
import type { ReviewSearchIndex } from './internalTypes.js';
import type { ReviewSearchItem, ReviewSearchView, ReviewSearchViewRequest } from './searchContracts.js';
import { WORKSPACE_PROJECTION_VERSION } from './limits.js';
import { searchSnippet } from './utils.js';

/**
 * One window of a Review search: the saved Snapshot's changed files by path,
 * then their added or removed lines, then (when the live file list is given)
 * every repository file the live changes leave unchanged, by path. Matching
 * ignores case.
 */
export function matchReviewSearch(
  searchIndex: ReviewSearchIndex,
  liveFiles: readonly ReviewLiveFileItem[],
  request: Pick<ReviewSearchViewRequest, 'query' | 'offset' | 'limit' | 'only'>,
): { readonly results: ReviewSearchItem[]; readonly totalResults: number } {
  const query = request.query.toLowerCase();
  const results: ReviewSearchItem[] = [];
  let totalResults = 0;
  const admit = (item: ReviewSearchItem): void => {
    if (request.only === (item.kind === 'change' ? 'paths' : 'changes')) return;
    if (totalResults >= request.offset && results.length < request.limit) {
      results.push(item);
    }
    totalResults += 1;
  };
  for (const file of searchIndex.files) {
    if (file.normalizedPath.includes(query)) {
      admit({
        kind: 'file',
        resultIdentity: `file:${file.fileIdentity}`,
        fileIdentity: file.fileIdentity,
        fileAbsolute: file.fileAbsolute,
        displayPath: file.displayPath,
      });
    }
    for (const change of file.changes) {
      const matchAt = change.normalizedText.indexOf(query);
      if (matchAt < 0) continue;
      admit({
        kind: 'change',
        resultIdentity: `change:${change.rowIdentity}`,
        fileIdentity: change.fileIdentity,
        fileAbsolute: change.fileAbsolute,
        displayPath: change.displayPath,
        rowIdentity: change.rowIdentity,
        rowAbsolute: change.rowAbsolute,
        change: change.change,
        ...(change.oldLine === undefined ? {} : { oldLine: change.oldLine }),
        ...(change.newLine === undefined ? {} : { newLine: change.newLine }),
        snippet: searchSnippet(change.text, matchAt, request.query.length),
      });
    }
  }
  liveFiles.forEach((file, fileAbsolute) => {
    if (file.status !== 'unchanged' || !file.path.display.toLowerCase().includes(query)) return;
    admit({
      kind: 'unchanged-file',
      resultIdentity: `unchanged:${file.fileIdentity}`,
      fileIdentity: file.fileIdentity,
      fileAbsolute,
      displayPath: file.path.display,
      pathBytesBase64: file.path.bytesBase64,
    });
  });
  return { results, totalResults };
}

/** A Review search's view: not found without the Review's search index, else one window of matches. */
export function reviewSearchView(
  request: ReviewSearchViewRequest,
  stateVersion: number,
  searchIndex?: ReviewSearchIndex,
  liveFiles: readonly ReviewLiveFileItem[] = [],
): ReviewSearchView {
  const header = {
    kind: 'review.search',
    projectionVersion: WORKSPACE_PROJECTION_VERSION,
    stateVersion,
    reviewIdentity: request.reviewIdentity,
    query: request.query,
  } as const;
  if (searchIndex === undefined) return { ...header, status: 'not-found' };
  const { results, totalResults } = matchReviewSearch(searchIndex, liveFiles, request);
  const next = request.offset + results.length;
  return {
    ...header,
    status: 'available',
    reviewSnapshotIdentity: searchIndex.reviewSnapshotIdentity,
    totalResults,
    unsearchableChangeFiles: searchIndex.unsearchableChangeFiles,
    offset: request.offset,
    results,
    nextOffset: next < totalResults ? next : null,
  };
}
