import {
  StyledText,
  TextareaRenderable,
  type CliRenderer,
  type KeyEvent,
  type MouseEvent,
  type PasteEvent,
  type Renderable,
} from '@opentui/core';
import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';
import type { DefaultReviewMessageInspectionView } from '@buildframe/workspace/harness-interaction';
import type {
  ReviewBasisItem,
  ReviewHistoryStep,
  ReviewMessageListItem,
  ReviewProjectedDiffRow,
  ReviewProjectedQuestionItem,
  ReviewProjectedQuestionTarget,
  ReviewSearchItem,
  WorkspaceHomeReviewItem,
} from '@buildframe/workspace/projection';

import { reviewLiveContentLines } from './reviewingContent.js';
import { Box, h, type RenderChild, type RenderNode } from './renderTree.js';
import { reviewingInputFromKeyEvent, reviewingInputFromPasteEvent } from './reviewingInput.js';
import {
  diffMinimumWidth,
  historyStepKey,
  historyStepText,
  commitName,
  headMoveNote,
  historyStepWords,
  latestHeadMoveStep,
  shortHash,
  shownFilePosition,
  jumpListRows,
  type JumpListRow,
  messageState,
  messagesOnLines,
  messagesPaneName,
  pickableBases,
  rowMessages,
  type LineMessages,
  shownDiff,
  type ReviewRegion,
  type ReviewingApplicationModel,
  type ReviewingApplicationState,
  type ReviewingModelEffect,
  type ReviewingPointerTarget,
  agentName,
  comparisonUnavailableNotice,
  noticeToneOf,
} from './reviewingModel.js';
import { reviewFileTreeNodes, reviewingFiles } from './reviewingFileList.js';
import {
  messageBadge,
  noticeGlyph,
  noticeStatusTone,
  outgoingBadge,
  spinnerGlyph,
  type StatusBadge,
  type StatusTone,
} from './reviewingStatus.js';

import {
  ReviewingScrollRenderable,
  reviewingPageStep,
  visibleReviewingItems,
  type ReviewingPaneScrollLayout,
  type ReviewingPaneScrollState,
  type ReviewingScrollSpan,
  type ReviewingVisibleItem,
} from './reviewingScroll.js';
import {
  displayCells,
  displayCellSlice,
  codeRowStarts,
  fitDisplayCellsEnd,
  wrapDisplayCellRows,
} from './displayCells.js';
import { reviewingFiletype } from './highlightAssets.js';
import type { ReviewingHighlight } from './reviewingHighlight.js';
import {
  borderedBox,
  controlPlaneTheme,
  label,
  safeText,
  theme,
  wrappedRows,
  type ThemeColor,
  toneColor,
} from './shellLook.js';
import { REVIEWING_KEYS, reviewingFooterMode, reviewingHelpMode } from './reviewingKeys.js';
import { footerSentence, keyList, keysRow, type KeyListItem } from './shellKeys.js';
import { PaneGlider } from './shellGlide.js';
import {
  fileStatus,
  fileTypeIcon,
  NERD_ICONS,
  nerdIcons,
  statusColoredRow,
  statusIcon,
} from './reviewingFileGlyphs.js';
import { ShellRoots } from './shellRoots.js';
import { ShellPointer } from './shellPointer.js';
import { ShellSelection } from './shellSelection.js';
import { shellFrame } from './shellFrame.js';
import {
  actionChecksPanel,
  agentIndicator,
  dialogHeight,
  dialogTop,
  keyListPanel,
  shellHeader,
} from './shellChrome.js';
import { configurationDialog } from './shellConfiguration.js';
import { homeLauncherCard, homePane, homeRow, homeSentence, type HomeCard, type HomeChoice } from './shellHome.js';
import { fitPaneDetail, shortDisplayPath, treeName } from './reviewingPathText.js';
import { reviewingSettings } from './reviewingSettings.js';

export { INDIGO_NIGHT, MATCH_TERMINAL_THEME, QUIET_GRAPHITE, QUIET_PAPER, WARM_CARBON } from './shellLook.js';

/** Both code and markdown cross this seam after the same terminal-safe transform. */
function richLabel(
  state: ReviewingApplicationState,
  content: string,
  filetype: string | undefined,
  interaction: ReviewPointerInteraction,
  options: Parameters<typeof label>[2] = {},
  codeWidth?: number,
): RenderChild {
  const exactDisplay = safeText(content, state.presentation.ascii);
  const highlighted = interaction.highlight.text(
    exactDisplay,
    filetype,
    theme(state).tokens,
    state.presentation.noColor,
    options.fg,
  );
  return label(state, codeWidth === undefined ? highlighted : clippedCode(state, highlighted, codeWidth), options);
}

function centeredStart(selected: number, offset: number, count: number, visible: number): number {
  const local = Math.max(0, Math.min(selected - offset, Math.max(0, count - 1)));
  return Math.max(0, Math.min(local - Math.floor(visible / 2), Math.max(0, count - visible)));
}

interface ReviewPointerInteraction {
  readonly highlight: ReviewingHighlight;
  readonly begin: (target: ReviewingPointerTarget, event: MouseEvent) => void;
  readonly finish: (event: MouseEvent) => void;
  readonly move: (event: MouseEvent) => void;
  readonly synchronizePaneScroll: (region: ReviewRegion, layout: ReviewingPaneScrollLayout) => ReviewingPaneScrollState;
  readonly wheelPane: (region: ReviewRegion, event: MouseEvent) => void;
}

interface ReviewingVisualItem {
  readonly size: number;
  readonly ordinals?: readonly number[];
  readonly render: () => RenderChild;
}

interface ReviewingScrollingColumn {
  readonly body: RenderChild;
  readonly visible: readonly ReviewingVisibleItem[];
  readonly span: ReviewingScrollSpan;
  readonly scroll: ReviewingPaneScrollState;
}

function projectedSpan(
  total: number,
  items: readonly ReviewingVisualItem[],
  visible: readonly ReviewingVisibleItem[],
): ReviewingScrollSpan {
  const ordinals = visible.flatMap(item => items[item.index]?.ordinals ?? []);
  const start = ordinals.length === 0 ? 0 : Math.min(...ordinals);
  const end = ordinals.length === 0 ? start : Math.max(...ordinals) + 1;
  return { total, start, size: Math.max(0, end - start) };
}

function scrollingColumn(
  state: ReviewingApplicationState,
  region: ReviewRegion,
  id: string,
  items: readonly ReviewingVisualItem[],
  selectedIndex: number,
  selectionKey: string | undefined,
  viewportHeight: number,
  interaction: ReviewPointerInteraction,
  total: number,
  options: {
    readonly contentKey?: string;
    /** Same scope = same document; the view then keeps its row when the window changes. */
    readonly anchorScope?: string;
    readonly selectionStart?: number;
    readonly selectionSize?: number;
    readonly pageItemSizes?: readonly number[];
    readonly pageSelectedIndex?: number;
  } = {},
): ReviewingScrollingColumn {
  const colors = theme(state);
  const height = Math.max(1, Math.floor(viewportHeight));
  const sizes = items.map(item => item.size);
  const pageSizes = options.pageItemSizes ?? sizes;
  const pageSelected = options.pageSelectedIndex ?? selectedIndex;
  const layout: ReviewingPaneScrollLayout = {
    contentKey: options.contentKey ?? id,
    ...(options.anchorScope === undefined
      ? {}
      : {
          anchorScope: options.anchorScope,
          itemKeys: items.map(item => (item.ordinals?.length ? String(item.ordinals[0]) : undefined)),
        }),
    viewportSize: height,
    itemSizes: sizes,
    selectedIndex,
    ...(selectionKey === undefined ? {} : { selectionKey }),
    ...(options.selectionStart === undefined ? {} : { selectionStart: options.selectionStart }),
    ...(options.selectionSize === undefined ? {} : { selectionSize: options.selectionSize }),
    pageUp: reviewingPageStep(pageSizes, pageSelected, height, -1),
    pageDown: reviewingPageStep(pageSizes, pageSelected, height, 1),
  };
  const scroll = interaction.synchronizePaneScroll(region, layout);
  const viewportBottom = scroll.offset + height;
  const visible = visibleReviewingItems(sizes, scroll.offset, height).filter(
    item => item.start <= scroll.offset || item.start + item.size <= viewportBottom || item.index === selectedIndex,
  );
  const span = projectedSpan(total, items, visible);
  const visualSpan: ReviewingScrollSpan =
    span.size > 0 && span.size < span.total
      ? span
      : {
          total: Math.max(scroll.contentSize, height),
          start: scroll.offset,
          size: Math.min(height, scroll.contentSize),
        };
  const overflowing = visualSpan.size > 0 && visualSpan.size < visualSpan.total;
  const first = visible[0];
  const scrollHandler = { onMouseScroll: (event: MouseEvent) => interaction.wheelPane(region, event) };
  return {
    visible,
    span,
    scroll,
    body: Box(
      {
        id: reviewRenderableId(state, `${id}-viewport`),
        width: '100%',
        height,
        flexShrink: 0,
        flexDirection: 'row',
        overflow: 'visible',
        ...scrollHandler,
      },
      Box(
        {
          width: '100%',
          flexGrow: 1,
          minWidth: 0,
          height: '100%',
          flexShrink: 1,
          overflow: 'hidden',
        },
        Box(
          {
            id: reviewRenderableId(state, `${id}-content`),
            width: '100%',
            height: Math.max(1, scroll.contentSize),
            flexShrink: 0,
            flexDirection: 'column',
            top: -scroll.offset,
          },
          ...(first === undefined || first.start === 0
            ? []
            : [Box({ width: '100%', height: first.start, flexShrink: 0 })]),
          ...visible.map(item =>
            Box(
              { width: '100%', height: item.size, flexShrink: 0, flexDirection: 'column', overflow: 'hidden' },
              items[item.index]?.render(),
            ),
          ),
        ),
      ),
      ...(overflowing
        ? [
            h(ReviewingScrollRenderable, {
              id: reviewRenderableId(state, `${id}-scrollbar`),
              span: visualSpan,
              orientation: 'vertical',
              length: height,
              ascii: state.presentation.ascii,
              noColor: state.presentation.noColor,
              foreground: shownFocus(state) === region ? colors.accent : colors.muted,
              background: colors.surface,
            }),
          ]
        : []),
    ),
  };
}

function reviewRenderableId(state: ReviewingApplicationState, id: string): string {
  return state.historicalDialog === undefined ? id : `historical-${id}`;
}

function pointerMouseHandlers(
  interaction: ReviewPointerInteraction,
  target: ReviewingPointerTarget,
): {
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onMouseUp: (event: MouseEvent) => void;
} {
  return {
    onMouseDown: event => interaction.begin(target, event),
    onMouseUp: event => interaction.finish(event),
  };
}

interface EffectivePaneGeometry {
  readonly files: number;
  readonly questions: number;
  readonly balancedContext: number;
  readonly notebookNavigation: number;
}

/** Effective geometry depends only on saved preferences and terminal size. */
function effectivePaneGeometry(state: ReviewingApplicationState): EffectivePaneGeometry {
  const centerMinimum = diffMinimumWidth(state.width);
  const wideGaps = state.filePaneVisible ? 2 : 1;
  // When both side panes want more than the Diff leaves them, they give way in
  // proportion to their preferred widths, never below their minimums.
  const sideBudget = Math.max(0, state.width - centerMinimum - wideGaps);
  const preferredFiles = state.filePaneVisible ? state.leftPaneWidth : 0;
  const preferredTotal = preferredFiles + state.rightPaneWidth;
  const scale = preferredTotal > sideBudget && preferredTotal > 0 ? sideBudget / preferredTotal : 1;
  const files = state.filePaneVisible ? Math.max(16, Math.floor(state.leftPaneWidth * scale)) : 0;
  const questions = Math.max(20, Math.min(Math.floor(state.rightPaneWidth * scale), sideBudget - files));
  const stableContextPreference = state.filePaneVisible
    ? Math.max(state.leftPaneWidth, state.rightPaneWidth)
    : state.rightPaneWidth;
  const balancedContext = Math.max(
    20,
    Math.min(stableContextPreference, Math.max(20, state.width - centerMinimum - 1)),
  );
  const notebookNavigation = Math.max(
    28,
    Math.min(stableContextPreference, Math.max(28, Math.floor(state.width * 0.42))),
  );
  return { files, questions, balancedContext, notebookNavigation };
}

/** The active review point as a short name: "a1b2c3d", "after #3", "saved point". */
function activeBasisName(state: ReviewingApplicationState): string {
  const basis = state.review?.bases.bases.items.find(
    item => item.reviewBasisIdentity === state.activeReviewBasisIdentity,
  );
  if (basis === undefined || basis.kind === 'live') return 'Live';
  if (basis.kind === 'git-commit') return basis.source.commit.abbreviatedObjectIdentity;
  if (basis.kind === 'change-event') return responseMoment(state, basis.source.responseIdentity);
  return 'saved point';
}

/** What the Diff shows, in plain words: "since last commit", "vs a1b2c3d", "after #3". */
function activeBasisLabel(state: ReviewingApplicationState): string {
  const basis = state.review?.bases.bases.items.find(
    item => item.reviewBasisIdentity === state.activeReviewBasisIdentity,
  );
  if (basis === undefined || basis.kind === 'live') {
    // After HEAD moved during the Review, "last commit" is ambiguous; name it.
    const move = latestHeadMoveStep(state)?.headMove;
    return move === undefined ? 'since last commit' : `since ${shortHash(move.to)}`;
  }
  if (basis.kind === 'git-commit') return `vs ${basis.source.commit.abbreviatedObjectIdentity}`;
  if (basis.kind === 'change-event') return responseMoment(state, basis.source.responseIdentity);
  return 'at a saved point';
}

/** "after #3", naming the Message whose Response this was when it is loaded. */
function responseMoment(state: ReviewingApplicationState, responseIdentity: string): string {
  const messages = state.review?.messages.messages;
  const index = messages?.items.findIndex(item => item.response?.responseIdentity === responseIdentity) ?? -1;
  return messages === undefined || index < 0 ? 'after a Response' : `after #${messages.offset + index + 1}`;
}

/**
 * Whether code changed while the Message was answered; undefined until known.
 * Anyone's edits in that time count, not only the agent's.
 */
function codeChangeNote(
  state: ReviewingApplicationState,
  item: ReviewMessageListItem,
): { readonly text: string; readonly glyph: string; readonly changed: boolean } | undefined {
  if (item.changeObservation === undefined) return undefined;
  const glyph = state.presentation.ascii ? '*' : '✎';
  const step = state.review?.history?.steps.find(
    candidate => candidate.to.kind === 'answered' && candidate.to.reviewMessageIdentity === item.reviewMessageIdentity,
  );
  const separator = state.presentation.ascii ? '-' : '·';
  const moved = step?.headMove === undefined ? '' : ` ${separator} ${headMoveNote(step.headMove)}`;
  // Moving HEAD alone forks the observation; when the code is the same, say that first.
  if (step?.headMove !== undefined && step.changes.status === 'unchanged') {
    return { text: `No code changes${moved}`, glyph, changed: false };
  }
  return item.changeObservation.outcome === 'forked'
    ? { text: `${glyph} Code changed while answering${moved}`, glyph, changed: true }
    : { text: 'No code changes', glyph, changed: false };
}

/**
 * What an empty comparison says. After HEAD moved during the Review, Live
 * changes compare against the new commit, so the sentence names it, and the
 * way on gets its own line. A move that isn't a commit on top is a caution.
 */
function emptyChangesSentence(state: ReviewingApplicationState): { readonly text: string; readonly caution: boolean } {
  if (state.review?.source.kind !== 'live')
    return { text: 'No changed files here. [f] shows all files.', caution: false };
  const step = latestHeadMoveStep(state);
  const move = step?.headMove;
  if (step === undefined || move === undefined) {
    return { text: 'No changes since your last commit. [f] shows all files.', caution: false };
  }
  const { label } = historyStepWords(step, state.review.history?.messages ?? []);
  const way =
    step.changes.status === 'changed' ? '[ and ] history shows what changed · [f] all files.' : '[f] shows all files.';
  if (move.kind === 'moved') {
    return {
      text: `No changes since ${commitName(move.to)}. HEAD moved there ${label}, so Live changes compare against it.\n${way}`,
      caution: true,
    };
  }
  const how = move.count === 1 ? 'committed' : `the newest of ${move.count} commits made`;
  return { text: `No changes since ${commitName(move.to)}, ${how} ${label}.\n${way}`, caution: false };
}

/**
 * " · file 2 of 7" after the Diff's file name while Files isn't on screen, so J/K
 * and the e list have a place to start from; Files says it itself when shown.
 */
function filePositionDetail(state: ReviewingApplicationState): string {
  const filesOnScreen =
    !state.codeOnly &&
    state.filePaneVisible &&
    (state.layout === 'wide' || (state.layout === 'balanced' && state.balancedContext === 'files'));
  const position = filesOnScreen ? undefined : shownFilePosition(state);
  return position === undefined ? '' : ` · file ${position.position} of ${position.total}`;
}

/**
 * The pane that reads as focused. While a Message is being written its
 * composer lives in the Diff, so the Diff shows focus there even when the
 * Message was started from another pane.
 */
function shownFocus(state: ReviewingApplicationState): ReviewingApplicationState['focus'] {
  return state.editor !== undefined ? 'diff' : state.focus;
}

/** Selection wears the accent only in the focused pane; elsewhere its cursor sits on a neutral fill. */
function selectionColors(
  state: ReviewingApplicationState,
  region: ReviewingApplicationState['focus'],
): { readonly fg: ThemeColor; readonly bg: ThemeColor } {
  const colors = theme(state);
  return shownFocus(state) === region
    ? { fg: colors.accent, bg: colors.accentSoft }
    : { fg: colors.text, bg: colors.raised };
}

function paneTitle(
  state: ReviewingApplicationState,
  region: ReviewRegion,
  title: string,
  detail: string,
  span?: ReviewingScrollSpan,
  /** Overrides the title's color, as for a Diff showing the past. */
  tone?: ThemeColor,
  /** The pane's outer width in cells, when known, so the detail can be fitted rather than cut mid-word. */
  paneWidth?: number,
): RenderChild {
  const colors = theme(state);
  const focused = shownFocus(state) === region;
  const marker = focused ? (state.presentation.ascii ? '|' : '▌') : ' ';
  // A self-describing window beats an abstract position bar: which slice of the
  // bounded projection is on screen, in ordinals.
  const position =
    span !== undefined && span.size > 0 && span.size < span.total
      ? ` · ${span.start + 1}-${span.start + span.size}/${span.total}`
      : '';
  const lead = `${marker} ${title}${focused ? ' FOCUSED' : ''}  `;
  const shownDetail =
    paneWidth === undefined
      ? detail
      : fitPaneDetail(
          detail,
          // Border and padding take two cells on each side.
          paneWidth - 4 - displayCells(lead) - displayCells(position),
          state.presentation.ascii ? '...' : '…',
        );
  return label(state, `${lead}${shownDetail}${position}`, {
    fg: tone ?? (focused ? colors.accent : colors.text),
    bold: true,
    height: 1,
    paddingLeft: 1,
    paddingRight: 1,
  });
}

/**
 * In the balanced arrangement Files and History share one side pane; its title
 * names the other one, so a pane you can't see is never a pane you don't know about.
 */
function balancedSibling(state: ReviewingApplicationState, region: 'files' | 'questions'): string {
  if (state.layout !== 'balanced' || !state.filePaneVisible) return '';
  const separator = state.presentation.ascii ? '-' : '·';
  return region === 'files'
    ? `  ${separator} ${messagesPaneName(state)} ${state.review?.messages.messages.total ?? 0}`
    : `  ${separator} Files`;
}

function filesPane(
  state: ReviewingApplicationState,
  width: number | `${number}%`,
  interaction: ReviewPointerInteraction,
  viewportHeight: number,
): RenderChild {
  if (state.shownStep !== undefined) {
    return shownStepFilesPane(state, state.shownStep, width, interaction, viewportHeight);
  }
  const colors = theme(state);
  const review = state.review;
  const files = reviewingFiles(review, state.fileScope);
  const source =
    state.fileScope === 'all' && review?.liveFiles?.status === 'available'
      ? review.liveFiles.files
      : review?.manifest.manifest;
  const sourceOffset = source?.offset ?? 0;
  const sourceTotal = source === undefined ? 0 : 'total' in source ? source.total : source.totalFiles;
  const bodyHeight = Math.max(1, viewportHeight - 4);
  const messages = review?.messages.messages.items ?? [];
  const changedDuring = changedDuringByPath(review);
  const changedGlyph = state.presentation.ascii ? '*' : '✎';
  const nodes = reviewFileTreeNodes(files, state.collapsedDirectories);
  const selectedIndex =
    state.selectedDirectory !== undefined
      ? nodes.findIndex(node => node.kind === 'directory' && node.directory === state.selectedDirectory)
      : nodes.findIndex(node => node.kind === 'file' && node.file.fileIdentity === state.selectedFileIdentity);
  const selectedKey =
    state.selectedDirectory === undefined
      ? state.selectedFileIdentity === undefined
        ? undefined
        : `file:${state.selectedFileIdentity}`
      : `directory:${state.selectedDirectory}`;
  const items: readonly ReviewingVisualItem[] = nodes.map(node => ({
    size: 1,
    ordinals: [sourceOffset + node.flat],
    render: () => {
      const indent = '  '.repeat(node.depth);
      if (node.kind === 'directory') {
        const glyph = nerdIcons(state)
          ? `${node.collapsed ? NERD_ICONS.folder : NERD_ICONS.folderOpen} `
          : `${node.collapsed ? (state.presentation.ascii ? '>' : '▸') : state.presentation.ascii ? 'v' : '▾'} `;
        const selected = node.directory === state.selectedDirectory;
        return label(
          state,
          `${selected ? (state.presentation.ascii ? '>' : '›') : ' '}${indent} ${glyph}${treeName(node.directory)}`,
          {
            fg: selected ? selectionColors(state, 'files').fg : node.collapsed ? colors.muted : colors.text,
            bg: selected ? selectionColors(state, 'files').bg : colors.surface,
            bold: true,
            height: 1,
            paddingLeft: 1,
            paddingRight: 1,
            id: reviewRenderableId(state, `reviewing-directory-row-${sourceOffset + node.flat + 1}`),
            ...pointerMouseHandlers(interaction, { kind: 'file-directory', directory: node.directory }),
          },
        );
      }
      const file = node.file;
      const selected = state.selectedDirectory === undefined && file.fileIdentity === state.selectedFileIdentity;
      const messageCount = messages.filter(
        message => message.location.file.bytesBase64 === file.pathBytesBase64,
      ).length;
      const count = messageCount === 0 ? '' : `  ${state.presentation.ascii ? '#' : '●'}${messageCount}`;
      const changedIn = changedDuring.get(file.pathBytesBase64);
      const changed = changedIn === undefined ? '' : `  ${changedGlyph}#${changedIn}`;
      const status = nerdIcons(state)
        ? statusIcon(state, file.status).trim()
        : fileStatus(file.status, state.presentation.ascii);
      const icon = fileTypeIcon(state, file.displayPath);
      const fg = selected
        ? selectionColors(state, 'files').fg
        : file.status === 'unchanged'
          ? colors.muted
          : colors.text;
      const after = `${status === '' || icon === '' ? icon : ` ${icon}`}  ${treeName(file.displayPath)}${count}${changed}`;
      return label(
        state,
        statusColoredRow(
          state,
          colors,
          {
            before: `${selected ? (state.presentation.ascii ? '>' : '›') : ' '}${indent} `,
            status: file.status,
            glyph: status,
            after,
          },
          { fg, bold: selected },
        ),
        {
          fg,
          bg: selected ? selectionColors(state, 'files').bg : colors.surface,
          bold: selected,
          height: 1,
          paddingLeft: 1,
          paddingRight: 1,
          id: reviewRenderableId(state, `reviewing-file-row-${sourceOffset + node.flat + 1}`),
          ...pointerMouseHandlers(interaction, { kind: 'file', fileIdentity: file.fileIdentity }),
        },
      );
    },
  }));
  const sourceIdentity =
    review?.source.kind === 'live'
      ? review.source.liveChangesIdentity
      : (review?.source.reviewSnapshotIdentity ?? 'none');
  const column = scrollingColumn(
    state,
    'files',
    'reviewing-files',
    items,
    selectedIndex,
    selectedKey,
    bodyHeight,
    interaction,
    sourceTotal,
    {
      contentKey: `reviewing-files:${sourceIdentity}:${state.fileScope}:${sourceOffset}:${state.collapsedDirectories.join('|')}`,
      anchorScope: `reviewing-files:${sourceIdentity}:${state.fileScope}`,
    },
  );
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-files-pane'),
      width,
      height: '100%',
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: shownFocus(state) === 'files' ? colors.accent : colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      onMouseScroll: (event: MouseEvent) => interaction.wheelPane('files', event),
      ...pointerMouseHandlers(interaction, { kind: 'region', region: 'files' }),
    },
    paneTitle(
      state,
      'files',
      'Files',
      `${state.loading?.region === 'files' ? state.loading.label : state.fileScope === 'changed' ? 'Changed' : 'All'}${balancedSibling(state, 'files')}`,
      column.span,
    ),
    label(state, `${sourceTotal} ${state.fileScope === 'changed' ? 'changed' : 'repository'} files`, {
      fg: colors.muted,
      height: 1,
      paddingLeft: 1,
    }),
    column.body,
  );
}

/** For each path, the number of the latest loaded Message during whose answer it changed. */
function changedDuringByPath(review: ReviewingApplicationState['review']): ReadonlyMap<string, number> {
  const marks = new Map<string, number>();
  const list = review?.messages.messages;
  list?.items.forEach((item, local) => {
    const observation = item.changeObservation;
    if (observation?.outcome !== 'forked' || observation.changedFiles === undefined) return;
    for (const path of observation.changedFiles.paths) marks.set(path.bytesBase64, list.offset + local + 1);
  });
  return marks;
}

