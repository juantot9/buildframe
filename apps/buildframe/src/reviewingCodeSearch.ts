import type { Workspace } from '@buildframe/workspace';
import type {
  ReviewCodeSearchMatch,
  ReviewCodeSearchView,
  ReviewSearchPreviewView,
  ReviewSearchView,
} from '@buildframe/workspace/projection';
import type { ReviewIdentity } from '@buildframe/workspace/reviewing';

import { Key, matchesKey, type ReviewingInput } from './reviewingInput.js';
import type { ReviewingApplicationModel, ReviewingModelEffect } from './reviewingModel.js';
import { SEARCH_RESULT_WINDOW_SIZE } from './reviewingLimits.js';

/**
 * The `/` dialog's four scopes: text in the open file, added or removed text,
 * every file path, and any text in any file (`git grep`). Tab moves between
 * them; `:` and a number in This file goes to that line.
 */
export type ReviewSearchScope = 'file' | 'changes' | 'files' | 'code';

export const SEARCH_SCOPES: readonly ReviewSearchScope[] = ['file', 'changes', 'files', 'code'];

export const SEARCH_SCOPE_NAMES: Readonly<Record<ReviewSearchScope, string>> = {
  file: 'This file',
  changes: 'Changes',
  files: 'Files',
  code: 'Code',
};

export interface ReviewSearchState {
  query: string;
  cursor: number;
  scope: ReviewSearchScope;
  view: ReviewSearchView | undefined;
  /** This file and Code: the matching lines. */
  code: ReviewCodeSearchView | undefined;
  selectedResultIdentity: string | undefined;
  loading: boolean;
  preview: ReviewSearchPreviewView | undefined;
  previewResultIdentity: string | undefined;
  previewLoading: boolean;
  requestedResultAbsolute: number | undefined;
}

/** The last This file search, so n and N move between its matches without the dialog. */
export interface FileMatches {
  readonly pathBytesBase64: string;
  readonly query: string;
  readonly lines: readonly number[];
}

export type SearchEffect = {
  readonly type: 'search-review';
  readonly reviewIdentity: ReviewIdentity;
  readonly query: string;
  readonly offset: number;
  readonly liveChangesIdentity?: string;
  readonly only?: 'paths' | 'changes';
  /** Search code instead: in one file when a path is given. */
  readonly code?: { readonly pathBytesBase64?: string };
};

/** `:120` in This file: a line to go to. */
export function goToLine(query: string): number | undefined {
  const line = /^:(\d{1,9})$/u.exec(query.trim())?.[1];
  return line === undefined ? undefined : Math.max(1, Number(line));
}

export function codeMatchKey(match: ReviewCodeSearchMatch): string {
  return `${match.path.bytesBase64}:${match.line}`;
}

export function codeMatches(search: ReviewSearchState | undefined): readonly ReviewCodeSearchMatch[] {
  return search?.code?.status === 'available' ? search.code.matches : [];
}

/** The search a scope runs; undefined when there is nothing to search (no open file, or a line to go to). */
export function searchRequest(
  search: ReviewSearchState,
  reviewIdentity: ReviewIdentity,
  query: string,
  offset: number,
  source: { readonly liveChangesIdentity?: string; readonly shownPath?: string },
): SearchEffect | undefined {
  const base = { type: 'search-review', reviewIdentity, query, offset } as const;
  if (search.scope === 'file') {
    if (source.shownPath === undefined || goToLine(query) !== undefined) return undefined;
    return { ...base, code: { pathBytesBase64: source.shownPath } };
  }
  if (search.scope === 'code') return { ...base, code: {} };
  if (search.scope === 'changes') return { ...base, only: 'changes' };
  return {
    ...base,
    only: 'paths',
    ...(source.liveChangesIdentity === undefined ? {} : { liveChangesIdentity: source.liveChangesIdentity }),
  };
}

/** Reads what a search effect asks for. */
export async function readSearch(
  workspace: Workspace,
  { type: _type, code, ...search }: SearchEffect,
): Promise<
  | { readonly kind: 'review'; readonly view: ReviewSearchView }
  | { readonly kind: 'code'; readonly view: ReviewCodeSearchView }
> {
  if (code === undefined) {
    return {
      kind: 'review',
      view: await workspace.read({ kind: 'review.search', ...search, limit: SEARCH_RESULT_WINDOW_SIZE }),
    };
  }
  return {
    kind: 'code',
    view: await workspace.read({
      kind: 'review.code-search',
      reviewIdentity: search.reviewIdentity,
      query: search.query,
      ...(code.pathBytesBase64 === undefined ? {} : { pathBytesBase64: code.pathBytesBase64 }),
    }),
  };
}

/** Code results land if they still answer the query shown; the first match is selected. */
export function applyCodeSearch(
  search: ReviewSearchState | undefined,
  view: ReviewCodeSearchView,
): FileMatches | undefined {
  if (search === undefined || search.query.trim() !== view.query) return undefined;
  search.code = view;
  search.loading = false;
  const matches = codeMatches(search);
  search.selectedResultIdentity = matches[0] === undefined ? undefined : codeMatchKey(matches[0]);
  const path = matches[0]?.path.bytesBase64;
  return search.scope === 'file' && path !== undefined
    ? { pathBytesBase64: path, query: view.query, lines: matches.map(match => match.line) }
    : undefined;
}

/** A search read lands: Review results through the model, code matches here (This file's stay for n and N). */
export function applySearch(
  model: ReviewingApplicationModel,
  read: Awaited<ReturnType<typeof readSearch>>,
  query: string,
): readonly ReviewingModelEffect[] {
  if (read.kind === 'review') return model.applyReviewSearch(read.view, query);
  const matches = applyCodeSearch(model.state.search, read.view);
  if (matches !== undefined) model.state.fileMatches = matches;
  return [];
}

/** What a key does in a code scope: move among the matches, or open one. */
export function codeSearchKey(
  search: ReviewSearchState,
  data: ReviewingInput,
): { readonly kind: 'moved' } | { readonly kind: 'open'; readonly match: ReviewCodeSearchMatch } | undefined {
  if (search.scope !== 'file' && search.scope !== 'code') return undefined;
  const matches = codeMatches(search);
  const index = Math.max(
    0,
    matches.findIndex(match => codeMatchKey(match) === search.selectedResultIdentity),
  );
  if (matches.length > 0 && (matchesKey(data, Key.up) || matchesKey(data, Key.down))) {
    const next = (index + (matchesKey(data, Key.up) ? -1 : 1) + matches.length) % matches.length;
    search.selectedResultIdentity = codeMatchKey(matches[next]!);
    return { kind: 'moved' };
  }
  if (matchesKey(data, Key.enter) && matches[index] !== undefined) return { kind: 'open', match: matches[index] };
  return undefined;
}

/** The next (or previous) match line after `line`, wrapping around the file. */
export function nextMatchLine(matches: FileMatches, line: number, direction: 1 | -1): number | undefined {
  const { lines } = matches;
  if (lines.length === 0) return undefined;
  return direction === 1
    ? (lines.find(candidate => candidate > line) ?? lines[0])
    : ([...lines].reverse().find(candidate => candidate < line) ?? lines.at(-1));
}
