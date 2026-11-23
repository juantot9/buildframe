import type { ReviewSearchItem } from '@buildframe/workspace/projection';
import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';

import type { ReviewingApplicationState } from './reviewingModel.js';
import { decodeDiffRow } from './reviewingContent.js';
import { Box, type RenderChild } from './renderTree.js';
import { centeredStart, dialogHeight, dialogTop } from './shellChrome.js';
import { borderedBox, label, theme } from './shellLook.js';

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
  const results = search.view?.status === 'available' ? search.view.results : [];
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
    results.findIndex(item => item.resultIdentity === search.selectedResultIdentity),
  );
  const start = centeredStart(selectedLocal, 0, results.length, visible);
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
    label(
      state,
      state.fileScope === 'all' && state.review?.source.kind === 'live'
        ? 'Paths of every file, and added or removed text in the saved Snapshot.'
        : 'File paths and added or removed text in the saved Snapshot.',
      { fg: colors.muted },
    ),
    label(state, `/ ${query}`, { fg: colors.accent, bold: true }),
    label(
      state,
      search.loading
        ? state.presentation.ascii
          ? 'Searching the exact Snapshot...'
          : 'Searching the exact Snapshot…'
        : search.view?.status === 'available'
          ? `${search.view.totalResults} matches`
          : 'Type a file path or changed text.',
      { fg: search.loading ? colors.warning : colors.muted },
    ),
    ...results.slice(start, start + visible).map(item =>
      label(state, searchResultLabel(state, item, item.resultIdentity === search.selectedResultIdentity), {
        fg: item.resultIdentity === search.selectedResultIdentity ? colors.accent : colors.text,
        bg: item.resultIdentity === search.selectedResultIdentity ? colors.accentSoft : colors.raised,
      }),
    ),
    ...(results.length === 0 || previewCapacity === 0
      ? []
      : [label(state, 'Preview', { fg: colors.text, bold: true })]),
    ...(previewCapacity === 0
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