/** The Files pane while "Changes from #N" is open: only the files that Response changed, flat. */
function shownStepFilesPane(
  state: ReviewingApplicationState,
  changes: NonNullable<ReviewingApplicationState['shownStep']>,
  width: number | `${number}%`,
  interaction: ReviewPointerInteraction,
  viewportHeight: number,
): RenderChild {
  const colors = theme(state);
  const files = changes.files ?? [];
  const bodyHeight = Math.max(1, viewportHeight - 4);
  const selectedIndex = files.findIndex(file => file.fileIdentity === state.selectedFileIdentity);
  const items: readonly ReviewingVisualItem[] = files.map((file, index) => ({
    size: 1,
    ordinals: [index],
    render: () => {
      const selected = file.fileIdentity === state.selectedFileIdentity;
      const status = nerdIcons(state)
        ? statusIcon(state, file.change).trim()
        : fileStatus(file.change, state.presentation.ascii);
      const lines = file.lines === undefined ? '' : `  +${file.lines.added} -${file.lines.removed}`;
      const fg = selected ? selectionColors(state, 'files').fg : colors.text;
      return label(
        state,
        statusColoredRow(
          state,
          colors,
          {
            before: `${selected ? (state.presentation.ascii ? '>' : '›') : ' '} `,
            status: file.change,
            glyph: status,
            after: ` ${fileTypeIcon(state, file.path.display)}  ${file.path.display}${lines}`,
          },
          { fg, bold: selected },
        ),
        {
          fg,
          bg: selected ? selectionColors(state, 'files').bg : colors.surface,
          bold: selected,
          height: 1,
          paddingLeft: 1,
          paddingRight: 1,
          id: reviewRenderableId(state, `reviewing-file-row-${index + 1}`),
          ...pointerMouseHandlers(interaction, { kind: 'file', fileIdentity: file.fileIdentity }),
        },
      );
    },
  }));
  const anchorScope = `reviewing-files:changes:${changes.key}`;
  const column = scrollingColumn(
    state,
    'files',
    'reviewing-files',
    items,
    selectedIndex,
    state.selectedFileIdentity === undefined ? undefined : `file:${state.selectedFileIdentity}`,
    bodyHeight,
    interaction,
    files.length,
    { contentKey: `${anchorScope}:${files.length}`, anchorScope },
  );
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-files-pane'),
      width,
      height: '100%',
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: shownFocus(state) === 'files' ? colors.accent : colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      onMouseScroll: (event: MouseEvent) => interaction.wheelPane('files', event),
      ...pointerMouseHandlers(interaction, { kind: 'region', region: 'files' }),
    },
    paneTitle(state, 'files', 'Files', changes.label, column.span),
    label(
      state,
      changes.files === undefined
        ? state.presentation.ascii
          ? 'Loading...'
          : 'Loading…'
        : `${files.length} ${files.length === 1 ? 'file' : 'files'} changed`,
      { fg: colors.muted, height: 1, paddingLeft: 1 },
    ),
    column.body,
  );
}

function decodeDiffRow(row: ReviewProjectedDiffRow, ascii: boolean): string {
  const decoded = decodeBytesBase64(row.text.bytesBase64).toString('utf8');
  const suffix = row.text.truncated ? ' [source row truncated]' : '';
  return safeText(`${decoded}${suffix}`, ascii, true).replaceAll('\n', ' ');
}

function questionFileLabel(state: ReviewingApplicationState, item: ReviewProjectedQuestionItem): string {
  return (
    state.review?.manifest.manifest.files.find(file => file.fileIdentity === item.target.fileIdentity)?.displayPath ??
    'Snapshot file'
  );
}

function invocationLifecycleLabel(status: string): string {
  switch (status) {
    case 'awaiting-start':
      return 'Waiting to start';
    case 'active':
      return 'Active';
    case 'rejected':
      return 'Did not start';
    case 'ended-normally':
      return 'Turn ended—no complete Response captured';
    case 'failed':
      return 'Failed';
    case 'interrupted':
      return 'Interrupted';
    case 'unresolved':
      return 'Outcome unknown';
    default:
      return 'Not sent yet';
  }
}

function stateBadge(state: ReviewingApplicationState, item: ReviewMessageListItem): StatusBadge {
  return messageBadge(messageState(state, item), state.animationFrame, state.presentation.ascii);
}

/** One sentence for a Message without a Response: what is happening and, if stuck, what to do. */
function messageOutcomeLabel(state: ReviewingApplicationState, item: ReviewMessageListItem): string {
  const agent = agentName(state);
  const lowerAgent = agent === 'The agent' ? 'the agent' : agent;
  const badge = stateBadge(state, item);
  switch (messageState(state, item)) {
    case 'answered':
      return `${badge.glyph} Answered.`;
    case 'working':
      return `${badge.glyph} ${agent} is working on it. Press x to interrupt.`;
    case 'stopping':
      return `${badge.glyph} Asked ${lowerAgent} to stop; waiting for it.`;
    case 'waiting':
      return `${badge.glyph} Waiting for ${lowerAgent} to start.`;
    case 'interrupted':
      return `${badge.glyph} Interrupted before it finished. Press r to send it again.`;
    case 'failed':
      return `${badge.glyph} ${agent} reported an error; its window has the details. Press r to send it again.`;
    case 'not-sent':
      return `${badge.glyph} ${agent} didn’t take this Message. Press r to send it again.`;
    case 'unknown':
      return `${badge.glyph} BuildFrame never heard back about this Message. Check ${lowerAgent}, or press r to send it again.`;
    case 'no-answer':
      return `${badge.glyph} The turn ended without a reply. Press r to send it again.`;
    case 'not-loaded':
      return `${badge.glyph} BuildFrame hasn’t loaded what happened to this Message.`;
  }
}

/** "12 files · 3 Messages"; Questions appear only for Reviews made before Messages. */
function homeReviewCounts(item: WorkspaceHomeReviewItem, separator: string): string {
  return [
    plural(item.totalFiles, 'file'),
    plural(item.messages, 'Message'),
    ...(item.questions > 0 ? [plural(item.questions, 'Question')] : []),
  ].join(separator);
}

function questionStateLabel(state: ReviewingApplicationState, item: ReviewProjectedQuestionItem): string {
  if (item.kind === 'question-draft') return `historical draft r${item.revision}`;
  if (item.response !== undefined) return 'Response captured';
  if (item.historicalDisposition !== undefined) return `historical ${item.historicalDisposition}`;
  if (state.review === undefined) return 'Not sent to the agent';
  const handoff = state.review.harnessInteraction.handoffs.find(
    candidate => candidate.reviewBatchIdentity === item.reviewBatchIdentity,
  );
  if (handoff === undefined) return 'Not sent to the agent';
  const invocation = state.review.harnessInteraction.invocations.find(
    candidate => candidate.handoffIdentity === handoff.handoffIdentity,
  );
  if (invocation === undefined) return 'Not sent to the agent';
  return invocationLifecycleLabel(invocation.status);
}

function responseSize(item: ReviewProjectedQuestionItem): string | undefined {
  if (item.kind !== 'question' || item.response === undefined) return undefined;
  const bytes = item.response.body.totalByteLength;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;
}

function questionLocation(state: ReviewingApplicationState, item: ReviewProjectedQuestionItem): string {
  const side = item.target.side === 'old' ? 'L' : 'R';
  return item.target.kind === 'review.whole-file'
    ? `${questionFileLabel(state, item)} ${side} file`
    : `${questionFileLabel(state, item)} ${side}${item.target.line}`;
}

function questionCard(
  state: ReviewingApplicationState,
  item: ReviewProjectedQuestionItem,
  absolute: number,
  interaction: ReviewPointerInteraction,
  compact = false,
): RenderChild {
  const colors = theme(state);
  const selected = item.itemIdentity === state.selectedQuestionIdentity;
  const body = decodeBytesBase64(item.body.bytesBase64).toString('utf8');
  const previewRows = wrappedRows(body, compact ? 28 : Math.max(16, effectivePaneGeometry(state).questions - 4));
  const shownRows = previewRows.slice(0, compact ? 1 : 2);
  const previewHeight = Math.max(1, shownRows.length);
  const location = questionLocation(state, item);
  const size = responseSize(item);
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, `reviewing-question-card-${absolute + 1}`),
      width: compact ? 32 : '100%',
      height: previewHeight + 4,
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: selected && shownFocus(state) === 'questions' ? colors.accent : colors.border,
      backgroundColor: selected ? selectionColors(state, 'questions').bg : colors.surface,
      paddingLeft: 1,
      paddingRight: 1,
      ...pointerMouseHandlers(interaction, {
        kind: 'question',
        itemIdentity: item.itemIdentity,
      }),
    },
    label(state, `Q${absolute + 1} · ${questionStateLabel(state, item)}`, {
      fg: selected ? selectionColors(state, 'questions').fg : colors.text,
      bold: true,
      height: 1,
    }),
    ...shownRows.map(content =>
      richLabel(state, content, 'markdown', interaction, {
        fg: colors.text,
        height: 1,
        wrap: 'none',
      }),
    ),
    label(state, `${location}${size === undefined ? '' : ` · ${size} Response`}`, {
      fg: colors.muted,
      height: 1,
    }),
  );
}

function questionsPane(
  state: ReviewingApplicationState,
  width: number | `${number}%`,
  interaction: ReviewPointerInteraction,
  viewportHeight: number,
  horizontal = false,
  /** Cell width behind a percentage `width`; defaults to the whole terminal. */
  availableWidth?: number,
): RenderChild {
  const colors = theme(state);
  const list = state.review?.messages.messages;
  const messages = list?.items ?? [];
  const activeBasis = state.activeReviewBasisIdentity;
  const historical = state.review?.questions.list;
  const provisional = state.provisionalMessage;
  const estimatedWidth = typeof width === 'number' ? width : (availableWidth ?? state.width);
  const expandedIdentity = state.hoveredMessageIdentity ?? state.selectedMessageIdentity;
  const separator = state.presentation.ascii ? '-' : '·';

  const previewRows = (value: string, available: number, maximumRows: number): readonly string[] => {
    const normalized = safeText(value, state.presentation.ascii).replace(/\s+/gu, ' ').trim();
    if (normalized.length === 0) return ['(empty)'];
    const rowWidth = Math.max(8, available);
    const rows: string[] = [];
    let remaining = normalized;
    while (remaining.length > 0 && rows.length < maximumRows) {
      if (displayCells(remaining) <= rowWidth) {
        rows.push(remaining);
        remaining = '';
        break;
      }
      const slice = displayCellSlice(remaining, 0, rowWidth);
      const candidate = remaining.slice(0, slice.end);
      const wordBreak = candidate.lastIndexOf(' ');
      const end = wordBreak > 0 ? wordBreak : Math.max(1, slice.end);
      rows.push(remaining.slice(0, end).trimEnd());
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining.length > 0 && rows.length > 0) {
      const ellipsis = state.presentation.ascii ? '...' : '…';
      const last = rows.at(-1) ?? '';
      const availableBeforeEllipsis = Math.max(1, rowWidth - displayCells(ellipsis));
      const slice = displayCellSlice(last, 0, availableBeforeEllipsis);
      const kept = last.slice(0, slice.end);
      // The ellipsis follows a whole word, never half of one.
      const cut = kept.length < last.length && last[kept.length] !== ' ' ? kept.lastIndexOf(' ') : -1;
      rows[rows.length - 1] = `${(cut > 0 ? kept.slice(0, cut) : kept).trimEnd()}${ellipsis}`;
    }
    return rows;
  };

  /** The empty state is an instruction, so it wraps rather than losing its end. */
  const emptyMessagesRows = (paddingLeft: number): RenderChild[] =>
    wrapDisplayCellRows(
      'No Messages yet. Press a on a line or a file to write one.',
      Math.max(8, estimatedWidth - 2 - 2 * paddingLeft),
    ).map(row => label(state, row, { fg: colors.muted, paddingLeft }));

  const completeRows = (value: string, available: number): readonly string[] => {
    const exact = safeText(value, state.presentation.ascii);
    return exact.length === 0 ? ['(empty)'] : wrapDisplayCellRows(exact, Math.max(8, available));
  };

  // A single dim rule between adjacent entries; the first entry and the
  // compact strip stay undecorated.
  const dividerRow = (width: number): string => (state.presentation.ascii ? '-' : '─').repeat(Math.max(1, width));

  /** `file:line` that fits: the folders give way first, then the name; a name is never cut. */
  const fitLocation = (display: string, line: number, available: number): string => {
    const whole = `${display}:${line}`;
    if (displayCells(safeText(whole, state.presentation.ascii)) <= available)
      return safeText(whole, state.presentation.ascii);
    const base = safeText(`${display.split('/').at(-1) ?? display}:${line}`, state.presentation.ascii);
    if (displayCells(base) <= available) return base;
    const lineOnly = `line ${line}`;
    return displayCells(lineOnly) <= available ? lineOnly : clipEnd(lineOnly, available);
  };
  const clipEnd = (value: string, available: number): string => {
    const safe = safeText(value, state.presentation.ascii);
    const cells = Math.max(1, available);
    if (displayCells(safe) <= cells) return safe;
    const ellipsis = state.presentation.ascii ? '...' : '…';
    const remaining = Math.max(1, cells - displayCells(ellipsis));
    const start = Math.max(0, displayCells(safe) - remaining);
    const slice = displayCellSlice(safe, start, remaining);
    return `${ellipsis}${slice.padding}${safe.slice(slice.start, slice.end)}`;
  };

  const statusFor = (item: ReviewMessageListItem): { readonly text: string; readonly fg: ThemeColor } => {
    const badge = stateBadge(state, item);
    return { text: `${badge.glyph} ${badge.word}`, fg: toneColor(colors, badge.tone) };
  };

  // Message text sits under its header with a small indent; the Response or
  // outcome follows on its own "↳" line. Both wrap at the real pane width.
  const bodyIndent = '   ';
  const responseMark = state.presentation.ascii ? '-> ' : '↳ ';
  const ellipsis = state.presentation.ascii ? '...' : '…';

  interface MessageCardLine {
    readonly text: string;
    readonly fg: ThemeColor;
    readonly bold?: boolean;
    /** The line that names the Message; its rail shows the Message's marker. */
    readonly header?: true;
    /** Trailing pieces in their own colour, so a state keeps its tone on a selected row. */
    readonly tail?: readonly { readonly text: string; readonly fg: ThemeColor }[];
  }

  // History: a line down the left edge joins start, each Message, the edits
  // outside answers between them, and now. The step on screen draws thick.
  const history = state.review?.history;
  const shownKey = state.shownStep?.key;
  const glyphs = state.presentation.ascii
    ? { start: '@', answer: 'o', outside: '.', now: '>', line: '|', thick: '#' }
    : { start: '◆', answer: '●', outside: '○', now: '▶', line: '│', thick: '┃' };
  const stepKey = (step: ReviewHistoryStep): string => historyStepKey(step.from, step.to);
  // Once HEAD has moved, "last commit" would name two commits; start names its own.
  const firstHeadMove = history?.steps.find(step => step.headMove !== undefined)?.headMove;
  const answerStepOf = (reviewMessageIdentity: string): ReviewHistoryStep | undefined =>
    history?.steps.find(step => step.to.kind === 'answered' && step.to.reviewMessageIdentity === reviewMessageIdentity);
  /** Changed steps that end at a send or at now get a row of their own, before that Message or at the end. */
  const stepRowBefore = (reviewMessageIdentity: string | 'now'): ReviewHistoryStep | undefined =>
    history?.steps.find(
      step =>
        step.changes.status === 'changed' &&
        (reviewMessageIdentity === 'now'
          ? step.to.kind === 'now'
          : step.to.kind === 'sent' && step.to.reviewMessageIdentity === reviewMessageIdentity),
    );
  const railLabel = (text: string, fg: ThemeColor): RenderChild =>
    label(state, text, { fg, height: 1, width: 2, flexShrink: 0, truncate: false });

  /** The Diff beside History already shows the selected Message in full, so History keeps it short. */
  const diffShowsSelected = ((): boolean => {
    if (state.arrangement !== 'workspace' || state.layout === 'linear') return false;
    const thread = selectedMessageThread(state);
    if (thread === undefined) return false;
    // Judge the fit on the whole text, never on a truncated list preview.
    const picked = thread.selected;
    const bodyLoaded =
      !picked.body.truncated || state.selectedMessageBody?.reviewMessageIdentity === picked.reviewMessageIdentity;
    const responseLoaded =
      picked.response?.body.truncated !== true ||
      state.selectedMessageResponseBody?.reviewMessageIdentity === picked.reviewMessageIdentity;
    if (!bodyLoaded || !responseLoaded) return false;
    const geometry = effectivePaneGeometry(state);
    const diffWidth =
      state.layout === 'wide'
        ? state.width - geometry.files - geometry.questions - (state.filePaneVisible ? 2 : 1)
        : state.width - geometry.balancedContext - 1;
    const { fixedRows, detailRows } = messageThreadRows(state, thread, Math.max(1, diffWidth - 2));
    // Only when the Diff card needs no paging even at its smallest height.
    return fixedRows.length + detailRows.length + 2 <= 10;
  })();
  const messageCardLines = (item: ReviewMessageListItem, absolute: number, compact: boolean): MessageCardLine[] => {
    const selected = item.reviewMessageIdentity === state.selectedMessageIdentity;
    const hovered = item.reviewMessageIdentity === state.hoveredMessageIdentity;
    const expanded = item.reviewMessageIdentity === expandedIdentity;
    const otherPoint = item.originReviewBasisIdentity !== activeBasis;
    const loadedBody =
      state.selectedMessageBody?.reviewMessageIdentity === item.reviewMessageIdentity
        ? state.selectedMessageBody.body
        : undefined;
    const body = loadedBody ?? decodeBytesBase64(item.body.bytesBase64).toString('utf8');
    const bodyComplete = loadedBody !== undefined || !item.body.truncated;
    const loadedResponse =
      state.selectedMessageResponseBody?.reviewMessageIdentity === item.reviewMessageIdentity
        ? state.selectedMessageResponseBody.body
        : undefined;
    const response =
      item.response === undefined
        ? undefined
        : (loadedResponse ?? decodeBytesBase64(item.response.body.bytesBase64).toString('utf8'));
    const responseComplete = loadedResponse !== undefined || item.response?.body.truncated !== true;
    const contentWidth = compact ? 30 : Math.max(12, estimatedWidth - 4 - (history === undefined ? 0 : 2));
    const textWidth = Math.max(8, contentWidth - displayCells(bodyIndent));
    const status = statusFor(item);
    const change = codeChangeNote(state, item);
    const marker = hovered ? '~' : selected ? (state.presentation.ascii ? '>' : '›') : ' ';
    const prefix = `${marker} #${absolute + 1} `;
    const changeMark = change?.changed === true ? ` ${change.glyph}` : '';
    const suffix = `  ${status.text}${changeMark}`;
    const locationWidth = Math.max(3, contentWidth - displayCells(prefix) - displayCells(suffix));
    const bodyColor = otherPoint ? colors.muted : colors.text;
    const lines: MessageCardLine[] = [];
    if (!compact && absolute > 0) lines.push({ text: dividerRow(contentWidth), fg: colors.border });
    const showDetail = !compact && (expanded || selected);
    lines.push({
      text: `${prefix}${fitLocation(item.location.file.display, item.location.line, locationWidth)}`,
      fg: otherPoint ? colors.muted : showDetail ? selectionColors(state, 'questions').fg : colors.text,
      bold: selected,
      header: true,
      tail: [
        { text: `  ${status.text}`, fg: status.fg },
        ...(changeMark === '' ? [] : [{ text: changeMark, fg: colors.warning }]),
      ],
    });
    if (!showDetail) {
      previewRows(body, textWidth, compact ? 1 : 2).forEach(row =>
        lines.push({ text: `${bodyIndent}${row}`, fg: bodyColor }),
      );
      return lines;
    }
    // The selected Message shows everything, unless the Diff beside it already
    // does; a hovered one stays a short preview.
    const full = selected && !diffShowsSelected;
    const bodyRows = full ? completeRows(body, textWidth) : previewRows(body, textWidth, 3);
    bodyRows.forEach(row => lines.push({ text: `${bodyIndent}${row}`, fg: bodyColor }));
    if (full && !bodyComplete)
      lines.push({ text: `${bodyIndent}Loading the full Message${ellipsis}`, fg: colors.muted });
    const responseIndent = `${bodyIndent}${' '.repeat(displayCells(responseMark))}`;
    const responseWidth = Math.max(8, contentWidth - displayCells(responseIndent));
    if (response === undefined) {
      const outcome = `${otherPoint ? `other review point ${separator} ` : ''}${messageOutcomeLabel(state, item)}`;
      const outcomeColor = toneColor(colors, stateBadge(state, item).tone);
      (full ? completeRows(outcome, responseWidth) : previewRows(outcome, responseWidth, 1)).forEach((row, index) =>
        lines.push({
          text: `${index === 0 ? `${bodyIndent}${responseMark}` : responseIndent}${row}`,
          fg: outcomeColor,
        }),
      );
      return lines;
    }
    const responseRows = full ? completeRows(response, responseWidth) : previewRows(response, responseWidth, 3);
    responseRows.forEach((row, index) =>
      lines.push({
        text: `${index === 0 ? `${bodyIndent}${responseMark}` : responseIndent}${row}`,
        fg: index === 0 ? colors.success : colors.text,
      }),
    );
    if (full && !responseComplete) {
      lines.push({ text: `${responseIndent}Loading the full Response${ellipsis}`, fg: colors.muted });
    }
    if (change !== undefined && !(selected && diffShowsSelected)) {
      completeRows(change.text, responseWidth).forEach(row =>
        lines.push({ text: `${responseIndent}${row}`, fg: change.changed ? colors.warning : colors.muted }),
      );
    }
    return lines;
  };

  const renderMessage = (item: ReviewMessageListItem, absolute: number, compact: boolean): RenderChild => {
    const lines = messageCardLines(item, absolute, compact);
    const showDetail =
      !compact &&
      (item.reviewMessageIdentity === expandedIdentity || item.reviewMessageIdentity === state.selectedMessageIdentity);
    return Box(
      {
        id: reviewRenderableId(state, `reviewing-message-card-${absolute + 1}`),
        width: compact ? 32 : '100%',
        height: lines.length,
        flexShrink: 0,
        flexDirection: 'column',
        backgroundColor: showDetail ? selectionColors(state, 'questions').bg : colors.surface,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: 'hidden',
        ...pointerMouseHandlers(interaction, {
          kind: 'message',
          reviewMessageIdentity: item.reviewMessageIdentity,
        }),
      },
      ...lines.map(line => {
        const words = label(state, line.text, {
          fg: line.fg,
          ...(line.bold === true ? { bold: true } : {}),
          height: 1,
          truncate: false,
          flexShrink: 0,
        });
        const text =
          line.tail === undefined
            ? words
            : Box(
                { height: 1, flexDirection: 'row', flexShrink: 0 },
                words,
                ...line.tail.map(piece =>
                  label(state, piece.text, {
                    fg: piece.fg,
                    ...(line.bold === true ? { bold: true } : {}),
                    height: 1,
                    truncate: false,
                    flexShrink: 0,
                  }),
                ),
              );
        if (compact || history === undefined) return text;
        const step = answerStepOf(item.reviewMessageIdentity);
        const shown = step !== undefined && stepKey(step) === shownKey;
        const rail =
          line.header === true
            ? railLabel(
                `${glyphs.answer} `,
                shown ? colors.warning : step?.changes.status === 'changed' ? colors.text : colors.muted,
              )
            : railLabel(`${shown ? glyphs.thick : glyphs.line} `, shown ? colors.warning : colors.border);
        return Box({ width: '100%', height: 1, flexDirection: 'row', flexShrink: 0 }, rail, text);
      }),
    );
  };

  /** A row for a stretch outside answers (or a Message with no answer yet) that changed code. */
  /** "You are here" in History wears the accent only while History has focus. */
  // "here" says what the Diff shows, not where the cursor is: it never takes the selection colours.
  const hereColors = { fg: state.shownStep === undefined ? colors.text : colors.warning, bg: colors.surface };
  const renderStepRow = (step: ReviewHistoryStep, ordinal: number): RenderChild => {
    const shown = stepKey(step) === shownKey;
    const { label: stepLabel } = historyStepText(step, history?.messages ?? []);
    const paths = step.changes.status === 'changed' ? step.changes : undefined;
    const what =
      paths === undefined ? '' : paths.total === 1 ? (paths.paths[0]?.display ?? '1 file') : `${paths.total} files`;
    const tone = step.kind === 'outside' ? colors.muted : colors.text;
    return Box(
      {
        id: reviewRenderableId(state, `reviewing-history-step-${ordinal}`),
        width: '100%',
        height: 1,
        flexShrink: 0,
        flexDirection: 'row',
        backgroundColor: shown ? hereColors.bg : colors.surface,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: 'hidden',
        ...pointerMouseHandlers(interaction, { kind: 'history-step', key: stepKey(step) }),
      },
      railLabel(`${step.kind === 'outside' ? glyphs.outside : glyphs.answer} `, shown ? hereColors.fg : tone),
      label(
        state,
        ((): string => {
          const lead = `${step.kind === 'outside' ? 'edits' : 'changes'} ${stepLabel} ${separator} `;
          const here = shown ? ` ${state.presentation.ascii ? '<- here' : '◀ here'}` : '';
          const room = Math.max(0, estimatedWidth - 6 - displayCells(lead) - displayCells(here));
          // A count ("5 files") is dropped whole rather than cut; a single path keeps its end.
          const fitted =
            displayCells(what) <= room
              ? what
              : paths !== undefined && paths.total > 1
                ? ''
                : clipEnd(what, Math.max(4, room));
          return fitted === '' ? `${lead.replace(` ${separator} `, '')}${here}` : `${lead}${fitted}${here}`;
        })(),
        { fg: shown ? hereColors.fg : tone, height: 1, bold: shown },
      ),
    );
  };

  const renderEdgeRow = (edge: 'start' | 'now'): RenderChild => {
    const here = edge === 'now' && state.shownStep === undefined;
    return Box(
      {
        id: reviewRenderableId(state, `reviewing-history-${edge}`),
        width: '100%',
        height: 1,
        flexShrink: 0,
        flexDirection: 'row',
        backgroundColor: here ? hereColors.bg : colors.surface,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: 'hidden',
        ...(edge === 'now' && state.shownStep !== undefined
          ? pointerMouseHandlers(interaction, { kind: 'region', region: 'questions' })
          : {}),
      },
      railLabel(`${edge === 'start' ? glyphs.start : glyphs.now} `, here ? hereColors.fg : colors.muted),
      label(
        state,
        edge === 'start'
          ? `start ${separator} ${firstHeadMove === undefined ? 'last commit' : shortHash(firstHeadMove.from)}`
          : `now${here ? ` ${state.presentation.ascii ? '<- here' : '◀ here'}` : `  ${separator} Esc to come back`}`,
        { fg: here ? hereColors.fg : colors.muted, height: 1, bold: here },
      ),
    );
  };

  const provisionalStatus = (): { readonly text: string; readonly fg: ThemeColor } => {
    if (provisional === undefined) return { text: '', fg: colors.muted };
    const badge = outgoingBadge(provisional.status, state.animationFrame, state.presentation.ascii);
    return { text: `${badge.glyph} ${badge.word}`, fg: toneColor(colors, badge.tone) };
  };

  const provisionalLines = (compact: boolean): MessageCardLine[] => {
    if (provisional === undefined) return [];
    const contentWidth = compact ? 30 : Math.max(12, estimatedWidth - 4);
    const textWidth = Math.max(8, contentWidth - displayCells(bodyIndent));
    const status = provisionalStatus();
    const prefix = `${state.presentation.ascii ? '+' : '＋'} local `;
    const suffix = `  ${status.text}`;
    const locationWidth = Math.max(3, contentWidth - displayCells(prefix) - displayCells(suffix));
    const lines: MessageCardLine[] = [];
    if (!compact && (list?.total ?? 0) > 0) lines.push({ text: dividerRow(contentWidth), fg: colors.border });
    lines.push({
      text: `${prefix}${fitLocation(provisional.location.fileLabel, provisional.location.line, locationWidth)}${suffix}`,
      fg: status.fg,
      bold: true,
    });
    (compact ? previewRows(provisional.body, textWidth, 1) : completeRows(provisional.body, textWidth)).forEach(row =>
      lines.push({ text: `${bodyIndent}${row}`, fg: colors.text }),
    );
    // While the composer card is open it tells the phase; History keeps the badge.
    if (state.editor === undefined) {
      const detail = (provisional.detail ?? 'Sending…').replaceAll('·', separator);
      (compact ? previewRows(detail, textWidth, 1) : completeRows(detail, textWidth)).forEach(row =>
        lines.push({ text: `${bodyIndent}${row}`, fg: status.fg }),
      );
    }
    return lines;
  };

  const renderProvisional = (compact: boolean): RenderChild => {
    const lines = provisionalLines(compact);
    return Box(
      {
        id: reviewRenderableId(state, 'reviewing-provisional-message'),
        width: compact ? 32 : '100%',
        height: lines.length,
        flexShrink: 0,
        flexDirection: 'column',
        backgroundColor: selectionColors(state, 'questions').bg,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: 'hidden',
      },
      ...lines.map(line =>
        label(state, line.text, {
          fg: line.fg,
          ...(line.bold === true ? { bold: true } : {}),
          height: 1,
          truncate: false,
        }),
      ),
    );
  };

  if (horizontal) {
    const available = Math.max(1, Math.floor(state.width / 32));
    const modernItems = [
      ...messages.map((item, index) => renderMessage(item, (list?.offset ?? 0) + index, true)),
      ...(provisional === undefined ? [] : [renderProvisional(true)]),
    ];
    // Centering follows keyboard selection so hover can never scroll the strip
    // under the pointer it is tracking.
    const selected =
      provisional === undefined
        ? Math.max(
            0,
            messages.findIndex(item => item.reviewMessageIdentity === state.selectedMessageIdentity),
          )
        : modernItems.length - 1;
    const sourceItems =
      modernItems.length > 0
        ? modernItems
        : (historical?.items ?? []).map((item, index) =>
            questionCard(state, item, (historical?.offset ?? 0) + index, interaction, true),
          );
    const start = centeredStart(selected, 0, sourceItems.length, available);
    const shown = sourceItems.slice(start, start + available);
    const total =
      modernItems.length > 0 ? (list?.total ?? 0) + (provisional === undefined ? 0 : 1) : (historical?.totalItems ?? 0);
    const offset = modernItems.length > 0 ? (list?.offset ?? 0) : (historical?.offset ?? 0);
    return borderedBox(
      state,
      {
        id: reviewRenderableId(state, 'reviewing-questions-pane'),
        width,
        height: 7,
        flexShrink: 0,
        flexDirection: 'column',
        borderColor: shownFocus(state) === 'questions' ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        onMouseScroll: (event: MouseEvent) => interaction.wheelPane('questions', event),
        ...pointerMouseHandlers(interaction, { kind: 'region', region: 'questions' }),
      },
      paneTitle(
        state,
        'questions',
        'Messages',
        state.loading?.region === 'questions'
          ? state.loading.label
          : `${list?.total ?? 0}${provisional === undefined ? '' : ' + 1 local'}`,
        { total, start: offset + start, size: shown.length },
      ),
      ...(shown.length === 0
        ? emptyMessagesRows(0)
        : modernItems.length === 0
          ? [
              label(state, 'Historical Questions · readable, not converted to Messages', { fg: colors.muted }),
              Box({ width: '100%', height: 4, flexDirection: 'row', overflow: 'hidden' }, ...shown),
            ]
          : [Box({ width: '100%', height: 5, flexDirection: 'row', overflow: 'hidden' }, ...shown)]),
    );
  }

  const paneBodyHeight = Math.max(1, viewportHeight - 3);
  let listColumn: ReviewingScrollingColumn | undefined;
  let historicalHeading: RenderChild | undefined;

  if (messages.length > 0 || provisional !== undefined) {
    const offset = list?.offset ?? 0;
    const reachesEnd = offset + messages.length >= (list?.total ?? 0);
    const cardItems: ReviewingVisualItem[] = [];
    /** What each item shows: a Message identity, a step key, or an edge; selection follows these. */
    const itemKeys: string[] = [];
    const pushRow = (key: string, ordinal: number, render: () => RenderChild): void => {
      cardItems.push({ size: 1, ordinals: [ordinal], render });
      itemKeys.push(key);
    };
    if (history !== undefined && offset === 0) pushRow('start', 0, () => renderEdgeRow('start'));
    messages.forEach((item, index) => {
      const absolute = offset + index;
      const before = stepRowBefore(item.reviewMessageIdentity);
      if (before !== undefined) pushRow(stepKey(before), absolute, () => renderStepRow(before, absolute));
      cardItems.push({
        size: messageCardLines(item, absolute, false).length,
        ordinals: [absolute],
        render: () => renderMessage(item, absolute, false),
      });
      itemKeys.push(item.reviewMessageIdentity);
    });
    if (history !== undefined && reachesEnd) {
      const total = list?.total ?? 0;
      const last = stepRowBefore('now');
      if (last !== undefined) pushRow(stepKey(last), total, () => renderStepRow(last, total));
      if (history.reachesNow) pushRow('now', total, () => renderEdgeRow('now'));
    }
    if (provisional !== undefined) {
      cardItems.push({
        size: provisionalLines(false).length,
        ordinals: [list?.total ?? 0],
        render: () => renderProvisional(false),
      });
      itemKeys.push(provisional.localIdentity);
    }
    // Scroll reconciliation follows keyboard selection only. Letting hover
    // move the viewport would shift the pointed card under the pointer and
    // oscillate between the two expansions.
    // A shown step that has its own row keeps that row in view; otherwise the selected Message.
    const selectedIndex =
      provisional === undefined
        ? shownKey !== undefined && itemKeys.includes(shownKey)
          ? itemKeys.indexOf(shownKey)
          : itemKeys.indexOf(state.selectedMessageIdentity ?? '')
        : cardItems.length - 1;
    const selectionKey = provisional?.localIdentity ?? state.selectedMessageIdentity;
    listColumn = scrollingColumn(
      state,
      'questions',
      'reviewing-messages',
      cardItems,
      selectedIndex,
      selectionKey,
      paneBodyHeight,
      interaction,
      (list?.total ?? 0) + (provisional === undefined ? 0 : 1),
      {
        contentKey: `reviewing-messages:${state.review?.stateVersion ?? -1}:${list?.offset ?? 0}:${provisional?.localIdentity ?? 'settled'}`,
      },
    );
  } else if ((historical?.items.length ?? 0) > 0) {
    historicalHeading = label(state, 'Historical Questions · readable, not converted to Messages', {
      fg: colors.muted,
      paddingLeft: 1,
    });
    const historicalItems: readonly ReviewingVisualItem[] = (historical?.items ?? []).map((item, index) => {
      const body = decodeBytesBase64(item.body.bytesBase64).toString('utf8');
      const previewHeight = Math.max(
        1,
        wrappedRows(body, Math.max(16, effectivePaneGeometry(state).questions - 4)).slice(0, 2).length,
      );
      return {
        size: previewHeight + 4,
        ordinals: [(historical?.offset ?? 0) + index],
        render: () => questionCard(state, item, (historical?.offset ?? 0) + index, interaction),
      };
    });
    const selectedIndex =
      historicalItems.length === 0
        ? -1
        : Math.max(
            0,
            (historical?.items ?? []).findIndex(item => item.itemIdentity === state.selectedQuestionIdentity),
          );
    listColumn = scrollingColumn(
      state,
      'questions',
      'reviewing-messages',
      historicalItems,
      selectedIndex,
      state.selectedQuestionIdentity,
      Math.max(1, paneBodyHeight - 1),
      interaction,
      historical?.totalItems ?? 0,
      {
        contentKey: `reviewing-historical-questions:${state.review?.stateVersion ?? -1}:${historical?.offset ?? 0}`,
      },
    );
  }

  const paneSpan = listColumn?.span ?? { total: 0, start: 0, size: 0 };
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-questions-pane'),
      width,
      height: '100%',
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: shownFocus(state) === 'questions' ? colors.accent : colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      onMouseScroll: (event: MouseEvent) => interaction.wheelPane('questions', event),
      ...pointerMouseHandlers(interaction, { kind: 'region', region: 'questions' }),
    },
    paneTitle(
      state,
      'questions',
      messagesPaneName(state),
      `${
        state.loading?.region === 'questions'
          ? state.loading.label
          : `${list?.total ?? 0}${history === undefined ? '' : (list?.total ?? 0) === 1 ? ' Message' : ' Messages'}${provisional === undefined ? '' : ' + 1 local'}`
      }${balancedSibling(state, 'questions')}`,
      paneSpan,
    ),
    ...(listColumn === undefined
      ? [...emptyMessagesRows(1)]
      : [...(historicalHeading === undefined ? [] : [historicalHeading]), listColumn.body]),
  );
}

