import type { ReviewSearchItem } from '@buildframe/workspace/projection';
import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';

import type { ReviewingApplicationState } from './reviewingModel.js';
import { decodeDiffRow } from './reviewingContent.js';
import { Box, type RenderChild } from './renderTree.js';
import { centeredStart, dialogHeight, dialogTop } from './shellChrome.js';
import { borderedBox, label, spans, theme } from './shellLook.js';
import {
  codeMatchKey,
  codeMatches,
  goToLine,
  SEARCH_SCOPE_NAMES,
  SEARCH_SCOPES,
  type ReviewSearchState,
} from './reviewingCodeSearch.js';

/** The `/` dialog: the query, its results, and a preview of the selected one. */

export function searchResultLabel(state: ReviewingApplicationState, item: ReviewSearchItem, selected: boolean): string {
  const marker = selected ? (state.presentation.ascii ? '>' : '›') : ' ';
  if (item.kind === 'file') return `${marker} ${item.displayPath}`;
  if (item.kind === 'unchanged-file')
    return `${marker} ${item.displayPath}  ${state.presentation.ascii ? '-' : '·'} unchanged`;
  const line = item.change === 'addition' ? item.newLine : item.oldLine;
  const snippet = decodeBytesBase64(item.snippet.bytesBase64).toString('utf8').replaceAll('\n', ' ');
  return `${marker} ${item.change === 'addition' ? '+' : '-'} ${item.displayPath}:${line ?? '?'}  ${snippet}`;
}

export function searchBody(state: ReviewingApplicationState, bodyHeight: number): RenderChild {
  const colors = theme(state);
  const search = state.search;
  if (search === undefined) return Box({});
  const cursor = state.presentation.ascii ? '|' : '▏';
  const query = `${search.query.slice(0, search.cursor)}${cursor}${search.query.slice(search.cursor)}`;
  const codeScope = search.scope === 'file' || search.scope === 'code';
  const results = !codeScope && search.view?.status === 'available' ? search.view.results : [];
  // This file and Code list matching lines; the others list Review search results.
  const rows: readonly { readonly key: string; readonly text: string }[] = codeScope
    ? codeMatches(search).map(match => ({
        key: codeMatchKey(match),
        text: `${search.scope === 'file' ? '' : `${match.path.display}:`}${match.line}  ${match.text.replaceAll('\t', '  ')}`,
      }))
    : results.map(item => ({ key: item.resultIdentity, text: searchResultLabel(state, item, false).slice(2) }));
  // Telescope-style floating window over the review, not a full-screen mode.
  // Its frame stays fixed while results and previews change; recentering a
  // differently sized box on every async preview reads as a close/reopen.
  const width = Math.min(88, Math.max(44, state.width - 12));
  const height = dialogHeight(bodyHeight, 22, 6);
  const innerHeight = Math.max(1, height - 2);
  const changingContentRows = Math.max(1, innerHeight - 3);
  const visible = Math.max(1, Math.floor(changingContentRows * 0.6));
  const previewCapacity = Math.max(0, changingContentRows - visible - 1);
  const selectedLocal = Math.max(
    0,
    rows.findIndex(row => row.key === search.selectedResultIdentity),
  );
  const start = centeredStart(selectedLocal, 0, rows.length, visible);
  const marker = (selected: boolean) => (selected ? (state.presentation.ascii ? '>' : '›') : ' ');
  const preview = search.preview?.status === 'available' ? search.preview.window.rows.slice(0, previewCapacity) : [];
  return borderedBox(
    state,
    {
      id: 'reviewing-search',
      position: 'absolute',
      left: Math.max(0, Math.floor((state.width - width) / 2)),
      top: dialogTop(bodyHeight, height),
      width,
      height,
      zIndex: 28,
      flexDirection: 'column',
      paddingLeft: 1,
      paddingRight: 1,
      overflow: 'hidden',
      borderColor: colors.accent,
      backgroundColor: colors.raised,
      title: ' Search this Review ',
      titleColor: colors.accent,
      titleAlignment: 'center',
    },
    label(state, scopeRow(state, search, colors), { fg: colors.text }),
    label(state, `/ ${query}`, { fg: colors.accent, bold: true }),
    label(state, searchCount(state, search), { fg: search.loading ? colors.warning : colors.muted }),
    ...rows.slice(start, start + visible).map(row =>
      label(state, `${marker(row.key === search.selectedResultIdentity)} ${row.text}`, {
        fg: row.key === search.selectedResultIdentity ? colors.accent : colors.text,
        bg: row.key === search.selectedResultIdentity ? colors.accentSoft : colors.raised,
      }),
    ),
    ...(codeScope || results.length === 0 || previewCapacity === 0
      ? []
      : [label(state, 'Preview', { fg: colors.text, bold: true })]),
    ...(codeScope || previewCapacity === 0
      ? []
      : results.find(item => item.resultIdentity === search.selectedResultIdentity)?.kind === 'unchanged-file'
        ? [label(state, 'Unchanged here; Enter opens the file.', { fg: colors.muted })]
        : preview.map(row =>
            label(state, decodeDiffRow(row, state.presentation.ascii), {
              fg: row.kind === 'addition' ? colors.success : row.kind === 'deletion' ? colors.danger : colors.code,
            }),
          )),
  );
}

/** `● This file  ○ Changes  ○ Files  ○ Code`, like the commit picker's radio row; Tab moves along it. */
function scopeRow(
  state: ReviewingApplicationState,
  search: ReviewSearchState,
  colors: ReturnType<typeof theme>,
): ReturnType<typeof spans> {
  const ascii = state.presentation.ascii;
  return spans(
    state,
    SEARCH_SCOPES.flatMap((scope, index) => [
      ...(index === 0 ? [] : [{ text: '  ', fg: colors.muted }]),
      {
        text: `${scope === search.scope ? (ascii ? '(*)' : '●') : ascii ? '( )' : '○'} ${SEARCH_SCOPE_NAMES[scope]}`,
        fg: scope === search.scope ? colors.text : colors.muted,
        bold: scope === search.scope,
      },
    ]),
  );
}

/** What the search found, or what to type; a code search says what it looked in. */
function searchCount(state: ReviewingApplicationState, search: ReviewSearchState): string {
  const ellipsis = state.presentation.ascii ? '...' : '…';
  const plural = (count: number) => `${count.toLocaleString('en-US')} ${count === 1 ? 'match' : 'matches'}`;
  const line = search.scope === 'file' ? goToLine(search.query) : undefined;
  if (line !== undefined) return `Enter goes to line ${line}.`;
  if (search.loading)
    return search.scope === 'file' || search.scope === 'code'
      ? `Searching the code${ellipsis}`
      : `Searching the exact Snapshot${ellipsis}`;
  if (search.scope === 'file' || search.scope === 'code') {
    const view = search.code;
    if (view === undefined)
      return search.scope === 'file' ? 'Type text in this file, or : and a line number.' : 'Type any text in any file.';
    if (view.status !== 'available')
      return view.reason === 'unsearchable-path'
        ? 'This file’s name can’t be searched.'
        : 'Git couldn’t search the code here.';
    const where = view.searched.kind === 'now' ? 'code now' : `code at ${view.searched.abbreviatedObjectIdentity}`;
    return view.totalMatches > view.matches.length
      ? `${view.matches.length} of ${plural(view.totalMatches)}, refine the search · ${where}`
      : `${plural(view.totalMatches)} · ${where}`;
  }
  if (search.view?.status === 'available') return plural(search.view.totalResults);
  return search.scope === 'files' ? 'Type a file path.' : 'Type added or removed text.';
}
