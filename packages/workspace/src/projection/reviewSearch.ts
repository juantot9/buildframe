import type { ReviewLiveFileItem } from './liveFileContracts.js';
import type { ReviewSearchIndex } from './internalTypes.js';
import type { ReviewSearchItem, ReviewSearchViewRequest } from './searchContracts.js';
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
  request: Pick<ReviewSearchViewRequest, 'query' | 'offset' | 'limit'>,
): { readonly results: ReviewSearchItem[]; readonly totalResults: number } {
  const query = request.query.toLowerCase();
  const results: ReviewSearchItem[] = [];
  let totalResults = 0;
  const admit = (item: ReviewSearchItem): void => {
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