function questionOrdinal(state: ReviewingApplicationState, item: ReviewProjectedQuestionItem): number {
  const list = state.review?.questions.list;
  if (list === undefined) return 1;
  return (
    list.offset +
    Math.max(
      0,
      list.items.findIndex(candidate => candidate.itemIdentity === item.itemIdentity),
    ) +
    1
  );
}

type LineQuestionItem = ReviewProjectedQuestionItem & {
  readonly target: Extract<ReviewProjectedQuestionTarget, { readonly kind: 'review.diff-line' }>;
};

interface DiscussionThread {
  readonly selected: LineQuestionItem;
  readonly items: readonly LineQuestionItem[];
}

interface DiscussionPage {
  readonly offset: number;
  readonly maximumOffset: number;
  readonly pageSize: number;
}

function discussionThreadCard(
  state: ReviewingApplicationState,
  thread: DiscussionThread,
  anchorRow: ReviewProjectedDiffRow,
  maximumHeight: number,
  paneWidth: number,
  interaction: ReviewPointerInteraction,
  onPage: (page: DiscussionPage) => void,
): RenderChild {
  const colors = theme(state);
  const contentWidth = Math.max(12, paneWidth - 4);
  const location = questionLocation(state, thread.selected);
  const code = decodeDiffRow(anchorRow, state.presentation.ascii);
  type DiscussionRow = {
    readonly content: string;
    readonly foreground: ThemeColor;
    readonly markdown?: boolean;
    readonly bold?: boolean;
  };
  const codeRows = wrappedRows(`Code ${location} ${code}`, contentWidth);
  const fixedRows: DiscussionRow[] = codeRows.slice(0, 1).map(content => ({
    content:
      codeRows.length > 1
        ? `${[...content].slice(0, Math.max(1, contentWidth - 1)).join('')}${state.presentation.ascii ? '>' : '›'}`
        : content,
    foreground: colors.code,
  }));
  thread.items.forEach(item => {
    const preview = decodeBytesBase64(item.body.bytesBase64).toString('utf8').replace(/\s+/gu, ' ').trim();
    const status =
      item.kind === 'question' && item.response !== undefined ? 'Response captured' : questionStateLabel(state, item);
    const prefix = `Question ${questionOrdinal(state, item)} ${state.presentation.ascii ? '-' : '·'} `;
    const suffix = ` ${state.presentation.ascii ? '-' : '·'} ${status}`;
    const available = Math.max(1, contentWidth - [...prefix, ...suffix].length);
    const shown = [...preview].slice(0, available).join('');
    fixedRows.push({
      content: `${prefix}${shown}${[...preview].length > available ? (state.presentation.ascii ? '>' : '…') : ''}${suffix}`,
      foreground: item.itemIdentity === thread.selected.itemIdentity ? colors.warning : colors.muted,
      bold: item.itemIdentity === thread.selected.itemIdentity,
    });
  });
  const complete = state.selectedQuestionBody?.itemIdentity === thread.selected.itemIdentity;
  const question = complete
    ? state.selectedQuestionBody!.body
    : decodeBytesBase64(thread.selected.body.bytesBase64).toString('utf8');
  const hasResponse = thread.selected.kind === 'question' && thread.selected.response !== undefined;
  const response = hasResponse
    ? decodeBytesBase64(thread.selected.response!.body.bytesBase64).toString('utf8')
    : questionStateLabel(state, thread.selected);
  const detailRows: DiscussionRow[] = [
    { content: 'Selected Question', foreground: colors.warning, bold: true },
    ...wrappedRows(question, contentWidth).map(content => ({
      content,
      markdown: true,
      foreground: colors.text,
    })),
    {
      content: hasResponse ? 'Response' : 'Status',
      foreground: hasResponse ? colors.success : colors.muted,
      bold: true,
    },
    ...wrappedRows(response, contentWidth).map(content => ({
      content,
      markdown: hasResponse,
      foreground: colors.text,
    })),
  ];
  const hasPaging = fixedRows.length + detailRows.length + 2 > maximumHeight;
  const cardHeight = Math.min(maximumHeight, Math.max(3, fixedRows.length + detailRows.length + (hasPaging ? 3 : 2)));
  const visibleDetailRows = Math.max(0, cardHeight - (hasPaging ? 3 : 2) - fixedRows.length);
  const maximumOffset = Math.max(0, detailRows.length - visibleDetailRows);
  const offset = Math.min(state.questionCardScrollOffset, maximumOffset);
  const shown = detailRows.slice(offset, offset + visibleDetailRows);
  onPage({
    offset,
    maximumOffset,
    pageSize: Math.max(1, visibleDetailRows),
  });
  const title =
    thread.items.length === 1
      ? ` Question ${questionOrdinal(state, thread.selected)} ${state.presentation.ascii ? '-' : '·'} ${location} `
      : ` ${thread.items.length} Questions ${state.presentation.ascii ? '-' : '·'} ${location} `;
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-expanded-question-card'),
      width: '100%',
      height: cardHeight,
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: shownFocus(state) === 'diff' ? colors.accent : colors.border,
      backgroundColor: colors.raised,
      paddingLeft: 1,
      paddingRight: 1,
      title,
      titleColor: shownFocus(state) === 'diff' ? colors.accent : colors.text,
      ...(maximumOffset === 0
        ? {}
        : {
            bottomTitle: ` ${offset + 1}-${offset + shown.length}/${detailRows.length} ${state.presentation.ascii ? '-' : '·'} PgUp/PgDn `,
            bottomTitleAlignment: 'right' as const,
          }),
    },
    ...fixedRows.map(row =>
      label(state, row.content, {
        fg: row.foreground,
        ...(row.bold === undefined ? {} : { bold: row.bold }),
        height: 1,
      }),
    ),
    ...(maximumOffset === 0
      ? []
      : [
          Box(
            { width: '100%', height: 1, flexShrink: 0, flexDirection: 'row' },
            label(state, `${state.presentation.ascii ? '^' : '↑'} Ctrl+K`, {
              id: reviewRenderableId(state, 'reviewing-question-page-up'),
              fg: offset === 0 ? colors.muted : colors.text,
              width: '50%',
              height: 1,
              ...pointerMouseHandlers(interaction, {
                kind: 'question-card-page',
                offset: Math.max(0, offset - visibleDetailRows),
              }),
            }),
            label(state, `${state.presentation.ascii ? 'v' : '↓'} Ctrl+J`, {
              id: reviewRenderableId(state, 'reviewing-question-page-down'),
              fg: offset === maximumOffset ? colors.muted : colors.text,
              width: '50%',
              height: 1,
              ...pointerMouseHandlers(interaction, {
                kind: 'question-card-page',
                offset: Math.min(maximumOffset, offset + visibleDetailRows),
              }),
            }),
          ),
        ]),
    ...shown.map((row, index) =>
      richLabel(state, row.content, row.markdown ? 'markdown' : undefined, interaction, {
        fg: row.foreground,
        ...(row.bold === undefined ? {} : { bold: row.bold }),
        height: 1,
        ...(index === 0 ? { id: reviewRenderableId(state, 'reviewing-expanded-question-text') } : {}),
      }),
    ),
  );
}

function selectedDiscussionThread(state: ReviewingApplicationState): DiscussionThread | undefined {
  if (state.shownStep !== undefined) return undefined;
  const selected = state.review?.questions.list.items.find(
    candidate => candidate.itemIdentity === state.expandedQuestionIdentity,
  );
  const visibleDiff = state.review?.diff;
  if (
    selected === undefined ||
    selected.target.kind !== 'review.diff-line' ||
    visibleDiff?.status !== 'available' ||
    selected.target.fileIdentity !== visibleDiff.file.fileIdentity
  ) {
    return undefined;
  }
  const selectedTarget = selected.target;
  const targetRowIsVisible =
    selectedTarget.rowIdentity !== undefined &&
    visibleDiff.window.rows.some(row => row.rowIdentity === selectedTarget.rowIdentity);
  const resolvedRowIdentity = targetRowIsVisible
    ? selectedTarget.rowIdentity
    : visibleDiff.window.rows.find(
        row => (selectedTarget.side === 'old' ? row.oldLine : row.newLine) === selectedTarget.line,
      )?.rowIdentity;
  if (resolvedRowIdentity === undefined) return undefined;
  const selectedLine: LineQuestionItem = {
    ...selected,
    target: {
      ...selected.target,
      rowIdentity: resolvedRowIdentity,
    },
  };
  const items = state.review!.questions.list.items.flatMap((candidate): readonly LineQuestionItem[] =>
    candidate.target.kind === 'review.diff-line' &&
    candidate.target.fileIdentity === selectedLine.target.fileIdentity &&
    candidate.target.side === selectedLine.target.side &&
    candidate.target.line === selectedLine.target.line
      ? [
          {
            ...candidate,
            target: {
              ...candidate.target,
              rowIdentity: resolvedRowIdentity,
            },
          },
        ]
      : [],
  );
  return { selected: selectedLine, items };
}

interface MessageThread {
  readonly selected: ReviewMessageListItem;
  readonly items: readonly ReviewMessageListItem[];
  /** The exact anchored code line, from the Diff row or the loaded unchanged content. */
  readonly code: string;
  /** Present when the anchor resolves against the Diff; absent for unchanged content. */
  readonly row?: ReviewProjectedDiffRow;
}

/** Resolves the selected Message to the visible Diff row or unchanged content line it belongs to. */
function selectedMessageThread(state: ReviewingApplicationState): MessageThread | undefined {
  if (state.shownStep !== undefined) return shownStepMessageThread(state);
  const review = state.review;
  const selected = review?.messages.messages.items.find(
    item => item.reviewMessageIdentity === state.selectedMessageIdentity,
  );
  if (review === undefined || selected === undefined) return undefined;
  const file = reviewingFiles(review, state.fileScope).find(
    candidate => candidate.pathBytesBase64 === selected.location.file.bytesBase64,
  );
  if (file === undefined) return undefined;
  const items = review.messages.messages.items.filter(
    item =>
      item.location.file.bytesBase64 === selected.location.file.bytesBase64 &&
      item.location.line === selected.location.line,
  );
  if (file.status === 'unchanged') {
    const content = state.unchangedContent;
    if (content?.pathBytesBase64 !== file.pathBytesBase64 || content.view.status !== 'available') return undefined;
    const code = reviewLiveContentLines(content.view)[selected.location.line - content.view.content.firstLine];
    if (code === undefined) return undefined;
    return { selected, items, code };
  }
  const diff = review.diff;
  if (diff?.status !== 'available' || diff.file.fileIdentity !== (file.diffFileIdentity ?? file.fileIdentity)) {
    return undefined;
  }
  const row =
    diff.window.rows.find(candidate => candidate.newLine === selected.location.line) ??
    diff.window.rows.find(candidate => candidate.oldLine === selected.location.line);
  if (row === undefined) return undefined;
  return { selected, items, row, code: decodeDiffRow(row, state.presentation.ascii) };
}

/** On a past step, the open Message's card sits beneath the line it was sent about, on the side that line belongs to. */
function shownStepMessageThread(state: ReviewingApplicationState): MessageThread | undefined {
  const changes = state.shownStep;
  const diff = changes?.diff;
  if (changes?.openMessage === undefined || diff?.status !== 'available') return undefined;
  const lines = messagesOnLines(state);
  for (const row of diff.window.rows) {
    const items = rowMessages(lines, row);
    const selected = items.find(item => item.reviewMessageIdentity === changes.openMessage);
    if (selected !== undefined) return { selected, items, row, code: decodeDiffRow(row, state.presentation.ascii) };
  }
  return undefined;
}

/** The mark beside a code line with Messages: their count, in the first one's state colour. */
function lineMessagesMark(
  state: ReviewingApplicationState,
  items: readonly ReviewMessageListItem[],
): { readonly text: string; readonly fg: ThemeColor } | undefined {
  const first = items[0];
  if (first === undefined) return undefined;
  const glyph = state.presentation.ascii ? '#' : '●';
  return {
    text: `${glyph}${items.length > 9 ? '+' : items.length}`,
    fg: toneColor(theme(state), stateBadge(state, first).tone),
  };
}

/** Cells the Message mark column takes when the shown file has Messages. */
const LINE_MESSAGES_WIDTH = 3;

function hasLineMessages(lines: LineMessages): boolean {
  return lines.old.size > 0 || lines.new.size > 0;
}

/** The Message mark column beside a code line; blank on lines without Messages. */
function lineMessagesCell(
  state: ReviewingApplicationState,
  items: readonly ReviewMessageListItem[],
  id: string,
  selected: boolean,
): RenderChild {
  const mark = lineMessagesMark(state, items);
  return label(state, mark === undefined ? ' ' : `${mark.text} `, {
    ...(mark === undefined ? {} : { id: reviewRenderableId(state, id) }),
    fg: mark?.fg ?? theme(state).muted,
    bold: mark !== undefined && selected,
    width: LINE_MESSAGES_WIDTH,
    height: 1,
    flexShrink: 0,
  });
}

interface MessageCardRow {
  readonly content: string;
  readonly foreground: ThemeColor;
  readonly markdown?: boolean;
  readonly bold?: boolean;
}

interface MessageThreadRows {
  readonly fixedRows: readonly MessageCardRow[];
  readonly detailRows: readonly MessageCardRow[];
  readonly title: string;
  readonly titleColor: ThemeColor;
}

/** The rows of the inline Message card; the Diff sizes its slot from these. */
function messageThreadRows(
  state: ReviewingApplicationState,
  thread: MessageThread,
  paneWidth: number,
): MessageThreadRows {
  const colors = theme(state);
  const contentWidth = Math.max(12, paneWidth - 4);
  const selected = thread.selected;
  const location = `${selected.location.file.display}:${selected.location.line}`;
  const separator = state.presentation.ascii ? '-' : '·';
  const list = state.review!.messages.messages;
  const ordinal = (item: ReviewMessageListItem): number => list.offset + Math.max(0, list.items.indexOf(item)) + 1;
  // The code line sits right above the card, so the card holds only the
  // conversation. Several Messages on one line get a one-row index first.
  const fixedRows: MessageCardRow[] =
    thread.items.length === 1
      ? []
      : thread.items.map(item => {
          const preview = decodeBytesBase64(item.body.bytesBase64).toString('utf8').replace(/\s+/gu, ' ').trim();
          const badge = stateBadge(state, item);
          const prefix = `#${ordinal(item)} ${separator} `;
          const suffix = ` ${separator} ${badge.glyph} ${badge.word}`;
          // Count terminal cells, not characters, and keep the state word whole:
          // the preview is what gives way. Two cells spare the card's own edges.
          const available = Math.max(1, contentWidth - 2 - displayCells(prefix) - displayCells(suffix));
          const shown = fitDisplayCellsEnd(preview, available, state.presentation.ascii ? '>' : '…');
          const isSelected = item.reviewMessageIdentity === selected.reviewMessageIdentity;
          return {
            content: `${prefix}${shown}${suffix}`,
            // Bold marks the selected one; its state keeps its own tone.
            foreground: isSelected ? toneColor(colors, badge.tone) : colors.muted,
            bold: isSelected,
          };
        });
  const loadedBody =
    state.selectedMessageBody?.reviewMessageIdentity === selected.reviewMessageIdentity
      ? state.selectedMessageBody.body
      : undefined;
  const body = loadedBody ?? decodeBytesBase64(selected.body.bytesBase64).toString('utf8');
  const bodyComplete = loadedBody !== undefined || !selected.body.truncated;
  const loadedResponse =
    state.selectedMessageResponseBody?.reviewMessageIdentity === selected.reviewMessageIdentity
      ? state.selectedMessageResponseBody.body
      : undefined;
  const response =
    selected.response === undefined
      ? undefined
      : (loadedResponse ?? decodeBytesBase64(selected.response.body.bytesBase64).toString('utf8'));
  const responseComplete = loadedResponse !== undefined || selected.response?.body.truncated !== true;
  const loadingLabel = state.presentation.ascii ? '...' : '…';
  const responseMark = state.presentation.ascii ? '-> ' : '↳ ';
  const responseIndent = ' '.repeat(displayCells(responseMark));
  const responseWidth = Math.max(8, contentWidth - displayCells(responseMark));
  const badge = stateBadge(state, selected);
  const change = codeChangeNote(state, selected);
  // In a stack the index row already shows a body that fits on it whole; say it once.
  const indexShowsBody =
    thread.items.length > 1 &&
    bodyComplete &&
    !body.includes('\n') &&
    fixedRows.some(row => row.bold === true && !row.content.includes(state.presentation.ascii ? '>' : '…'));
  const detailRows: MessageCardRow[] = [
    ...(indexShowsBody
      ? []
      : wrappedRows(body, contentWidth).map(content => ({
          content,
          markdown: true,
          foreground: colors.text,
        }))),
    ...(bodyComplete ? [] : [{ content: `Loading the full Message${loadingLabel}`, foreground: colors.muted }]),
    ...(response === undefined
      ? wrappedRows(messageOutcomeLabel(state, selected), responseWidth).map((content, index) => ({
          content: `${index === 0 ? responseMark : responseIndent}${content}`,
          foreground: toneColor(colors, badge.tone),
        }))
      : wrappedRows(response, responseWidth).map((content, index) => ({
          content: `${index === 0 ? responseMark : responseIndent}${content}`,
          markdown: true,
          foreground: index === 0 ? colors.success : colors.text,
        }))),
    ...(responseComplete
      ? []
      : [{ content: `${responseIndent}Loading the full Response${loadingLabel}`, foreground: colors.muted }]),
    ...(change === undefined
      ? []
      : [{ content: `${responseIndent}${change.text}`, foreground: change.changed ? colors.warning : colors.muted }]),
  ];
  const title =
    thread.items.length === 1
      ? ` #${ordinal(selected)} ${location} ${separator} ${badge.glyph} ${badge.word} `
      : ` ${thread.items.length} Messages ${separator} ${location} `;
  // The border marks the selection; the title keeps the state's own tone.
  const titleColor =
    thread.items.length === 1
      ? toneColor(colors, badge.tone)
      : shownFocus(state) === 'diff'
        ? colors.accent
        : colors.text;
  return { fixedRows, detailRows, title, titleColor };
}

/** Rows the inline card takes in the Diff, borders and paging row included. */
function messageThreadCardHeight(
  state: ReviewingApplicationState,
  thread: MessageThread,
  maximumHeight: number,
  paneWidth: number,
): number {
  const { fixedRows, detailRows } = messageThreadRows(state, thread, paneWidth);
  const hasPaging = fixedRows.length + detailRows.length + 2 > maximumHeight;
  return Math.min(maximumHeight, Math.max(3, fixedRows.length + detailRows.length + (hasPaging ? 3 : 2)));
}

/** Renders the selected Message inline at its anchored code line, like the legacy thread card. */
function messageThreadCard(
  state: ReviewingApplicationState,
  thread: MessageThread,
  maximumHeight: number,
  paneWidth: number,
  interaction: ReviewPointerInteraction,
  onPage: (page: DiscussionPage) => void,
): RenderChild {
  const colors = theme(state);
  const separator = state.presentation.ascii ? '-' : '·';
  const { fixedRows, detailRows, title, titleColor } = messageThreadRows(state, thread, paneWidth);
  const hasPaging = fixedRows.length + detailRows.length + 2 > maximumHeight;
  const cardHeight = Math.min(maximumHeight, Math.max(3, fixedRows.length + detailRows.length + (hasPaging ? 3 : 2)));
  const visibleDetailRows = Math.max(0, cardHeight - (hasPaging ? 3 : 2) - fixedRows.length);
  const maximumOffset = Math.max(0, detailRows.length - visibleDetailRows);
  const offset = Math.min(state.questionCardScrollOffset, maximumOffset);
  const shown = detailRows.slice(offset, offset + visibleDetailRows);
  onPage({
    offset,
    maximumOffset,
    pageSize: Math.max(1, visibleDetailRows),
  });
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-expanded-message-card'),
      width: '100%',
      height: cardHeight,
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: shownFocus(state) === 'diff' ? colors.accent : colors.border,
      backgroundColor: colors.raised,
      paddingLeft: 1,
      paddingRight: 1,
      title,
      titleColor,
      ...(maximumOffset === 0
        ? {}
        : {
            bottomTitle: ` ${offset + 1}-${offset + shown.length}/${detailRows.length} ${separator} PgUp/PgDn `,
            bottomTitleAlignment: 'right' as const,
          }),
    },
    ...fixedRows.map(row =>
      label(state, row.content, {
        fg: row.foreground,
        ...(row.bold === undefined ? {} : { bold: row.bold }),
        height: 1,
      }),
    ),
    ...(maximumOffset === 0
      ? []
      : [
          Box(
            { width: '100%', height: 1, flexShrink: 0, flexDirection: 'row' },
            label(state, `${state.presentation.ascii ? '^' : '↑'} Ctrl+K`, {
              id: reviewRenderableId(state, 'reviewing-message-page-up'),
              fg: offset === 0 ? colors.muted : colors.text,
              width: '50%',
              height: 1,
              ...pointerMouseHandlers(interaction, {
                kind: 'question-card-page',
                offset: Math.max(0, offset - visibleDetailRows),
              }),
            }),
            label(state, `${state.presentation.ascii ? 'v' : '↓'} Ctrl+J`, {
              id: reviewRenderableId(state, 'reviewing-message-page-down'),
              fg: offset === maximumOffset ? colors.muted : colors.text,
              width: '50%',
              height: 1,
              ...pointerMouseHandlers(interaction, {
                kind: 'question-card-page',
                offset: Math.min(maximumOffset, offset + visibleDetailRows),
              }),
            }),
          ),
        ]),
    ...shown.map((row, index) =>
      richLabel(state, row.content, row.markdown ? 'markdown' : undefined, interaction, {
        fg: row.foreground,
        ...(row.bold === undefined ? {} : { bold: row.bold }),
        height: 1,
        ...(index === 0 ? { id: reviewRenderableId(state, 'reviewing-expanded-message-text') } : {}),
      }),
    ),
  );
}

function clippedCode(
  state: ReviewingApplicationState,
  source: string | StyledText,
  width: number,
): string | StyledText {
  if (state.wrapDiffLines) return wrappedCode(source, width);
  const plain = typeof source === 'string' ? source : source.chunks.map(chunk => chunk.text).join('');
  const offset = state.diffHorizontalOffset;
  const left = offset > 0 ? (state.presentation.ascii ? '<' : '‹') : '';
  const available = Math.max(1, width - left.length - 1);
  const slice = displayCellSlice(plain, offset, available);
  const shown = plain.slice(slice.start, slice.end);
  const clipped = displayCells(plain) > offset + available;
  const right = clipped ? (state.presentation.ascii ? '>' : '›') : '';
  if (typeof source === 'string') return `${left}${slice.padding}${shown}${right}`;
  let index = 0;
  return new StyledText([
    { __isChunk: true, text: left + slice.padding },
    ...source.chunks.flatMap(chunk => {
      const start = Math.max(0, slice.start - index);
      const end = Math.min(chunk.text.length, slice.end - index);
      index += chunk.text.length;
      return end <= start ? [] : [{ ...chunk, text: chunk.text.slice(start, end) }];
    }),
    { __isChunk: true, text: right },
  ]);
}

/**
 * Breaks code into explicit rows at token boundaries (see `codeRowStarts`), so
 * the rendered rows and `wrappedDiffRowHeight` come from one calculation.
 */
function wrappedCode(source: string | StyledText, width: number): string | StyledText {
  const plain = typeof source === 'string' ? source : source.chunks.map(chunk => chunk.text).join('');
  const starts = codeRowStarts(plain, width);
  if (starts.length === 0) return source;
  if (typeof source === 'string') {
    return [0, ...starts].map((start, index) => plain.slice(start, starts[index] ?? plain.length)).join('\n');
  }
  let offset = 0;
  return new StyledText(
    source.chunks.map(chunk => {
      const chunkStart = offset;
      offset += chunk.text.length;
      const inside = starts.filter(start => start >= chunkStart && start < offset);
      if (inside.length === 0) return chunk;
      let text = '';
      let from = chunkStart;
      for (const start of inside) {
        text += `${chunk.text.slice(from - chunkStart, start - chunkStart)}\n`;
        from = start;
      }
      return { ...chunk, text: text + chunk.text.slice(from - chunkStart) };
    }),
  );
}

/** Where the selection starts, in rows, and how many rows it spans: one running total. */
function selectionSpan(
  items: readonly ReviewingVisualItem[],
  first: number,
  last: number,
): { readonly selectionStart?: number; readonly selectionSize?: number } {
  if (first < 0) return {};
  let start = 0;
  for (let index = 0; index < first; index += 1) start += items[index]!.size;
  if (last < first) return { selectionStart: start };
  let size = 0;
  for (let index = first; index <= last; index += 1) size += items[index]!.size;
  return { selectionStart: start, selectionSize: size };
}

/**
 * Wrapped heights by row object. Rows are immutable and stay the same objects
 * between redraws, so cursor moves, glides and spinners re-measure nothing.
 */
const wrappedRowHeights = new WeakMap<ReviewProjectedDiffRow, Map<string, number>>();

function wrappedDiffRowHeight(
  state: ReviewingApplicationState,
  row: ReviewProjectedDiffRow,
  codeWidth: number,
): number {
  if (!state.wrapDiffLines) return 1;
  const key = `${codeWidth}:${state.presentation.ascii ? 'ascii' : 'unicode'}`;
  let heights = wrappedRowHeights.get(row);
  const known = heights?.get(key);
  if (known !== undefined) return known;
  const height = codeRowStarts(decodeDiffRow(row, state.presentation.ascii), codeWidth).length + 1;
  if (heights === undefined) {
    heights = new Map();
    wrappedRowHeights.set(row, heights);
  }
  // A resize sweep leaves at most a few widths per row; keep the newest few.
  if (heights.size >= 4) heights.delete(heights.keys().next().value!);
  heights.set(key, height);
  return height;
}

function diffLine(
  state: ReviewingApplicationState,
  row: ReviewProjectedDiffRow,
  codeWidth: number,
  interaction: ReviewPointerInteraction,
  lines: LineMessages,
): RenderChild {
  const colors = theme(state);
  const selected = row.rowIdentity === state.selectedRowIdentity;
  const marker = row.kind === 'addition' ? '+' : row.kind === 'deletion' ? '-' : ' ';
  const numbers = `${selected ? (state.presentation.ascii ? '>' : '▌') : ' '} ${String(row.oldLine ?? '').padStart(4)} ${String(row.newLine ?? '').padStart(4)} `;
  const withMarks = hasLineMessages(lines);
  const code = decodeDiffRow(row, state.presentation.ascii);
  const foreground = row.kind === 'addition' ? colors.success : row.kind === 'deletion' ? colors.danger : colors.code;
  const background = selected
    ? selectionColors(state, 'diff').bg
    : row.kind === 'addition'
      ? colors.successSoft
      : row.kind === 'deletion'
        ? colors.dangerSoft
        : colors.surface;
  const lineHeight = wrappedDiffRowHeight(state, row, codeWidth);
  return Box(
    {
      width: '100%',
      height: lineHeight,
      flexShrink: 0,
      flexDirection: 'row',
      backgroundColor: state.presentation.noColor ? 'transparent' : background,
      id: reviewRenderableId(state, `reviewing-diff-row-${row.rowIdentity}`),
      ...pointerMouseHandlers(interaction, {
        kind: 'diff-row',
        rowIdentity: row.rowIdentity,
        side: row.newLine !== undefined ? 'new' : 'old',
      }),
    },
    // Files without Messages keep the one-piece gutter; the mark column sits between the numbers and +/-.
    ...(withMarks
      ? [
          label(state, numbers, {
            fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
            width: 12,
            height: 1,
            flexShrink: 0,
          }),
          lineMessagesCell(state, rowMessages(lines, row), `reviewing-line-messages-${row.rowIdentity}`, selected),
          label(state, marker, {
            fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
            width: 2,
            height: 1,
            flexShrink: 0,
          }),
        ]
      : [
          label(state, `${numbers}${marker}`, {
            fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
            width: 14,
            height: 1,
            flexShrink: 0,
          }),
        ]),
    richLabel(
      state,
      code.length === 0 ? ' ' : code,
      reviewingFiletype(shownDiff(state)?.file?.displayPath ?? ''),
      interaction,
      {
        fg: foreground,
        // Explicit width keeps the model's wrap math and the rendered wrap
        // width identical, including the pane's rounded-border columns.
        width: codeWidth,
        flexShrink: 0,
        height: lineHeight,
        wrap: state.wrapDiffLines ? 'char' : 'none',
        truncate: false,
      },
      codeWidth,
    ),
  );
}

interface SidePair {
  readonly old?: ReviewProjectedDiffRow;
  readonly next?: ReviewProjectedDiffRow;
}

function sidePairs(rows: readonly ReviewProjectedDiffRow[]): readonly SidePair[] {
  const pairs: SidePair[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (row === undefined) break;
    if (row.kind === 'context') {
      pairs.push({ old: row, next: row });
      index += 1;
      continue;
    }
    const deletions: ReviewProjectedDiffRow[] = [];
    while (rows[index]?.kind === 'deletion') deletions.push(rows[index++]!);
    const additions: ReviewProjectedDiffRow[] = [];
    while (rows[index]?.kind === 'addition') additions.push(rows[index++]!);
    for (let offset = 0; offset < Math.max(deletions.length, additions.length); offset += 1) {
      pairs.push({
        ...(deletions[offset] === undefined ? {} : { old: deletions[offset] }),
        ...(additions[offset] === undefined ? {} : { next: additions[offset] }),
      });
    }
  }
  return pairs;
}

function sidePairHeight(state: ReviewingApplicationState, pair: SidePair, codeWidth: number): number {
  return Math.max(
    pair.old === undefined ? 1 : wrappedDiffRowHeight(state, pair.old, codeWidth),
    pair.next === undefined ? 1 : wrappedDiffRowHeight(state, pair.next, codeWidth),
  );
}

function sideBySideLine(
  state: ReviewingApplicationState,
  pair: SidePair,
  codeWidth: number,
  interaction: ReviewPointerInteraction,
  lines: LineMessages,
): RenderChild {
  const colors = theme(state);
  const height = sidePairHeight(state, pair, codeWidth);
  const side = (row: ReviewProjectedDiffRow | undefined, direction: 'old' | 'new'): RenderChild => {
    if (row === undefined) {
      return Box({
        width: '50%',
        height,
        flexDirection: 'row',
        backgroundColor: state.presentation.noColor ? 'transparent' : colors.surface,
      });
    }
    const selected =
      row.rowIdentity === state.selectedRowIdentity && (row.kind !== 'context' || state.anchorSide === direction);
    const line = direction === 'old' ? row.oldLine : row.newLine;
    const marker = row.kind === 'addition' ? '+' : row.kind === 'deletion' ? '-' : ' ';
    const code = decodeDiffRow(row, state.presentation.ascii);
    const foreground = row.kind === 'addition' ? colors.success : row.kind === 'deletion' ? colors.danger : colors.code;
    const background = selected
      ? selectionColors(state, 'diff').bg
      : row.kind === 'addition'
        ? colors.successSoft
        : row.kind === 'deletion'
          ? colors.dangerSoft
          : colors.surface;
    return Box(
      {
        width: '50%',
        height,
        flexDirection: 'row',
        backgroundColor: state.presentation.noColor ? 'transparent' : background,
        id: reviewRenderableId(state, `reviewing-diff-row-${row.rowIdentity}-${direction}`),
        ...pointerMouseHandlers(interaction, {
          kind: 'diff-row',
          rowIdentity: row.rowIdentity,
          side: direction,
        }),
      },
      label(state, `${selected ? (state.presentation.ascii ? '>' : '▌') : ' '} ${String(line ?? '').padStart(4)} `, {
        fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
        width: 7,
        height: 1,
        flexShrink: 0,
      }),
      ...(hasLineMessages(lines)
        ? [
            lineMessagesCell(
              state,
              (direction === 'old' ? row.oldLine : row.newLine) === undefined
                ? []
                : ((direction === 'old' ? lines.old : lines.new).get(
                    (direction === 'old' ? row.oldLine : row.newLine)!,
                  ) ?? []),
              `reviewing-line-messages-${row.rowIdentity}-${direction}`,
              selected,
            ),
          ]
        : []),
      label(state, marker, {
        fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
        width: 1,
        height: 1,
        flexShrink: 0,
      }),
      richLabel(
        state,
        code.length === 0 ? ' ' : code,
        reviewingFiletype(shownDiff(state)?.file?.displayPath ?? ''),
        interaction,
        {
          fg: foreground,
          flexGrow: 1,
          height,
          wrap: state.wrapDiffLines ? 'char' : 'none',
          truncate: false,
        },
        codeWidth,
      ),
    );
  };
  return Box(
    { width: '100%', height, flexShrink: 0, flexDirection: 'row' },
    side(pair.old, 'old'),
    side(pair.next, 'new'),
  );
}

function diffPane(
  state: ReviewingApplicationState,
  width: number | 'auto' | `${number}%`,
  questionTextarea: TextareaRenderable | undefined,
  interaction: ReviewPointerInteraction,
  onDiscussionPage: (page: DiscussionPage) => void,
  onContentPage: (pageSize: number) => void,
  viewportHeight: number,
): RenderChild {
  const colors = theme(state);
  const view = shownDiff(state);
  const changes = state.shownStep;
  const selectedFile =
    changes === undefined
      ? reviewingFiles(state.review, state.fileScope).find(
          candidate => candidate.fileIdentity === state.selectedFileIdentity,
        )
      : undefined;
  const path =
    selectedFile?.displayPath ??
    view?.file?.displayPath ??
    (state.review !== undefined && reviewingFiles(state.review, state.fileScope).length === 0
      ? 'no changes'
      : 'No changed file selected');
  const selectedIsUnchanged = selectedFile?.status === 'unchanged';
  const composer = selectedQuestionComposer(state);
  const discussion = composer === undefined ? selectedDiscussionThread(state) : undefined;
  const messageThread = composer === undefined && discussion === undefined ? selectedMessageThread(state) : undefined;
  const lineMessages = messagesOnLines(state);
  const markWidth = hasLineMessages(lineMessages) ? LINE_MESSAGES_WIDTH : 0;
  const availableHeight = Math.max(1, viewportHeight - 3);
  const embeddedHeight =
    composer !== undefined
      ? Math.min(Math.max(9, Math.floor(availableHeight * 0.5)), 12)
      : discussion === undefined && messageThread === undefined
        ? 0
        : Math.min(Math.max(10, Math.floor(availableHeight * 0.45)), 12);
  const estimatedPaneWidth =
    typeof width === 'number'
      ? width
      : width === '100%'
        ? state.width
        : (() => {
            const geometry = effectivePaneGeometry(state);
            if (state.arrangement === 'review-notebook') {
              return state.width - geometry.notebookNavigation - 1;
            }
            if (state.arrangement === 'code-spotlight') {
              const filesWidth = state.filePaneVisible && state.width >= 100 ? Math.min(geometry.files, 28) + 1 : 0;
              return state.width - filesWidth;
            }
            if (state.layout === 'wide') {
              return state.width - geometry.files - geometry.questions - (state.filePaneVisible ? 2 : 1);
            }
            return state.width - geometry.balancedContext - 1;
          })();
  const paneContentWidth = Math.max(1, estimatedPaneWidth - 2);
  const messageCardHeight =
    messageThread === undefined ? 0 : messageThreadCardHeight(state, messageThread, embeddedHeight, paneContentWidth);
  const sourceIdentity =
    changes !== undefined
      ? `changes:${changes.key}`
      : state.review?.source.kind === 'live'
        ? state.review.source.liveChangesIdentity
        : (state.review?.source.reviewSnapshotIdentity ?? 'none');

  let column: ReviewingScrollingColumn;
  if (selectedIsUnchanged) {
    const content = state.unchangedContent;
    if (content?.view.status === 'available') {
      const lines = reviewLiveContentLines(content.view);
      const { firstLine, totalLines, truncated } = content.view.content;
      const lastLine = firstLine + lines.length - 1;
      onContentPage(Math.max(1, availableHeight - 2));
      // Windows of large files reach line numbers wider than four digits.
      const lineNumberWidth = Math.max(4, String(totalLines).length);
      const lineGutterWidth = lineNumberWidth + 4;
      const contentGutterWidth = lineGutterWidth + markWidth;
      const codeWidth = Math.max(4, paneContentWidth - contentGutterWidth);
      const filetype = reviewingFiletype(path);
      const items: ReviewingVisualItem[] = [
        {
          size: 1,
          render: () => label(state, `${path} is unchanged versus this basis.`, { fg: colors.muted, paddingLeft: 1 }),
        },
      ];
      let selectedIndex = -1;
      let selectionStart: number | undefined;
      let selectionSize: number | undefined;
      lines.forEach((line, index) => {
        const lineNumber = firstLine + index;
        const selected = lineNumber === state.unchangedContentLine;
        const anchoredThread =
          messageThread !== undefined &&
          messageThread.selected.location.file.bytesBase64 === content.pathBytesBase64 &&
          messageThread.selected.location.line === lineNumber
            ? messageThread
            : undefined;
        if (selected) {
          selectionStart = items.reduce((total, item) => total + item.size, 0);
        }
        const itemIndex = items.length;
        items.push({
          size: 1,
          ordinals: [index],
          render: () => {
            const marker = selected ? (state.presentation.ascii ? '>' : '▌') : ' ';
            const clipped = displayCellSlice(line, 0, codeWidth);
            const code = `${line.slice(0, clipped.end)}${clipped.padding}`;
            return Box(
              {
                width: '100%',
                height: 1,
                flexShrink: 0,
                flexDirection: 'row',
                backgroundColor: state.presentation.noColor
                  ? 'transparent'
                  : selected
                    ? selectionColors(state, 'diff').bg
                    : colors.surface,
                id: reviewRenderableId(state, `reviewing-content-line-${lineNumber}`),
                ...pointerMouseHandlers(interaction, { kind: 'content-line', line: lineNumber }),
              },
              label(state, ` ${marker}${String(lineNumber).padStart(lineNumberWidth)}  `, {
                fg: selected ? selectionColors(state, 'diff').fg : colors.muted,
                width: lineGutterWidth,
                height: 1,
                flexShrink: 0,
              }),
              ...(markWidth === 0
                ? []
                : [
                    lineMessagesCell(
                      state,
                      lineMessages.new.get(lineNumber) ?? [],
                      `reviewing-line-messages-content-${lineNumber}`,
                      selected,
                    ),
                  ]),
              richLabel(state, code.length === 0 ? ' ' : code, filetype, interaction, {
                fg: selected ? colors.text : colors.code,
                width: codeWidth,
                height: 1,
                flexShrink: 0,
                truncate: false,
              }),
            );
          },
        });
        // Like the Diff, the composer and a saved Message's card sit beneath their line.
        if (selected && composer !== undefined && questionTextarea !== undefined) {
          items.push({
            size: embeddedHeight,
            render: () => questionComposerCard(state, embeddedHeight, questionTextarea),
          });
        }
        if (anchoredThread !== undefined) {
          items.push({
            size: messageCardHeight,
            render: () =>
              messageThreadCard(
                state,
                anchoredThread,
                messageCardHeight,
                paneContentWidth,
                interaction,
                onDiscussionPage,
              ),
          });
        }
        if (selected) {
          selectedIndex = itemIndex;
          selectionSize =
            (composer !== undefined && questionTextarea !== undefined ? embeddedHeight : 0) +
            (anchoredThread !== undefined ? messageCardHeight : 0) +
            1;
        }
      });
      items.push({
        size: 1,
        render: () =>
          label(
            state,
            `${truncated ? `Lines ${firstLine}–${lastLine} of ${totalLines}` : `${totalLines} ${totalLines === 1 ? 'line' : 'lines'}`} · j/k selects · a composes at it`,
            {
              fg: colors.muted,
              paddingLeft: 1,
            },
          ),
      });
      column = scrollingColumn(
        state,
        'diff',
        'reviewing-diff',
        items,
        selectedIndex,
        `content:${content.pathBytesBase64}:${state.unchangedContentLine}:${composer === undefined ? '' : 'composer'}`,
        availableHeight,
        interaction,
        lines.length,
        {
          contentKey: `reviewing-content:${sourceIdentity}:${content.pathBytesBase64}:${firstLine}`,
          ...(selectionStart === undefined ? {} : { selectionStart }),
          ...(selectionSize === undefined ? {} : { selectionSize }),
          pageItemSizes: lines.map(() => 1),
          // While the next window loads, the selection may sit just outside this one.
          pageSelectedIndex: Math.min(lines.length - 1, Math.max(0, state.unchangedContentLine - firstLine)),
        },
      );
    } else {
      const reason = content?.view.reason;
      const message =
        reason === 'binary'
          ? 'Binary file; contents are not rendered.'
          : reason === 'unrenderable'
            ? 'Not valid UTF-8 text; contents are not rendered.'
            : reason === 'too-large'
              ? 'Larger than the bounded content window.'
              : reason === 'live-changes-moved'
                ? 'Source moved; reselect the file.'
                : state.loading?.region === 'diff'
                  ? state.presentation.ascii
                    ? 'Loading file contents...'
                    : 'Loading file contents…'
                  : 'Contents match the basis exactly; press a to compose a Message at line 1.';
      column = scrollingColumn(
        state,
        'diff',
        'reviewing-diff',
        [
          {
            size: 1,
            render: () => label(state, `${path} is unchanged versus this basis.`, { fg: colors.muted, paddingLeft: 1 }),
          },
          {
            size: 1,
            render: () =>
              label(state, message, { fg: reason === undefined ? colors.muted : colors.warning, paddingLeft: 1 }),
          },
        ],
        -1,
        undefined,
        availableHeight,
        interaction,
        0,
        { contentKey: `reviewing-content-state:${sourceIdentity}:${path}:${reason ?? 'pending'}` },
      );
    }
  } else if (
    view === undefined ||
    view.status !== 'available' ||
    (state.loading?.region === 'diff' && view.file.fileIdentity !== state.selectedFileIdentity)
  ) {
    // A clean worktree is a calm fact, not a caution: say so and offer the way on.
    const nothingChanged =
      view === undefined &&
      state.loading?.region !== 'diff' &&
      changes === undefined &&
      state.fileScope === 'changed' &&
      reviewingFiles(state.review, 'changed').length === 0;
    const empty = nothingChanged ? emptyChangesSentence(state) : undefined;
    const message =
      empty !== undefined
        ? empty.text
        : view === undefined
          ? state.loading?.region === 'diff'
            ? state.loading.label
            : (changes?.diffNote ?? 'No changed file selected.')
          : view.status !== 'available'
            ? `Diff unavailable: ${view.reason}`
            : `Loading ${path}${state.presentation.ascii ? '...' : '…'}`;
    column = scrollingColumn(
      state,
      'diff',
      'reviewing-diff',
      // The sentence wraps on whole words, so the way on at its end stays visible.
      wrappedRows(message, paneContentWidth - 1).map(row => ({
        size: 1,
        render: () =>
          label(state, row, {
            fg: empty !== undefined && !empty.caution ? colors.muted : colors.warning,
            paddingLeft: 1,
          }),
      })),
      -1,
      undefined,
      availableHeight,
      interaction,
      0,
      { contentKey: `reviewing-diff-state:${sourceIdentity}:${path}:${message}` },
    );
  } else {
    const rows = view.window.rows;
    const rowOffset = view.window.offset;
    type BuiltDiffItems = {
      readonly items: readonly ReviewingVisualItem[];
      readonly selectedIndex: number;
      readonly selectionStart?: number;
      readonly selectionSize?: number;
      readonly pageSizes: readonly number[];
      readonly pageSelectedIndex: number;
    };
    const buildItems = (contentWidth: number): BuiltDiffItems => {
      const items: ReviewingVisualItem[] = [];
      let selectedIndex = -1;
      let selectionFirst = -1;
      let selectionLast = -1;
      // The composer's line: the selected row, or else the row showing its anchored line.
      const composerRowIdentity =
        composer === undefined
          ? undefined
          : rows.some(row => row.rowIdentity === state.selectedRowIdentity)
            ? state.selectedRowIdentity
            : rows.find(row => row.newLine === composer.line)?.rowIdentity;
      const pushComposer = (): void => {
        if (composer === undefined || questionTextarea === undefined) return;
        if (selectionFirst < 0) selectionFirst = items.length;
        items.push({
          size: embeddedHeight,
          render: () => questionComposerCard(state, embeddedHeight, questionTextarea),
        });
        selectionLast = items.length - 1;
      };
      const pushDiscussion = (anchorRow: ReviewProjectedDiffRow): void => {
        if (discussion === undefined) return;
        items.push({
          size: embeddedHeight,
          render: () =>
            discussionThreadCard(
              state,
              discussion,
              anchorRow,
              embeddedHeight,
              paneContentWidth,
              interaction,
              onDiscussionPage,
            ),
        });
        if (anchorRow.rowIdentity === state.selectedRowIdentity) selectionLast = items.length - 1;
      };
      const pushMessage = (anchorRow: ReviewProjectedDiffRow): void => {
        if (messageThread === undefined) return;
        items.push({
          size: messageCardHeight,
          render: () =>
            messageThreadCard(state, messageThread, messageCardHeight, paneContentWidth, interaction, onDiscussionPage),
        });
        if (anchorRow.rowIdentity === state.selectedRowIdentity) selectionLast = items.length - 1;
      };

      if (state.diffMode === 'side-by-side') {
        const pairs = sidePairs(rows);
        const sideCodeWidth = Math.max(1, Math.floor(contentWidth / 2) - 8 - markWidth);
        const pairHeights = pairs.map(pair => sidePairHeight(state, pair, sideCodeWidth));
        pairs.forEach((pair, pairOrdinal) => {
          const selected =
            pair.old?.rowIdentity === state.selectedRowIdentity || pair.next?.rowIdentity === state.selectedRowIdentity;
          if (selected && selectionFirst < 0) selectionFirst = items.length;
          const pairIndex = items.length;
          const ordinals = [pair.old, pair.next].flatMap(row => {
            if (row === undefined) return [];
            const local = rows.indexOf(row);
            return local < 0 ? [] : [rowOffset + local];
          });
          items.push({
            size: pairHeights[pairOrdinal]!,
            ordinals,
            render: () => sideBySideLine(state, pair, sideCodeWidth, interaction, lineMessages),
          });
          if (selected) {
            selectedIndex = pairIndex;
            selectionLast = pairIndex;
          }
          // The composer opens beneath its line, like a saved Message's card.
          if (pair.old?.rowIdentity === composerRowIdentity || pair.next?.rowIdentity === composerRowIdentity) {
            pushComposer();
            if (!selected) selectedIndex = items.length - 1;
          }
          if (discussion !== undefined) {
            const anchorRow = discussion.selected.target.side === 'old' ? pair.old : pair.next;
            if (anchorRow !== undefined && anchorRow.rowIdentity === discussion.selected.target.rowIdentity) {
              pushDiscussion(anchorRow);
            }
          }
          if (messageThread !== undefined) {
            const anchorRow = [pair.old, pair.next].find(row => row?.rowIdentity === messageThread.row?.rowIdentity);
            if (anchorRow !== undefined) pushMessage(anchorRow);
          }
        });
        return {
          items,
          selectedIndex,
          ...selectionSpan(items, selectionFirst, selectionLast),
          pageSizes: pairHeights,
          pageSelectedIndex: Math.max(
            0,
            pairs.findIndex(
              pair =>
                pair.old?.rowIdentity === state.selectedRowIdentity ||
                pair.next?.rowIdentity === state.selectedRowIdentity,
            ),
          ),
        };
      }

      const codeWidth = Math.max(1, contentWidth - 14 - markWidth);
      // Wrapping a row is the costly part of a redraw: measure each row once.
      const rowHeights = rows.map(row => wrappedDiffRowHeight(state, row, codeWidth));
      rows.forEach((row, index) => {
        const selected = row.rowIdentity === state.selectedRowIdentity;
        if (selected && selectionFirst < 0) selectionFirst = items.length;
        const itemIndex = items.length;
        items.push({
          size: rowHeights[index]!,
          ordinals: [rowOffset + index],
          render: () => diffLine(state, row, codeWidth, interaction, lineMessages),
        });
        if (selected) {
          selectedIndex = itemIndex;
          selectionLast = itemIndex;
        }
        // The composer opens beneath its line, like a saved Message's card.
        if (row.rowIdentity === composerRowIdentity) {
          pushComposer();
          if (!selected) selectedIndex = items.length - 1;
        }
        if (discussion?.selected.target.rowIdentity === row.rowIdentity) pushDiscussion(row);
        if (messageThread?.row?.rowIdentity === row.rowIdentity) pushMessage(row);
      });
      if (composer !== undefined && questionTextarea !== undefined && selectedIndex < 0) {
        pushComposer();
        selectedIndex = items.length - 1;
      }
      return {
        items,
        selectedIndex,
        ...selectionSpan(items, selectionFirst, selectionLast),
        pageSizes: rowHeights,
        pageSelectedIndex: Math.max(
          0,
          rows.findIndex(row => row.rowIdentity === state.selectedRowIdentity),
        ),
      };
    };

    const built = buildItems(paneContentWidth);
    const selectionKey =
      state.selectedRowIdentity === undefined
        ? undefined
        : `${view.file.fileIdentity}:${state.selectedRowIdentity}:${composer === undefined ? '' : 'composer'}:${discussion?.selected.itemIdentity ?? ''}`;
    column = scrollingColumn(
      state,
      'diff',
      'reviewing-diff',
      built.items,
      built.selectedIndex,
      selectionKey,
      availableHeight,
      interaction,
      view.window.totalRows,
      {
        contentKey: `reviewing-diff:${sourceIdentity}:${view.file.fileIdentity}:${rowOffset}:${state.diffMode}:${state.wrapDiffLines}`,
        anchorScope: `reviewing-diff:${sourceIdentity}:${view.file.fileIdentity}:${state.diffMode}:${state.wrapDiffLines}`,
        ...(built.selectionStart === undefined ? {} : { selectionStart: built.selectionStart }),
        ...(built.selectionSize === undefined ? {} : { selectionSize: built.selectionSize }),
        pageItemSizes: built.pageSizes,
        pageSelectedIndex: built.pageSelectedIndex,
      },
    );
  }

  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-diff-pane'),
      width,
      height: '100%',
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'column',
      // A shown step is the past: amber, so it can't pass for the current code.
      borderColor:
        changes !== undefined ? colors.warning : shownFocus(state) === 'diff' ? colors.accent : colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      onMouseScroll: (event: MouseEvent) => interaction.wheelPane('diff', event),
      ...pointerMouseHandlers(interaction, { kind: 'region', region: 'diff' }),
    },
    paneTitle(
      state,
      'diff',
      state.diffMode === 'inline' ? 'Diff' : 'Side-by-side',
      composer !== undefined
        ? `${activeBasisLabel(state)} · ${shortDisplayPath(composer.fileLabel)}:${composer.line}`
        : changes !== undefined
          ? `PAST · ${changes.label} · ${shortDisplayPath(path)}${filePositionDetail(state)}`
          : selectedIsUnchanged
            ? `unchanged ${activeBasisLabel(state)} · ${shortDisplayPath(path)}`
            : `${activeBasisLabel(state)} · ${shortDisplayPath(path)}${filePositionDetail(state)}${
                state.loading?.region === 'diff' &&
                view?.status === 'available' &&
                view.file.fileIdentity === state.selectedFileIdentity
                  ? ' · loading'
                  : ''
              }`,
      column.span,
      changes === undefined ? undefined : colors.warning,
      estimatedPaneWidth,
    ),
    column.body,
  );
}

function statusCondition(state: ReviewingApplicationState): RenderChild[] {
  const colors = theme(state);
  const review = state.review;
  if (review?.source.kind === 'live') return [];
  const line = (
    text: string,
    fg: ThemeColor,
    extra: { readonly bg?: ThemeColor; readonly bold?: boolean } = {},
  ): RenderChild => label(state, text, { fg, paddingLeft: 2, ...extra });
  if (
    review?.source.kind === 'snapshot' &&
    review.manifest.header.retention === 'current' &&
    review.manifest.header.title === 'Review current changes'
  ) {
    return [line('Saved version: Messages quote this saved code, not your working tree.', colors.muted)];
  }
  const continuation = review?.continuation;
  if (continuation?.status === 'available') {
    return [
      line(
        `Fixed commits: Messages quote them as saved; nothing is checked out. ${
          continuation.headMoved ? '[C] Choose where to continue.' : '[C] Continue from HEAD.'
        }`,
        colors.muted,
      ),
    ];
  }
  const status = review?.manifest.header.snapshotStatus;
  if (status === 'stale') {
    return [
      line(
        'The code changed since this Review was saved. You can read it; open the Current Review to send Messages.',
        colors.danger,
        { bg: colors.dangerSoft, bold: true },
      ),
    ];
  }
  if (status === 'unverified') {
    return [
      line('BuildFrame couldn’t check the current code yet; sending waits until it can.', colors.warning, {
        bold: true,
      }),
    ];
  }
  return [];
}

interface RailPiece {
  readonly text: string;
  readonly fg: ThemeColor;
  readonly bg?: ThemeColor;
  readonly bold?: boolean;
  readonly target?: ReviewingPointerTarget;
  readonly id?: string;
}

/**
 * The history rail: start, the end of each step, and now, joined by
 * segments. The thick part is what the Diff shows: everything at now, one
 * step otherwise. Long histories keep the markers around the shown one and
 * fold the rest into a count.
 */
function historyRail(
  state: ReviewingApplicationState,
  history: NonNullable<NonNullable<ReviewingApplicationState['review']>['history']>,
  room: number,
): RailPiece[] {
  const colors = theme(state);
  const ascii = state.presentation.ascii;
  const thin = ascii ? '-' : '─';
  const thick = ascii ? '=' : '━';
  const shownKey = state.shownStep?.key;
  const atNow = shownKey === undefined;
  interface RailNode {
    readonly name: string;
    readonly kind: 'start' | 'answer' | 'outside' | 'now';
    /** The step that ends here, drawn as the segment before the marker. */
    readonly step?: ReviewHistoryStep;
  }
  const commitMark = ascii ? '@' : '◆';
  const nodes: RailNode[] = [{ name: commitMark, kind: 'start' }];
  // A step in which a commit was made carries the commit mark start wears, so the rail shows where HEAD moved.
  const named = (name: string, step: ReviewHistoryStep): string =>
    step.headMove === undefined ? name : `${name}${commitMark}`;
  for (const step of history.steps) {
    const changed = step.changes.status === 'changed';
    if (step.to.kind === 'answered') {
      nodes.push({
        name: named(`#${history.messages.indexOf(step.to.reviewMessageIdentity) + 1}`, step),
        kind: 'answer',
        step,
      });
    } else if (step.to.kind === 'now') {
      // Edits since the last answer get their own marker, so "now" only ever means now.
      if (changed) nodes.push({ name: named(ascii ? 'o' : '○', step), kind: 'outside', step });
      nodes.push({ name: 'now', kind: 'now' });
    } else if (changed) {
      nodes.push({ name: named(ascii ? 'o' : '○', step), kind: step.kind === 'outside' ? 'outside' : 'answer', step });
    }
  }
  const shownIndex = atNow
    ? nodes.length - 1
    : nodes.findIndex(node => node.step && historyStepKey(node.step.from, node.step.to) === shownKey);
  const segment = 4;
  const width = (node: RailNode): number => displayCells(node.name) + segment + 2;
  // Fold from the far end inward until the rail fits, always keeping start, now and the shown marker's neighbours.
  const visible = nodes.map(() => true);
  const used = (): number => nodes.reduce((total, node, index) => total + (visible[index] ? width(node) : 0), 0) + 8;
  for (let distance = nodes.length; used() > room && distance > 1; distance -= 1) {
    for (const index of [shownIndex - distance, shownIndex + distance]) {
      if (index > 0 && index < nodes.length - 1 && used() > room) visible[index] = false;
    }
  }
  const pieces: RailPiece[] = [];
  let folded = 0;
  nodes.forEach((node, index) => {
    if (!visible[index]) {
      folded += 1;
      return;
    }
    if (folded > 0) {
      pieces.push({ text: ` ${ascii ? '..' : '┄'} ${folded} ${ascii ? '..' : '┄'} `, fg: colors.muted });
      folded = 0;
    }
    if (index > 0) {
      const shown = node.step !== undefined && historyStepKey(node.step.from, node.step.to) === shownKey;
      // A shown past step is history: brass, never the accent.
      const tone = colors.warning;
      pieces.push({
        text: ` ${(atNow || shown ? thick : thin).repeat(segment)} `,
        fg: atNow ? colors.muted : shown ? tone : colors.border,
      });
    }
    const here = index === shownIndex;
    // Your own edits between answers are routine, so they stay Pewter.
    const tone = node.kind === 'outside' || node.kind === 'start' ? colors.muted : colors.text;
    const target: ReviewingPointerTarget | undefined =
      node.kind === 'now'
        ? { kind: 'history-now' }
        : node.step !== undefined && node.step.changes.status === 'changed'
          ? { kind: 'history-step', key: historyStepKey(node.step.from, node.step.to) }
          : undefined;
    pieces.push({
      text: here ? ` ${node.name} ` : node.name,
      fg: here
        ? colors.background
        : node.step?.changes.status === 'changed' || node.kind === 'now'
          ? tone
          : colors.muted,
      // The chip is where you are: the accent at now, brass on a past step like the Diff's border.
      ...(here ? { bg: node.kind === 'now' ? colors.accent : colors.warning, bold: true } : {}),
      ...(target === undefined ? {} : { target, id: `reviewing-history-rail-${index}` }),
    });
  });
  return pieces;
}

/** One row under the header: which Review this is, what you are looking at, and how to move between versions. */
function reviewRetentionContext(
  state: ReviewingApplicationState,
  interaction?: ReviewPointerInteraction,
): RenderChild[] {
  if (state.screen !== 'review') return [];
  const header = state.review?.manifest.header;
  const colors = theme(state);
  const separator = state.presentation.ascii ? '-' : '·';
  // With the header hidden, whether the agent is connected still has a home.
  const agent = state.header.visible ? undefined : agentIndicator(state, state.harnessConnection);
  const agentCells = agent === undefined ? 0 : displayCells(agent.text) + 2;
  const agentTail: RenderChild[] =
    agent === undefined
      ? []
      : [
          label(state, '', { flexGrow: 1, flexShrink: 1 }),
          label(state, `  ${agent.text}`, { id: 'reviewing-header-agent', fg: agent.fg, bold: true, flexShrink: 0 }),
        ];
  const row = (text: string, fg: ThemeColor): RenderChild[] => [
    Box(
      {
        width: '100%',
        height: 1,
        flexShrink: 0,
        flexDirection: 'row',
        paddingLeft: 2,
        paddingRight: 2,
        backgroundColor: state.presentation.noColor ? 'transparent' : colors.raised,
      },
      label(
        state,
        fitDisplayCellsEnd(text, Math.max(1, state.width - 4 - agentCells), state.presentation.ascii ? '...' : '…'),
        { fg, bold: true, flexShrink: 1 },
      ),
      ...agentTail,
    ),
  ];
  if (header === undefined && state.pendingReviewShell !== undefined) {
    const glyph = state.presentation.ascii ? '.' : '○';
    return row(
      `${glyph} Opening the ${state.pendingReviewShell.retention === 'current' ? 'Current' : 'Previous'} Review${state.presentation.ascii ? '...' : '…'}`,
      colors.muted,
    );
  }
  if (header === undefined) return [];
  const current = header.retention === 'current';
  const review = state.review!;
  const version = review.manifest.header.version;
  const source =
    review.source.kind === 'live'
      ? `Live changes ${separator} ${plural(review.versions.versions.total, 'saved version')} ${separator} [ older`
      : version === undefined
        ? `Review point ${activeBasisName(state)} ${separator} t change`
        : `Version ${version.ordinal}/${version.total} ${separator} [ older ${separator} ] newer${
            current && header.title === 'Review current changes' ? ` ${separator} R back to live changes` : ''
          }`;
  const count = state.previousReviewCount;
  const extras = [
    ...(count > 0 ? [plural(count, 'previous Review')] : []),
    ...(current && header.continuedFromReviewIdentity !== undefined ? ['continues an earlier range'] : []),
  ];
  const extraText = extras.map(extra => ` ${separator} ${extra}`).join('');
  const history = review.history;
  if (history !== undefined && review.source.kind === 'live' && history.reachesNow) {
    // Where you are: the history rail, and what the Diff covers.
    const steps = history.steps.filter(step => step.changes.status === 'changed');
    const shownAt = steps.findIndex(step => historyStepKey(step.from, step.to) === state.shownStep?.key);
    const where = state.shownStep === undefined ? '' : `step ${shownAt + 1} of ${steps.length}`;
    const lead = `${current ? 'Current Review' : 'Previous Review'} ${separator} `;
    const room = Math.max(
      20,
      state.width - 4 - agentCells - displayCells(lead) - displayCells(where) - displayCells(extraText) - 2,
    );
    const pieces = historyRail(state, history, room);
    // On a narrow terminal the rail keeps its room and the words after it
    // shorten with a visible cut rather than stopping mid-word.
    const railCells = pieces.reduce((total, piece) => total + displayCells(piece.text), 0);
    const tailRoom = state.width - 4 - agentCells - displayCells(lead) - railCells - 2;
    const ellipsis = state.presentation.ascii ? '...' : '…';
    const shownWhere = fitDisplayCellsEnd(where, Math.max(0, tailRoom), ellipsis);
    const shownExtra = fitDisplayCellsEnd(extraText, Math.max(0, tailRoom - displayCells(shownWhere)), ellipsis);
    return [
      Box(
        {
          id: reviewRenderableId(state, 'reviewing-history-rail'),
          width: '100%',
          height: 1,
          flexShrink: 0,
          flexDirection: 'row',
          paddingLeft: 2,
          paddingRight: 2,
          backgroundColor: state.presentation.noColor ? 'transparent' : colors.raised,
        },
        label(state, lead, { fg: colors.text, bold: true, flexShrink: 0 }),
        ...pieces.map(piece =>
          label(state, piece.text, {
            ...(piece.id === undefined ? {} : { id: reviewRenderableId(state, piece.id) }),
            fg: piece.fg,
            ...(piece.bg === undefined || state.presentation.noColor ? {} : { bg: piece.bg }),
            ...(piece.bold === true ? { bold: true } : {}),
            flexShrink: 0,
            ...(piece.target === undefined || interaction === undefined
              ? {}
              : pointerMouseHandlers(interaction, piece.target)),
          }),
        ),
        ...(shownWhere === '' ? [] : [label(state, `  ${shownWhere}`, { fg: colors.warning, flexShrink: 0 })]),
        ...(shownExtra.trim() === '' ? [] : [label(state, shownExtra, { fg: colors.muted, flexShrink: 0 })]),
        ...agentTail,
      ),
    ];
  }
  return row(
    `${current ? 'Current Review' : `Previous Review ${separator} read only`} ${separator} ${source}${extraText}`,
    colors.text,
  );
}

function selectedQuestionComposer(state: ReviewingApplicationState): ReviewingApplicationState['editor'] {
  return state.editor;
}

function questionComposerCard(
  state: ReviewingApplicationState,
  maximumHeight: number,
  textarea: TextareaRenderable,
): RenderChild {
  const colors = theme(state);
  const opaqueColors = controlPlaneTheme(state);
  const editor = state.editor!;
  /** Once Enter is pressed, the card says where the send stands instead of how to edit. */
  const saving =
    state.pending?.action === 'review.message.commit'
      ? state.pending.phase
      : editor.inspectionRequest?.purpose === 'submit'
        ? 'checking'
        : undefined;
  const targetChanged = editor.reselectionRequired;
  const bodyHeight = Math.max(2, maximumHeight - 3);
  textarea.width = '100%';
  textarea.height = bodyHeight;
  textarea.flexShrink = 0;
  textarea.wrapMode = 'word';
  textarea.backgroundColor = colors.raised;
  textarea.focusedBackgroundColor = colors.raised;
  textarea.textColor = colors.text;
  textarea.focusedTextColor = colors.text;
  textarea.selectionBg = colors.accent;
  textarea.selectionFg = opaqueColors.background;
  textarea.cursorColor = colors.accent;
  textarea.cursorStyle = { style: 'block', blinking: true };
  textarea.traits = {
    capture: ['escape', 'navigate', 'submit'],
    status: 'Composing Message',
  };
  return borderedBox(
    state,
    {
      id: reviewRenderableId(state, 'reviewing-question-composer'),
      width: '100%',
      height: maximumHeight,
      flexShrink: 0,
      flexDirection: 'column',
      borderColor: colors.accent,
      backgroundColor: colors.raised,
      paddingLeft: 1,
      paddingRight: 1,
      title: ` ${saving === undefined ? 'New Message' : saving === 'awaiting-projection' ? 'Saved' : saving === 'result-unavailable' ? 'Not confirmed' : saving === 'checking' ? 'Checking' : 'Saving'} ${state.presentation.ascii ? '-' : '·'} ${editor.fileLabel}:${editor.line}${targetChanged ? ' · LINE CHANGED' : ''} `,
      titleColor: colors.accent,
    },
    textarea,
    label(
      state,
      saving === 'awaiting-projection'
        ? 'This closes by itself.'
        : saving === 'result-unavailable'
          ? 'BuildFrame lost contact before the save was confirmed.'
          : saving === 'checking'
            ? 'Nothing is saved yet.'
            : saving !== undefined
              ? 'Saving it locally first.'
              : targetChanged
                ? 'Line changed; text kept. F4 targets the current line.'
                : 'Up/Down moves by row · paste goes at the cursor',
      { fg: targetChanged && saving === undefined ? colors.warning : colors.muted },
    ),
  );
}

/**
 * Dialogs are drawn inside the body (between the header rows and the footer),
 * so they are sized and centred against that height, never the terminal's.
 */

function searchResultLabel(state: ReviewingApplicationState, item: ReviewSearchItem, selected: boolean): string {
  const marker = selected ? (state.presentation.ascii ? '>' : '›') : ' ';
  if (item.kind === 'file') return `${marker} ${item.displayPath}`;
  const line = item.change === 'addition' ? item.newLine : item.oldLine;
  const snippet = decodeBytesBase64(item.snippet.bytesBase64).toString('utf8').replaceAll('\n', ' ');
  return `${marker} ${item.change === 'addition' ? '+' : '-'} ${item.displayPath}:${line ?? '?'}  ${snippet}`;
}

function searchBody(state: ReviewingApplicationState, bodyHeight: number): RenderChild {
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
    label(state, 'File paths and added or removed text in the saved Snapshot.', { fg: colors.muted }),
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
      : preview.map(row =>
          label(state, decodeDiffRow(row, state.presentation.ascii), {
            fg: row.kind === 'addition' ? colors.success : row.kind === 'deletion' ? colors.danger : colors.code,
          }),
        )),
  );
}

/** One row of pane tabs for the one-pane layout, so the hidden panes stay discoverable. */
function linearPaneStrip(state: ReviewingApplicationState, interaction: ReviewPointerInteraction): RenderChild {
  const colors = theme(state);
  const regions: readonly ReviewRegion[] = state.filePaneVisible
    ? ['files', 'diff', 'questions']
    : ['diff', 'questions'];
  const messageTotal = state.review?.messages.messages.total ?? 0;
  const name = (region: ReviewRegion): string =>
    region === 'files' ? 'Files' : region === 'diff' ? 'Diff' : `${messagesPaneName(state)} ${messageTotal}`;
  return Box(
    {
      id: reviewRenderableId(state, 'reviewing-pane-strip'),
      width: '100%',
      height: 1,
      flexShrink: 0,
      flexDirection: 'row',
      gap: 1,
      paddingLeft: 1,
      backgroundColor: colors.background,
    },
    ...regions.map(region => {
      const focused = shownFocus(state) === region;
      return label(state, ` ${name(region)} `, {
        id: reviewRenderableId(state, `reviewing-pane-tab-${region}`),
        fg: focused ? colors.accent : colors.muted,
        bg: focused ? colors.accentSoft : colors.background,
        bold: focused,
        height: 1,
        ...pointerMouseHandlers(interaction, { kind: 'region', region }),
      });
    }),
    label(state, '[Tab] switch', { fg: colors.muted, height: 1 }),
  );
}

function reviewBody(
  state: ReviewingApplicationState,
  questionTextarea: TextareaRenderable | undefined,
  interaction: ReviewPointerInteraction,
  onDiscussionPage: (page: DiscussionPage) => void,
  onContentPage: (pageSize: number) => void,
  viewportHeight: number,
): RenderChild {
  const colors = theme(state);
  const geometry = effectivePaneGeometry(state);
  // Code only takes the one-pane layout whatever the arrangement; the arrangement returns with every pane.
  if (!state.codeOnly && state.arrangement === 'code-spotlight' && shownFocus(state) === 'questions') {
    return questionsPane(state, '100%', interaction, viewportHeight);
  }
  if (!state.codeOnly && state.arrangement === 'code-spotlight') {
    return Box(
      {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        gap: 1,
        backgroundColor: colors.background,
      },
      questionsPane(state, '100%', interaction, 6, true),
      Box(
        {
          width: '100%',
          flexGrow: 1,
          flexDirection: 'row',
          gap: 1,
          overflow: 'hidden',
        },
        ...(state.filePaneVisible && state.width >= 100
          ? [filesPane(state, Math.min(geometry.files, 28), interaction, viewportHeight - 7)]
          : []),
        diffPane(state, 'auto', questionTextarea, interaction, onDiscussionPage, onContentPage, viewportHeight - 7),
      ),
    );
  }
  if (!state.codeOnly && state.arrangement === 'review-notebook') {
    return Box(
      {
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        gap: 1,
        backgroundColor: colors.background,
      },
      Box(
        {
          width: geometry.notebookNavigation,
          height: '100%',
          flexShrink: 0,
          flexDirection: 'column',
          gap: 1,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        },
        ...(state.filePaneVisible
          ? [
              Box(
                { width: '100%', height: 7, flexShrink: 0, overflow: 'hidden' },
                filesPane(state, '100%', interaction, 7),
              ),
            ]
          : []),
        questionsPane(
          state,
          '100%',
          interaction,
          viewportHeight - (state.filePaneVisible ? 8 : 0),
          false,
          geometry.notebookNavigation,
        ),
      ),
      diffPane(state, 'auto', questionTextarea, interaction, onDiscussionPage, onContentPage, viewportHeight),
    );
  }
  if (state.layout === 'wide') {
    return Box(
      { width: '100%', height: '100%', flexDirection: 'row', gap: 1, backgroundColor: colors.background },
      ...(state.filePaneVisible ? [filesPane(state, geometry.files, interaction, viewportHeight)] : []),
      diffPane(state, 'auto', questionTextarea, interaction, onDiscussionPage, onContentPage, viewportHeight),
      questionsPane(state, geometry.questions, interaction, viewportHeight),
    );
  }
  if (state.layout === 'balanced') {
    const showFiles = state.filePaneVisible && state.balancedContext === 'files';
    return Box(
      { width: '100%', height: '100%', flexDirection: 'row', gap: 1, backgroundColor: colors.background },
      diffPane(state, 'auto', questionTextarea, interaction, onDiscussionPage, onContentPage, viewportHeight),
      showFiles
        ? filesPane(state, geometry.balancedContext, interaction, viewportHeight)
        : questionsPane(state, geometry.balancedContext, interaction, viewportHeight),
    );
  }
  const paneHeight = Math.max(1, viewportHeight - 1);
  return Box(
    { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: colors.background },
    linearPaneStrip(state, interaction),
    Box(
      { width: '100%', flexGrow: 1, flexShrink: 1, flexDirection: 'row', overflow: 'hidden' },
      shownFocus(state) === 'files' && state.filePaneVisible
        ? filesPane(state, '100%', interaction, paneHeight)
        : shownFocus(state) === 'questions'
          ? questionsPane(state, '100%', interaction, paneHeight)
          : diffPane(state, '100%', questionTextarea, interaction, onDiscussionPage, onContentPage, paneHeight),
    ),
  );
}

function pendingReviewBody(state: ReviewingApplicationState): RenderChild {
  const colors = theme(state);
  const shell = state.pendingReviewShell;
  if (shell === undefined) return Box({});
  const current = shell.retention === 'current';
  const title = `${current ? 'Current' : 'Previous'} Review`;
  const phase =
    state.pending?.phase === 'awaiting-result'
      ? 'Saving a snapshot of the code'
      : state.pending?.phase === 'awaiting-projection'
        ? 'Saved; loading the Review'
        : 'Loading the Review';
  const main = borderedBox(
    state,
    {
      id: 'reviewing-pending-review-shell',
      width: 'auto',
      height: '100%',
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'column',
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingLeft: 2,
      paddingRight: 2,
      overflow: 'hidden',
      title: ` ${title} `,
      titleColor: colors.text,
    },
    label(state, `${phase}${state.presentation.ascii ? '...' : '…'}`, {
      fg: colors.text,
      bold: true,
    }),
    label(state, 'Files, Diff, and Messages appear as soon as it is ready.', {
      fg: colors.muted,
      wrap: 'word',
      height: 2,
    }),
  );
  if (state.width < 82) {
    return Box({ width: '100%', height: '100%', flexDirection: 'column', backgroundColor: colors.background }, main);
  }
  const sideWidth = Math.max(20, Math.min(30, Math.floor(state.width * 0.22)));
  return Box(
    {
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      gap: 1,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    ...(state.filePaneVisible
      ? [
          borderedBox(
            state,
            {
              id: 'reviewing-pending-files-shell',
              width: sideWidth,
              height: '100%',
              flexShrink: 0,
              flexDirection: 'column',
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingLeft: 1,
              paddingRight: 1,
              title: ' Files ',
              titleColor: colors.muted,
            },
            label(state, shell.totalFiles === undefined ? 'Loading…' : `${shell.totalFiles} files · loading`, {
              fg: colors.muted,
            }),
          ),
        ]
      : []),
    main,
    borderedBox(
      state,
      {
        id: 'reviewing-pending-messages-shell',
        width: sideWidth,
        height: '100%',
        flexShrink: 0,
        flexDirection: 'column',
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingLeft: 1,
        paddingRight: 1,
        title: ' Messages ',
        titleColor: colors.muted,
      },
      label(state, 'Loading…', { fg: colors.muted }),
    ),
  );
}

/**
 * Home's one pane: the same rounded frame, title row and selection as a
 * Review's panes, so opening BuildFrame and opening a Review look like one app.
 * The launcher, the commit picker and Previous Reviews all live in it, so
 * nothing moves when you go between them.
 */

function homeChoices(state: ReviewingApplicationState): readonly HomeChoice[] {
  const home = state.home!;
  const current = home.currentReview;
  const ascii = state.presentation.ascii;
  return [
    {
      id: 'primary',
      // ASCII twins stay distinct from the `>` cursor and the `-` separator.
      icon: current === undefined ? (ascii ? '+' : '◇') : ascii ? '@' : '●',
      label: current === undefined ? 'Review current changes' : 'Continue Current Review',
      description:
        current === undefined
          ? 'Everything since your last commit, including uncommitted changes.'
          : 'Go back to the open Review and its Messages.',
      available: true,
    },
    ...(current === undefined
      ? []
      : [
          {
            id: 'new-current',
            icon: ascii ? '+' : '◆',
            label: 'Start new Review',
            description: 'Start fresh from the code as it is now; the open Review moves to Previous Reviews.',
            available: true,
          },
        ]),
    {
      id: 'comparison',
      icon: ascii ? '=' : '↔',
      label: 'Review a commit or range',
      description: 'Pick commits from history; your files are not touched.',
      available: true,
    },
    {
      id: 'history',
      icon: ascii ? '%' : '◷',
      label:
        home.header.totalPastReviews === 0
          ? 'Previous Reviews (none yet)'
          : `Previous Reviews (${home.header.totalPastReviews})`,
      description:
        home.header.totalPastReviews === 0
          ? 'A Review moves here when you start a new one.'
          : 'Read earlier Reviews and their Messages.',
      available: home.header.totalPastReviews > 0,
    },
  ];
}

function homeLauncher(state: ReviewingApplicationState, interaction: ReviewPointerInteraction): HomeCard {
  if (state.home === undefined) {
    const unavailable = homeSentence(state, 'Reviewing is unavailable.', theme(state).danger);
    return homePane(state, 'reviewing-home-pane', 'Home', '', unavailable.length, ...unavailable);
  }
  return homeLauncherCard(state, homeChoices(state), state.homeLauncherSelection, 'reviewing', selection =>
    pointerMouseHandlers(interaction, {
      kind: 'home-launcher-choice',
      selection: selection as ReviewingApplicationState['homeLauncherSelection'],
    }),
  );
}

function homeComparison(state: ReviewingApplicationState, interaction: ReviewPointerInteraction): HomeCard {
  const colors = theme(state);
  const ascii = state.presentation.ascii;
  const separator = ascii ? '-' : '·';
  const graph = state.commitGraph;
  const graphRows = graph?.status === 'available' ? graph.rows : [];
  const projectedCommits = graphRows.filter(row => row.kind === 'commit');
  const input = state.comparisonInput;
  const messageSearch = input?.kind === 'message-search' ? input : undefined;
  const matchingIdentities = new Set(messageSearch?.matchingCommitIdentities ?? []);
  const rows =
    messageSearch === undefined
      ? graphRows
      : projectedCommits.filter(commit => matchingIdentities.has(commit.objectIdentity));
  const selectedIdentity = messageSearch?.selectedCommitIdentity ?? state.selectedCommitIdentity;
  const selected = Math.max(
    0,
    rows.findIndex(row => row.kind === 'commit' && row.objectIdentity === selectedIdentity),
  );
  // Header, context row, footer, and the card's border, title, mode row, gap
  // and three-row preview take 13 rows; the list has the rest, and the card is
  // only as tall as the list it shows. An input's two rows come out of the
  // list, so the card keeps its height and the preview stays put while you type.
  const listRoom = Math.max(0, state.height - 13);
  const unsearchedRows = Math.min(listRoom, graphRows.length);
  const visibleRows = input === undefined ? listRoom : Math.max(graphRows.length === 0 ? 0 : 1, unsearchedRows - 2);
  const start = centeredStart(selected, 0, rows.length, visibleRows);
  const shownRows = rows.slice(start, start + visibleRows);
  // A search keeps its room as matches thin out, so the card doesn't shrink while you type.
  const viewportHeight = visibleRows === 0 ? 0 : messageSearch === undefined ? shownRows.length : visibleRows;
  const commitViewport: RenderChild[] =
    viewportHeight === 0
      ? []
      : [
          Box(
            {
              id: 'reviewing-comparison-commits',
              width: '100%',
              height: Math.max(1, viewportHeight),
              flexShrink: 0,
              flexDirection: 'column',
              overflow: 'hidden',
            },
            ...(shownRows.length === 0
              ? homeSentence(state, 'No shown commit messages match this search.', colors.muted)
              : shownRows.map(row => {
                  if (row.kind === 'connector') {
                    return label(state, `  ${row.graph}`, { fg: colors.muted, paddingLeft: 1, height: 1 });
                  }
                  const isSelected = row.objectIdentity === selectedIdentity;
                  const decorations = row.decorations.length === 0 ? '' : `  ${row.decorations}`;
                  return homeRow(
                    state,
                    `${messageSearch === undefined ? row.graph : ''}${row.abbreviatedObjectIdentity}  ${row.subject}${decorations}`,
                    isSelected,
                    {
                      id: `reviewing-comparison-commit-${row.objectIdentity}`,
                      pointer: pointerMouseHandlers(interaction, {
                        kind: 'home-comparison-commit',
                        objectIdentity: row.objectIdentity,
                      }),
                    },
                  );
                })),
          ),
        ];
  const comparisonInputRows: RenderChild[] =
    input === undefined
      ? []
      : [
          label(
            state,
            input.kind === 'message-search'
              ? `  Search commit messages ${separator} ${input.matchingCommitIdentities.length}/${projectedCommits.length} match`
              : input.kind === 'count'
                ? '  Commits back from HEAD (HEAD~N)'
                : '  Commit hash, branch or tag',
            {
              id:
                input.kind === 'message-search'
                  ? 'reviewing-comparison-search-summary'
                  : 'reviewing-comparison-input-summary',
              fg: colors.text,
              bold: true,
              paddingLeft: 1,
            },
          ),
          label(
            state,
            `  > ${input.value.slice(0, input.cursor)}${ascii ? '|' : '▏'}${input.value.slice(input.cursor)}`,
            {
              id:
                input.kind === 'message-search'
                  ? 'reviewing-comparison-search-query'
                  : 'reviewing-comparison-input-query',
              fg: colors.text,
              paddingLeft: 1,
            },
          ),
        ];
  const preview = state.comparisonPreview;
  const commitMode = state.comparisonMode === 'commit';
  // A commit known to the list is named by its subject too, so "Parent" and
  // "From" read as commits rather than bare hashes.
  const subjectOf = (identity: string | null | undefined): string | undefined =>
    identity === null || identity === undefined
      ? undefined
      : projectedCommits.find(commit => commit.objectIdentity === identity)?.subject;
  const named = (identity: string | null | undefined): string => {
    if (identity === null || identity === undefined) return 'unavailable';
    const subject = subjectOf(identity);
    return subject === undefined ? identity.slice(0, 12) : `${identity.slice(0, 12)} ${subject}`;
  };
  const selectedRow = projectedCommits.find(commit => commit.objectIdentity === state.selectedCommitIdentity);
  const mergeAwaitingParent =
    commitMode &&
    selectedRow !== undefined &&
    selectedRow.parentIdentities.length > 1 &&
    (state.selectedMergeParentIdentity === undefined ||
      !selectedRow.parentIdentities.includes(state.selectedMergeParentIdentity));
  // Labels share one width, so the values line up.
  const valueInput = input !== undefined && input.kind !== 'message-search' ? input : undefined;
  const labelWidth = commitMode ? 6 : 5;
  const previewLine = (name: string, value: string): string => `  ${name.padEnd(labelWidth)}  ${value}`;
  const previewRows: RenderChild[] =
    // While a hash or HEAD~N is being typed, the old preview would read as its
    // answer; the card shows what Enter will do instead.
    valueInput !== undefined
      ? [
          label(
            state,
            valueInput.kind === 'count'
              ? '  Enter compares HEAD~N up to HEAD.'
              : commitMode
                ? '  Enter compares that commit with its parent.'
                : '  Enter compares that commit up to HEAD.',
            { fg: colors.muted, paddingLeft: 1 },
          ),
          label(state, '', { height: 1 }),
          label(state, '', { height: 1 }),
        ]
      : preview?.status === 'available'
        ? [
            label(
              state,
              previewLine(
                commitMode ? 'Parent' : 'Start',
                preview.basis.kind === 'empty-tree'
                  ? 'none (first commit)'
                  : preview.basis.kind === 'index'
                    ? 'Index'
                    : named(preview.basis.objectIdentity),
              ),
              { fg: colors.muted, paddingLeft: 1 },
            ),
            label(
              state,
              previewLine(
                commitMode ? 'Commit' : 'Head',
                preview.comparedState.kind === 'commit'
                  ? `${preview.comparedState.objectIdentity.slice(0, 12)} ${preview.comparedState.subject}`
                  : preview.comparedState.kind === 'tree'
                    ? `${preview.comparedState.abbreviatedObjectIdentity} tree`
                    : preview.comparedState.kind === 'index'
                      ? 'Index'
                      : preview.comparedState.kind === 'working-tree'
                        ? 'Working tree'
                        : 'Working state',
              ),
              { fg: colors.text, paddingLeft: 1 },
            ),
            label(
              state,
              preview.totalFiles === 0
                ? `  No changed files ${separator} ${commitMode ? '[Tab] compares a range instead' : 'pick an older commit'}`
                : `  ${plural(preview.totalFiles, 'changed file')}`,
              {
                fg: preview.totalFiles === 0 ? colors.muted : colors.text,
                bold: preview.totalFiles > 0,
                paddingLeft: 1,
              },
            ),
          ]
        : preview === undefined && state.loading?.region !== 'home' && mergeAwaitingParent
          ? [
              ...homeSentence(
                state,
                comparisonUnavailableNotice('merge-parent-ambiguous'),
                colors.text,
                'reviewing-comparison-unavailable',
              ),
              label(state, '', { height: 1 }),
              label(state, '', { height: 1 }),
            ].slice(0, 3)
          : preview?.status === 'unavailable' && state.loading?.region !== 'home'
            ? // Why nothing can be shown, where the preview would be, with the way on.
              [
                ...homeSentence(
                  state,
                  comparisonUnavailableNotice(preview.reason),
                  colors.text,
                  'reviewing-comparison-unavailable',
                ).slice(0, 3),
                ...Array.from(
                  {
                    length: Math.max(
                      0,
                      3 - homeSentence(state, comparisonUnavailableNotice(preview.reason), colors.text).length,
                    ),
                  },
                  () => label(state, '', { height: 1 }),
                ),
              ]
            : [
                label(state, state.loading?.region === 'home' ? `  ${state.loading.label}` : '', {
                  fg: colors.muted,
                  paddingLeft: 1,
                }),
                label(state, '', { height: 1 }),
                label(state, '', { height: 1 }),
              ];
  // A mode is a setting, not a list row: a radio mark, so it never passes for the cursor.
  const mode = (name: string, active: boolean): string =>
    `${active ? (ascii ? '(*)' : '●') : ascii ? '( )' : '○'} ${name}`;
  return homePane(
    state,
    'reviewing-comparison-pane',
    'Commits',
    graph?.status === 'available' && graph.truncated
      ? `newest 500 from HEAD ${separator} your files are not touched`
      : `from HEAD ${separator} your files are not touched`,
    // Mode row, the input's rows, the list, a gap and the three-row preview.
    1 + comparisonInputRows.length + viewportHeight + 1 + 3,
    Box(
      { width: '100%', height: 1, flexDirection: 'row', flexShrink: 0, paddingLeft: 1, paddingRight: 1 },
      label(state, `  ${mode('One commit', commitMode)}`, {
        id: 'reviewing-comparison-mode-commit',
        fg: commitMode ? colors.text : colors.muted,
        bold: commitMode,
        flexShrink: 0,
      }),
      label(state, `    ${mode('Range up to HEAD', !commitMode)}`, {
        id: 'reviewing-comparison-mode-range',
        fg: commitMode ? colors.muted : colors.text,
        bold: !commitMode,
        flexShrink: 0,
      }),
    ),
    ...(messageSearch === undefined ? [] : comparisonInputRows),
    ...commitViewport,
    ...(messageSearch === undefined ? comparisonInputRows : []),
    label(state, '', { height: 1 }),
    Box(
      {
        id: 'reviewing-comparison-preview',
        width: '100%',
        height: 3,
        flexShrink: 0,
        flexDirection: 'column',
      },
      ...previewRows,
    ),
  );
}

function homeHistory(state: ReviewingApplicationState, interaction: ReviewPointerInteraction): HomeCard {
  const separator = state.presentation.ascii ? '-' : '·';
  const home = state.home;
  const items = home?.reviews.items ?? [];
  const selectedLocal = Math.max(
    0,
    items.findIndex(item => item.reviewIdentity === state.selectedReviewIdentity),
  );
  // Header, context row, two-row footer, border and title.
  const visible = Math.max(1, state.height - 10);
  const start = centeredStart(selectedLocal, 0, items.length, visible);
  const shown = items.slice(start, start + visible);
  const total = home?.header.totalPastReviews ?? 0;
  return homePane(
    state,
    'reviewing-history-pane',
    'Previous Reviews',
    `${total} ${separator} newest first ${separator} read only`,
    shown.length,
    ...shown.map(item => {
      const selected = item.reviewIdentity === state.selectedReviewIdentity;
      const when = item.recordedAt?.slice(0, 16).replace('T', ' ') ?? 'Date unavailable';
      const outcome = item.historicalOutcome === undefined ? '' : `  ${separator} ${item.historicalOutcome}`;
      return homeRow(state, `${when}  ${homeReviewCounts(item, ` ${separator} `)}${outcome}`, selected, {
        id: `reviewing-history-choice-${item.reviewIdentity}`,
        pointer: pointerMouseHandlers(interaction, {
          kind: 'home-history-review',
          reviewIdentity: item.reviewIdentity,
        }),
      });
    }),
  );
}

/**
 * Home's context row sits where a Review's history row does: what is open, in
 * one line, so the pane below never has to say it.
 */
function homeContextRow(state: ReviewingApplicationState): RenderChild[] {
  if (state.screen !== 'home') return [];
  const colors = theme(state);
  const separator = state.presentation.ascii ? '-' : '·';
  const current = state.home?.currentReview;
  const text =
    state.home === undefined
      ? ''
      : current === undefined
        ? 'No Review open'
        : `Current Review ${separator} ${homeReviewCounts(current, ` ${separator} `)}`;
  return [
    Box(
      {
        id: 'reviewing-home-context',
        width: '100%',
        height: 1,
        flexShrink: 0,
        flexDirection: 'row',
        paddingLeft: 2,
        paddingRight: 2,
        backgroundColor: state.presentation.noColor ? 'transparent' : colors.raised,
      },
      label(state, fitDisplayCellsEnd(text, Math.max(1, state.width - 4), state.presentation.ascii ? '...' : '…'), {
        fg: current === undefined ? colors.muted : colors.text,
        bold: true,
        flexShrink: 1,
      }),
    ),
  ];
}

function homeBody(state: ReviewingApplicationState, interaction: ReviewPointerInteraction): RenderChild {
  const colors = theme(state);
  const card =
    state.homeMode === 'launcher'
      ? homeLauncher(state, interaction)
      : state.homeMode === 'comparison'
        ? homeComparison(state, interaction)
        : homeHistory(state, interaction);
  // Centred in the body as it is with the ordinary two-row footer. A typed
  // input's taller footer takes its row from below the card, so the card
  // never moves while you search.
  const ordinaryBody = Math.max(0, state.height - (state.header.visible ? 1 : 0) - 1 - 2);
  const top = Math.max(0, Math.floor((ordinaryBody - Math.min(card.height, ordinaryBody)) / 2));
  return Box(
    {
      id: 'reviewing-home-body',
      width: '100%',
      height: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: top,
      backgroundColor: state.presentation.noColor ? 'transparent' : colors.background,
      overflow: 'hidden',
    },
    card.node,
  );
}

/** The status line: a spinner while working, otherwise the notice with its tone's symbol. */
function statusLine(state: ReviewingApplicationState): { readonly text: string; readonly tone: StatusTone } {
  const spinner = spinnerGlyph(state.animationFrame, state.presentation.ascii);
  const agent = agentName(state);
  if (state.pending !== undefined) {
    if (state.pending.phase === 'result-unavailable') {
      return {
        text: `${noticeGlyph('error', state.presentation.ascii)} Lost contact with BuildFrame’s background process before it answered.`,
        tone: 'danger',
      };
    }
    // Saved durably: say so in the same words the status line keeps once the Message reaches History.
    if (state.pending.action === 'review.message.commit' && state.pending.phase === 'awaiting-projection') {
      return { text: `Saved. Waiting for ${agent} to start.`, tone: 'muted' };
    }
    if (state.pending.phase === 'awaiting-projection') return { text: `${spinner} Updating…`, tone: 'accent' };
    switch (state.pending.action) {
      case 'review.current-changes.start':
      case 'review.comparison.start':
      case 'review.comparison.continue-live':
        return { text: `${spinner} Saving a snapshot of the code…`, tone: 'accent' };
      case 'review.message.commit':
        // The composer card says it is saving; the status line waits for the agent.
        return { text: '', tone: 'muted' };
      case 'review.question.ask':
        return { text: `${spinner} Asking ${agent}…`, tone: 'accent' };
      case 'review.basis.git-commit.capture':
        return { text: `${spinner} Reading that commit…`, tone: 'accent' };
      case 'harness.invocation.interruption.request':
        return { text: `${spinner} Asking ${agent} to stop…`, tone: 'accent' };
      default:
        return { text: `${spinner} Saving…`, tone: 'accent' };
    }
  }
  if (state.notice !== undefined) {
    const tone = noticeToneOf(state);
    const glyph = noticeGlyph(tone, state.presentation.ascii);
    return { text: glyph.length === 0 ? state.notice : `${glyph} ${state.notice}`, tone: noticeStatusTone(tone) };
  }
  // Home's card already says what it is loading, where you are looking.
  if (state.loading !== undefined && !(state.screen === 'home' && state.loading.region === 'home'))
    return { text: `${state.loading.label}${state.presentation.ascii ? '...' : '…'}`, tone: 'muted' };
  return { text: '', tone: 'muted' };
}

function basisItemLabel(state: ReviewingApplicationState, item: ReviewBasisItem): string {
  if (item.kind === 'live') return 'Current repository';
  if (item.kind === 'git-commit') {
    return `${item.source.commit.abbreviatedObjectIdentity}  ${item.source.commit.subject}${item.capture.status === 'capture-on-open' ? '  · capture on open' : ''}`;
  }
  if (item.kind === 'change-event') return `Code ${responseMoment(state, item.source.responseIdentity)} answered`;
  return 'Saved review point';
}

function basisPickerOverlay(
  state: ReviewingApplicationState,
  interaction: ReviewPointerInteraction,
  bodyHeight: number,
): RenderChild[] {
  const picker = state.basisPicker;
  if (picker === undefined || state.review === undefined) return [];
  const bases = pickableBases(state);
  const colors = controlPlaneTheme(state);
  const width = Math.min(76, Math.max(36, state.width - 8));
  const height = dialogHeight(bodyHeight, Math.max(7, bases.length + 4), 7);
  const left = Math.max(0, Math.floor((state.width - width) / 2));
  const top = dialogTop(bodyHeight, height);
  const stopPointer = (event: MouseEvent): void => event.stopPropagation();
  return [
    Box(
      {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 30,
        backgroundColor: 'transparent',
        onMouseDown: stopPointer,
        onMouseUp: stopPointer,
      },
      borderedBox(
        state,
        {
          id: 'reviewing-basis-picker',
          position: 'absolute',
          left,
          top,
          width,
          height,
          zIndex: 31,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          borderColor: colors.accent,
          backgroundColor: colors.raised,
          title: ' Review points ',
          titleColor: colors.accent,
          titleAlignment: 'center',
          overflow: 'hidden',
        },
        label(state, 'Switches the whole review; never checks out a commit.', { fg: colors.muted }),
        ...bases.slice(0, Math.max(1, height - 4)).map(item => {
          const selected = item.reviewBasisIdentity === picker.selectedReviewBasisIdentity;
          const active = item.reviewBasisIdentity === state.activeReviewBasisIdentity;
          const marker = active ? (state.presentation.ascii ? '*' : '●') : state.presentation.ascii ? 'o' : '○';
          const branch = `${'  '.repeat(item.depth)}${item.depth === 0 ? '' : state.presentation.ascii ? '+- ' : '└─ '}`;
          return label(state, `${selected ? '›' : ' '} ${marker} ${branch}${basisItemLabel(state, item)}`, {
            id: reviewRenderableId(state, `reviewing-basis-${item.reviewBasisIdentity}`),
            fg: selected ? colors.accent : active ? colors.text : colors.muted,
            bg: selected ? colors.accentSoft : colors.raised,
            bold: selected || active,
            height: 1,
            ...pointerMouseHandlers(interaction, {
              kind: 'basis',
              reviewBasisIdentity: item.reviewBasisIdentity,
            }),
          });
        }),
        label(state, '[j/k] move · [Enter/click] open · [Esc/t] close', { fg: colors.warning }),
      ),
    ),
  ];
}

/**
 * e and m: the files or Messages as a short list over the code, one row each,
 * so the Diff keeps its width. Keys live in the footer, as for every dialog.
 */
function jumpListOverlay(state: ReviewingApplicationState, bodyHeight: number): RenderChild[] {
  const list = state.jumpList;
  if (list === undefined || state.review === undefined) return [];
  const colors = controlPlaneTheme(state);
  const ascii = state.presentation.ascii;
  const rows = jumpListRows(state);
  const width = Math.min(76, Math.max(36, state.width - 8));
  const contentWidth = Math.max(1, width - 4);
  const filterShown = list.filtering || list.query !== '';
  // Border, the filter row when there is one, and at least three rows of list.
  const chrome = 2 + (filterShown ? 1 : 0);
  const height = dialogHeight(bodyHeight, chrome + Math.max(1, Math.min(rows.length, 12)), chrome + 3);
  const visible = Math.max(1, height - chrome);
  const selected = Math.max(
    0,
    rows.findIndex(row => row.key === list.selectedKey),
  );
  const start = centeredStart(selected, 0, rows.length, visible);
  const items = state.review.messages.messages.items;
  const separator = ascii ? '-' : '·';
  const total = list.kind === 'files' ? 'files' : 'Messages';
  const stopPointer = (event: MouseEvent): void => event.stopPropagation();
  const count =
    list.query.trim() === ''
      ? `${rows.length} ${total}`
      : `${rows.length} of ${list.kind === 'files' ? jumpListCount(state) : items.length} ${total}`;
  const row = (entry: JumpListRow, index: number): RenderChild => {
    const isSelected = entry.key === list.selectedKey;
    const marker = isSelected ? (ascii ? '>' : '›') : ' ';
    const item =
      list.kind === 'messages' ? items.find(candidate => candidate.reviewMessageIdentity === entry.key) : undefined;
    const badge = item === undefined ? undefined : stateBadge(state, item);
    const tail = badge === undefined ? '' : `  ${badge.glyph} ${badge.word}`;
    const status = list.kind === 'files' ? fileStatus(entry.tail ?? '', ascii) : '';
    const lead = list.kind === 'files' ? `${marker} ${status}  ` : `${marker} `;
    // A state word is never cut: the text gives way before it, ending on its own ellipsis.
    const text = fitDisplayCellsEnd(
      entry.text.replaceAll('\n', ' '),
      Math.max(1, contentWidth - displayCells(lead) - displayCells(tail)),
      ascii ? '...' : '…',
    );
    return Box(
      {
        id: reviewRenderableId(state, `reviewing-jump-list-row-${start + index}`),
        width: '100%',
        height: 1,
        flexShrink: 0,
        flexDirection: 'row',
        backgroundColor: isSelected ? colors.accentSoft : colors.raised,
      },
      label(
        state,
        statusColoredRow(
          state,
          colors,
          {
            before: `${marker} `,
            status: entry.tail ?? '',
            glyph: status,
            after: `${lead.slice(marker.length + 1 + status.length)}${text}`,
          },
          {
            fg: isSelected ? colors.accent : entry.current ? colors.text : colors.muted,
            bold: isSelected || entry.current,
          },
        ),
        {
          fg: isSelected ? colors.accent : entry.current ? colors.text : colors.muted,
          bold: isSelected || entry.current,
          flexShrink: 1,
        },
      ),
      ...(badge === undefined
        ? []
        : [label(state, tail, { fg: toneColor(colors, badge.tone), flexShrink: 0, bold: isSelected })]),
    );
  };
  return [
    Box(
      {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 30,
        backgroundColor: 'transparent',
        onMouseDown: stopPointer,
        onMouseUp: stopPointer,
      },
      borderedBox(
        state,
        {
          id: 'reviewing-jump-list',
          position: 'absolute',
          left: Math.max(0, Math.floor((state.width - width) / 2)),
          top: dialogTop(bodyHeight, height),
          width,
          height,
          zIndex: 31,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          borderColor: colors.accent,
          backgroundColor: colors.raised,
          title: ` ${list.kind === 'files' ? 'Files' : 'Messages'} ${separator} ${count} `,
          titleColor: colors.accent,
          titleAlignment: 'center',
          overflow: 'hidden',
        },
        ...(filterShown
          ? [
              label(state, `/ ${list.query}${list.filtering ? (ascii ? '_' : '▏') : ''}`, {
                fg: colors.text,
                height: 1,
              }),
            ]
          : []),
        ...(rows.length === 0
          ? [label(state, `No ${total} match “${list.query}”.`, { fg: colors.muted, height: 1 })]
          : rows.slice(start, start + visible).map(row)),
      ),
    ),
  ];
}

/** How many files the files list holds before its filter. */
function jumpListCount(state: ReviewingApplicationState): number {
  if (state.shownStep !== undefined) return state.shownStep.files?.length ?? 0;
  return reviewingFiles(state.review, state.fileScope).length;
}

function messagePreviewAssessment(
  preview: Extract<DefaultReviewMessageInspectionView, { readonly status: 'available' }>,
): string {
  // What the agent may do with the Message is shown on every preview; it is the fact the owner acts on.
  const agent = preview.destination.harnessLabel;
  const authorityNote =
    preview.capability.authority === 'workspace-write' ? `${agent} may edit your files` : `${agent} can only read`;
  const assessment = preview.commitment;
  if (assessment.status === 'direct') return `Sends right away. ${authorityNote}.`;
  return `Asks first: an earlier Message here never reported back. ${authorityNote}.`;
}

function messageCommitGateOverlay(state: ReviewingApplicationState, bodyHeight: number): RenderChild[] {
  const gate = state.messageCommitGate;
  if (gate === undefined) return [];
  const colors = controlPlaneTheme(state);
  const width = Math.min(72, Math.max(40, state.width - 6));
  const textWidth = Math.max(1, width - 4);
  const harness = gate.destination.harnessLabel;
  const unresolved = gate.commitment.requirements.length;
  const stopPointer = (event: MouseEvent): void => event.stopPropagation();
  const paragraph = (text: string, fg: ThemeColor, indent = '', bold = false): RenderChild[] =>
    wrapDisplayCellRows(text, Math.max(1, textWidth - indent.length)).map(row =>
      label(state, `${indent}${row}`, { fg, bold }),
    );
  // The one thing a Message ever stops for: an earlier turn to this session
  // never reported back, so sending now may repeat its work.
  const rows: RenderChild[] = [
    ...paragraph(
      unresolved === 1
        ? '! An earlier Message here never reported back.'
        : `! ${unresolved} earlier Messages here never reported back.`,
      colors.warning,
      '',
      true,
    ),
    ...paragraph(`Sending now may make ${harness} do the same work twice.`, colors.text),
    ...paragraph(`It goes to ${harness} · ${gate.destination.sessionLabel}.`, colors.muted),
  ];
  rows.push(
    label(state, ' ', {}),
    ...paragraph(
      `Sends ${plural(gate.outgoingMaterial.characterLength, 'character')}. F3 shows them exactly as ${harness} will get them.`,
      colors.muted,
    ),
  );
  // The box is as tall as what it says, so no empty rows read as missing text.
  const height = Math.min(Math.max(1, bodyHeight), rows.length + 2);
  return [
    // A plain backdrop hides the panes, so nothing competes with the question.
    Box({
      id: 'reviewing-message-commit-gate-backdrop',
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: Math.max(1, bodyHeight),
      zIndex: 33,
      backgroundColor: colors.background,
      onMouseDown: stopPointer,
      onMouseUp: stopPointer,
    }),
    borderedBox(
      state,
      {
        id: 'reviewing-message-commit-gate',
        position: 'absolute',
        left: Math.max(0, Math.floor((state.width - width) / 2)),
        top: dialogTop(bodyHeight, height),
        width,
        height,
        zIndex: 34,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        borderColor: colors.warning,
        backgroundColor: colors.raised,
        title: ' Confirm before sending ',
        titleColor: colors.warning,
        titleAlignment: 'center',
        overflow: 'hidden',
        onMouseDown: stopPointer,
        onMouseUp: stopPointer,
      },
      ...rows.slice(0, Math.max(1, height - 2)),
    ),
  ];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function messagePreviewOverlay(state: ReviewingApplicationState, bodyHeight: number): RenderChild[] {
  const preview = state.messagePreview;
  const editor = state.editor;
  // The inspection is slow; the overlay opens on the key press and fills in
  // the exact facts when they arrive instead of leaving the composer unchanged.
  const pending = preview === undefined && editor?.inspectionRequest?.purpose === 'preview';
  if (preview === undefined && !pending) return [];
  const colors = controlPlaneTheme(state);
  const width = Math.min(84, Math.max(38, state.width - 6));
  const height = dialogHeight(bodyHeight, 18, 8);
  const stopPointer = (event: MouseEvent): void => event.stopPropagation();
  if (preview === undefined) {
    const body = editor?.body ?? '';
    const bodyRows = Math.max(1, wrapDisplayCellRows(body, Math.max(8, width - 8), Math.max(1, height - 11)).length);
    return [
      borderedBox(
        state,
        {
          id: 'reviewing-message-preview',
          position: 'absolute',
          left: Math.max(0, Math.floor((state.width - width) / 2)),
          top: dialogTop(bodyHeight, height),
          width,
          height,
          zIndex: 35,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          borderColor: colors.accent,
          backgroundColor: colors.raised,
          title: ' Preview · preparing ',
          titleColor: colors.accent,
          titleAlignment: 'center',
          overflow: 'hidden',
          onMouseDown: stopPointer,
          onMouseUp: stopPointer,
        },
        label(state, `Preparing the preview${state.presentation.ascii ? '...' : '…'}`, {
          fg: colors.text,
          bold: true,
        }),
        label(state, `On ${editor?.fileLabel ?? ''}:${editor?.line ?? ''}`, { fg: colors.muted }),
        borderedBox(
          state,
          {
            width: '100%',
            flexGrow: 1,
            flexDirection: 'column',
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingLeft: 1,
            paddingRight: 1,
            overflow: 'hidden',
          },
          label(state, body.length === 0 ? '(empty)' : body, { fg: colors.text, wrap: 'word', height: bodyRows }),
        ),
        label(state, 'The exact text appears once BuildFrame has checked it.', { fg: colors.muted }),
      ),
    ];
  }
  const material = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    decodeBytesBase64(preview.outgoingMaterial.bytesBase64),
  );
  // The exact material box grows with its content up to the dialog's rows, so
  // a custom template is fully visible instead of a single clipped line.
  const materialRows = Math.max(
    1,
    wrapDisplayCellRows(material, Math.max(8, width - 8), Math.max(1, height - 11)).length,
  );
  const destination = `${preview.destination.harnessLabel} · ${preview.destination.sessionLabel}`;
  return [
    borderedBox(
      state,
      {
        id: 'reviewing-message-preview',
        position: 'absolute',
        left: Math.max(0, Math.floor((state.width - width) / 2)),
        top: dialogTop(bodyHeight, height),
        width,
        height,
        zIndex: 35,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        borderColor: colors.accent,
        backgroundColor: colors.raised,
        title: ' Preview · exactly what will be sent ',
        titleColor: colors.accent,
        titleAlignment: 'center',
        overflow: 'hidden',
        onMouseDown: stopPointer,
        onMouseUp: stopPointer,
      },
      label(
        state,
        `${preview.outgoingMaterial.byteLength} bytes · ${preview.outgoingMaterial.characterLength} characters`,
        {
          fg: colors.text,
          bold: true,
        },
      ),
      label(state, `To ${destination}`, { fg: colors.muted }),
      borderedBox(
        state,
        {
          width: '100%',
          flexGrow: 1,
          flexDirection: 'column',
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingLeft: 1,
          paddingRight: 1,
          overflow: 'hidden',
        },
        label(state, material, { fg: colors.text, wrap: 'word', height: materialRows }),
      ),
      ...[...preview.limitations, messagePreviewAssessment(preview)].flatMap((fact, index, facts) =>
        wrapDisplayCellRows(fact, Math.max(1, width - 4)).map(row =>
          label(state, row, {
            fg: index < facts.length - 1 || preview.commitment.status !== 'direct' ? colors.warning : colors.muted,
          }),
        ),
      ),
    ),
  ];
}

function actionName(kind: string): string {
  switch (kind) {
    case 'review.current-changes.start':
      return 'Review current changes';
    case 'review.comparison.start':
      return 'Review selected changes';
    case 'review.comparison.continue-live':
      return 'Continue with Live Changes from HEAD';
    case 'review.question.ask':
      return 'Ask the agent';
    default:
      return kind;
  }
}

function continuationChoiceCard(
  state: ReviewingApplicationState,
  selected: boolean,
  kind: 'saved-endpoint' | 'current-head',
  heading: string,
  consequence: string,
): RenderChild {
  const colors = state.presentation.noColor ? theme(state) : controlPlaneTheme(state);
  const focusColor = kind === 'saved-endpoint' ? colors.accent : colors.success;
  const focusBackground = kind === 'saved-endpoint' ? colors.accentSoft : colors.successSoft;
  const marker = selected ? (state.presentation.ascii ? '>' : '›') : ' ';
  return borderedBox(
    state,
    {
      height: 4,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      flexDirection: 'column',
      paddingLeft: 1,
      paddingRight: 1,
      borderColor: selected ? focusColor : colors.border,
      backgroundColor: selected ? focusBackground : colors.surface,
    },
    label(state, `${marker} ${heading}`, {
      fg: selected ? focusColor : colors.text,
      bold: selected,
    }),
    label(state, consequence, { fg: colors.muted }),
  );
}

function continuationChoiceOverlay(state: ReviewingApplicationState): RenderChild[] {
  const choice = state.continuationChoice;
  const continuation = state.review?.continuation;
  if (choice === undefined || continuation?.status !== 'available') return [];
  const colors = state.presentation.noColor ? theme(state) : controlPlaneTheme(state);
  const source =
    continuation.sourceBasis.kind === 'commit'
      ? continuation.sourceBasis.objectIdentity.slice(0, 12)
      : continuation.sourceBasis.kind === 'empty-tree'
        ? 'start'
        : continuation.sourceBasis.kind === 'index'
          ? 'index'
          : (continuation.sourceBasis.objectIdentity?.slice(0, 12) ?? 'unborn');
  const saved =
    continuation.savedEndpoint.kind === 'commit' ? continuation.savedEndpoint.objectIdentity.slice(0, 12) : '';
  const current = continuation.currentHead.objectIdentity?.slice(0, 12) ?? 'unborn';
  const linear = state.layout === 'linear';
  const dialogHeight = linear ? 15 : 11;
  const horizontalMargin = state.layout === 'wide' ? Math.max(1, Math.floor(state.width / 12)) : 1;
  const choices = Box(
    {
      width: '100%',
      height: linear ? 8 : 4,
      flexDirection: linear ? 'column' : 'row',
      gap: linear ? 0 : 1,
    },
    continuationChoiceCard(
      state,
      choice.selected === 'saved-endpoint',
      'saved-endpoint',
      'Stay with saved Review',
      'No new Review; keep this range.',
    ),
    continuationChoiceCard(
      state,
      choice.selected === 'current-head',
      'current-head',
      'Continue from current HEAD',
      'One new Review; keep saved Review.',
    ),
  );
  return [
    borderedBox(
      state,
      {
        id: 'reviewing-continuation-dialog',
        position: 'absolute',
        left: horizontalMargin,
        right: horizontalMargin,
        top: Math.max(2, Math.floor((state.height - dialogHeight - 2) / 2)),
        height: dialogHeight,
        zIndex: 20,
        flexDirection: 'column',
        paddingLeft: 2,
        paddingRight: 2,
        backgroundColor: colors.raised,
        title: ' CONTINUE REVIEW - SAVED RANGE / CURRENT HEAD ',
        titleColor: colors.warning,
        titleAlignment: 'center',
      },
      label(state, 'HEAD moved after this Review was saved.', {
        fg: colors.text,
        bold: true,
      }),
      label(state, `${source}  ─────  ${saved}  ─────  ${current} HEAD`, {
        fg: colors.text,
      }),
      label(state, 'review start        saved Review end        repository now', {
        fg: colors.muted,
      }),
      label(state, 'The saved Review stays unchanged either way.', {
        fg: colors.muted,
      }),
      choices,
      label(
        state,
        linear
          ? '[Tab/j/k] move focus   [Enter] choose   [Esc] cancel'
          : '[Tab/h/l] move focus   [Enter] choose   [Esc] cancel',
        { fg: colors.warning },
      ),
    ),
  ];
}

function detailsOverlay(state: ReviewingApplicationState): RenderChild[] {
  if (!state.showDetails) return [];
  const actions = state.screen === 'home' ? (state.home?.actions ?? []) : (state.review?.manifest.actions ?? []);
  return actionChecksPanel(
    state,
    actions.slice(0, 4).map(action => {
      const status = action.availability === 'direct' ? 'ready' : 'blocked';
      return `${actionName(action.kind)}: ${status} at v${action.gateBasis.expectedStateVersion}`;
    }),
  );
}

function configurationOverlay(
  state: ReviewingApplicationState,
  bodyHeight: number,
  /** Header rows above the body: the box is centred as if they were body, so hiding the header never moves it. */
  headerRows = 0,
): RenderChild[] {
  const window = state.configurationWindow;
  if (window === undefined) return [];
  // The rows only describe the state here; nothing changes them while drawing.
  const content = reviewingSettings(state, () => undefined);
  return configurationDialog(state, window, content, bodyHeight, headerRows, 'reviewing');
}

function historicalBaseState(state: ReviewingApplicationState): ReviewingApplicationState {
  const context = state.historicalDialog?.base;
  if (context === undefined) return state;
  return {
    ...state,
    review: context.review,
    focus: context.focus,
    balancedContext: context.balancedContext,
    selectedFileIdentity: context.selectedFileIdentity,
    selectedRowIdentity: context.selectedRowIdentity,
    selectedQuestionIdentity: context.selectedQuestionIdentity,
    expandedQuestionIdentity: context.expandedQuestionIdentity,
    selectedQuestionBody: context.selectedQuestionBody,
    questionCardScrollOffset: context.questionCardScrollOffset,
    anchorSide: context.anchorSide,
    diffMode: context.diffMode,
    wrapDiffLines: context.wrapDiffLines,
    diffHorizontalOffset: context.diffHorizontalOffset,
    loading: context.loading,
    notice: context.notice,
    showDetails: context.showDetails,
    historicalDialog: undefined,
    editor: undefined,
    configurationWindow: undefined,
    continuationChoice: undefined,
    search: undefined,
  };
}

function historicalDialogOverlay(
  state: ReviewingApplicationState,
  availableHeight: number,
  interaction: ReviewPointerInteraction,
  onDiscussionPage: (page: DiscussionPage) => void,
): RenderChild[] {
  const dialog = state.historicalDialog;
  const review = state.review;
  if (dialog === undefined || review === undefined) return [];
  const colors = controlPlaneTheme(state);
  const width = Math.max(26, Math.min(140, state.width - 4));
  const height = Math.max(6, Math.min(40, availableHeight - 2));
  const innerWidth = Math.max(22, width - 4);
  const innerHeight = Math.max(6, height - 7);
  const dialogState: ReviewingApplicationState = {
    ...state,
    width: innerWidth,
    height: innerHeight,
    layout: innerWidth >= 120 ? 'wide' : innerWidth >= 90 ? 'balanced' : 'linear',
    editor: undefined,
    search: undefined,
    configurationWindow: undefined,
    continuationChoice: undefined,
    showDetails: false,
  };
  const version = review.source.kind === 'snapshot' ? review.manifest.header.version : undefined;
  const title =
    version === undefined
      ? state.presentation.ascii
        ? ' HISTORY - Opening saved Snapshot - READ ONLY '
        : ' HISTORY · Opening saved Snapshot · READ ONLY '
      : state.presentation.ascii
        ? ` HISTORY - Historical Version ${version.ordinal}/${version.total} - SAVED - READ ONLY `
        : ` HISTORY · Historical Version ${version.ordinal}/${version.total} · SAVED · READ ONLY `;
  const relationship =
    version === undefined
      ? state.presentation.ascii
        ? 'OPENING SAVED SNAPSHOT  |  NOT LIVE CHANGES'
        : 'OPENING SAVED SNAPSHOT  ·  NOT LIVE CHANGES'
      : state.presentation.ascii
        ? `SAVED SNAPSHOT  |  VERSION ${version.ordinal} OF ${version.total}  |  NOT LIVE CHANGES`
        : `SAVED SNAPSHOT  ·  VERSION ${version.ordinal} OF ${version.total}  ·  NOT LIVE CHANGES`;
  const copyHint =
    state.focus === 'questions' ? '[y] copy Question body  ' : state.focus === 'diff' ? '[y] copy Diff row  ' : '';
  return [
    borderedBox(
      state,
      {
        id: 'reviewing-historical-dialog',
        position: 'absolute',
        left: Math.max(2, Math.floor((state.width - width) / 2)),
        top: Math.max(0, Math.floor((availableHeight - height) / 2)),
        width,
        height,
        zIndex: 30,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        borderStyle: state.presentation.ascii ? 'single' : 'double',
        borderColor: colors.accent,
        backgroundColor: colors.raised,
        title,
        titleColor: colors.accent,
      },
      Box(
        {
          id: 'reviewing-historical-context',
          width: '100%',
          height: 3,
          flexShrink: 0,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: colors.surface,
        },
        label(state, relationship, { fg: colors.text, bold: true }),
        label(state, state.loading?.label ?? 'Exact immutable files, Questions, and Responses.', {
          fg: state.loading === undefined ? colors.text : colors.warning,
        }),
        label(state, 'Live Changes remains preserved underneath and refreshes on close.', {
          fg: colors.muted,
        }),
      ),
      Box(
        {
          width: '100%',
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: colors.raised,
        },
        reviewBody(dialogState, undefined, interaction, onDiscussionPage, () => undefined, innerHeight),
      ),
      label(state, '[Tab] pane  [j/k] move  [PgUp/PgDn] page  [ and ] Versions', {
        fg: colors.text,
      }),
      label(state, `${copyHint}[R/Esc] close and return to Live Changes`, {
        fg: colors.warning,
      }),
    ),
  ];
}

interface ReviewingHeaderFacts {
  readonly route: string;
  /** What is on screen, in a few capital words. */
  readonly source: string;
  readonly compactSource: string;
}

function reviewingHeaderFacts(state: ReviewingApplicationState, trail: string | undefined): ReviewingHeaderFacts {
  const route = trail === undefined ? 'Home' : trail;
  if (state.screen === 'home') {
    if (state.homeMode === 'comparison') {
      return {
        route,
        source: 'COMPARE',
        compactSource: 'COMPARE',
      };
    }
    if (state.homeMode === 'history') {
      return {
        route,
        source: 'HISTORY',
        compactSource: 'HISTORY',
      };
    }
    return {
      route,
      source: 'HOME',
      compactSource: 'HOME',
    };
  }
  const review = state.review;
  const shell = state.pendingReviewShell;
  if (review === undefined && shell !== undefined) {
    return {
      route,
      source: 'OPENING',
      compactSource: 'OPENING',
    };
  }
  const current = review?.manifest.header.retention === 'current';
  if (review?.source.kind === 'live') {
    return {
      route,
      source: 'LIVE CHANGES',
      compactSource: 'LIVE',
    };
  }
  return {
    route,
    source: current ? 'SNAPSHOT' : 'SAVED',
    compactSource: current ? 'SNAPSHOT' : 'SAVED',
  };
}

/** Below this size the header names its source in one short word. */
function compactHeader(state: ReviewingApplicationState): boolean {
  return state.width < 100;
}

function reviewingHeader(
  state: ReviewingApplicationState,
  trail: string | undefined,
): { readonly height: number; readonly rows: readonly RenderChild[] } {
  if (!state.header.visible) return { height: 0, rows: [] };
  const colors = theme(state);
  const facts = reviewingHeaderFacts(state, trail);
  // A past step must never read as live, so the header says so in caution.
  const word =
    state.screen === 'review' && state.shownStep !== undefined
      ? 'PAST STEP'
      : compactHeader(state)
        ? facts.compactSource
        : facts.source;
  const source =
    word.toLowerCase() === facts.route.toLowerCase()
      ? undefined
      : { text: word, fg: state.shownStep !== undefined && state.screen === 'review' ? colors.warning : colors.muted };
  return shellHeader(
    state,
    'reviewing',
    // On a Review the row below names it ("Current Review · …"), so the header doesn't repeat it.
    state.screen === 'review' && (facts.route === 'Current Review' || facts.route === 'Previous Review')
      ? 'BuildFrame'
      : `BuildFrame / ${facts.route}`,
    source,
    agentIndicator(state, state.harnessConnection),
  );
}

function screen(
  state: ReviewingApplicationState,
  questionTextarea: TextareaRenderable | undefined,
  interaction: ReviewPointerInteraction,
  onDiscussionPage: (page: DiscussionPage) => void,
  onContentPage: (pageSize: number) => void,
): RenderNode {
  const presented = historicalBaseState(state);
  const colors = theme(presented);
  const statusState = state.historicalDialog !== undefined && state.notice !== undefined ? state : presented;
  const reviewHeader = presented.review?.manifest.header;
  const trail =
    presented.screen === 'home'
      ? presented.homeMode === 'history'
        ? 'Previous Reviews'
        : presented.homeMode === 'comparison'
          ? 'Review a commit or range'
          : undefined
      : `${
          reviewHeader?.retention === 'current' ||
          (reviewHeader === undefined && presented.pendingReviewShell?.retention === 'current')
            ? 'Current Review'
            : 'Previous Review'
        }${reviewHeader?.historicalOutcome === undefined ? '' : ` / Historical ${reviewHeader.historicalOutcome}`}`;
  const header = reviewingHeader(presented, trail);
  const retention = [...reviewRetentionContext(presented, interaction), ...homeContextRow(presented)];
  const conditions = statusCondition(presented);
  const baseInteraction: ReviewPointerInteraction =
    state.historicalDialog === undefined
      ? interaction
      : {
          ...interaction,
          begin: (_target, event) => event.stopPropagation(),
          finish: event => event.stopPropagation(),
          move: event => event.stopPropagation(),
          wheelPane: (_region, event) => event.stopPropagation(),
        };
  return shellFrame(presented, {
    idPrefix: 'reviewing',
    header,
    context: [...retention, ...conditions],
    said: statusLine(statusState),
    // The footer is always the same two rows: what is being said (or what this
    // mode means), then the keys. Neither row moves or swaps with the mode.
    idleSentence: footerSentence(REVIEWING_KEYS, reviewingFooterMode(state), state),
    keysRow: width => keysRow(REVIEWING_KEYS, reviewingFooterMode(state), state, width),
    onMouseMove: baseInteraction.move,
    body: contentHeight => [
      presented.screen === 'loading' || presented.screen === 'failed'
        ? label(
            presented,
            presented.screen === 'failed'
              ? (presented.failure ?? presented.notice ?? 'The Reviewing surface could not open.')
              : (presented.loading?.label ?? (state.presentation.ascii ? 'Loading...' : 'Loading…')),
            {
              fg: presented.screen === 'failed' ? colors.danger : colors.warning,
              paddingLeft: 3,
              height: 3,
            },
          )
        : presented.screen === 'home'
          ? homeBody(presented, interaction)
          : presented.review === undefined && presented.pendingReviewShell !== undefined
            ? pendingReviewBody(presented)
            : reviewBody(presented, questionTextarea, baseInteraction, onDiscussionPage, onContentPage, contentHeight),
      ...detailsOverlay(presented),
      ...(presented.actionLookupOpen
        ? keyListPanel(
            presented,
            keyList(REVIEWING_KEYS, reviewingHelpMode(presented), presented),
            contentHeight,
            'reviewing',
          )
        : []),
      ...configurationOverlay(presented, contentHeight, header.height),
      ...continuationChoiceOverlay(presented),
      ...(state.search !== undefined ? [searchBody(state, contentHeight)] : []),
      ...basisPickerOverlay(state, interaction, contentHeight),
      ...jumpListOverlay(state, contentHeight),
      ...messageCommitGateOverlay(state, contentHeight),
      ...messagePreviewOverlay(state, contentHeight),
      ...historicalDialogOverlay(state, contentHeight, interaction, onDiscussionPage),
    ],
  });
}

const QUESTION_EDITOR_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;

class QuestionTextareaRenderable extends TextareaRenderable {
  override insertText(text: string): void {
    // OpenTUI routes ordinary input and decoded, ANSI-free paste through here.
    super.insertText(text.replace(QUESTION_EDITOR_CONTROL_PATTERN, ''));
  }
}

/** OpenTUI implementation private to the deep Reviewing Application Module. */
export class ReviewingView {
  readonly #model: ReviewingApplicationModel;
  readonly #roots: ShellRoots;
  readonly #onEffects: (effects: readonly ReviewingModelEffect[], inputStartedAt: number) => void;
  readonly #pointer: ShellPointer<ReviewingPointerTarget>;
  #questionTextarea: TextareaRenderable | undefined;
  #discussionPage: DiscussionPage | undefined;
  #contentPageSize: number | undefined;
  readonly #selection: ShellSelection;
  #synchronizingQuestionTextarea = false;
  #wheelRenderQueued: NodeJS.Immediate | undefined;
  #wheelFramePending = false;
  #wheelRenderDirty = false;
  #rendering = false;
  #started = false;

  readonly #captureDiscussionPage = (page: DiscussionPage): void => {
    this.#discussionPage = page;
    // Width or height changes can lower the final valid offset. Keep the
    // model-owned visual position equal to the card position used this frame,
    // so its pane label and the next key press never trail clipped content.
    this.#model.synchronizeQuestionDiscussionOffset(page.offset);
  };

  readonly #glider = new PaneGlider<ReviewRegion>({
    smooth: () => this.#model.smoothScrolling(),
    running: () => this.#started,
    selecting: () => this.renderer.getSelection()?.isDragging === true,
    render: () => this.render(),
  });

  readonly #synchronizePaneScroll = (
    region: ReviewRegion,
    layout: ReviewingPaneScrollLayout,
  ): ReviewingPaneScrollState => this.#glider.glide(region, this.#model.synchronizePaneScroll(region, layout));

  readonly #onWheelRenderFrame = (): void => {
    this.#wheelFramePending = false;
    if (this.#wheelRenderDirty) this.#scheduleWheelRender();
  };

  /**
   * Model input remains lossless, while expensive whole-tree replacement is
   * coalesced across one terminal input burst and capped at one per presented
   * frame. This prevents rapid wheel input from building and retaining dozens
   * of superseded render trees before OpenTUI can publish one of them.
   */
  #scheduleWheelRender(): void {
    this.#wheelRenderDirty = true;
    if (this.#wheelRenderQueued !== undefined || this.#wheelFramePending || !this.#started) return;
    this.#wheelRenderQueued = setImmediate(() => {
      this.#wheelRenderQueued = undefined;
      if (!this.#started || !this.#wheelRenderDirty) return;
      this.#wheelRenderDirty = false;
      this.render();
      if (!this.#started) return;
      // render() registers retired-tree cleanup before this listener. On the
      // frame, cleanup therefore runs before another replacement can retire
      // the tree whose hit grid was just presented.
      this.#wheelFramePending = true;
      this.renderer.once('frame', this.#onWheelRenderFrame);
    });
  }

  readonly #wheelPane = (region: ReviewRegion, event: MouseEvent): void => {
    const direction = event.scroll?.direction;
    if (direction !== 'up' && direction !== 'down') return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.#started) return;
    const inputStartedAt = performance.now();
    const rows = this.#glider.wheelRows(region, event.scroll?.delta, inputStartedAt);
    const effects = this.#model.handlePaneWheel(region, direction === 'up' ? -1 : 1, rows);
    this.#scheduleWheelRender();
    this.#onEffects(effects, inputStartedAt);
  };

  readonly #activatePointerTarget = (target: ReviewingPointerTarget): void => {
    if (!this.#started) return;
    const inputStartedAt = performance.now();
    const effects = this.#model.handlePointerTarget(target);
    this.render();
    this.#onEffects(effects, inputStartedAt);
  };

  #messageIdentityAt(x: number, y: number): ReviewMessageListItem['reviewMessageIdentity'] | undefined {
    const state = this.#model.state;
    const root = this.#roots.current;
    if (
      root === undefined ||
      state.screen !== 'review' ||
      state.review === undefined ||
      state.historicalDialog !== undefined ||
      state.search !== undefined ||
      state.configurationWindow !== undefined ||
      state.messageCommitGate !== undefined ||
      state.messagePreview !== undefined ||
      state.editor?.inspectionRequest?.purpose === 'preview' ||
      state.actionLookupOpen
    ) {
      return undefined;
    }
    const offset = state.review.messages.messages.offset;
    for (const [index, item] of state.review.messages.messages.items.entries()) {
      const renderable = root.findDescendantById(
        reviewRenderableId(state, `reviewing-message-card-${offset + index + 1}`),
      );
      if (
        renderable !== undefined &&
        x >= renderable.screenX &&
        x < renderable.screenX + renderable.width &&
        y >= renderable.screenY &&
        y < renderable.screenY + renderable.height
      ) {
        return item.reviewMessageIdentity;
      }
    }
    return undefined;
  }

  readonly #movePointer = (event: MouseEvent): void => {
    if (!this.#started) return;
    // Replacing the tree mid-drag would discard the native text selection.
    if (this.renderer.getSelection()?.isDragging) return;
    const reviewMessageIdentity = this.#messageIdentityAt(event.x, event.y);
    if (this.#model.hoverMessage(reviewMessageIdentity)) this.render();
  };

  #diffPointerTargetAt(x: number, y: number): ReviewingPointerTarget | undefined {
    const view = shownDiff(this.#model.state);
    const root = this.#roots.current;
    if (view?.status !== 'available' || root === undefined) return undefined;
    const contains = (renderable: Renderable): boolean =>
      x >= renderable.screenX &&
      x < renderable.screenX + renderable.width &&
      y >= renderable.screenY &&
      y < renderable.screenY + renderable.height;
    for (const row of view.window.rows) {
      if (this.#model.state.diffMode === 'inline') {
        const renderable = root.findDescendantById(
          reviewRenderableId(this.#model.state, `reviewing-diff-row-${row.rowIdentity}`),
        );
        if (renderable !== undefined && contains(renderable)) {
          return {
            kind: 'diff-row',
            rowIdentity: row.rowIdentity,
            side: row.newLine !== undefined ? 'new' : 'old',
          };
        }
        continue;
      }
      for (const side of ['old', 'new'] as const) {
        const renderable = root.findDescendantById(
          reviewRenderableId(this.#model.state, `reviewing-diff-row-${row.rowIdentity}-${side}`),
        );
        if (renderable !== undefined && contains(renderable)) {
          return { kind: 'diff-row', rowIdentity: row.rowIdentity, side };
        }
      }
    }
    return undefined;
  }

  readonly #onKeyPress = (event: KeyEvent): void => {
    const input = reviewingInputFromKeyEvent(event);
    if (input === undefined) return;
    const inputStartedAt = performance.now();
    const textarea = this.#questionTextarea;
    if (textarea !== undefined && this.#model.state.editor !== undefined) {
      const copyRequested = input.name === 'c' && (input.super || input.ctrl);
      const workflowRequested = input.name === 'f3' || input.name === 'f4';
      // While the Message saves, the draft is locked: keys go to the model,
      // which keeps moves for after the save, never into the sent text.
      const saving =
        this.#model.state.pending !== undefined || this.#model.state.editor.inspectionRequest?.purpose === 'submit';
      if (input.name === 'escape' || copyRequested || workflowRequested || saving) {
        event.preventDefault();
        event.stopPropagation();
        if (copyRequested && textarea.hasSelection()) {
          this.#onEffects(
            [
              {
                type: 'copy-text',
                source: 'message-composer',
                text: textarea.getSelectedText(),
                announce: 'always',
              },
            ],
            inputStartedAt,
          );
          return;
        }
        const effects = this.#model.handleInput(input, inputStartedAt);
        this.render();
        this.#onEffects(effects, inputStartedAt);
      }
      // Every other editor key is owned by OpenTUI's focused Textarea so Up
      // and Down follow post-wrap visual rows instead of synthetic newlines.
      return;
    }

    const discussionDirection =
      input.name === 'pageUp' || (input.name === 'k' && input.ctrl)
        ? -1
        : input.name === 'pageDown' || input.name === 'linefeed' || (input.name === 'j' && input.ctrl)
          ? 1
          : 0;
    if (
      discussionDirection !== 0 &&
      this.#model.state.screen === 'review' &&
      this.#model.state.focus === 'questions' &&
      this.#discussionPage !== undefined
    ) {
      event.preventDefault();
      event.stopPropagation();
      const page = this.#discussionPage;
      const offset =
        discussionDirection < 0
          ? Math.max(0, page.offset - page.pageSize)
          : Math.min(page.maximumOffset, page.offset + page.pageSize);
      this.#model.synchronizeQuestionDiscussionOffset(offset);
      this.render();
      return;
    }

    const contentDelta =
      this.#model.state.screen === 'review' &&
      this.#model.state.focus === 'diff' &&
      this.#model.state.editor === undefined &&
      this.#model.state.unchangedContent?.view.status === 'available'
        ? input.text === 'k' || input.name === 'up'
          ? -1
          : input.text === 'j' || input.name === 'down'
            ? 1
            : input.name === 'pageUp'
              ? -(this.#contentPageSize ?? 20)
              : input.name === 'pageDown'
                ? (this.#contentPageSize ?? 20)
                : 0
        : 0;
    if (contentDelta !== 0) {
      event.preventDefault();
      event.stopPropagation();
      const effects = this.#model.moveUnchangedContentLine(contentDelta);
      this.render();
      this.#onEffects(effects, performance.now());
      return;
    }

    if (this.#selection.copyOnCtrlC(input, event)) return;

    const editorWasOpen = this.#model.state.editor !== undefined;
    const effects = this.#model.handleInput(input, inputStartedAt);
    this.render();
    this.#onEffects(effects, inputStartedAt);
    if (!editorWasOpen && this.#model.state.editor !== undefined) {
      // Do not deliver the key that opened the composer to the newly focused
      // Textarea during this same global-to-renderable dispatch.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  readonly #onPaste = (event: PasteEvent): void => {
    if (this.#questionTextarea !== undefined && this.#model.state.editor !== undefined) {
      // The focused Textarea decodes and strips ANSI from bracketed paste,
      // then removes controls before synchronizing the model-owned draft.
      return;
    }
    const inputStartedAt = performance.now();
    const effects = this.#model.handleInput(reviewingInputFromPasteEvent(event), inputStartedAt);
    this.render();
    this.#onEffects(effects, inputStartedAt);
  };

  readonly #onResize = (): void => this.render();

  #highlightDirty = false;
  invalidateHighlight(): void {
    if (!this.#started) return;
    this.#highlightDirty = true;
    this.renderer.requestRender();
  }

  readonly #onHighlightFrame = (): void => {
    if (!this.#highlightDirty || !this.#started) return;
    // Do not replace a tree underneath an active native text selection.
    if (this.renderer.getSelection()?.isDragging) return;
    // Finish the presented frame's hit-grid/retired-tree cleanup first.
    queueMicrotask(() => {
      if (this.#started && this.#highlightDirty) this.render();
    });
  };

  constructor(
    readonly renderer: CliRenderer,
    model: ReviewingApplicationModel,
    onEffects: (effects: readonly ReviewingModelEffect[], inputStartedAt: number) => void,
    readonly highlight: ReviewingHighlight,
    /** Runs after every drawn tree, whoever asked for it (input, wheel, glide). */
    readonly onRendered: () => void = () => {},
  ) {
    this.#model = model;
    this.#onEffects = onEffects;
    this.#roots = new ShellRoots(renderer, 'reviewing-screen');
    this.#pointer = new ShellPointer(renderer, {
      refine: (target, event) =>
        target.kind === 'region' && target.region === 'diff'
          ? (this.#diffPointerTargetAt(event.x, event.y) ?? target)
          : target,
      activate: target => this.#activatePointerTarget(target),
    });
    this.#selection = new ShellSelection(renderer, {
      copying: () => this.#started && this.#model.state.editor === undefined,
      selected: () => this.#pointer.cancel(),
      copy: (text, announce) =>
        this.#onEffects([{ type: 'copy-text', source: 'review-selection', text, announce }], performance.now()),
    });
  }

  #synchronizeQuestionTextarea(): void {
    if (this.#synchronizingQuestionTextarea) return;
    const textarea = this.#questionTextarea;
    const editor = this.#model.state.editor;
    if (textarea === undefined || editor === undefined) return;
    const wasEmpty = editor.body.length === 0;
    const accepted = this.#model.synchronizeMessageEditor(textarea.plainText, textarea.cursorOffset);
    if (accepted) {
      // The footer's keys differ for an empty draft ([Esc] close) and a typed
      // one ([Esc] discard); redraw only when that flips, not on every key.
      if (wasEmpty !== (editor.body.length === 0)) {
        queueMicrotask(() => {
          if (this.#started) this.render();
        });
      }
      return;
    }

    this.#synchronizingQuestionTextarea = true;
    textarea.setText(editor.body);
    if (editor.cursor >= editor.body.length) textarea.gotoBufferEnd();
    else textarea.cursorOffset = editor.cursor;
    this.#synchronizingQuestionTextarea = false;
    queueMicrotask(() => {
      if (this.#started) this.render();
    });
  }

  #submitQuestionTextarea(): void {
    const textarea = this.#questionTextarea;
    if (textarea === undefined) return;
    this.#synchronizeQuestionTextarea();
    queueMicrotask(() => {
      if (!this.#started || this.#questionTextarea !== textarea || this.#model.state.editor === undefined) {
        return;
      }
      const inputStartedAt = performance.now();
      const effects = this.#model.handleInput(
        {
          name: 'enter',
          ctrl: false,
          alt: false,
          shift: false,
          super: false,
        },
        inputStartedAt,
      );
      this.render();
      this.#onEffects(effects, inputStartedAt);
    });
  }

  #ensureQuestionTextarea(): TextareaRenderable | undefined {
    const editor = this.#model.state.editor;
    if (editor === undefined) return undefined;
    let textarea = this.#questionTextarea;
    if (textarea === undefined || textarea.isDestroyed) {
      textarea = new QuestionTextareaRenderable(this.renderer, {
        id: 'reviewing-question-textarea',
        width: '100%',
        height: 2,
        initialValue: editor.body,
        wrapMode: 'word',
        cursorStyle: { style: 'block', blinking: true },
        keyBindings: [
          { name: 'return', action: 'submit' },
          { name: 'kpenter', action: 'submit' },
          { name: 'linefeed', action: 'submit' },
        ],
        onContentChange: () => this.#synchronizeQuestionTextarea(),
        onCursorChange: () => this.#synchronizeQuestionTextarea(),
        onSubmit: () => this.#submitQuestionTextarea(),
      });
      this.#questionTextarea = textarea;
      if (editor.cursor >= editor.body.length) textarea.gotoBufferEnd();
      else textarea.cursorOffset = editor.cursor;
    } else if (textarea.plainText !== editor.body) {
      this.#synchronizingQuestionTextarea = true;
      textarea.setText(editor.body);
      if (editor.cursor >= editor.body.length) textarea.gotoBufferEnd();
      else textarea.cursorOffset = editor.cursor;
      this.#synchronizingQuestionTextarea = false;
    }
    return textarea;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#roots.start();
    this.renderer.keyInput.on('keypress', this.#onKeyPress);
    this.renderer.keyInput.on('paste', this.#onPaste);
    this.#selection.start();
    this.renderer.on('resize', this.#onResize);
    this.renderer.on('frame', this.#onHighlightFrame);
    this.render();
  }

  render(): void {
    // Layout callbacks can request a replacement while a VNode is mounting.
    // The in-progress tree already reads the current synchronous model state;
    // dropping that nested replacement leaves one unambiguous root owner.
    if (this.#rendering) return;
    this.#rendering = true;
    try {
      this.#renderNow();
    } finally {
      this.#rendering = false;
    }
  }

  #renderNow(): void {
    // Any immediate render already includes the latest queued wheel state.
    this.#wheelRenderDirty = false;
    this.#highlightDirty = false;
    this.#model.setViewport(this.renderer.width, this.renderer.height);
    const colors = theme(this.#model.state);
    this.renderer.setBackgroundColor(this.#model.state.presentation.noColor ? 'transparent' : colors.background);
    const editorRemainsOpen = this.#model.state.editor !== undefined;
    const replaced = this.#roots.retire(() => {
      // The composer survives the swap: it leaves the old tree before that tree retires.
      if (editorRemainsOpen && this.#questionTextarea !== undefined && !this.#questionTextarea.isDestroyed) {
        this.#questionTextarea.blur();
        this.#questionTextarea.parent?.remove(this.#questionTextarea);
      }
    });
    if (replaced && !editorRemainsOpen) this.#questionTextarea = undefined;
    const textarea = this.#ensureQuestionTextarea();
    this.#discussionPage = undefined;
    this.#contentPageSize = undefined;
    this.#roots.mount(
      screen(
        this.#model.state,
        textarea,
        {
          highlight: this.highlight,
          begin: this.#pointer.begin,
          finish: this.#pointer.finish,
          move: this.#movePointer,
          synchronizePaneScroll: this.#synchronizePaneScroll,
          wheelPane: this.#wheelPane,
        },
        this.#captureDiscussionPage,
        size => {
          this.#contentPageSize = size;
        },
      ),
    );
    textarea?.focus();
    this.#roots.present();
    this.onRendered();
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.renderer.keyInput.off('keypress', this.#onKeyPress);
    this.renderer.keyInput.off('paste', this.#onPaste);
    this.#selection.stop();
    this.renderer.off('resize', this.#onResize);
    this.renderer.off('frame', this.#onHighlightFrame);
    this.renderer.off('frame', this.#onWheelRenderFrame);
    if (this.#wheelRenderQueued !== undefined) clearImmediate(this.#wheelRenderQueued);
    this.#glider.stop();
    this.#wheelRenderQueued = undefined;
    this.#wheelFramePending = false;
    this.#wheelRenderDirty = false;
    this.#roots.stop();
    this.#questionTextarea = undefined;
    this.#discussionPage = undefined;
    this.#pointer.cancel();
  }
}

/** The keys row, `?` entries and idle sentence for a state, as the footer and `?` list draw them. */
export function reviewingKeysRow(state: ReviewingApplicationState, width: number): string {
  return keysRow(REVIEWING_KEYS, reviewingFooterMode(state), state, width);
}

export function reviewingKeyList(state: ReviewingApplicationState): readonly KeyListItem[] {
  return keyList(REVIEWING_KEYS, reviewingHelpMode(state), state);
}

export function reviewingFooterSentence(state: ReviewingApplicationState): string | undefined {
  return footerSentence(REVIEWING_KEYS, reviewingFooterMode(state), state);
}
