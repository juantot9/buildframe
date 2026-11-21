import { randomUUID } from 'node:crypto';

import { decodeBytesBase64 } from '@buildframe/workspace/bytes-base64';
import type { WorkspaceCommand, WorkspaceCommandResult } from '@buildframe/workspace';
import type {
  DefaultReviewMessageInspectionView,
  HarnessConnectionView,
  HarnessInvocationIdentity,
  HarnessInvocationView,
  ReviewHarnessInteractionView,
  ReviewMessageLocationInput,
} from '@buildframe/workspace/harness-interaction';
import type {
  ReviewBasesAvailableView,
  ReviewCommitGraphView,
  ReviewComparisonPreviewView,
  ReviewContinuationView,
  ReviewDiffAvailableView,
  ReviewDiffView,
  ReviewLiveDiffView,
  ReviewLiveFileContentView,
  ReviewLiveFilesView,
  ReviewManifestAvailableView,
  ReviewBasisItem,
  ReviewHistoryPoint,
  ReviewHistoryStep,
  ReviewHistoryView,
  ReviewStepChangedFile,
  ReviewStepChangesDiffView,
  ReviewStepChangesView,
  ReviewMessageListItem,
  ReviewMessageOriginView,
  ReviewMessagesAvailableView,
  ReviewProjectedAction,
  ReviewProjectedActionKind,
  ReviewProjectedDiffRow,
  ReviewProjectedQuestionItem,
  ReviewQuestionLocationView,
  ReviewQuestionsAvailableView,
  ReviewSearchItem,
  ReviewSearchPreviewView,
  ReviewSearchView,
  ReviewVersionsAvailableView,
  WorkspaceHomeView,
} from '@buildframe/workspace/projection';
import type {
  ReviewBasisIdentity,
  ReviewIdentity,
  ReviewMessageIdentity,
  ReviewQuestionDraftIdentity,
  ReviewQuestionIdentity,
  ReviewSnapshotIdentity,
} from '@buildframe/workspace/reviewing';
import type { ReviewComparisonSelection } from '@buildframe/workspace/workspace-evidence';

import { fitDisplayCellsEnd } from './displayCells.js';
import { contentWindowContainsLine } from './reviewingContent.js';
import { Key, matchesKey, printableInput, type ReviewingInput } from './reviewingInput.js';
import {
  firstListedFile,
  reviewFileTreeNodes,
  reviewingFiles,
  type ReviewFileTreeNode,
  type ReviewingFileItem,
} from './reviewingFileList.js';
import { routeShellKey, type ShellKeyHost } from './shellInput.js';
import { configurationKey } from './shellConfiguration.js';
import { reviewingSettings } from './reviewingSettings.js';
import { dispatchReviewingKey } from './reviewingActions.js';
import { reasonSentence } from './reviewingReasons.js';
import { outgoingStateSpins, type MessageState, type NoticeTone } from './reviewingStatus.js';
import {
  emptyReviewingPaneScroll,
  scrollReviewingPaneBy,
  scrollWithinOversizedSelection,
  synchronizeReviewingPaneScroll,
  type ReviewingPaneScrollLayout,
  type ReviewingPaneScrollState,
} from './reviewingScroll.js';
import type { ReviewArrangement, ReviewingPreferences, ReviewingThemeDefinition } from './userConfiguration.js';

export const HOME_WINDOW_SIZE = 64;
export const MANIFEST_WINDOW_SIZE = 64;
export const DIFF_WINDOW_SIZE = 64;
/** Rows of one file kept loaded around the view, like an editor buffer; farther windows fall away. */
export const DIFF_KEEP_ROWS: number = DIFF_WINDOW_SIZE * 16;
export const QUESTION_WINDOW_SIZE = 8;
export const VERSION_WINDOW_SIZE = 64;
export const SEARCH_RESULT_WINDOW_SIZE = 64;
/** The Workspace's whole per-Review bound, so every Message of a Review finds its Handoff. */
export const HARNESS_INTERACTION_WINDOW_SIZE = 128;
// The Reviewing loader's windows and bounds.
export const QUESTION_BODY_WINDOW_BYTES: number = 16 * 1024;
export const MESSAGE_BODY_WINDOW_BYTES: number = 16 * 1024;
export const MESSAGE_BODY_LIMIT_BYTES: number = 256 * 1024;
export const REVIEW_BASIS_WINDOW_SIZE = 64;
export const REVIEW_MESSAGE_WINDOW_SIZE = 32;
export const LIVE_FILE_WINDOW_SIZE = 64;
export const MAX_PROJECTION_ATTEMPTS = 5;
const MESSAGE_MAX_BYTES = 256 * 1024;
/** Keys that write a Message or move the Review's own files or saved points; a shown step waits for Esc first. */

/** Outcomes a Message can be written again from: nothing it asked for is still running. */
export const SEND_AGAIN_STATES: ReadonlySet<MessageState> = new Set([
  'failed',
  'not-sent',
  'unknown',
  'interrupted',
  'no-answer',
]);

export type ReviewingLayout = 'wide' | 'balanced' | 'linear';
export type ReviewRegion = 'files' | 'diff' | 'questions';
export type ReviewingFocus = 'home' | ReviewRegion;
export type HomeMode = 'launcher' | 'comparison' | 'history';
export type HomeLauncherSelection = 'primary' | 'new-current' | 'comparison' | 'history';
export type ConfigurationSetting =
  | 'theme'
  | 'background'
  | 'arrangement'
  | 'panes'
  | 'icons'
  | 'header-visibility'
  | 'motion';
export type ReviewComparisonMode = 'commit' | 'range-to-head';
export type ReviewDiffMode = 'inline' | 'side-by-side';
export type ReviewingClipboardSource =
  | 'diff-row'
  | 'message-body'
  | 'message-composer'
  | 'question-body'
  | 'question-composer'
  | 'review-selection';
export type ReviewingClipboardOutcome = 'written' | 'attempted' | 'unavailable';

type ReviewCommitGraphCommit = Extract<
  Extract<ReviewCommitGraphView, { status: 'available' }>['rows'][number],
  { kind: 'commit' }
>;

interface ReviewComparisonValueInputState {
  readonly kind: 'count' | 'revision';
  value: string;
  cursor: number;
  /** The suggested value is replaced by the first character typed, as a selected field would be. */
  suggested?: boolean;
}

interface ReviewComparisonMessageSearchState {
  readonly kind: 'message-search';
  value: string;
  cursor: number;
  matchingCommitIdentities: readonly string[];
  selectedCommitIdentity: string | undefined;
}

export type ReviewComparisonInputState = ReviewComparisonValueInputState | ReviewComparisonMessageSearchState;

export interface ReviewSearchState {
  query: string;
  cursor: number;
  view: ReviewSearchView | undefined;
  selectedResultIdentity: string | undefined;
  loading: boolean;
  preview: ReviewSearchPreviewView | undefined;
  previewResultIdentity: string | undefined;
  previewLoading: boolean;
  requestedResultAbsolute: number | undefined;
}

export interface ReviewingPresentation {
  readonly noColor: boolean;
  readonly ascii: boolean;
  /** Forces instant scrolling whatever the saved preference says (tests, recordings). */
  readonly reducedMotion: boolean;
}

export interface ConfigurationWindowState {
  selected: ConfigurationSetting;
}

export interface ReviewContinuationChoiceState {
  selected: 'saved-endpoint' | 'current-head';
}

export type ReviewSource =
  | {
      readonly kind: 'live';
      readonly liveChangesIdentity: string;
      readonly matchesLatestSnapshot: boolean;
    }
  | {
      readonly kind: 'snapshot';
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly isLatest: boolean;
    };

export interface ReviewViewBundle {
  readonly stateVersion: number;
  readonly source: ReviewSource;
  readonly manifest: ReviewManifestAvailableView;
  readonly diff?: ReviewDiffView | ReviewLiveDiffView;
  readonly versions: ReviewVersionsAvailableView;
  readonly bases: ReviewBasesAvailableView;
  readonly messages: ReviewMessagesAvailableView;
  /** Steps of the Review's history; absent for fixed comparisons. */
  readonly history?: Extract<ReviewHistoryView, { readonly status: 'available' }>;
  readonly liveFiles?: ReviewLiveFilesView;
  readonly questions: ReviewQuestionsAvailableView;
  readonly harnessInteraction: ReviewHarnessInteractionView;
  readonly continuation?: ReviewContinuationView;
}

/** State commits and working-tree edits are independent; neither alone identifies source. */
function sourceKey(
  stateVersion: number,
  reviewIdentity: ReviewIdentity,
  kind: ReviewSource['kind'],
  identity: string,
): string {
  return JSON.stringify([stateVersion, reviewIdentity, kind, identity]);
}

/** Shared by cache lookups and asynchronous prefetch bookkeeping. */
export function reviewingSourceKey(review: ReviewViewBundle): string {
  return sourceKey(
    review.stateVersion,
    review.manifest.header.reviewIdentity,
    review.source.kind,
    review.source.kind === 'live' ? review.source.liveChangesIdentity : review.source.reviewSnapshotIdentity,
  );
}

function diffSourceKey(diff: AvailableReviewDiff): string {
  return diff.kind === 'review.live-diff'
    ? sourceKey(diff.stateVersion, diff.reviewIdentity, 'live', diff.liveChangesIdentity)
    : sourceKey(diff.stateVersion, diff.header.reviewIdentity, 'snapshot', diff.header.reviewSnapshotIdentity);
}

function diffCacheKey(diff: AvailableReviewDiff): string {
  return `${diffSourceKey(diff)}:${diff.file.fileIdentity}`;
}

function contentCacheKey(view: ReviewLiveFileContentView, pathBytesBase64: string): string {
  return `${sourceKey(view.stateVersion, view.reviewIdentity, 'live', view.liveChangesIdentity)}:${pathBytesBase64}`;
}

export interface ReviewLoadTarget {
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly reviewBasisIdentity?: ReviewBasisIdentity;
  readonly versionsOffset?: number;
  readonly liveFilesOffset?: number;
  readonly manifestOffset: number;
  readonly fileIdentity?: string;
  readonly filePathBytesBase64?: string;
  readonly fileAbsolute?: number;
  readonly diffOffset: number;
  /** Exact source line whose row the loaded Diff window must contain. */
  readonly anchorLine?: number;
  readonly messageOffset?: number;
  readonly questionOffset: number;
}

export interface ReviewSelectionHint {
  readonly fileIdentity?: string;
  readonly fileAbsolute?: number;
  readonly rowAbsolute?: number;
  /** Exact source line to select inside the loaded Diff window. */
  readonly anchorLine?: number;
  readonly questionAbsolute?: number;
  readonly messageAbsolute?: number;
}

interface HistoricalReviewBaseContext {
  readonly review: ReviewViewBundle;
  readonly focus: ReviewingFocus;
  readonly balancedContext: 'files' | 'questions';
  readonly selectedFileIdentity: string | undefined;
  readonly selectedRowIdentity: string | undefined;
  readonly selectedQuestionIdentity: ReviewProjectedQuestionItem['itemIdentity'] | undefined;
  readonly expandedQuestionIdentity: ReviewProjectedQuestionItem['itemIdentity'] | undefined;
  readonly selectedQuestionBody:
    | { readonly itemIdentity: ReviewProjectedQuestionItem['itemIdentity']; readonly body: string }
    | undefined;
  readonly questionCardScrollOffset: number;
  readonly anchorSide: 'old' | 'new';
  readonly diffMode: ReviewDiffMode;
  readonly wrapDiffLines: boolean;
  readonly diffHorizontalOffset: number;
  readonly loading: LoadingState | undefined;
  readonly notice: string | undefined;
  readonly showDetails: boolean;
}

interface HistoricalReviewDialogState {
  readonly base: HistoricalReviewBaseContext;
  readonly returnTarget: ReviewLoadTarget;
}

type ReviewingHomePointerTarget =
  | {
      readonly kind: 'home-launcher-choice';
      readonly selection: HomeLauncherSelection;
    }
  | {
      readonly kind: 'home-comparison-commit';
      readonly objectIdentity: string;
    }
  | {
      readonly kind: 'home-history-review';
      readonly reviewIdentity: ReviewIdentity;
    };

/** Renderer-neutral click target inside the bounded Review projection. */
export type ReviewingPointerTarget =
  | ReviewingHomePointerTarget
  | { readonly kind: 'region'; readonly region: ReviewRegion }
  | { readonly kind: 'file'; readonly fileIdentity: string }
  /** A step of the Review's history, by its key. */
  | { readonly kind: 'history-step'; readonly key: string }
  /** Now on the history rail: back to everything since the last commit. */
  | { readonly kind: 'history-now' }
  | {
      readonly kind: 'diff-row';
      readonly rowIdentity: string;
      readonly side: 'old' | 'new';
    }
  | {
      readonly kind: 'message';
      readonly reviewMessageIdentity: ReviewMessageIdentity;
    }
  | {
      readonly kind: 'basis';
      readonly reviewBasisIdentity: ReviewBasisIdentity;
    }
  | {
      readonly kind: 'file-directory';
      readonly directory: string;
    }
  | {
      readonly kind: 'content-line';
      readonly line: number;
    }
  | {
      readonly kind: 'question';
      readonly itemIdentity: ReviewProjectedQuestionItem['itemIdentity'];
    }
  | {
      readonly kind: 'question-card-page';
      readonly offset: number;
    };

export interface CreateMessageEditor {
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly pathBytesBase64: string;
  readonly fileLabel: string;
  readonly line: number;
  body: string;
  cursor: number;
  reselectionRequired: boolean;
  /** The first Esc on a draft with text arms the discard; the second discards. */
  discardArmed?: boolean;
  inspectionRequest?: {
    readonly requestIdentity: string;
    readonly purpose: 'preview' | 'submit';
  };
}

type PendingAction =
  | ReviewProjectedActionKind
  | 'review.message.commit'
  | 'review.basis.git-commit.capture'
  | 'harness.invocation.interruption.request';

type ReviewMessageAuthority = Extract<
  DefaultReviewMessageInspectionView,
  { readonly status: 'available' }
>['capability']['authority'];

interface PendingCommand {
  readonly commandIdentity: string;
  readonly action: PendingAction;
  readonly returnFocus: ReviewingFocus;
  readonly navigateToActiveReview: boolean;
  readonly startedAt: number;
  /** Direct authority of a dispatched Message, for the settlement notice. */
  readonly authority?: ReviewMessageAuthority;
  /** The Invocation an interrupt targets, and how often it already chased a newer State version. */
  readonly interruption?: { readonly invocationIdentity: HarnessInvocationIdentity; readonly attempts: number };
  phase: 'awaiting-result' | 'awaiting-projection' | 'result-unavailable';
  committedStateVersion?: number;
}

export interface PendingReviewShell {
  readonly reviewIdentity?: ReviewIdentity;
  readonly retention: 'current' | 'previous';
  readonly stateVersion: number;
  readonly totalFiles?: number;
}

export interface ProvisionalReviewMessage {
  readonly localIdentity: string;
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly location: {
    readonly pathBytesBase64: string;
    readonly fileLabel: string;
    readonly line: number;
  };
  readonly body: string;
  readonly status:
    | 'inspecting'
    | 'awaiting-confirmation'
    | 'committing'
    | 'saved-awaiting-projection'
    | 'rejected'
    | 'outcome-unknown';
  readonly reviewMessageIdentity?: ReviewMessageIdentity;
  readonly detail?: string;
}

export interface LoadingState {
  readonly label: string;
  readonly region?: ReviewingFocus;
}

/** One stretch of the Review's history shown in place of its Files and Diff. */
export interface ShownStepState {
  readonly from: ReviewHistoryPoint;
  readonly to: ReviewHistoryPoint;
  /** Identifies the stretch in reads and scroll positions. */
  readonly key: string;
  /** Short, for titles: "during #3". */
  readonly label: string;
  /** One sentence for the notice: what this stretch holds and who may have made it. */
  readonly description: string;
  readonly files: readonly ReviewStepChangedFile[] | undefined;
  readonly diff: ReviewDiffAvailableView | undefined;
  /** Why the selected file shows no rows, when it has none to show. */
  readonly diffNote: string | undefined;
  /** The Message whose card the step shows: its own answer's, or one opened on its line. */
  readonly openMessage?: ReviewMessageIdentity | undefined;
  /** What the panes showed before; Esc puts it back. */
  readonly restore: {
    readonly focus: ReviewingFocus;
    readonly selectedFileIdentity: string | undefined;
    readonly selectedDirectory: string | undefined;
    readonly selectedRowIdentity: string | undefined;
  };
}

export interface ReviewingApplicationState {
  width: number;
  height: number;
  layout: ReviewingLayout;
  presentation: ReviewingPresentation;
  screen: 'loading' | 'home' | 'review' | 'failed';
  focus: ReviewingFocus;
  balancedContext: 'files' | 'questions';
  homeMode: HomeMode;
  homeLauncherSelection: HomeLauncherSelection;
  reviewReturn: HomeMode;
  /** Last same-version Home count, retained while a Review is visible. */
  previousReviewCount: number;
  home: WorkspaceHomeView | undefined;
  review: ReviewViewBundle | undefined;
  /** Agents the Workspace knows and which are connected; undefined until first read. */
  harnessConnection: HarnessConnectionView | undefined;
  /** One stretch of history shown in the Files and Diff panes instead of the Review's own. */
  shownStep: ShownStepState | undefined;
  /** Truthful shell shown before one same-version Review bundle materializes. */
  pendingReviewShell: PendingReviewShell | undefined;
  selectedReviewIdentity: ReviewIdentity | undefined;
  selectedFileIdentity: string | undefined;
  selectedRowIdentity: string | undefined;
  selectedMessageIdentity: ReviewMessageIdentity | undefined;
  /** Pointer-only preview; keyboard selection remains authoritative when absent. */
  hoveredMessageIdentity: ReviewMessageIdentity | undefined;
  selectedMessageBody: { readonly reviewMessageIdentity: ReviewMessageIdentity; readonly body: string } | undefined;
  /** Complete immutable Response body for the selected Message, when its preview is truncated. */
  selectedMessageResponseBody:
    | { readonly reviewMessageIdentity: ReviewMessageIdentity; readonly body: string }
    | undefined;
  selectedQuestionIdentity: ReviewProjectedQuestionItem['itemIdentity'] | undefined;
  /** Question whose anchored discussion remains expanded across region focus. */
  expandedQuestionIdentity: ReviewProjectedQuestionItem['itemIdentity'] | undefined;
  selectedQuestionBody:
    | { readonly itemIdentity: ReviewProjectedQuestionItem['itemIdentity']; readonly body: string }
    | undefined;
  /** Visual offset into the selected Hunk-style inline discussion card. */
  questionCardScrollOffset: number;
  anchorSide: 'old' | 'new';
  diffMode: ReviewDiffMode;
  wrapDiffLines: boolean;
  diffHorizontalOffset: number;
  arrangement: ReviewArrangement;
  reviewingTheme: ReviewingThemeDefinition;
  customThemes: readonly ReviewingThemeDefinition[];
  background: ReviewingPreferences['background'];
  /** What the terminal reported about its background; undefined until (or unless) it answers. */
  terminalThemeMode: 'dark' | 'light' | undefined;
  icons: ReviewingPreferences['icons'];
  motion: ReviewingPreferences['motion'];
  header: ReviewingPreferences['header'];
  configurationWindow: ConfigurationWindowState | undefined;
  continuationChoice: ReviewContinuationChoiceState | undefined;
  historicalDialog: HistoricalReviewDialogState | undefined;
  filePaneVisible: boolean;
  /** Only the Diff at every width (the one-pane layout); Files and History are a key away. */
  codeOnly: boolean;
  leftPaneWidth: number;
  rightPaneWidth: number;
  fileScope: 'changed' | 'all';
  /** Collapsed directory prefixes (with trailing slash). */
  collapsedDirectories: readonly string[];
  /** Files-pane selection: a folder node (neo-tree style) or a file. */
  selectedDirectory: string | undefined;
  /** Selected 1-based line in the unchanged-file content view. */
  unchangedContentLine: number;
  /** 0-based index of the first visible content line. */
  unchangedContentOffset: number;
  /** Content lines visible at once, reported by the View. */
  unchangedContentPageSize: number;
  /** Loaded working-tree content for the selected unchanged file, if any. */
  unchangedContent: { readonly pathBytesBase64: string; readonly view: ReviewLiveFileContentView } | undefined;
  activeReviewBasisIdentity: ReviewBasisIdentity | undefined;
  basisPicker: { selectedReviewBasisIdentity: ReviewBasisIdentity } | undefined;
  /** e or m: a short list of files or Messages over the code; Enter jumps, the Diff keeps its width. */
  jumpList: JumpListState | undefined;
  editor: CreateMessageEditor | undefined;
  messagePreview: Extract<DefaultReviewMessageInspectionView, { readonly status: 'available' }> | undefined;
  messageCommitGate: Extract<DefaultReviewMessageInspectionView, { readonly status: 'available' }> | undefined;
  /** Application-local acknowledgement; never a durable projected Message. */
  provisionalMessage: ProvisionalReviewMessage | undefined;
  pending: PendingCommand | undefined;
  loading: LoadingState | undefined;
  notice: string | undefined;
  /** Why the screen failed; it stays while the failed screen does, unlike a status-line notice. */
  failure: string | undefined;
  /** The tone of `notice`; it applies only while the text still matches. */
  noticeTone: { readonly text: string; readonly tone: NoticeTone } | undefined;
  /** Display name of the last coding agent a Message was checked against. */
  agentLabel: string | undefined;
  /** Spinner frame; advances only while something is working. */
  animationFrame: number;
  showDetails: boolean;
  actionLookupOpen: boolean;
  comparisonMode: ReviewComparisonMode;
  comparisonInput: ReviewComparisonInputState | undefined;
  comparisonPreview: ReviewComparisonPreviewView | undefined;
  comparisonRequestedSelection: ReviewComparisonSelection | undefined;
  commitGraph: ReviewCommitGraphView | undefined;
  selectedCommitIdentity: string | undefined;
  selectedMergeParentIdentity: string | undefined;
  search: ReviewSearchState | undefined;
  /** Durable visual positions for rebuilt Files, Diff, and Messages panes. */
  paneScroll: Record<ReviewRegion, ReviewingPaneScrollState>;
}

export type ReviewingModelEffect =
  | { readonly type: 'stop' }
  | {
      readonly type: 'show-home';
      readonly offset: number;
      readonly preferredReviewIdentity?: ReviewIdentity;
      readonly mode?: HomeMode;
    }
  | {
      readonly type: 'show-review';
      readonly target: ReviewLoadTarget;
      readonly selection?: ReviewSelectionHint;
      readonly fromSearch?: boolean;
    }
  | {
      readonly type: 'show-review-diff';
      readonly target: ReviewLoadTarget;
      readonly selection?: ReviewSelectionHint;
    }
  | {
      readonly type: 'preview-file';
      readonly target: ReviewLoadTarget;
      readonly selection?: ReviewSelectionHint;
    }
  | {
      readonly type: 'preview-file-content';
      readonly reviewIdentity: ReviewIdentity;
      readonly liveChangesIdentity: string;
      readonly pathBytesBase64: string;
      readonly anchorLine?: number;
      /** Load around this line while preserving selection where the new window permits it. */
      readonly windowLine?: number;
    }
  | { readonly type: 'load-commit-graph' }
  | {
      readonly type: 'preview-comparison';
      readonly selection: ReviewComparisonSelection;
    }
  | {
      readonly type: 'search-review';
      readonly reviewIdentity: ReviewIdentity;
      readonly query: string;
      readonly offset: number;
    }
  | {
      readonly type: 'preview-search-result';
      readonly reviewIdentity: ReviewIdentity;
      readonly resultIdentity: string;
      readonly fileIdentity: string;
      readonly rowAbsolute: number;
    }
  | {
      readonly type: 'inspect-review-message';
      readonly requestIdentity: string;
      readonly purpose: 'preview' | 'submit';
      readonly reviewIdentity: ReviewIdentity;
      readonly originReviewBasisIdentity: ReviewBasisIdentity;
      readonly location: ReviewMessageLocationInput;
      readonly body: string;
    }
  | {
      readonly type: 'open-review-message-origin';
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly messageAbsolute: number;
    }
  | {
      readonly type: 'load-step-changes';
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
    }
  | {
      readonly type: 'load-step-change-diff';
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
      readonly fileIdentity: string;
      readonly offset: number;
      /** The row to select once loaded; the first change when absent. */
      readonly rowAbsolute?: number;
    }
  | {
      readonly type: 'load-message-body';
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly part: 'message' | 'response';
    }
  | {
      readonly type: 'load-question-discussion';
      readonly reviewIdentity: ReviewIdentity;
      readonly itemIdentity: ReviewProjectedQuestionItem['itemIdentity'];
    }
  | {
      readonly type: 'locate-question';
      readonly reviewIdentity: ReviewIdentity;
      readonly itemIdentity: ReviewProjectedQuestionItem['itemIdentity'];
      readonly questionAbsolute: number;
    }
  | {
      readonly type: 'save-reviewing-preferences';
      readonly preferences: ReviewingPreferences;
    }
  | {
      readonly type: 'copy-text';
      readonly source: ReviewingClipboardSource;
      readonly text: string;
      readonly announce: 'always' | 'failure-only';
    }
  | { readonly type: 'execute'; readonly command: WorkspaceCommand };

/** At most this many moves are kept while a Message saves. */
const HELD_NAVIGATION_LIMIT = 16;
/** Review keys that act on what is on screen, so they wait for a load to finish. */
/** Keys a read-only Snapshot dialog refuses until it is closed. */
const HISTORICAL_REFUSED_KEYS: ReadonlySet<string> = new Set(['c', 's', '/', 'C', '?', '!', '<', '>']);

/** Keys that only move selection or focus, safe to replay once a Message is saved. */
function isHeldNavigation(data: ReviewingInput): boolean {
  if (data.ctrl || data.alt || data.super) return false;
  return (
    matchesKey(data, Key.up) ||
    matchesKey(data, Key.down) ||
    matchesKey(data, Key.pageUp) ||
    matchesKey(data, Key.pageDown) ||
    matchesKey(data, Key.tab) ||
    matchesKey(data, Key.shift('tab')) ||
    (!data.shift && (data.text === 'j' || data.text === 'k' || data.text === '[' || data.text === ']'))
  );
}

/**
 * The Diff keeps at least half the terminal (and never under 32 cells): side
 * panes give way first, so code is not starved beside mostly empty columns.
 */
export function diffMinimumWidth(width: number): number {
  return Math.max(32, Math.ceil(width / 2));
}

function layoutForWidth(width: number): ReviewingLayout {
  if (width >= 120) return 'wide';
  if (width >= 90) return 'balanced';
  return 'linear';
}

const MAX_INTERRUPT_ATTEMPTS = 3;

function commandIdentity(): string {
  return `buildframe-tui-${randomUUID()}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function cycledTarget(current: number, delta: number, total: number): number {
  if (total <= 1) return 0;
  const requested = current + delta;
  if (requested < 0) return total - 1;
  if (requested >= total) return 0;
  return requested;
}

function activeVersion(state: ReviewingApplicationState): number {
  if (state.screen === 'home') return state.home?.stateVersion ?? -1;
  if (state.screen === 'review') return state.review?.stateVersion ?? state.pendingReviewShell?.stateVersion ?? -1;
  return -1;
}

function directAction(
  actions: readonly ReviewProjectedAction[],
  kind: ReviewProjectedActionKind,
): ReviewProjectedAction | undefined {
  return actions.find(action => action.kind === kind);
}

function reviewActions(state: ReviewingApplicationState): readonly ReviewProjectedAction[] {
  return state.review?.manifest.actions ?? [];
}

function questionItem(state: ReviewingApplicationState): ReviewProjectedQuestionItem | undefined {
  return state.review?.questions.list.items.find(item => item.itemIdentity === state.selectedQuestionIdentity);
}

type AvailableReviewDiff = ReviewDiffAvailableView | Extract<ReviewLiveDiffView, { readonly status: 'available' }>;

function diffView(state: ReviewingApplicationState): AvailableReviewDiff | undefined {
  if (state.shownStep !== undefined) return state.shownStep.diff;
  const view = state.review?.diff;
  return view?.status === 'available' ? view : undefined;
}

/**
 * The review points `t` offers. With history, saved points and answer events are
 * reached by stepping, so only "since last commit" and Git commits stay; the
 * point being viewed is kept so the picker always shows where you are.
 */
export function pickableBases(state: ReviewingApplicationState): readonly ReviewBasisItem[] {
  const items = state.review?.bases.bases.items ?? [];
  if (state.review?.history === undefined) return items;
  return items.filter(
    item =>
      item.kind === 'live' ||
      item.kind === 'git-commit' ||
      item.reviewBasisIdentity === state.activeReviewBasisIdentity,
  );
}

/** The Diff the panes show: one stretch of history while it is shown, else the Review's. */
export function shownDiff(state: ReviewingApplicationState): ReviewViewBundle['diff'] {
  return state.shownStep === undefined ? state.review?.diff : state.shownStep.diff;
}

/** The path the shown Diff or unchanged content belongs to, as base64 bytes. */
export function shownFilePath(state: ReviewingApplicationState): string | undefined {
  const changes = state.shownStep;
  if (changes !== undefined) {
    return changes.files?.find(file => file.fileIdentity === state.selectedFileIdentity)?.path.bytesBase64;
  }
  const file = reviewingFiles(state.review, state.fileScope).find(
    candidate => candidate.fileIdentity === state.selectedFileIdentity,
  );
  return file?.pathBytesBase64;
}

/** The Messages anchored on the shown file's lines, by the side of the Diff they belong to. */
export interface LineMessages {
  readonly old: ReadonlyMap<number, readonly ReviewMessageListItem[]>;
  readonly new: ReadonlyMap<number, readonly ReviewMessageListItem[]>;
}

/**
 * Where the shown file's Messages sit. A Message's line is a line of the code
 * as it was when it was sent. At now that is read against the current code; on
 * a past step only a Message sent at one of the step's ends can be placed: on
 * the old side when the step starts at its send, on the new side when it ends
 * there.
 */
export function messagesOnLines(state: ReviewingApplicationState): LineMessages {
  const old = new Map<number, ReviewMessageListItem[]>();
  const next = new Map<number, ReviewMessageListItem[]>();
  const path = shownFilePath(state);
  if (path === undefined) return { old, new: next };
  const step = state.shownStep;
  const sentAt = (point: ReviewHistoryPoint, item: ReviewMessageListItem): boolean =>
    point.kind === 'sent' && point.reviewMessageIdentity === item.reviewMessageIdentity;
  for (const item of state.review?.messages.messages.items ?? []) {
    if (item.location.file.bytesBase64 !== path) continue;
    const side = step === undefined || sentAt(step.to, item) ? next : sentAt(step.from, item) ? old : undefined;
    if (side === undefined) continue;
    const line = side.get(item.location.line);
    if (line === undefined) side.set(item.location.line, [item]);
    else line.push(item);
  }
  return { old, new: next };
}

/** The Messages anchored on one Diff row. */
export function rowMessages(lines: LineMessages, row: ReviewProjectedDiffRow): readonly ReviewMessageListItem[] {
  return [
    ...(row.oldLine === undefined ? [] : (lines.old.get(row.oldLine) ?? [])),
    ...(row.newLine === undefined ? [] : (lines.new.get(row.newLine) ?? [])),
  ];
}

function historyPointKey(point: ReviewHistoryPoint): string {
  return point.kind === 'sent' || point.kind === 'answered'
    ? `${point.kind}:${point.reviewMessageIdentity}`
    : point.kind;
}

export function historyStepKey(from: ReviewHistoryPoint, to: ReviewHistoryPoint): string {
  return `${historyPointKey(from)}>${historyPointKey(to)}`;
}

export interface JumpListState {
  readonly kind: 'files' | 'messages';
  /** The selected row among the rows the filter leaves, by its key. */
  selectedKey: string | undefined;
  /** Typed after /; rows whose text contains it, ignoring case, stay. */
  query: string;
  filtering: boolean;
}

/** One row of a jump list: what Enter opens and the text it shows and filters on. */
export interface JumpListRow {
  readonly key: string;
  readonly text: string;
  /** A state word or count kept whole after the text, in its own tone. */
  readonly tail?: string;
  readonly current: boolean;
}

/** The rows the open jump list shows, after its filter. */
export function jumpListRows(state: ReviewingApplicationState): readonly JumpListRow[] {
  const list = state.jumpList;
  if (list === undefined) return [];
  const rows: JumpListRow[] =
    list.kind === 'files'
      ? state.shownStep !== undefined
        ? (state.shownStep.files ?? []).map(file => ({
            key: file.fileIdentity,
            text: file.path.display,
            tail: file.change,
            current: file.fileIdentity === state.selectedFileIdentity,
          }))
        : jumpFiles(state).map(file => ({
            key: file.fileIdentity,
            text: file.displayPath,
            tail: file.status === 'unchanged' ? '' : file.status,
            current: file.fileIdentity === state.selectedFileIdentity,
          }))
      : (state.review?.messages.messages.items ?? []).map((item, index) => ({
          key: item.reviewMessageIdentity,
          text: `#${(state.review?.messages.messages.offset ?? 0) + index + 1} ${item.location.file.display}:${item.location.line}  ${decodeBytesBase64(item.body.bytesBase64).toString('utf8').split('\n')[0] ?? ''}`,
          tail: messageState(state, item),
          current: item.reviewMessageIdentity === state.selectedMessageIdentity,
        }));
  const query = list.query.trim().toLowerCase();
  return query === '' ? rows : rows.filter(row => row.text.toLowerCase().includes(query));
}

/** The files J and K move through, in the order Files lists them, folders all open. */
function jumpFiles(state: ReviewingApplicationState): readonly ReviewingFileItem[] {
  return reviewFileTreeNodes(reviewingFiles(state.review, state.fileScope), []).flatMap(node =>
    node.kind === 'file' ? [node.file] : [],
  );
}

/**
 * Where the shown file sits among the files J and K move through, as "2 of 7";
 * undefined when there's only one, so the Diff title only says it when it helps.
 */
export function shownFilePosition(
  state: ReviewingApplicationState,
): { readonly position: number; readonly total: number } | undefined {
  const step = state.shownStep;
  if (step !== undefined) {
    const files = step.files ?? [];
    const index = files.findIndex(file => file.fileIdentity === state.selectedFileIdentity);
    return index < 0 || files.length < 2 ? undefined : { position: index + 1, total: files.length };
  }
  const review = state.review;
  if (review === undefined) return undefined;
  const files = jumpFiles(state);
  const index = files.findIndex(file => file.fileIdentity === state.selectedFileIdentity);
  const offset =
    state.fileScope === 'all' && review.liveFiles?.status === 'available'
      ? review.liveFiles.files.offset
      : review.manifest.manifest.offset;
  const total =
    state.fileScope === 'all' && review.liveFiles?.status === 'available'
      ? review.liveFiles.files.total
      : review.manifest.manifest.totalFiles;
  return index < 0 || total < 2 ? undefined : { position: offset + index + 1, total };
}

/** The steps [ and ] visit: those that changed code, oldest first; undefined without history. */
export function navigableHistorySteps(state: ReviewingApplicationState): readonly ReviewHistoryStep[] | undefined {
  return state.review?.history?.steps.filter(step => step.changes.status === 'changed');
}

type HeadMove = NonNullable<ReviewHistoryStep['headMove']>;
type HeadMoveCommit = HeadMove['to'];

/** A commit's short hash, as git prints it by default. */
export function shortHash(commit: HeadMoveCommit): string {
  return commit.objectIdentity.slice(0, 7);
}

/** A commit in a sentence: its subject first, in plain words, then its short hash. */
export function commitName(commit: HeadMoveCommit): string {
  const subject = fitDisplayCellsEnd(commit.subject.trim(), 40, '…');
  return subject === '' ? shortHash(commit) : `“${subject}” (${shortHash(commit)})`;
}

/** A HEAD move in a note: "committed f32adef", "3 commits, newest f32adef", "HEAD moved to f32adef". */
export function headMoveNote(move: HeadMove): string {
  if (move.kind === 'moved') return `HEAD moved to ${shortHash(move.to)}`;
  return move.count === 1 ? `committed ${shortHash(move.to)}` : `${move.count} commits, newest ${shortHash(move.to)}`;
}

/** What happened to HEAD in a step, as one sentence: "“Tidy” (f32adef) was committed during #1." */
export function headMoveSentence(move: HeadMove, label: string): string {
  if (move.kind === 'moved') return `HEAD moved to ${commitName(move.to)} ${label}.`;
  return move.count === 1
    ? `${commitName(move.to)} was committed ${label}.`
    : `${move.count} commits were made ${label}, the newest ${commitName(move.to)}.`;
}

/** The newest step in which HEAD moved; undefined when it never did. */
export function latestHeadMoveStep(state: ReviewingApplicationState): ReviewHistoryStep | undefined {
  return [...(state.review?.history?.steps ?? [])].reverse().find(step => step.headMove !== undefined);
}

/** How a step reads in titles ("during #3") and in its notice; a HEAD move in it leads the notice. */
export function historyStepText(
  step: ReviewHistoryStep,
  messages: readonly ReviewMessageIdentity[],
): { readonly label: string; readonly description: string } {
  const text = historyStepWords(step, messages);
  return step.headMove === undefined
    ? text
    : { ...text, description: `${headMoveSentence(step.headMove, text.label)} ${text.description}` };
}

export function historyStepWords(
  step: ReviewHistoryStep,
  messages: readonly ReviewMessageIdentity[],
): { readonly label: string; readonly description: string } {
  const ordinalOf = (point: ReviewHistoryPoint): number =>
    point.kind === 'sent' || point.kind === 'answered' ? messages.indexOf(point.reviewMessageIdentity) + 1 : 0;
  const ordinals = step.messageOrdinals;
  if (step.kind === 'answer') {
    return {
      label: `during #${ordinals[0]}`,
      description: `Everything that changed while #${ordinals[0]} was answered, by the agent or anyone else.`,
    };
  }
  if (step.kind === 'outside') {
    const label =
      step.to.kind !== 'now'
        ? `before #${ordinalOf(step.to)}`
        : step.from.kind === 'start'
          ? 'outside answers'
          : `after #${ordinalOf(step.from)}`;
    return { label, description: 'Changed outside any answer, most likely by you.' };
  }
  const named = ordinals.length === 1 ? `#${ordinals[0]}` : `#${ordinals[0]}–#${ordinals.at(-1)}`;
  if (step.from.kind === 'sent' && step.to.kind !== 'answered') {
    return {
      label: `since ${named} was sent`,
      description: `Everything that changed since ${named} was sent, by the agent or anyone else. It has no answer yet.`,
    };
  }
  return {
    label: `around ${named}`,
    description: `Everything that changed around ${named}, by the agent or anyone else. BuildFrame didn't keep the code when it was sent, so edits outside the answer are included.`,
  };
}

/** A stretch's before → after rows in the shape the Diff pane already draws. */
function stepChangeDiff(
  review: ReviewViewBundle,
  view: Extract<ReviewStepChangesDiffView, { readonly status: 'available' }>,
): ReviewDiffAvailableView {
  const firstChanged = view.window.rows.findIndex(row => row.kind !== 'context');
  return {
    kind: 'review.diff',
    status: 'available',
    projectionVersion: view.projectionVersion,
    stateVersion: view.stateVersion,
    header: review.manifest.header,
    file: { fileIdentity: view.file.fileIdentity, status: view.file.change, displayPath: view.file.path.display },
    ...(view.window.offset === 0 && firstChanged >= 0 ? { firstChangedRow: firstChanged } : {}),
    window: view.window,
    actions: [],
  };
}

/** The window that holds the selected row, so a reload lands where the user is. */
function diffReloadOffset(state: ReviewingApplicationState): number {
  const view = diffView(state);
  if (view === undefined) return 0;
  const local = view.window.rows.findIndex(row => row.rowIdentity === state.selectedRowIdentity);
  if (local < 0) return view.window.offset;
  return Math.floor((view.window.offset + local) / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE;
}

export function diffRow(state: ReviewingApplicationState): ReviewProjectedDiffRow | undefined {
  return diffView(state)?.window.rows.find(row => row.rowIdentity === state.selectedRowIdentity);
}

/**
 * A first selection lands on the current code: when it would start on deleted
 * lines that are followed by their replacement, it moves to the first added
 * line, so pressing a composes on the new side straight away.
 */
function preferCurrentSide(rows: readonly ReviewProjectedDiffRow[], index: number): ReviewProjectedDiffRow | undefined {
  for (let candidate = index; candidate < rows.length; candidate += 1) {
    const row = rows[candidate]!;
    if (row.kind === 'addition') return row;
    if (row.kind !== 'deletion') break;
  }
  return rows[index];
}

export function messageInvocation(
  state: ReviewingApplicationState,
  item: ReviewMessageListItem,
): HarnessInvocationView | undefined {
  const interaction = state.review?.harnessInteraction;
  const handoff = interaction?.handoffs.find(
    candidate => candidate.reviewMessageIdentity === item.reviewMessageIdentity,
  );
  if (handoff === undefined) return undefined;
  return interaction?.invocations.find(candidate => candidate.handoffIdentity === handoff.handoffIdentity);
}

/** A running turn the user asked to stop and the Harness has not yet ended. */
export function messageInterrupting(invocation: HarnessInvocationView | undefined): boolean {
  return (
    (invocation?.status === 'awaiting-start' || invocation?.status === 'active') &&
    invocation.interruptionIntentIdentities.length > 0
  );
}

/** How a sent Message stands; the list, the card and the spinner all read this. */
export function messageState(state: ReviewingApplicationState, item: ReviewMessageListItem): MessageState {
  if (item.response !== undefined) return 'answered';
  const invocation = messageInvocation(state, item);
  // Without its Handoff on screen nothing is known about the turn; never claim one.
  if (invocation === undefined) return 'not-loaded';
  if (messageInterrupting(invocation)) return 'stopping';
  switch (invocation.status) {
    case 'awaiting-start':
      return 'waiting';
    case 'active':
      return 'working';
    case 'interrupted':
      return 'interrupted';
    case 'failed':
      return 'failed';
    case 'rejected':
      return 'not-sent';
    case 'unresolved':
      return 'unknown';
    case 'ended-normally':
      return 'no-answer';
  }
}

function messageItem(state: ReviewingApplicationState): ReviewMessageListItem | undefined {
  return state.review?.messages.messages.items.find(
    item => item.reviewMessageIdentity === state.selectedMessageIdentity,
  );
}

/** The Messages pane is called History once a Review has history to step through. */
export function messagesPaneName(state: ReviewingApplicationState): 'Messages' | 'History' {
  return state.review?.history === undefined ? 'Messages' : 'History';
}

/** `#3`: a Message's number in its Review, as the list and the status line show it. */
function messageOrdinal(state: ReviewingApplicationState, item: ReviewMessageListItem): string {
  const list = state.review?.messages.messages;
  const index =
    list?.items.findIndex(candidate => candidate.reviewMessageIdentity === item.reviewMessageIdentity) ?? -1;
  return index < 0 || list === undefined ? 'This Message' : `#${list.offset + index + 1}`;
}

function actionNotice(action: ReviewProjectedAction): string {
  if (action.blockers.length === 0) return 'That isn’t available right now.';
  return action.blockers.map(item => reasonSentence(item.code)).join(' ');
}

/** The status line's tone; untagged text reads as plain information. */
export function noticeToneOf(state: ReviewingApplicationState): NoticeTone {
  const notice = state.notice;
  return notice !== undefined && state.noticeTone?.text === notice ? state.noticeTone.tone : 'info';
}

/** The coding agent's name for sentences, e.g. "Claude Code"; generic until one is known. */
export function agentName(state: ReviewingApplicationState): string {
  return state.agentLabel ?? 'The agent';
}

/** Whether a coding agent is live now; previewing needs one to inspect against. */
export function agentConnected(state: ReviewingApplicationState): boolean {
  return state.harnessConnection?.harnesses.some(harness => harness.connected) === true;
}

/** Enter as a key press, for pointer actions that mean the same thing. */
const ENTER_INPUT: ReviewingInput = Object.freeze({
  name: 'enter',
  ctrl: false,
  alt: false,
  shift: false,
  super: false,
});

/** Why a comparison can't be shown, in plain words, with the way on where there is one. */
export function comparisonUnavailableNotice(
  reason: Extract<ReviewComparisonPreviewView, { status: 'unavailable' }>['reason'],
): string {
  if (reason === 'merge-parent-ambiguous') {
    return 'A merge has two parents. [h/l] picks which one to compare against.';
  }
  if (reason === 'ancestry-not-found') {
    return 'This repository doesn’t have that many commits before HEAD.';
  }
  if (reason === 'revision-not-found' || reason === 'local-ref-not-found') {
    return 'No commit, branch or tag by that name here.';
  }
  return 'Git couldn’t compare that here.';
}

/** Human sentence for a refused Message inspection. */
function messageUnavailableNotice(
  reason: Extract<DefaultReviewMessageInspectionView, { status: 'unavailable' }>['reason'],
  agent: string,
): string {
  return `Not sent. ${reasonSentence(reason, agent)}`;
}

export class ReviewingApplicationModel {
  readonly state: ReviewingApplicationState;

  /** The selected Diff row, once it is loaded. */
  get selectedDiffRow(): ReviewProjectedDiffRow | undefined {
    return diffRow(this.state);
  }
  /** Moves typed while a Message saved locally, replayed once it is saved. */
  readonly #heldNavigation: ReviewingInput[] = [];
  /** The HEAD moves already said for the open Review, so a reload never says one twice or swallows it. */
  #announcedHeadMoves: { readonly reviewIdentity: string; readonly targets: Set<string> } | undefined;

  /**
   * The sentence for a HEAD move this Review hasn't announced yet. Opening a
   * Review counts its earlier moves as known, so only a move seen happening is said.
   */
  #announceHeadMove(bundle: ReviewViewBundle): { readonly text: string; readonly tone: NoticeTone } | undefined {
    const steps = bundle.history?.steps ?? [];
    const target = (step: ReviewHistoryStep): string | undefined =>
      step.headMove === undefined ? undefined : historyStepKey(step.from, step.to) + step.headMove.to.objectIdentity;
    const reviewIdentity = bundle.manifest.header.reviewIdentity;
    const known = this.#announcedHeadMoves;
    if (known?.reviewIdentity !== reviewIdentity) {
      this.#announcedHeadMoves = {
        reviewIdentity,
        targets: new Set(steps.flatMap(step => target(step) ?? [])),
      };
      return undefined;
    }
    const fresh = steps.filter(step => {
      const key = target(step);
      return key !== undefined && !known.targets.has(key);
    });
    for (const step of fresh) known.targets.add(target(step)!);
    const step = fresh.at(-1);
    if (step?.headMove === undefined) return undefined;
    const sentence = headMoveSentence(step.headMove, historyStepWords(step, bundle.history?.messages ?? []).label);
    const way = step.changes.status === 'changed' ? ' [ and ] history shows what changed.' : '';
    return { text: `${sentence}${way}`, tone: step.headMove.kind === 'moved' ? 'warning' : 'info' };
  }
  /**
   * The file Enter asked for to reach a Message: asked for once, and only
   * called missing after a load for that path has landed.
   */
  #messageFileRequest: { readonly path: string; landed: boolean } | undefined;
  /** Where Enter is taking you, said once the Message's line is on screen. */
  #landingNotice: string | undefined;
  /** The Message r is reopening once its file, outside the loaded Files list, has loaded. */
  #sendAgainRequest: ReviewMessageIdentity | undefined;
  /** Diff windows keyed by exact Review source and file; entry eviction is a separate policy. */
  readonly #diffCache = new Map<string, AvailableReviewDiff>();
  /** Working-tree content keyed by exact live Review source and path. */
  readonly #contentCache = new Map<string, ReviewLiveFileContentView>();
  #cacheSourceKey: string | undefined;
  /** Preserve position during replacement loads without keeping stale bytes on screen. */
  #unchangedContentReload:
    | { readonly reviewIdentity: ReviewIdentity; readonly pathBytesBase64: string; readonly line: number }
    | undefined;

  #synchronizeSourceCaches(review: ReviewViewBundle): void {
    const key = reviewingSourceKey(review);
    if (key === this.#cacheSourceKey) return;
    // Giving live edits distinct keys must not retain every superseded source.
    this.#diffCache.clear();
    this.#contentCache.clear();
    this.#cacheSourceKey = key;
  }

  constructor(presentation: Partial<ReviewingPresentation> = {}) {
    this.state = {
      width: 80,
      height: 24,
      layout: 'linear',
      presentation: {
        noColor: presentation.noColor ?? false,
        ascii: presentation.ascii ?? false,
        reducedMotion: presentation.reducedMotion ?? false,
      },
      screen: 'loading',
      focus: 'home',
      balancedContext: 'files',
      homeMode: 'launcher',
      homeLauncherSelection: 'primary',
      reviewReturn: 'launcher',
      previousReviewCount: 0,
      home: undefined,
      review: undefined,
      pendingReviewShell: undefined,
      selectedReviewIdentity: undefined,
      selectedFileIdentity: undefined,
      selectedRowIdentity: undefined,
      selectedMessageIdentity: undefined,
      hoveredMessageIdentity: undefined,
      selectedMessageBody: undefined,
      selectedMessageResponseBody: undefined,
      selectedQuestionIdentity: undefined,
      expandedQuestionIdentity: undefined,
      selectedQuestionBody: undefined,
      questionCardScrollOffset: 0,
      anchorSide: 'new',
      diffMode: 'inline',
      wrapDiffLines: true,
      diffHorizontalOffset: 0,
      arrangement: 'workspace',
      reviewingTheme: Object.freeze({
        inherits: 'match-terminal',
        colors: Object.freeze({}),
      }),
      customThemes: Object.freeze([]),
      background: 'theme',
      terminalThemeMode: undefined,
      icons: 'text',
      motion: 'smooth',
      header: Object.freeze({
        visible: true,
      }),
      configurationWindow: undefined,
      continuationChoice: undefined,
      historicalDialog: undefined,
      filePaneVisible: true,
      codeOnly: false,
      leftPaneWidth: 34,
      rightPaneWidth: 40,
      fileScope: 'changed',
      collapsedDirectories: Object.freeze([]),
      selectedDirectory: undefined,
      unchangedContentLine: 1,
      unchangedContentOffset: 0,
      unchangedContentPageSize: 20,
      unchangedContent: undefined,
      activeReviewBasisIdentity: undefined,
      basisPicker: undefined,
      jumpList: undefined,
      editor: undefined,
      messagePreview: undefined,
      messageCommitGate: undefined,
      provisionalMessage: undefined,
      pending: undefined,
      loading: { label: 'Opening Home' },
      notice: undefined,
      failure: undefined,
      noticeTone: undefined,
      agentLabel: undefined,
      animationFrame: 0,
      showDetails: false,
      actionLookupOpen: false,
      comparisonMode: 'commit',
      comparisonInput: undefined,
      comparisonPreview: undefined,
      comparisonRequestedSelection: undefined,
      commitGraph: undefined,
      selectedCommitIdentity: undefined,
      selectedMergeParentIdentity: undefined,
      search: undefined,
      harnessConnection: undefined,
      shownStep: undefined,
      paneScroll: {
        files: emptyReviewingPaneScroll(),
        diff: emptyReviewingPaneScroll(),
        questions: emptyReviewingPaneScroll(),
      },
    };
  }

  setHarnessConnection(view: HarnessConnectionView): void {
    this.state.harnessConnection = view;
    const connected = view.harnesses.find(harness => harness.connected);
    if (connected !== undefined) this.state.agentLabel = connected.harnessLabel;
  }

  setViewport(width: number, height: number): void {
    this.state.width = Math.max(30, width);
    this.state.height = Math.max(12, height);
    this.state.layout = this.state.codeOnly ? 'linear' : layoutForWidth(this.state.width);
  }

  /**
   * The next Diff window to read so the view never reaches an edge while the
   * file has more rows: within two screens of the loaded end, read the next one.
   */
  diffPrefetch(): { readonly fileIdentity: string; readonly offset: number } | undefined {
    if (this.state.screen !== 'review' || this.state.pending !== undefined) return undefined;
    const view = diffView(this.state);
    const scroll = this.state.paneScroll.diff;
    if (view === undefined || !scroll.contentKey.startsWith('reviewing-diff:')) return undefined;
    const margin = Math.max(16, scroll.viewportSize * 2);
    const end = view.window.offset + view.window.rows.length;
    if (end < view.window.totalRows && scroll.offset + scroll.viewportSize + margin >= scroll.contentSize) {
      return { fileIdentity: view.file.fileIdentity, offset: end };
    }
    if (view.window.offset > 0 && scroll.offset <= margin) {
      return { fileIdentity: view.file.fileIdentity, offset: Math.max(0, view.window.offset - DIFF_WINDOW_SIZE) };
    }
    return undefined;
  }

  /**
   * Joins one more window onto the loaded Diff rows. Only an adjacent window
   * of the same file and exact source joins; anything else is dropped and
   * the next refresh reads afresh. Far rows fall away beyond DIFF_KEEP_ROWS.
   */
  extendDiff(page: AvailableReviewDiff, shownStepKey?: string): boolean {
    const current = diffView(this.state);
    const review = this.state.review;
    if (
      review === undefined ||
      current === undefined ||
      diffCacheKey(page) !== diffCacheKey(current) ||
      this.state.shownStep?.key !== shownStepKey ||
      page.window.rows.length === 0
    ) {
      return false;
    }
    const currentEnd = current.window.offset + current.window.rows.length;
    const pageEnd = page.window.offset + page.window.rows.length;
    if (page.window.offset > currentEnd || pageEnd < current.window.offset) return false;
    if (page.window.offset >= current.window.offset && pageEnd <= currentEnd) return false;
    const byOrdinal = new Map<number, ReviewProjectedDiffRow>();
    current.window.rows.forEach((row, index) => byOrdinal.set(current.window.offset + index, row));
    page.window.rows.forEach((row, index) => byOrdinal.set(page.window.offset + index, row));
    let offset = Math.min(current.window.offset, page.window.offset);
    let rows = Array.from({ length: Math.max(currentEnd, pageEnd) - offset }, (_, index) =>
      byOrdinal.get(offset + index)!,
    );
    const appended = pageEnd > currentEnd;
    if (rows.length > DIFF_KEEP_ROWS) {
      const excess = Math.ceil((rows.length - DIFF_KEEP_ROWS) / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE;
      if (appended) {
        rows = rows.slice(excess);
        offset += excess;
      } else {
        rows = rows.slice(0, rows.length - excess);
      }
      // A selection that fell away moves to the row at the top of the view, so
      // following it never pulls a wheel-scrolled view back; else the nearest kept row.
      if (!rows.some(row => row.rowIdentity === this.state.selectedRowIdentity)) {
        const scroll = this.state.paneScroll.diff;
        const topOrdinal =
          scroll.contentKey.startsWith('reviewing-diff:') && scroll.anchorKey !== undefined
            ? Number(scroll.anchorKey) + (scroll.anchorDelta > 0 ? 1 : 0)
            : Number.NaN;
        const inView = Number.isInteger(topOrdinal) ? rows[topOrdinal - offset] : undefined;
        const kept = inView ?? (appended ? rows[0] : rows.at(-1));
        this.state.selectedRowIdentity = kept?.rowIdentity;
        this.state.anchorSide = kept?.newLine !== undefined ? 'new' : 'old';
      }
    }
    const end = offset + rows.length;
    const merged = {
      ...current,
      window: { ...current.window, offset, rows, nextOffset: end < current.window.totalRows ? end : null },
    } as AvailableReviewDiff;
    const changes = this.state.shownStep;
    if (changes !== undefined) {
      if (merged.kind !== 'review.diff') return false;
      this.state.shownStep = { ...changes, diff: merged };
      return true;
    }
    this.state.review = { ...review, diff: merged };
    this.#synchronizeSourceCaches(review);
    this.#diffCache.set(diffCacheKey(merged), merged);
    return true;
  }

  /** The next rows of a shown stretch, in the Diff pane's own shape. */
  stepChangeDiffPage(view: ReviewStepChangesDiffView): AvailableReviewDiff | undefined {
    const review = this.state.review;
    const changes = this.state.shownStep;
    return review === undefined ||
      changes === undefined ||
      view.status !== 'available' ||
      view.reviewIdentity !== review.manifest.header.reviewIdentity ||
      view.stateVersion !== review.stateVersion ||
      historyStepKey(view.from, view.to) !== changes.key
      ? undefined
      : stepChangeDiff(review, view);
  }

  /**
   * [ and ]: one step back or forward through the history's steps that
   * changed code. Past the newest step is now again. A Review without history
   * (a fixed comparison) walks its saved Versions instead.
   */
  moveStep(delta: -1 | 1, keepFocus = false): readonly ReviewingModelEffect[] {
    const steps = navigableHistorySteps(this.state);
    if (steps === undefined) return this.moveVersion(delta);
    const shownKey = this.state.shownStep?.key;
    const shown =
      shownKey === undefined ? -1 : steps.findIndex(step => historyStepKey(step.from, step.to) === shownKey);
    const target = (shown < 0 ? steps.length : shown) + delta;
    if (target >= steps.length) {
      if (this.state.shownStep !== undefined) {
        this.closeShownStep();
        const move = latestHeadMoveStep(this.state)?.headMove;
        this.say(
          `Back to now: everything since ${move === undefined ? 'the last commit' : shortHash(move.to)}.`,
          'info',
        );
      } else {
        this.say('Already at now. Press [ to step back through the changes.', 'info');
      }
      return [];
    }
    const step = steps[target];
    if (step === undefined) {
      this.say(steps.length === 0 ? 'No code has changed in this Review yet.' : 'This is the oldest change.', 'info');
      return [];
    }
    return this.showHistoryStep(step, keepFocus);
  }

  private showHistoryStep(step: ReviewHistoryStep, keepFocus = false): readonly ReviewingModelEffect[] {
    const history = this.state.review?.history;
    if (history === undefined) return [];
    const focus = this.state.focus;
    // The Message whose answer this is becomes the selected one in History.
    const answered = step.to.kind === 'answered' ? step.to.reviewMessageIdentity : undefined;
    if (answered !== undefined) this.state.selectedMessageIdentity = answered;
    const { label, description } = historyStepText(step, history.messages);
    const effects = this.showStep(step.from, step.to, label, description);
    if (answered !== undefined && this.state.shownStep !== undefined) {
      this.state.shownStep = { ...this.state.shownStep, openMessage: answered };
    }
    if (keepFocus) this.state.focus = focus;
    return effects;
  }

  /** Shows one stretch of history in the Files and Diff panes; Esc goes back. */
  private showStep(
    from: ReviewHistoryPoint,
    to: ReviewHistoryPoint,
    label: string,
    description: string,
  ): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined) return [];
    const restore = this.state.shownStep?.restore ?? {
      focus: this.state.focus,
      selectedFileIdentity: this.state.selectedFileIdentity,
      selectedDirectory: this.state.selectedDirectory,
      selectedRowIdentity: this.state.selectedRowIdentity,
    };
    this.state.shownStep = {
      from,
      to,
      key: historyStepKey(from, to),
      label,
      description,
      files: undefined,
      diff: undefined,
      diffNote: undefined,
      restore,
    };
    this.state.focus = 'diff';
    this.state.selectedDirectory = undefined;
    this.state.selectedRowIdentity = undefined;
    this.setLoading(`Loading what changed ${label}`, 'diff');
    return [{ type: 'load-step-changes', reviewIdentity: review.manifest.header.reviewIdentity, from, to }];
  }

  /** Esc: back to the Review's own Files and Diff, where they were. */
  private closeShownStep(): void {
    const changes = this.state.shownStep;
    if (changes === undefined) return;
    this.state.shownStep = undefined;
    this.state.focus = changes.restore.focus;
    this.state.selectedFileIdentity = changes.restore.selectedFileIdentity;
    this.state.selectedDirectory = changes.restore.selectedDirectory;
    this.state.selectedRowIdentity = changes.restore.selectedRowIdentity;
    this.state.loading = undefined;
  }

  /**
   * Applies a Review update while "Changes from #N" is open: the update moves the
   * Review's own selection, which Esc restores, and the changes view stays as it is.
   */
  private updateUnderneathShownStep<T>(update: () => T): T {
    const changes = this.state.shownStep;
    if (changes === undefined) return update();
    const shown = {
      focus: this.state.focus,
      selectedFileIdentity: this.state.selectedFileIdentity,
      selectedDirectory: this.state.selectedDirectory,
      selectedRowIdentity: this.state.selectedRowIdentity,
      anchorSide: this.state.anchorSide,
      loading: this.state.loading,
    };
    this.state.shownStep = undefined;
    this.state.focus = changes.restore.focus;
    this.state.selectedFileIdentity = changes.restore.selectedFileIdentity;
    this.state.selectedDirectory = changes.restore.selectedDirectory;
    this.state.selectedRowIdentity = changes.restore.selectedRowIdentity;
    const result = update();
    this.state.shownStep = {
      ...changes,
      restore: {
        focus: this.state.focus,
        selectedFileIdentity: this.state.selectedFileIdentity,
        selectedDirectory: this.state.selectedDirectory,
        selectedRowIdentity: this.state.selectedRowIdentity,
      },
    };
    Object.assign(this.state, shown);
    return result;
  }

  applyStepChanges(view: ReviewStepChangesView): readonly ReviewingModelEffect[] {
    const changes = this.state.shownStep;
    const review = this.state.review;
    if (changes === undefined || review === undefined || historyStepKey(view.from, view.to) !== changes.key) {
      return [];
    }
    if (view.status !== 'available') {
      this.closeShownStep();
      this.say(
        view.reason === 'commit-moved'
          ? `A commit was made ${changes.label}, so its changes can't be shown on their own.`
          : `BuildFrame didn't keep the code needed to show what changed ${changes.label}.`,
        'info',
      );
      return [];
    }
    const first = view.files.items[0];
    this.state.shownStep = { ...changes, files: view.files.items };
    if (first === undefined) {
      this.closeShownStep();
      this.say(`No code changed ${changes.label}.`, 'info');
      return [];
    }
    const effects = this.selectChangedFile(first.fileIdentity);
    this.say(changes.description, 'info');
    return effects;
  }

  applyStepChangeDiff(view: ReviewStepChangesDiffView, rowAbsolute: number | undefined): void {
    const changes = this.state.shownStep;
    const review = this.state.review;
    if (
      changes === undefined ||
      review === undefined ||
      historyStepKey(view.from, view.to) !== changes.key ||
      (view.status === 'available' ? view.file.fileIdentity : view.fileIdentity) !== this.state.selectedFileIdentity
    ) {
      return;
    }
    this.state.loading = undefined;
    if (view.status !== 'available') {
      const note =
        view.reason === 'not-text'
          ? 'This file is not text, so there are no lines to show.'
          : view.reason === 'comparison-limit'
            ? 'This file changed too much to show line by line.'
            : 'The contents of this file were not kept, so its lines cannot be shown.';
      this.state.shownStep = { ...changes, diff: undefined, diffNote: note };
      return;
    }
    const diff = stepChangeDiff(review, view);
    this.state.shownStep = { ...changes, diff, diffNote: undefined };
    const local =
      rowAbsolute === undefined
        ? (diff.firstChangedRow ?? 0)
        : clamp(rowAbsolute - view.window.offset, 0, view.window.rows.length - 1);
    const row = view.window.rows[local];
    this.state.selectedRowIdentity = row?.rowIdentity;
    this.state.anchorSide = row?.newLine !== undefined ? 'new' : 'old';
  }

  private selectChangedFile(fileIdentity: string): readonly ReviewingModelEffect[] {
    const changes = this.state.shownStep;
    const review = this.state.review;
    if (changes === undefined || review === undefined) return [];
    this.state.selectedFileIdentity = fileIdentity;
    this.state.selectedRowIdentity = undefined;
    this.state.shownStep = { ...changes, diff: undefined, diffNote: undefined };
    this.setLoading('Loading Diff rows', 'diff');
    return [
      {
        type: 'load-step-change-diff',
        reviewIdentity: review.manifest.header.reviewIdentity,
        from: changes.from,
        to: changes.to,
        fileIdentity,
        offset: 0,
      },
    ];
  }

  private moveChangedFile(delta: number, bounded = false): readonly ReviewingModelEffect[] {
    const files = this.state.shownStep?.files ?? [];
    if (files.length === 0) return [];
    const current = Math.max(
      0,
      files.findIndex(file => file.fileIdentity === this.state.selectedFileIdentity),
    );
    const target = bounded ? clamp(current + delta, 0, files.length - 1) : cycledTarget(current, delta, files.length);
    const file = files[target];
    if (file === undefined || target === current) return [];
    return this.selectChangedFile(file.fileIdentity);
  }

  /**
   * A refresh of the same exact source keeps the wider window already joined
   * for it. A new Live Changes or Snapshot identity must always start afresh.
   */
  #widenDiff<T extends ReviewViewBundle['diff']>(diff: T): T | AvailableReviewDiff {
    if (diff?.status !== 'available') return diff;
    const cached = this.#diffCache.get(diffCacheKey(diff));
    if (cached === undefined || cached.kind !== diff.kind) return diff;
    const start = diff.window.offset;
    const end = start + diff.window.rows.length;
    const cachedEnd = cached.window.offset + cached.window.rows.length;
    return cached.window.offset <= start && end <= cachedEnd && cached.window.rows.length > diff.window.rows.length
      ? cached
      : diff;
  }

  /** A key press or click hands the view back to the selection after wheel scrolling. */
  private followSelection(): void {
    for (const region of ['files', 'diff', 'questions'] as const) {
      const scroll = this.state.paneScroll[region];
      if (!scroll.followSelection) this.state.paneScroll[region] = { ...scroll, followSelection: true };
    }
  }

  /** Whether pane scrolling eases; the saved preference unless presentation forces it off. */
  smoothScrolling(): boolean {
    return this.state.motion === 'smooth' && !this.state.presentation.reducedMotion;
  }

  /** Reconciles exact View geometry with the model-owned pane position. */
  synchronizePaneScroll(region: ReviewRegion, layout: ReviewingPaneScrollLayout): ReviewingPaneScrollState {
    const scroll = synchronizeReviewingPaneScroll(this.state.paneScroll[region], layout);
    this.state.paneScroll[region] = scroll;
    return scroll;
  }

  /** Reconciles the independently scrollable selected-Message detail. */
  /** Mouse wheel follows logical selection; oversized selected rows scroll in place first. */
  handlePaneWheel(region: ReviewRegion, direction: -1 | 1, rows = 3): readonly ReviewingModelEffect[] {
    if (
      this.state.screen !== 'review' ||
      this.state.review === undefined ||
      this.state.pending !== undefined ||
      this.state.editor !== undefined ||
      this.state.search !== undefined ||
      this.state.configurationWindow !== undefined ||
      this.state.continuationChoice !== undefined ||
      this.state.basisPicker !== undefined ||
      this.state.jumpList !== undefined ||
      this.state.actionLookupOpen
    ) {
      return [];
    }
    this.state.focus = region;
    if (region === 'files' || region === 'questions') this.state.balancedContext = region;
    // The wheel moves the view and leaves the selection alone. Only at the
    // edge of the loaded rows does it move the selection, which loads more.
    const view = scrollReviewingPaneBy(this.state.paneScroll[region], direction, rows);
    if (view.moved) {
      this.state.paneScroll[region] = view.state;
      return [];
    }
    if (region === 'diff') {
      const file = this.selectedFileEntry();
      const content = this.state.unchangedContent?.view;
      if (file?.status === 'unchanged' && content?.status === 'available') {
        const next =
          direction > 0 ? content.content.firstLine + content.content.lineCount : content.content.firstLine - 1;
        if (next >= 1 && next <= content.content.totalLines) {
          return this.previewUnchangedFile(file, undefined, next);
        }
      }
      // Diff rows arrive by prefetch; only the real end stops its wheel.
      return [];
    }
    // Files and Messages still load in windows: step just past the loaded edge
    // so the next window opens where the view already is.
    if (region === 'files') {
      const nodes = this.visibleTreeNodes();
      const current = Math.max(0, this.findNodeIndex(nodes));
      return this.moveFile(direction > 0 ? nodes.length - current : -current - 1, true);
    }
    const messages = this.state.review.messages.messages;
    if (messages.total > 0) {
      const current = Math.max(
        0,
        messages.items.findIndex(item => item.reviewMessageIdentity === this.state.selectedMessageIdentity),
      );
      return this.moveMessage(direction > 0 ? messages.items.length - current : -current - 1, true);
    }
    return this.moveQuestion(direction, true);
  }

  /** Pointer hover changes presentation only; keyboard selection remains intact. */
  hoverMessage(reviewMessageIdentity: ReviewMessageIdentity | undefined): boolean {
    const hovered =
      reviewMessageIdentity !== undefined &&
      this.state.screen === 'review' &&
      this.state.review?.messages.messages.items.some(item => item.reviewMessageIdentity === reviewMessageIdentity)
        ? reviewMessageIdentity
        : undefined;
    if (hovered === this.state.hoveredMessageIdentity) return false;
    this.state.hoveredMessageIdentity = hovered;
    return true;
  }

  applyReviewingPreferences(
    preferences: ReviewingPreferences,
    customThemes: readonly ReviewingThemeDefinition[] = Object.freeze([]),
  ): void {
    this.state.arrangement = preferences.arrangement;
    this.state.reviewingTheme = preferences.theme;
    this.state.customThemes = customThemes;
    this.state.background = preferences.background;
    this.state.icons = preferences.icons;
    this.state.motion = preferences.motion;
    this.state.header = preferences.header;
    this.state.filePaneVisible = preferences.filesVisible;
    this.state.codeOnly = preferences.codeOnly;
    this.setViewport(this.state.width, this.state.height);
    this.state.leftPaneWidth = preferences.filesPaneWidth;
    this.state.rightPaneWidth = preferences.questionsPaneWidth;
    if (!this.state.filePaneVisible && this.state.focus === 'files') {
      this.state.focus = 'diff';
    }
    if (!this.state.filePaneVisible && this.state.balancedContext === 'files') {
      this.state.balancedContext = 'questions';
    }
  }

  /** Records the terminal's light/dark report; true when the shown theme may change. */
  setTerminalThemeMode(mode: 'dark' | 'light' | undefined): boolean {
    if (this.state.terminalThemeMode === mode) return false;
    this.state.terminalThemeMode = mode;
    return true;
  }

  /** Set the status line; the tone picks its symbol, colour and how long it stays. */
  say(text: string, tone: NoticeTone = 'info'): void {
    this.state.notice = text;
    this.state.noticeTone = { text, tone };
  }

  /** Whether anything on screen is working, so a spinner should keep moving. */
  animating(): boolean {
    const state = this.state;
    if (state.pending !== undefined && state.pending.phase !== 'result-unavailable') return true;
    if (state.provisionalMessage !== undefined && outgoingStateSpins(state.provisionalMessage.status)) return true;
    if (state.screen !== 'review') return false;
    return (
      state.review?.harnessInteraction.invocations.some(
        invocation =>
          invocation.status === 'active' ||
          (invocation.status === 'awaiting-start' && invocation.interruptionIntentIdentities.length > 0),
      ) ?? false
    );
  }

  advanceAnimation(): void {
    this.state.animationFrame += 1;
  }

  reportConfigurationWarning(message: string): void {
    this.say(message, 'warning');
  }

  reportClipboardCopy(source: ReviewingClipboardSource, outcome: ReviewingClipboardOutcome, _byteLength: number): void {
    const sourceLabel =
      source === 'diff-row'
        ? 'the selected Diff row'
        : source === 'message-body'
          ? 'the selected Message body'
          : source === 'message-composer'
            ? 'the Message composer selection'
            : source === 'question-body'
              ? 'the selected historical Question body'
              : source === 'question-composer'
                ? 'the historical Question composer selection'
                : 'the Review selection';
    if (outcome === 'written') {
      this.say(`Copied ${sourceLabel}.`, 'success');
    } else if (outcome === 'attempted') {
      this.say(`Copied ${sourceLabel} (your terminal may not support copying; check before pasting).`, 'info');
    } else {
      this.say(`Couldn’t copy ${sourceLabel}: no clipboard is available.`, 'warning');
    }
  }

  /** Synchronizes control-free OpenTUI text without moving workflow meaning. */
  synchronizeMessageEditor(body: string, cursor: number): boolean {
    const editor = this.state.editor;
    if (editor === undefined) return false;
    if (Buffer.byteLength(body) > MESSAGE_MAX_BYTES) {
      this.say('A Message can be at most 256 KiB.', 'warning');
      return false;
    }
    // While the exact preview, a pending inspection, its gate, or the save is
    // open the inspected bytes are frozen: typing never rewrites what will be
    // sent, and a re-render reporting the same text never cancels the check.
    if (
      this.state.messagePreview !== undefined ||
      this.state.messageCommitGate !== undefined ||
      editor.inspectionRequest !== undefined ||
      this.state.pending !== undefined
    ) {
      return body === editor.body;
    }
    delete editor.inspectionRequest;
    if (body !== editor.body && editor.discardArmed === true) {
      // Typing again means the draft is wanted.
      delete editor.discardArmed;
      this.state.notice = undefined;
    }
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.state.provisionalMessage = undefined;
    editor.body = body;
    editor.cursor = clamp(cursor, 0, body.length);
    return true;
  }

  /** Accepts the View's exact size-aware visual discussion position. */
  synchronizeQuestionDiscussionOffset(offset: number): void {
    this.state.questionCardScrollOffset = Math.max(0, Math.floor(offset));
  }

  rememberHomeContext(home: WorkspaceHomeView): void {
    if (home.stateVersion < this.currentVersion()) return;
    this.state.previousReviewCount = home.header.totalPastReviews;
  }

  currentVersion(): number {
    return activeVersion(this.state);
  }

  shouldDeferProjection(version: number): boolean {
    return (
      (this.state.pending?.phase === 'awaiting-result' || this.state.pending?.phase === 'result-unavailable') &&
      version > this.currentVersion()
    );
  }

  /** A key arrived mid-load: name what is loading and what to do, so nothing happens silently. */
  sayStillLoading(key: string): void {
    const what = this.state.loading?.label ?? (this.state.pending === undefined ? 'the Review' : 'your last action');
    this.say(
      key === 'q'
        ? `Still ${this.state.loading === undefined ? 'saving' : 'loading'}; press q again once it’s done to quit.`
        : `Still loading (${what}); press ${key} again in a moment.`,
      'info',
    );
  }

  setLoading(label: string, region?: ReviewingFocus, keepNotice = false): void {
    this.state.loading = { label, ...(region === undefined ? {} : { region }) };
    if (!keepNotice) this.state.notice = undefined;
  }

  /** Restores Home only when an uncommitted optimistic open cannot materialize. */
  failReviewOpen(message: string): void {
    if (this.state.pendingReviewShell === undefined) {
      this.fail(message);
      return;
    }
    if (this.state.pending?.phase === 'awaiting-projection') {
      this.state.loading = undefined;
      this.say(message, 'error');
      return;
    }
    this.state.screen = 'home';
    this.state.focus = 'home';
    this.state.review = undefined;
    this.state.pendingReviewShell = undefined;
    this.state.loading = undefined;
    this.say(message, 'error');
  }

  fail(message: string): void {
    if (this.state.screen === 'loading') {
      this.state.screen = 'failed';
      this.state.failure = message;
    }
    this.state.loading = undefined;
    this.say(message, 'error');
    this.state.actionLookupOpen = false;
  }

  applyHome(
    home: WorkspaceHomeView,
    preferredReviewIdentity?: ReviewIdentity,
    mode?: HomeMode,
  ): readonly ReviewingModelEffect[] {
    if (home.stateVersion < this.currentVersion()) return [];
    this.rememberHomeContext(home);
    const oldPending = this.state.pending;
    const settled = this.pendingSettlesAt(home.stateVersion);
    if (settled && oldPending?.navigateToActiveReview === true && home.header.currentReviewIdentity !== undefined) {
      this.state.home = home;
      this.finishPending(oldPending);
      this.state.screen = 'review';
      this.state.focus = 'diff';
      this.state.pendingReviewShell = {
        reviewIdentity: home.header.currentReviewIdentity,
        retention: 'current',
        stateVersion: home.stateVersion,
        ...(home.currentReview === undefined ? {} : { totalFiles: home.currentReview.totalFiles }),
      };
      this.state.loading = { label: 'Opening Current Review shell; immutable Snapshot pending' };
      return [
        {
          type: 'show-review',
          target: {
            reviewIdentity: home.header.currentReviewIdentity,
            manifestOffset: 0,
            diffOffset: 0,
            questionOffset: 0,
          },
        },
      ];
    }
    const wasHome = this.state.screen === 'home';
    this.state.screen = 'home';
    this.state.home = home;
    this.state.review = undefined;
    this.state.pendingReviewShell = undefined;
    this.state.provisionalMessage = undefined;
    this.state.hoveredMessageIdentity = undefined;
    this.state.historicalDialog = undefined;
    this.state.search = undefined;
    this.state.focus = 'home';
    this.state.loading = undefined;
    if (this.state.comparisonPreview !== undefined && this.state.comparisonPreview.stateVersion !== home.stateVersion) {
      this.state.comparisonPreview = undefined;
      this.state.comparisonRequestedSelection = undefined;
    }
    if (this.state.commitGraph !== undefined && this.state.commitGraph.stateVersion !== home.stateVersion) {
      this.state.commitGraph = undefined;
      this.state.selectedCommitIdentity = undefined;
      this.state.selectedMergeParentIdentity = undefined;
    }
    this.state.homeMode = mode ?? (wasHome ? this.state.homeMode : 'launcher');
    if (this.state.homeMode === 'history' && home.header.totalPastReviews === 0) {
      this.state.homeMode = 'launcher';
    }
    if (
      (home.header.totalPastReviews === 0 && this.state.homeLauncherSelection === 'history') ||
      (home.currentReview === undefined && this.state.homeLauncherSelection === 'new-current')
    ) {
      this.state.homeLauncherSelection = 'primary';
    }
    const preferred = preferredReviewIdentity ?? this.state.selectedReviewIdentity;
    this.state.selectedReviewIdentity =
      home.reviews.items.find(item => item.reviewIdentity === preferred)?.reviewIdentity ??
      home.reviews.items[0]?.reviewIdentity;
    if (settled) this.finishPending(oldPending);
    return [];
  }

  applyCommitGraph(graph: ReviewCommitGraphView): readonly ReviewingModelEffect[] {
    if (
      this.state.screen !== 'home' ||
      this.state.homeMode !== 'comparison' ||
      graph.stateVersion !== this.state.home?.stateVersion
    ) {
      return [];
    }
    this.state.commitGraph = graph;
    this.state.loading = undefined;
    if (graph.status !== 'available') {
      this.state.selectedCommitIdentity = undefined;
      this.say('Couldn’t read this repository’s commit history.', 'error');
      return [];
    }
    const commits = graph.rows.filter(row => row.kind === 'commit');
    this.state.selectedCommitIdentity =
      commits.find(commit => commit.objectIdentity === this.state.selectedCommitIdentity)?.objectIdentity ??
      graph.headObjectIdentity;
    this.state.selectedMergeParentIdentity = undefined;
    this.state.notice = undefined;
    return this.previewSelectedCommit();
  }

  applyComparisonPreview(preview: ReviewComparisonPreviewView, requested: ReviewComparisonSelection): void {
    if (
      this.state.screen !== 'home' ||
      this.state.homeMode !== 'comparison' ||
      preview.stateVersion !== this.state.home?.stateVersion ||
      JSON.stringify(requested) !== JSON.stringify(this.state.comparisonRequestedSelection)
    ) {
      return;
    }
    this.state.comparisonPreview = preview;
    this.state.loading = undefined;
    if (preview.status === 'available') {
      if (requested.kind === 'commit') {
        this.state.comparisonMode = 'commit';
        this.state.selectedCommitIdentity =
          preview.comparedState.kind === 'commit'
            ? preview.comparedState.objectIdentity
            : this.state.selectedCommitIdentity;
        this.state.selectedMergeParentIdentity =
          preview.selection.kind === 'commit' ? preview.selection.parentRevision : undefined;
      } else if (requested.kind === 'commit-to-head' || requested.kind === 'head-ancestry') {
        this.state.comparisonMode = 'range-to-head';
        if (preview.basis.kind === 'commit') {
          this.state.selectedCommitIdentity = preview.basis.objectIdentity;
        }
      }
    }
    // What the comparison holds, or why it can't be shown, is said in the
    // card's preview where the eye already is; the status line stays quiet.
    this.state.notice = undefined;
  }

  applyReview(
    bundle: ReviewViewBundle,
    target: ReviewLoadTarget,
    selection: ReviewSelectionHint = {},
    fromSearch = false,
  ): readonly ReviewingModelEffect[] {
    const savingMessage = this.state.pending?.action === 'review.message.commit';
    const effects = this.applyReviewProjection(bundle, target, selection, fromSearch);
    if (this.state.pending !== undefined) return effects;
    // The Message is saved and the composer closed: replay the moves typed
    // while it saved, after the projection has placed the selection.
    const held = savingMessage ? this.#heldNavigation.splice(0) : [];
    this.#heldNavigation.length = 0;
    return [...effects, ...held.flatMap(input => this.handleInput(input))];
  }

  private applyReviewProjection(
    bundle: ReviewViewBundle,
    target: ReviewLoadTarget,
    selection: ReviewSelectionHint,
    fromSearch: boolean,
  ): readonly ReviewingModelEffect[] {
    const navigatesElsewhere =
      fromSearch ||
      Object.keys(selection).length > 0 ||
      bundle.manifest.header.reviewIdentity !== this.state.review?.manifest.header.reviewIdentity;
    if (navigatesElsewhere && bundle.stateVersion >= this.currentVersion()) this.closeShownStep();
    return this.updateUnderneathShownStep(() => this.applyReviewNow(bundle, target, selection, fromSearch));
  }

  private applyReviewNow(
    bundle: ReviewViewBundle,
    target: ReviewLoadTarget,
    selection: ReviewSelectionHint,
    fromSearch: boolean,
  ): readonly ReviewingModelEffect[] {
    if (bundle.stateVersion < this.currentVersion()) return [];
    this.#synchronizeSourceCaches(bundle);
    const fileRequest = this.#messageFileRequest;
    if (fileRequest !== undefined && fileRequest.path === target.filePathBytesBase64) fileRequest.landed = true;
    const oldPending = this.state.pending;
    const settled = this.pendingSettlesAt(bundle.stateVersion);
    const previousReviewIdentity = this.state.review?.manifest.header.reviewIdentity;
    // A refresh (an answer landing, files changing) brings a new Snapshot whose
    // files and rows carry new identities. Remember where you were by path and
    // line so the selection can be found again instead of resetting to the top.
    const previousFilePath = reviewingFiles(this.state.review, this.state.fileScope).find(
      file => file.fileIdentity === this.state.selectedFileIdentity,
    )?.pathBytesBase64;
    const previousRow = this.state.review?.diff?.status === 'available' ? diffRow(this.state) : undefined;
    const previousLine =
      previousRow === undefined
        ? undefined
        : previousRow.newLine !== undefined
          ? ({ side: 'new', line: previousRow.newLine } as const)
          : previousRow.oldLine !== undefined
            ? ({ side: 'old', line: previousRow.oldLine } as const)
            : undefined;
    const statesBefore = new Map<string, MessageState>(
      (this.state.review?.messages.messages.items ?? []).map(item => [
        item.reviewMessageIdentity,
        messageState(this.state, item),
      ]),
    );
    // A Message just saved reads as waiting, so an agent that starts before it
    // reaches History still gets its "started" line.
    const justSaved = this.state.provisionalMessage?.reviewMessageIdentity;
    if (justSaved !== undefined && !statesBefore.has(justSaved)) statesBefore.set(justSaved, 'waiting');
    this.state.screen = 'review';
    this.state.home = undefined;
    this.state.review = bundle.diff === undefined ? bundle : { ...bundle, diff: this.#widenDiff(bundle.diff) };
    const outcome =
      previousReviewIdentity === bundle.manifest.header.reviewIdentity ? this.settledOutcome(statesBefore) : undefined;
    this.state.pendingReviewShell = undefined;
    if (bundle.continuation?.status !== 'available' || !bundle.continuation.headMoved) {
      this.state.continuationChoice = undefined;
    }
    if (previousReviewIdentity !== bundle.manifest.header.reviewIdentity) {
      this.state.selectedFileIdentity = undefined;
      this.state.selectedRowIdentity = undefined;
      this.state.selectedMessageIdentity = undefined;
      this.state.hoveredMessageIdentity = undefined;
      this.state.selectedMessageBody = undefined;
      this.state.selectedMessageResponseBody = undefined;
      this.state.expandedQuestionIdentity = undefined;
      this.state.selectedQuestionBody = undefined;
      this.state.collapsedDirectories = Object.freeze([]);
      this.state.unchangedContent = undefined;
      this.#unchangedContentReload = undefined;
      this.state.unchangedContentLine = 1;
      this.state.unchangedContentOffset = 0;
    }
    const snapshotIdentity = bundle.source.kind === 'snapshot' ? bundle.source.reviewSnapshotIdentity : undefined;
    const snapshotBasisIdentity =
      snapshotIdentity === undefined
        ? undefined
        : bundle.bases.bases.items.find(
            basis => basis.capture.status === 'captured' && basis.capture.reviewSnapshotIdentity === snapshotIdentity,
          )?.reviewBasisIdentity;
    const inferredBasis = bundle.source.kind === 'live' ? bundle.bases.liveReviewBasisIdentity : snapshotBasisIdentity;
    this.state.activeReviewBasisIdentity = target.reviewBasisIdentity ?? inferredBasis;
    this.state.loading = undefined;

    const files = reviewingFiles(bundle, this.state.fileScope);
    const fileOffset =
      this.state.fileScope === 'all' && bundle.liveFiles?.status === 'available'
        ? bundle.liveFiles.files.offset
        : bundle.manifest.manifest.offset;
    const desiredFile = selection.fileAbsolute ?? target.fileAbsolute;
    const selectedFile =
      desiredFile === undefined
        ? (files.find(
            file =>
              file.fileIdentity === (selection.fileIdentity ?? this.state.selectedFileIdentity ?? target.fileIdentity),
          ) ??
          (selection.fileIdentity === undefined && previousFilePath !== undefined
            ? files.find(file => file.pathBytesBase64 === previousFilePath)
            : undefined) ??
          // A live Review loads the selected file's Diff itself, so it can open
          // at the top of the list as shown; fixed comparisons keep their own.
          (bundle.source.kind === 'live' ? firstListedFile(files, this.state.collapsedDirectories) : files[0]))
        : files[clamp(desiredFile - fileOffset, 0, Math.max(0, files.length - 1))];
    this.state.selectedFileIdentity = selectedFile?.fileIdentity;

    const availableDiff = this.state.review.diff?.status === 'available' ? this.state.review.diff : undefined;
    const desiredRow = selection.rowAbsolute;
    const anchorRow =
      selection.anchorLine === undefined || availableDiff === undefined
        ? undefined
        : (availableDiff.window.rows.find(row => row.newLine === selection.anchorLine) ??
          availableDiff.window.rows.find(row => row.oldLine === selection.anchorLine));
    const selectedRow =
      desiredRow === undefined
        ? (anchorRow ??
          availableDiff?.window.rows.find(row => row.rowIdentity === this.state.selectedRowIdentity) ??
          (previousLine !== undefined &&
          selectedFile !== undefined &&
          selectedFile.pathBytesBase64 === previousFilePath &&
          (availableDiff?.file.fileIdentity === selectedFile.diffFileIdentity ||
            availableDiff?.file.fileIdentity === selectedFile.fileIdentity)
            ? availableDiff?.window.rows.find(row =>
                previousLine.side === 'new' ? row.newLine === previousLine.line : row.oldLine === previousLine.line,
              )
            : undefined) ??
          (availableDiff === undefined ? undefined : preferCurrentSide(availableDiff.window.rows, 0)))
        : availableDiff?.window.rows[
            clamp(desiredRow - availableDiff.window.offset, 0, Math.max(0, availableDiff.window.rows.length - 1))
          ];
    this.state.selectedRowIdentity = selectedRow?.rowIdentity;
    this.state.anchorSide = selectedRow?.newLine !== undefined ? 'new' : 'old';

    const desiredQuestion = selection.questionAbsolute;
    const selectedQuestion =
      bundle.questions.list.items.find(item => item.itemIdentity === this.state.selectedQuestionIdentity) ??
      (desiredQuestion === undefined
        ? bundle.questions.list.items[0]
        : bundle.questions.list.items[
            clamp(
              desiredQuestion - bundle.questions.list.offset,
              0,
              Math.max(0, bundle.questions.list.items.length - 1),
            )
          ]);
    this.state.selectedQuestionIdentity = selectedQuestion?.itemIdentity;

    const desiredMessage = selection.messageAbsolute;
    const selectedMessage =
      bundle.messages.messages.items.find(item => item.reviewMessageIdentity === this.state.selectedMessageIdentity) ??
      (desiredMessage === undefined
        ? bundle.messages.messages.items[0]
        : bundle.messages.messages.items[
            clamp(
              desiredMessage - bundle.messages.messages.offset,
              0,
              Math.max(0, bundle.messages.messages.items.length - 1),
            )
          ]);
    this.state.selectedMessageIdentity = selectedMessage?.reviewMessageIdentity;
    if (
      !bundle.messages.messages.items.some(item => item.reviewMessageIdentity === this.state.hoveredMessageIdentity)
    ) {
      this.state.hoveredMessageIdentity = undefined;
    }

    if (settled) this.finishPending(oldPending);
    // A Message reaching its outcome replaces whatever the status line said,
    // so an earlier "Saved" never sits above a failure.
    // Moving HEAD takes changes out of Live changes; say once where they went.
    const moveNotice = this.#announceHeadMove(bundle);
    if (outcome !== undefined) {
      this.say(moveNotice === undefined ? outcome.text : `${outcome.text} ${moveNotice.text}`, outcome.tone);
    } else if (moveNotice !== undefined) {
      // An answer said a moment ago keeps its words; the move follows them.
      const answered = this.state.notice !== undefined && noticeToneOf(this.state) === 'success';
      this.say(
        answered ? `${this.state.notice} ${moveNotice.text}` : moveNotice.text,
        answered ? 'success' : moveNotice.tone,
      );
    }
    if (fromSearch) this.state.notice = 'Search result opened.';
    if (this.state.focus === 'home') this.state.focus = 'diff';
    const selectedMessageBodyEffects = this.loadSelectedMessageBody();
    const sendAgain = this.#sendAgainRequest;
    // The load r started carries that Message's selection; a refresh doesn't.
    if (
      sendAgain !== undefined &&
      desiredMessage !== undefined &&
      selectedMessage?.reviewMessageIdentity === sendAgain
    ) {
      this.#sendAgainRequest = undefined;
      this.fixupCollapsedSelection();
      return [...this.sendSelectedMessageAgain(true), ...selectedMessageBodyEffects];
    }
    if (desiredQuestion !== undefined && selection.fileAbsolute === undefined && selectedQuestion !== undefined) {
      return [...this.navigateToQuestion(selectedQuestion, desiredQuestion, false), ...selectedMessageBodyEffects];
    }
    if (
      desiredMessage !== undefined &&
      selection.fileAbsolute === undefined &&
      selectedMessage !== undefined &&
      selectedMessage.originReviewBasisIdentity === this.state.activeReviewBasisIdentity
    ) {
      const navigation = this.navigateToMessage(selectedMessage, desiredMessage, true, true);
      this.fixupCollapsedSelection();
      return navigation;
    }
    this.fixupCollapsedSelection();
    return [...this.previewSelectedFile(selection.anchorLine), ...selectedMessageBodyEffects];
  }

  applyReviewDiff(
    diff: ReviewDiffView | ReviewLiveDiffView,
    target: ReviewLoadTarget,
    selection: ReviewSelectionHint = {},
  ): void {
    this.updateUnderneathShownStep(() => this.applyReviewDiffNow(diff, target, selection));
  }

  private applyReviewDiffNow(
    diff: ReviewDiffView | ReviewLiveDiffView,
    target: ReviewLoadTarget,
    selection: ReviewSelectionHint,
  ): void {
    const review = this.state.review;
    const diffReviewIdentity =
      diff.kind === 'review.live-diff'
        ? diff.reviewIdentity
        : diff.status === 'available'
          ? diff.header.reviewIdentity
          : diff.reviewIdentity;
    const diffFileIdentity = diff.status === 'available' ? diff.file.fileIdentity : diff.fileIdentity;
    if (
      this.state.screen !== 'review' ||
      review === undefined ||
      diff.stateVersion !== review.stateVersion ||
      diffReviewIdentity !== review.manifest.header.reviewIdentity ||
      target.reviewIdentity !== diffReviewIdentity ||
      (target.fileIdentity !== undefined && target.fileIdentity !== diffFileIdentity) ||
      (diff.kind === 'review.live-diff'
        ? review.source.kind !== 'live' || diff.liveChangesIdentity !== review.source.liveChangesIdentity
        : review.source.kind !== 'snapshot' ||
          (diff.header !== undefined && diff.header.reviewSnapshotIdentity !== review.source.reviewSnapshotIdentity) ||
          (target.reviewSnapshotIdentity !== undefined &&
            target.reviewSnapshotIdentity !== review.source.reviewSnapshotIdentity))
    ) {
      return;
    }
    this.#synchronizeSourceCaches(review);
    const widened = this.#widenDiff(diff);
    this.state.review = { ...review, diff: widened };
    this.state.loading = undefined;
    if (widened.status === 'available') {
      this.#diffCache.set(diffCacheKey(widened), widened);
    }
    if (widened.status !== 'available') {
      this.state.selectedRowIdentity = undefined;
      return;
    }
    this.state.selectedFileIdentity = selection.fileIdentity ?? widened.file.fileIdentity;
    const desiredRow = selection.rowAbsolute;
    const anchorRow =
      selection.anchorLine === undefined
        ? undefined
        : (widened.window.rows.find(row => row.newLine === selection.anchorLine) ??
          widened.window.rows.find(row => row.oldLine === selection.anchorLine));
    const firstChangedInWindow =
      widened.firstChangedRow !== undefined &&
      widened.firstChangedRow >= widened.window.offset &&
      widened.firstChangedRow < widened.window.offset + widened.window.rows.length
        ? preferCurrentSide(widened.window.rows, widened.firstChangedRow - widened.window.offset)
        : undefined;
    const selectedRow =
      desiredRow === undefined
        ? (anchorRow ??
          widened.window.rows.find(row => row.rowIdentity === this.state.selectedRowIdentity) ??
          (this.state.selectedRowIdentity === undefined ? firstChangedInWindow : undefined) ??
          preferCurrentSide(widened.window.rows, 0))
        : widened.window.rows[
            clamp(desiredRow - widened.window.offset, 0, Math.max(0, widened.window.rows.length - 1))
          ];
    this.state.selectedRowIdentity = selectedRow?.rowIdentity;
    if (
      selectedRow !== undefined &&
      !(this.state.anchorSide === 'old' ? selectedRow.oldLine !== undefined : selectedRow.newLine !== undefined)
    ) {
      this.state.anchorSide = selectedRow.newLine !== undefined ? 'new' : 'old';
    }
    this.state.notice = undefined;
    this.announceLanding();
  }

  /** Says where Enter took you, once, when no other notice explains the screen. */
  private announceLanding(): void {
    const landing = this.#landingNotice;
    this.#landingNotice = undefined;
    if (landing !== undefined && this.state.notice === undefined) this.say(landing, 'info');
  }

  failReviewDiffLoad(message: string): void {
    this.state.loading = undefined;
    this.say(message, 'error');
  }

  applyReviewSearch(view: ReviewSearchView, query: string): readonly ReviewingModelEffect[] {
    const search = this.state.search;
    const reviewIdentity = this.state.review?.manifest.header.reviewIdentity;
    if (
      this.state.screen !== 'review' ||
      search === undefined ||
      search.query.trim() !== query ||
      view.reviewIdentity !== reviewIdentity
    ) {
      return [];
    }
    search.view = view;
    search.loading = false;
    const requestedResultAbsolute = search.requestedResultAbsolute;
    search.requestedResultAbsolute = undefined;
    search.selectedResultIdentity =
      view.status === 'available'
        ? requestedResultAbsolute === undefined
          ? (view.results.find(item => item.resultIdentity === search.selectedResultIdentity)?.resultIdentity ??
            view.results[0]?.resultIdentity)
          : view.results[clamp(requestedResultAbsolute - view.offset, 0, Math.max(0, view.results.length - 1))]
              ?.resultIdentity
        : undefined;
    this.state.notice = view.status === 'not-found' ? reasonSentence('review-not-found') : undefined;
    return this.requestSearchPreview();
  }

  applySearchPreview(view: ReviewSearchPreviewView, resultIdentity: string): void {
    const search = this.state.search;
    if (
      search === undefined ||
      search.selectedResultIdentity !== resultIdentity ||
      search.previewResultIdentity !== resultIdentity
    ) {
      return;
    }
    search.preview = view;
    search.previewLoading = false;
  }

  failSearchPreview(message: string, resultIdentity: string): void {
    const search = this.state.search;
    if (search === undefined || search.previewResultIdentity !== resultIdentity) return;
    search.previewLoading = false;
    this.say(message, 'error');
  }

  failReviewSearch(message: string): void {
    if (this.state.search === undefined) return;
    this.state.search.loading = false;
    this.state.search.previewLoading = false;
    this.say(message, 'error');
  }

  applyReviewMessageInspection(
    requestIdentity: string,
    purpose: 'preview' | 'submit',
    inspection: DefaultReviewMessageInspectionView,
    now: number = performance.now(),
  ): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    if (
      editor === undefined ||
      editor.inspectionRequest?.requestIdentity !== requestIdentity ||
      editor.inspectionRequest.purpose !== purpose
    ) {
      return [];
    }
    delete editor.inspectionRequest;
    if (inspection.status !== 'available') {
      this.state.messagePreview = undefined;
      this.state.messageCommitGate = undefined;
      this.rejectProvisionalMessage(requestIdentity, reasonSentence(inspection.reason, agentName(this.state)));
      this.say(messageUnavailableNotice(inspection.reason, agentName(this.state)), 'error');
      return [];
    }
    if (
      inspection.reviewIdentity !== editor.reviewIdentity ||
      inspection.originReviewBasisIdentity !== editor.originReviewBasisIdentity ||
      inspection.location.file.bytesBase64 !== editor.pathBytesBase64 ||
      inspection.location.line !== editor.line
    ) {
      this.say('The line you picked changed. Press F4 to target the current line.', 'warning');
      editor.reselectionRequired = true;
      this.rejectProvisionalMessage(
        requestIdentity,
        'The line you picked changed. Press F4 to target the current line.',
      );
      return [];
    }
    this.state.agentLabel = inspection.destination.harnessLabel;
    if (purpose === 'preview') {
      this.state.messagePreview = inspection;
      this.state.messageCommitGate = undefined;
      this.state.notice = undefined;
      return [];
    }
    return this.commitInspectedMessage(inspection, now, false);
  }

  failReviewMessageInspection(requestIdentity: string, message: string): void {
    const editor = this.state.editor;
    if (editor?.inspectionRequest?.requestIdentity !== requestIdentity) return;
    delete editor.inspectionRequest;
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.rejectProvisionalMessage(requestIdentity, 'Not sent · inspection unavailable');
    this.say(message, 'error');
  }

  applyReviewMessageOrigin(view: ReviewMessageOriginView, messageAbsolute: number): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (
      view.status !== 'available' ||
      review === undefined ||
      view.reviewIdentity !== review.manifest.header.reviewIdentity
    ) {
      this.state.loading = undefined;
      this.say('The review point this Message came from is no longer available.', 'warning');
      return [];
    }
    const target = this.currentReviewTarget();
    if (target === undefined) return [];
    const matchingFile = reviewingFiles(review, this.state.fileScope).find(
      file => file.pathBytesBase64 === view.location.file.bytesBase64,
    );
    this.state.activeReviewBasisIdentity = view.basis.reviewBasisIdentity;
    this.state.selectedMessageIdentity = view.reviewMessageIdentity;
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.setLoading('Opening Message origin', 'diff');
    const { fileIdentity: _fileIdentity, fileAbsolute: _fileAbsolute, ...targetWithoutFile } = target;
    const baseTarget = {
      ...targetWithoutFile,
      reviewBasisIdentity: view.basis.reviewBasisIdentity,
      filePathBytesBase64: view.location.file.bytesBase64,
      manifestOffset: 0,
      diffOffset: 0,
      questionOffset: review.questions.list.offset,
    };
    const anchorLine = view.location.line;
    if (view.source.kind === 'live-working-diff') {
      const { reviewSnapshotIdentity: _snapshot, ...liveTarget } = baseTarget;
      return [
        {
          type: 'show-review',
          target: liveTarget,
          selection: {
            messageAbsolute,
            anchorLine,
            ...(matchingFile === undefined ? {} : { fileIdentity: matchingFile.fileIdentity }),
          },
        },
      ];
    }
    return [
      {
        type: 'show-review',
        target: {
          ...baseTarget,
          reviewSnapshotIdentity: view.source.reviewSnapshotIdentity,
        },
        selection: { messageAbsolute, anchorLine },
      },
    ];
  }

  applyMessageBody(reviewMessageIdentity: ReviewMessageIdentity, part: 'message' | 'response', body: string): void {
    if (this.state.selectedMessageIdentity !== reviewMessageIdentity) return;
    if (part === 'response') this.state.selectedMessageResponseBody = { reviewMessageIdentity, body };
    else this.state.selectedMessageBody = { reviewMessageIdentity, body };
  }

  failMessageBody(reviewMessageIdentity: ReviewMessageIdentity, part: 'message' | 'response'): void {
    if (this.state.selectedMessageIdentity !== reviewMessageIdentity) return;
    this.state.notice =
      part === 'response'
        ? 'The complete Response body could not be loaded.'
        : 'The complete Message body could not be loaded.';
  }

  applyQuestionDiscussion(itemIdentity: ReviewProjectedQuestionItem['itemIdentity'], body: string): void {
    if (this.state.selectedQuestionIdentity !== itemIdentity) return;
    this.state.selectedQuestionBody = { itemIdentity, body };
  }

  failQuestionDiscussion(itemIdentity: ReviewProjectedQuestionItem['itemIdentity']): void {
    if (this.state.selectedQuestionIdentity !== itemIdentity) return;
    this.say('Couldn’t load the full Question.', 'warning');
  }

  applyQuestionLocation(view: ReviewQuestionLocationView, questionAbsolute: number): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (
      review === undefined ||
      view.reviewIdentity !== review.manifest.header.reviewIdentity ||
      view.stateVersion !== review.stateVersion ||
      this.state.selectedQuestionIdentity !== view.itemIdentity
    ) {
      return [];
    }
    if (view.status !== 'available') {
      this.state.loading = undefined;
      this.say('Couldn’t find where this Question was asked.', 'warning');
      return [];
    }
    const items = review.questions.list.items.map(item =>
      item.itemIdentity === view.itemIdentity ? { ...item, target: view.target } : item,
    );
    const item = items.find(candidate => candidate.itemIdentity === view.itemIdentity);
    if (item === undefined) return [];
    this.state.review = {
      ...review,
      questions: {
        ...review.questions,
        list: { ...review.questions.list, items },
      },
    };
    this.state.loading = undefined;
    return this.navigateToQuestion(item, questionAbsolute);
  }

  applyCommandResult(result: WorkspaceCommandResult): readonly ReviewingModelEffect[] {
    const pending = this.state.pending;
    if (pending === undefined || result.commandIdentity !== pending.commandIdentity) return [];
    if (result.status === 'accepted') {
      const firstAcceptance = pending.phase !== 'awaiting-projection';
      pending.phase = 'awaiting-projection';
      pending.committedStateVersion = result.stateVersion;
      this.state.notice = undefined;
      if (result.kind === 'review.comparison.continued-live') {
        if (firstAcceptance) this.state.previousReviewCount += 1;
        this.state.reviewReturn = 'launcher';
        return [
          {
            type: 'show-review',
            target: {
              reviewIdentity: result.reviewIdentity,
              manifestOffset: 0,
              diffOffset: 0,
              questionOffset: 0,
            },
          },
        ];
      }
      if (result.kind === 'review.message.committed') {
        const messageAbsolute = this.state.review?.messages.messages.total ?? 0;
        const target = this.currentReviewTarget();
        this.state.selectedMessageIdentity = result.reviewMessageIdentity;
        this.state.messagePreview = undefined;
        this.state.messageCommitGate = undefined;
        if (this.state.provisionalMessage?.localIdentity === pending.commandIdentity) {
          this.state.provisionalMessage = {
            ...this.state.provisionalMessage,
            status: 'saved-awaiting-projection',
            reviewMessageIdentity: result.reviewMessageIdentity,
            detail: `Saved. Waiting for ${agentName(this.state)} to start.`,
          };
        }
        if (target !== undefined) {
          return [
            {
              type: 'show-review',
              target,
              selection: { messageAbsolute },
            },
          ];
        }
      }
      if (result.kind === 'harness.invocation.interruption-requested') {
        this.say(`Asked ${agentName(this.state)} to stop.`, 'success');
        return [];
      }
      if (result.kind === 'review.basis.git-commit.captured') {
        const target = this.currentReviewTarget();
        this.state.basisPicker = undefined;
        if (target !== undefined) {
          return [
            {
              type: 'show-review',
              target: {
                ...target,
                reviewBasisIdentity: result.reviewBasisIdentity,
                reviewSnapshotIdentity: result.reviewSnapshotIdentity,
                manifestOffset: 0,
                diffOffset: 0,
              },
            },
          ];
        }
      }
      if (result.kind === 'review.question.asked') {
        const questionAbsolute = this.state.review?.questions.list.totalItems ?? 0;
        const target = this.currentReviewTarget();
        this.state.selectedQuestionIdentity = result.questionIdentity;
        if (target !== undefined) {
          return [
            {
              type: 'show-review',
              target: {
                ...target,
                questionOffset: Math.floor(questionAbsolute / QUESTION_WINDOW_SIZE) * QUESTION_WINDOW_SIZE,
              },
              selection: { questionAbsolute },
            },
          ];
        }
      }
      return [];
    }
    this.state.pending = undefined;
    this.state.loading = undefined;
    if (pending.action === 'harness.invocation.interruption.request') {
      // Evidence keeps arriving while a turn runs, so the shown State version is
      // often just behind; the Workspace still rechecks that the turn is running.
      if (
        result.reason === 'state-version-mismatch' &&
        pending.interruption !== undefined &&
        pending.interruption.attempts < MAX_INTERRUPT_ATTEMPTS
      ) {
        return this.requestInterruption(
          pending.interruption.invocationIdentity,
          result.stateVersion,
          pending.interruption.attempts + 1,
          pending.startedAt,
        );
      }
      this.state.notice =
        result.reason === 'invocation-not-interruptible'
          ? 'The turn already ended; there was nothing to interrupt.'
          : `Couldn’t interrupt. ${reasonSentence(result.reason, agentName(this.state))}`;
      this.state.noticeTone = { text: this.state.notice, tone: 'warning' };
      return [];
    }
    if (
      pending.navigateToActiveReview &&
      this.state.pendingReviewShell !== undefined &&
      this.state.home !== undefined
    ) {
      this.state.screen = 'home';
      this.state.focus = 'home';
      this.state.review = undefined;
      this.state.pendingReviewShell = undefined;
      this.say(`Couldn’t open the Review. ${reasonSentence(result.reason)}`, 'error');
      return [];
    }
    if (pending.action === 'review.message.commit' && this.state.provisionalMessage !== undefined) {
      this.state.provisionalMessage = {
        ...this.state.provisionalMessage,
        status: 'rejected',
        detail: `${reasonSentence(result.reason, agentName(this.state))} Your text is kept.`,
      };
    }
    if (result.reason === 'inspection-changed' && this.state.editor !== undefined) {
      this.state.editor.reselectionRequired = true;
      delete this.state.editor.inspectionRequest;
      this.state.messagePreview = undefined;
      this.state.messageCommitGate = undefined;
      this.say(reasonSentence('inspection-changed'), 'warning');
    } else if (result.reason === 'commitment-requirements-not-acknowledged' && this.state.editor !== undefined) {
      this.state.messagePreview = undefined;
      this.state.messageCommitGate = undefined;
      this.say(reasonSentence('commitment-requirements-not-acknowledged'), 'warning');
    } else {
      const sentence = reasonSentence(result.reason, agentName(this.state));
      this.say(pending.action === 'review.message.commit' ? `Not sent. ${sentence}` : sentence, 'error');
      if (result.kind === 'review.command.rejected' && result.reason === 'comparison-changed') {
        this.state.comparisonPreview = undefined;
      }
    }
    return [];
  }

  markCommandResultUnavailable(message: string): void {
    if (this.state.pending === undefined) return;
    this.state.pending.phase = 'result-unavailable';
    this.state.loading = undefined;
    if (
      this.state.pending.action === 'review.message.commit' &&
      this.state.provisionalMessage?.localIdentity === this.state.pending.commandIdentity
    ) {
      this.state.provisionalMessage = {
        ...this.state.provisionalMessage,
        status: 'outcome-unknown',
        detail: 'Unknown whether it was sent · check before sending again',
      };
    }
    this.say(message, 'error');
  }

  handleInput(data: ReviewingInput, now: number = performance.now()): readonly ReviewingModelEffect[] {
    this.followSelection();
    return routeShellKey<ReviewingModelEffect>(data, this.shellKeyHost(now));
  }

  /** Reviewing as the shell routes keys to it: its typing layers, its guard, its Esc and its own keys. */
  private shellKeyHost(now: number): ShellKeyHost<ReviewingModelEffect> {
    const state = this.state;
    return {
      stop: { type: 'stop' },
      capture: data => {
        if (state.editor !== undefined) return this.handleEditorInput(data, now);
        if (state.comparisonInput !== undefined) return this.handleComparisonInput(data);
        if (state.search !== undefined) return this.handleSearchInput(data);
        if (state.continuationChoice !== undefined) return this.handleContinuationChoiceInput(data, now);
        if (state.basisPicker !== undefined) return this.handleBasisPickerInput(data, now);
        if (state.jumpList !== undefined) return this.handleJumpListInput(data);
        return undefined;
      },
      guard: data => {
        if (state.historicalDialog === undefined) return undefined;
        if (matchesKey(data, Key.escape) || data.text === 'R') return this.closeHistoricalDialog();
        if (
          (data.text !== undefined && HISTORICAL_REFUSED_KEYS.has(data.text)) ||
          matchesKey(data, Key.ctrl('h')) ||
          matchesKey(data, Key.ctrl('l'))
        ) {
          this.say('This saved Snapshot is read-only. Press Esc to close it first.', 'info');
          return [];
        }
        return undefined;
      },
      guarded: state.historicalDialog !== undefined,
      ready: state.screen === 'home' || state.screen === 'review',
      loading: state.loading !== undefined,
      saving: state.pending !== undefined,
      sayStillLoading: key => this.sayStillLoading(key),
      keyList: {
        open: state.actionLookupOpen,
        show: open => {
          state.actionLookupOpen = open;
        },
      },
      configuration: {
        open: state.configurationWindow !== undefined,
        show: () => {
          state.configurationWindow = { selected: 'theme' };
          state.showDetails = false;
          state.notice = undefined;
        },
        input: data => this.handleConfigurationInput(data),
      },
      details: {
        open: state.showDetails,
        show: open => {
          state.showDetails = open;
        },
      },
      escape: () => this.escapeScreen(),
      screenKey: data => dispatchReviewingKey(this, data, now),
    };
  }

  /** Esc once nothing the shell owns is open: a shown step closes, a Review returns Home. */
  private escapeScreen(): readonly ReviewingModelEffect[] {
    if (this.state.shownStep !== undefined) {
      this.closeShownStep();
      return [];
    }
    if (this.state.screen === 'review') {
      return [{ type: 'show-home', offset: 0, mode: this.state.reviewReturn }];
    }
    if (this.state.screen === 'home' && (this.state.homeMode === 'history' || this.state.homeMode === 'comparison')) {
      const returningFrom = this.state.homeMode;
      this.state.homeMode = 'launcher';
      this.state.homeLauncherSelection = returningFrom === 'comparison' ? 'comparison' : 'history';
      this.state.comparisonInput = undefined;
      this.state.loading = undefined;
    }
    return [];
  }

  /** Enter on a listed Message opens it where it lives: the Diff takes focus on its line. */
  openListedMessage(): readonly ReviewingModelEffect[] {
    const item = messageItem(this.state);
    if (item === undefined) {
      this.say('No Messages yet. Select a Diff line and press a to write one.', 'info');
      return [];
    }
    // Say where Enter went, since the Diff may already have been on that line.
    this.#landingNotice = `${messageOrdinal(this.state, item)} · ${item.location.file.display}:${item.location.line}`;
    // Only what this navigation says may replace the landing line.
    this.state.notice = undefined;
    const effects = this.openSelectedMessage();
    this.state.focus = 'diff';
    if (this.state.loading === undefined) this.announceLanding();
    return effects;
  }

  handlePointerTarget(target: ReviewingPointerTarget): readonly ReviewingModelEffect[] {
    if (this.state.actionLookupOpen || this.state.jumpList !== undefined) return [];
    this.followSelection();
    if (
      target.kind === 'home-launcher-choice' ||
      target.kind === 'home-comparison-commit' ||
      target.kind === 'home-history-review'
    ) {
      return this.handleHomePointerTarget(target);
    }
    if (this.state.basisPicker !== undefined) {
      if (target.kind !== 'basis') return [];
      this.state.basisPicker.selectedReviewBasisIdentity = target.reviewBasisIdentity;
      return this.openBasis(target.reviewBasisIdentity, performance.now());
    }
    if (
      this.state.screen !== 'review' ||
      this.state.review === undefined ||
      this.state.pending !== undefined ||
      this.state.editor !== undefined ||
      this.state.search !== undefined ||
      this.state.configurationWindow !== undefined ||
      this.state.continuationChoice !== undefined
    ) {
      return [];
    }

    if (target.kind === 'basis') return [];
    if (target.kind === 'file-directory') return this.toggleDirectory(target.directory);
    if (target.kind === 'content-line') {
      this.unchangedContentLineTo(target.line);
      return this.openMessagesOn(messagesOnLines(this.state).new.get(target.line) ?? []);
    }
    if (target.kind === 'history-now') {
      this.closeShownStep();
      return [];
    }
    if (target.kind === 'history-step') {
      const step = this.state.review.history?.steps.find(
        candidate => historyStepKey(candidate.from, candidate.to) === target.key,
      );
      if (step === undefined || step.changes.status !== 'changed') return [];
      this.state.balancedContext = 'questions';
      return this.showHistoryStep(step, true);
    }
    if (target.kind === 'message' && this.state.shownStep !== undefined) {
      // While looking at history, a Message shows the step its answer ended.
      const step = this.state.review.history?.steps.find(
        candidate =>
          candidate.to.kind === 'answered' && candidate.to.reviewMessageIdentity === target.reviewMessageIdentity,
      );
      this.state.selectedMessageIdentity = target.reviewMessageIdentity;
      if (step === undefined || step.changes.status !== 'changed') {
        this.say(
          step?.changes.status === 'unavailable'
            ? 'HEAD moved while this Message was answered, and BuildFrame couldn’t read what changed.'
            : step?.headMove !== undefined
              ? `${headMoveSentence(step.headMove, 'while it was answered')} No code changed.`
              : 'No code changed while this Message was answered.',
          'info',
        );
        return [];
      }
      return this.showHistoryStep(step, true);
    }
    if (target.kind === 'message') {
      const local = this.state.review.messages.messages.items.findIndex(
        candidate => candidate.reviewMessageIdentity === target.reviewMessageIdentity,
      );
      if (local < 0) return [];
      this.state.focus = 'questions';
      this.state.balancedContext = 'questions';
      this.state.selectedMessageIdentity = target.reviewMessageIdentity;
      this.state.notice = undefined;
      return this.openSelectedMessage();
    }

    if (target.kind === 'question') {
      const item = this.state.review.questions.list.items.find(
        candidate => candidate.itemIdentity === target.itemIdentity,
      );
      if (item === undefined) return [];
      const returnTarget = this.currentReviewTarget();
      if (returnTarget !== undefined) this.beginHistoricalDialog(returnTarget);
    }

    const focus =
      target.kind === 'region'
        ? target.region
        : target.kind === 'file'
          ? 'files'
          : target.kind === 'question' || target.kind === 'question-card-page'
            ? 'questions'
            : 'diff';
    this.state.focus = focus;
    if (focus === 'files' || focus === 'questions') {
      this.state.balancedContext = focus;
    }
    this.state.notice = undefined;

    if (target.kind === 'region') return [];

    if (target.kind === 'question-card-page') {
      this.state.questionCardScrollOffset = Math.max(0, target.offset);
      return [];
    }

    if (target.kind === 'file' && this.state.shownStep !== undefined) {
      return target.fileIdentity === this.state.selectedFileIdentity ? [] : this.selectChangedFile(target.fileIdentity);
    }
    if (target.kind === 'file') {
      const files = reviewingFiles(this.state.review, this.state.fileScope);
      const local = files.findIndex(candidate => candidate.fileIdentity === target.fileIdentity);
      const file = files[local];
      if (file === undefined) return [];
      this.state.selectedDirectory = undefined;
      this.state.selectedFileIdentity = file.fileIdentity;
      this.state.selectedRowIdentity = undefined;
      return this.openSelectedFile();
    }

    if (target.kind === 'diff-row') {
      const view = diffView(this.state);
      if (view === undefined) return [];
      const local = view.window.rows.findIndex(row => row.rowIdentity === target.rowIdentity);
      const row = view.window.rows[local];
      if (row === undefined) return [];
      this.state.selectedRowIdentity = row.rowIdentity;
      this.state.anchorSide =
        target.side === 'old' && row.oldLine !== undefined
          ? 'old'
          : target.side === 'new' && row.newLine !== undefined
            ? 'new'
            : row.newLine !== undefined
              ? 'new'
              : 'old';
      this.state.questionCardScrollOffset = 0;
      return this.openMessagesOn(rowMessages(messagesOnLines(this.state), row));
    }

    const list = this.state.review.questions.list;
    const local = list.items.findIndex(candidate => candidate.itemIdentity === target.itemIdentity);
    const item = list.items[local];
    if (item === undefined) return [];
    const questionAbsolute = list.offset + local;
    this.state.selectedQuestionIdentity = item.itemIdentity;
    return this.navigateToQuestion(item, questionAbsolute);
  }

  private handleHomePointerTarget(target: ReviewingHomePointerTarget): readonly ReviewingModelEffect[] {
    const home = this.state.home;
    if (
      this.state.screen !== 'home' ||
      home === undefined ||
      this.state.pending !== undefined ||
      this.state.configurationWindow !== undefined ||
      (this.state.comparisonInput !== undefined && this.state.comparisonInput.kind !== 'message-search')
    ) {
      return [];
    }
    if (target.kind === 'home-launcher-choice') {
      if (this.state.homeMode !== 'launcher') return [];
      if (
        (target.selection === 'new-current' && home.currentReview === undefined) ||
        (target.selection === 'history' && home.header.totalPastReviews === 0)
      ) {
        return [];
      }
      // A click selects; a click on the selected choice (a double-click) opens it, as Enter would.
      if (this.state.homeLauncherSelection === target.selection) {
        return this.handleHomeAction(ENTER_INPUT, performance.now());
      }
      this.state.homeLauncherSelection = target.selection;
      this.state.notice = undefined;
      return [];
    }
    if (target.kind === 'home-comparison-commit') {
      if (this.state.homeMode !== 'comparison') return [];
      const search = this.state.comparisonInput;
      if (search?.kind === 'message-search') {
        if (!search.matchingCommitIdentities.includes(target.objectIdentity)) return [];
        search.selectedCommitIdentity = target.objectIdentity;
        return [];
      }
      return this.selectComparisonCommit(target.objectIdentity);
    }
    if (this.state.homeMode !== 'history') return [];
    const item = home.reviews.items.find(candidate => candidate.reviewIdentity === target.reviewIdentity);
    if (item === undefined) return [];
    if (this.state.selectedReviewIdentity === item.reviewIdentity) {
      return this.handleHomeAction(ENTER_INPUT, performance.now());
    }
    this.state.selectedReviewIdentity = item.reviewIdentity;
    this.state.notice = undefined;
    return [];
  }

  private handleConfigurationInput(data: ReviewingInput): readonly ReviewingModelEffect[] {
    const window = this.state.configurationWindow;
    if (window === undefined) return [];
    const content = reviewingSettings(this.state, codeOnly => this.setCodeOnly(codeOnly));
    const outcome = configurationKey(window, data, content.rows);
    if (outcome === 'closed') {
      this.state.configurationWindow = undefined;
      this.say('Settings saved.', 'success');
      return [];
    }
    if (outcome !== 'changed') return [];
    this.state.notice = undefined;
    return [this.reviewingPreferencesSaveEffect()];
  }

  private pendingSettlesAt(version: number): boolean {
    return (
      this.state.pending?.phase === 'awaiting-projection' &&
      this.state.pending.committedStateVersion !== undefined &&
      version >= this.state.pending.committedStateVersion
    );
  }

  /** The newest Message outcome this projection reached, as a status-line sentence. */
  private settledOutcome(
    statesBefore: ReadonlyMap<string, MessageState>,
  ): { readonly text: string; readonly tone: NoticeTone } | undefined {
    const list = this.state.review?.messages.messages;
    if (list === undefined) return undefined;
    const agent = agentName(this.state);
    let outcome: { readonly text: string; readonly tone: NoticeTone } | undefined;
    list.items.forEach((item, index) => {
      const before = statesBefore.get(item.reviewMessageIdentity);
      const now = messageState(this.state, item);
      if (before === undefined || before === now) return;
      const ordinal = `#${list.offset + index + 1}`;
      switch (now) {
        case 'working':
          // Replaces "Waiting for … to start" so the status line never trails the card.
          outcome = { text: `${agent} started ${ordinal}.`, tone: 'info' };
          break;
        case 'answered':
          outcome = { text: `${agent} answered ${ordinal}.`, tone: 'success' };
          break;
        case 'failed':
          outcome = { text: `${ordinal} failed: ${agent} reported an error.`, tone: 'error' };
          break;
        case 'not-sent':
          outcome = { text: `${ordinal} wasn’t sent: ${agent} refused it.`, tone: 'error' };
          break;
        case 'unknown':
          outcome = { text: `${ordinal}: BuildFrame never heard back about it.`, tone: 'warning' };
          break;
        case 'interrupted':
          outcome = { text: `${ordinal} was interrupted.`, tone: 'warning' };
          break;
        case 'no-answer':
          outcome = { text: `${ordinal} ended without an answer.`, tone: 'info' };
          break;
        default:
          break;
      }
    });
    return outcome;
  }

  private finishPending(pending: PendingCommand | undefined): void {
    if (pending === undefined) return;
    this.state.pending = undefined;
    this.state.editor = undefined;
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.state.provisionalMessage = undefined;
    this.state.focus = pending.returnFocus;
    if (pending.returnFocus === 'files') this.state.balancedContext = 'files';
    if (pending.returnFocus === 'questions') this.state.balancedContext = 'questions';
    const agent = agentName(this.state);
    const authorityNote = pending.authority === 'workspace-write' ? ` ${agent} may edit your files.` : '';
    if (pending.action === 'review.message.commit') {
      // Saved durably; whether the agent starts is evidence still to come.
      this.say(`Saved. Waiting for ${agent} to start.${authorityNote}`, 'info');
    } else if (pending.action === 'review.question.ask') {
      this.say(`Question sent to ${agent}.`, 'success');
    } else if (pending.action === 'harness.invocation.interruption.request') {
      this.say(`Asked ${agent} to stop; the Message shows when it does.`, 'success');
    } else {
      this.say('Saved.', 'success');
    }
  }

  /**
   * Opens the composer on the selected Message's file and line in the current
   * code, with its text, so a failed or lost Message can go again without
   * retyping. Nothing is sent until Enter; it is saved as a new Message.
   */
  sendSelectedMessageAgain(
    /** Its file was just loaded by path, so a missing file now really is missing. */
    landed = false,
  ): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const item = messageItem(this.state);
    if (review === undefined) return [];
    if (item === undefined) {
      this.say(`No Message is selected. Select one in ${messagesPaneName(this.state)}, then press r.`, 'info');
      return [];
    }
    if (this.state.pending !== undefined || this.state.loading !== undefined || this.state.editor !== undefined) {
      return [];
    }
    const ordinal = messageOrdinal(this.state, item);
    const itemState = messageState(this.state, item);
    if (!SEND_AGAIN_STATES.has(itemState)) {
      this.say(
        itemState === 'answered'
          ? `${ordinal} was answered. To ask more, select a line and press a.`
          : `${ordinal} is still in progress; it can be sent again if it fails, is stopped, or gets no answer.`,
        'info',
      );
      return [];
    }
    const fullBody =
      this.state.selectedMessageBody?.reviewMessageIdentity === item.reviewMessageIdentity
        ? this.state.selectedMessageBody.body
        : item.body.truncated
          ? undefined
          : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decodeBytesBase64(item.body.bytesBase64));
    if (fullBody === undefined) {
      this.say(`Still loading ${ordinal}’s text; press r again in a moment.`, 'info');
      return this.loadSelectedMessageBody();
    }
    const originReviewBasisIdentity = this.state.activeReviewBasisIdentity;
    const path = item.location.file.bytesBase64;
    const file = reviewingFiles(review, this.state.fileScope).find(candidate => candidate.pathBytesBase64 === path);
    const current = this.currentReviewTarget();
    if (originReviewBasisIdentity !== undefined && file === undefined && !landed && current !== undefined) {
      // The file is in a part of the list that isn't loaded: ask for it by path,
      // then reopen the draft once it lands.
      this.#sendAgainRequest = item.reviewMessageIdentity;
      const { fileIdentity: _fileIdentity, fileAbsolute: _fileAbsolute, ...withoutFile } = current;
      const local = review.messages.messages.items.indexOf(item);
      this.setLoading(`Opening ${item.location.file.display}`, 'diff');
      return [
        {
          type: 'show-review',
          target: { ...withoutFile, filePathBytesBase64: path, diffOffset: 0 },
          selection: {
            messageAbsolute: review.messages.messages.offset + Math.max(0, local),
            anchorLine: item.location.line,
          },
        },
      ];
    }
    if (originReviewBasisIdentity === undefined || file === undefined) {
      this.say(
        this.state.fileScope === 'all'
          ? `${item.location.file.display} isn’t in this Review now; select a line and press a instead.`
          : `${item.location.file.display} has no changes now; press f to show all files, then r again.`,
        'warning',
      );
      return [];
    }
    const line = item.location.line;
    this.state.selectedFileIdentity = file.fileIdentity;
    const visible = diffView(this.state);
    const effects: ReviewingModelEffect[] = [];
    if (visible !== undefined && visible.file.fileIdentity === file.diffFileIdentity) {
      const row = visible.window.rows.find(candidate => candidate.newLine === line);
      if (row !== undefined) {
        this.state.selectedRowIdentity = row.rowIdentity;
        this.state.anchorSide = 'new';
      }
    } else {
      effects.push(...this.previewSelectedFile(line));
    }
    this.state.editor = {
      reviewIdentity: review.manifest.header.reviewIdentity,
      originReviewBasisIdentity,
      pathBytesBase64: file.pathBytesBase64,
      fileLabel: file.displayPath,
      line,
      body: fullBody,
      cursor: fullBody.length,
      reselectionRequired: false,
    };
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.state.provisionalMessage = undefined;
    this.say(`Sending ${ordinal} again: edit it if you like, then press Enter. It’s saved as a new Message.`, 'info');
    return effects;
  }

  /** Asks the agent to stop the selected Message's running turn; the card shows the outcome. */
  interruptSelectedMessage(now: number): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const messageIdentity = this.state.selectedMessageIdentity;
    if (review === undefined) return [];
    if (messageIdentity === undefined) {
      this.say(`No Message is selected. Select one in ${messagesPaneName(this.state)}, then press x.`, 'info');
      return [];
    }
    if (this.state.pending !== undefined) {
      this.say('Still saving something else; try again in a moment.', 'warning');
      return [];
    }
    const interaction = review.harnessInteraction;
    const handoff = interaction.handoffs.find(candidate => candidate.reviewMessageIdentity === messageIdentity);
    const invocation =
      handoff === undefined
        ? undefined
        : interaction.invocations.find(candidate => candidate.handoffIdentity === handoff.handoffIdentity);
    if (invocation === undefined || (invocation.status !== 'awaiting-start' && invocation.status !== 'active')) {
      this.say(`${agentName(this.state)} isn’t working on this Message.`, 'info');
      return [];
    }
    if (invocation.interruptionIntentIdentities.length > 0) {
      this.say(`Already asked ${agentName(this.state)} to stop; waiting for it.`, 'info');
      return [];
    }
    return this.requestInterruption(invocation.invocationIdentity, interaction.stateVersion, 1, now);
  }

  private requestInterruption(
    invocationIdentity: HarnessInvocationIdentity,
    expectedStateVersion: number,
    attempts: number,
    now: number,
  ): readonly ReviewingModelEffect[] {
    const command: WorkspaceCommand = {
      kind: 'harness.invocation.interruption.request',
      commandIdentity: commandIdentity(),
      expectedStateVersion,
      invocationIdentity,
    };
    this.beginPending({ kind: command.kind }, command.commandIdentity, this.state.focus, now);
    if (this.state.pending !== undefined) {
      this.state.pending = { ...this.state.pending, interruption: { invocationIdentity, attempts } };
    }
    return [{ type: 'execute', command }];
  }

  copyFocusedContent(): readonly ReviewingModelEffect[] {
    if (this.state.focus === 'diff') {
      const row = diffRow(this.state);
      if (row === undefined) {
        this.say('Select a Diff line to copy.', 'warning');
        return [];
      }
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          decodeBytesBase64(row.text.bytesBase64),
        );
      } catch {
        this.say('That line isn’t text, so it wasn’t copied.', 'warning');
        return [];
      }
      if (text.length === 0) {
        this.say('That line is empty; nothing was copied.', 'info');
        return [];
      }
      return [{ type: 'copy-text', source: 'diff-row', text, announce: 'always' }];
    }
    if (this.state.focus === 'questions') {
      const item = messageItem(this.state);
      if (item === undefined) {
        this.say('Select a Message to copy.', 'warning');
        return [];
      }
      let text =
        this.state.selectedMessageBody?.reviewMessageIdentity === item.reviewMessageIdentity
          ? this.state.selectedMessageBody.body
          : undefined;
      if (text === undefined && !item.body.truncated) {
        try {
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
            decodeBytesBase64(item.body.bytesBase64),
          );
        } catch {
          this.say('That Message isn’t text, so it wasn’t copied.', 'warning');
          return [];
        }
      }
      if (text === undefined) {
        this.say('The Message is still loading; try again in a moment.', 'info');
        return [];
      }
      if (text.length === 0) {
        this.say('That Message is empty; nothing was copied.', 'info');
        return [];
      }
      return [{ type: 'copy-text', source: 'message-body', text, announce: 'always' }];
    }
    this.say(`Press Tab to reach the Diff or ${messagesPaneName(this.state)}, then press y to copy.`, 'info');
    return [];
  }

  /** e or m: opens the list on the file or Message you're on; it says so instead when there's nothing to list. */
  openJumpList(kind: JumpListState['kind']): readonly ReviewingModelEffect[] {
    if (this.state.review === undefined) return [];
    this.state.jumpList = { kind, selectedKey: undefined, query: '', filtering: false };
    const rows = jumpListRows(this.state);
    if (rows.length === 0) {
      this.state.jumpList = undefined;
      this.say(kind === 'files' ? 'No files to list.' : 'No Messages yet. Press a on a line to write one.', 'info');
      return [];
    }
    this.state.jumpList.selectedKey = (rows.find(row => row.current) ?? rows[0])!.key;
    this.state.notice = undefined;
    this.state.showDetails = false;
    return [];
  }

  private handleJumpListInput(data: ReviewingInput): readonly ReviewingModelEffect[] {
    const list = this.state.jumpList;
    if (list === undefined) return [];
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    const rows = jumpListRows(this.state);
    const keepSelection = (): void => {
      const visible = jumpListRows(this.state);
      if (!visible.some(row => row.key === list.selectedKey)) list.selectedKey = visible[0]?.key;
    };
    if (matchesKey(data, Key.escape)) {
      // Esc lets go of a filter first, then closes.
      if (list.filtering || list.query !== '') {
        list.filtering = false;
        list.query = '';
        keepSelection();
      } else {
        this.state.jumpList = undefined;
      }
      return [];
    }
    if (matchesKey(data, Key.enter)) {
      const key = list.selectedKey;
      if (key === undefined || !rows.some(row => row.key === key)) return [];
      this.state.jumpList = undefined;
      return list.kind === 'files' ? this.jumpToFile(key) : this.jumpToMessage(key);
    }
    const move = (delta: number): readonly ReviewingModelEffect[] => {
      if (rows.length === 0) return [];
      const current = Math.max(
        0,
        rows.findIndex(row => row.key === list.selectedKey),
      );
      list.selectedKey = rows[cycledTarget(current, delta, rows.length)]!.key;
      return [];
    };
    if (matchesKey(data, Key.up)) return move(-1);
    if (matchesKey(data, Key.down)) return move(1);
    if (list.filtering) {
      if (matchesKey(data, Key.backspace)) {
        list.query = [...list.query].slice(0, -1).join('');
        keepSelection();
        return [];
      }
      const typed = printableInput(data);
      if (typed !== undefined) {
        list.query += typed;
        keepSelection();
      }
      return [];
    }
    if (data.text === 'k') return move(-1);
    if (data.text === 'j') return move(1);
    if (data.text === 'g') {
      list.selectedKey = rows[0]?.key;
      return [];
    }
    if (data.text === 'G') {
      list.selectedKey = rows.at(-1)?.key;
      return [];
    }
    if (data.text === '/') {
      list.filtering = true;
      return [];
    }
    // The key that opened the list closes it.
    if ((list.kind === 'files' && data.text === 'e') || (list.kind === 'messages' && data.text === 'm')) {
      this.state.jumpList = undefined;
    }
    return [];
  }

  private jumpToFile(fileIdentity: string): readonly ReviewingModelEffect[] {
    this.state.focus = 'diff';
    if (this.state.shownStep !== undefined) return this.selectChangedFile(fileIdentity);
    this.state.selectedDirectory = undefined;
    this.state.selectedFileIdentity = fileIdentity;
    this.state.selectedRowIdentity = undefined;
    return this.previewSelectedFile();
  }

  /** Enter on a Message: the Diff goes to its line at now, as Enter in History does. */
  private jumpToMessage(reviewMessageIdentity: string): readonly ReviewingModelEffect[] {
    const messages = this.state.review?.messages.messages;
    const index = messages?.items.findIndex(item => item.reviewMessageIdentity === reviewMessageIdentity) ?? -1;
    const item = messages?.items[index];
    if (messages === undefined || item === undefined) return [];
    if (this.state.shownStep !== undefined) this.closeShownStep();
    this.state.focus = 'diff';
    return this.navigateToMessage(item, messages.offset + index, true);
  }

  /**
   * J/K: the next or previous file in the Diff, from any pane and without the
   * Files pane on screen; a shown step moves through its own files.
   */
  jumpFile(direction: 1 | -1): readonly ReviewingModelEffect[] {
    const edge = direction > 0 ? 'This is the last file.' : 'This is the first file.';
    if (this.state.shownStep !== undefined) {
      const files = this.state.shownStep.files ?? [];
      if (files.length < 2) {
        this.say('Only one file changed in this step.', 'info');
        return [];
      }
      const current = files.findIndex(file => file.fileIdentity === this.state.selectedFileIdentity);
      const target = files[current + direction];
      if (target === undefined) {
        this.say(edge, 'info');
        return [];
      }
      return this.selectChangedFile(target.fileIdentity);
    }
    const review = this.state.review;
    const source = this.fileListSource();
    if (review === undefined || source === undefined) return [];
    if (source.total === 0) {
      this.say('No files to move between.', 'info');
      return [];
    }
    if (source.total === 1) {
      this.say(this.state.fileScope === 'changed' ? 'Only one file changed.' : 'Only one file here.', 'info');
      return [];
    }
    const files = jumpFiles(this.state);
    const current = files.findIndex(file => file.fileIdentity === this.state.selectedFileIdentity);
    const target = files[current + direction];
    if (target !== undefined) {
      this.state.selectedDirectory = undefined;
      this.state.selectedFileIdentity = target.fileIdentity;
      this.state.selectedRowIdentity = undefined;
      return this.previewSelectedFile();
    }
    // Past the loaded window: Files pages to the next one, the same way j/k there does.
    const loadedEnd = source.offset + files.length;
    if ((direction > 0 && loadedEnd < source.total) || (direction < 0 && source.offset > 0)) {
      return this.moveFile(direction);
    }
    this.say(edge, 'info');
    return [];
  }

  /** z: the Diff alone at every width, or every pane again; remembered like the other layout choices. */
  toggleCodeOnly(): readonly ReviewingModelEffect[] {
    this.setCodeOnly(!this.state.codeOnly);
    const narrow = layoutForWidth(this.state.width) === 'linear';
    this.say(
      this.state.codeOnly
        ? 'Code only. e lists files, m lists Messages, J/K move between files; z shows every pane.'
        : narrow
          ? 'Every pane is back for wider terminals; this width shows one pane at a time.'
          : 'Every pane is back.',
      'info',
    );
    return [this.reviewingPreferencesSaveEffect()];
  }

  private setCodeOnly(codeOnly: boolean): void {
    this.state.codeOnly = codeOnly;
    // The code is what this view is for, so a Review opens on the Diff.
    if (codeOnly && this.state.screen === 'review') this.state.focus = 'diff';
    this.setViewport(this.state.width, this.state.height);
  }

  reviewingPreferencesSaveEffect(): ReviewingModelEffect {
    return {
      type: 'save-reviewing-preferences',
      preferences: {
        arrangement: this.state.arrangement,
        theme: this.state.reviewingTheme,
        background: this.state.background,
        icons: this.state.icons,
        motion: this.state.motion,
        header: this.state.header,
        filesVisible: this.state.filePaneVisible,
        codeOnly: this.state.codeOnly,
        filesPaneWidth: this.state.leftPaneWidth,
        questionsPaneWidth: this.state.rightPaneWidth,
      },
    };
  }

  resizeFocusedPaneBorder(borderDelta: -2 | 2): readonly ReviewingModelEffect[] {
    if (this.state.layout === 'linear' || this.state.focus === 'diff') {
      this.say(`Press Tab to reach Files or ${messagesPaneName(this.state)}, then press < or > to resize it.`, 'info');
      return [];
    }
    const centerMinimum = diffMinimumWidth(this.state.width);
    if (this.state.layout === 'wide' && this.state.focus === 'files' && this.state.filePaneVisible) {
      const maximum = Math.max(
        16,
        this.state.width - Math.min(this.state.rightPaneWidth, this.state.width) - centerMinimum - 2,
      );
      const current = clamp(this.state.leftPaneWidth, 16, maximum);
      this.state.leftPaneWidth = clamp(current + borderDelta, 16, maximum);
      this.state.notice = `Files pane width ${this.state.leftPaneWidth}.`;
      return this.state.leftPaneWidth === current ? [] : [this.reviewingPreferencesSaveEffect()];
    }
    if (this.state.focus === 'questions' || this.state.focus === 'files') {
      const dividers = this.state.layout === 'wide' && this.state.filePaneVisible ? 2 : 1;
      const left =
        this.state.layout === 'wide' && this.state.filePaneVisible
          ? Math.min(this.state.leftPaneWidth, this.state.width)
          : 0;
      const maximum = Math.max(20, this.state.width - left - centerMinimum - dividers);
      const current = clamp(this.state.rightPaneWidth, 20, maximum);
      this.state.rightPaneWidth = clamp(current - borderDelta, 20, maximum);
      this.state.notice = `${this.state.focus === 'files' ? 'Files' : messagesPaneName(this.state)} pane width ${this.state.rightPaneWidth}.`;
      return this.state.rightPaneWidth === current ? [] : [this.reviewingPreferencesSaveEffect()];
    }
    return [];
  }

  moveFocus(direction: -1 | 1): readonly ReviewingModelEffect[] {
    if (this.state.screen !== 'review') return [];
    const order: readonly ReviewRegion[] =
      this.state.shownStep !== undefined
        ? ['files', 'diff', 'questions']
        : this.state.filePaneVisible
          ? ['files', 'diff', 'questions']
          : ['diff', 'questions'];
    const current = order.indexOf(this.state.focus as ReviewRegion);
    const next = (Math.max(0, current) + direction + order.length) % order.length;
    const focus = order[next] ?? 'diff';
    this.state.focus = focus;
    if (focus === 'files' || focus === 'questions') this.state.balancedContext = focus;
    if (focus === 'questions') {
      if ((this.state.review?.messages.messages.total ?? 0) > 0) {
        return this.loadSelectedMessageBody();
      }
      const item = questionItem(this.state);
      return item === undefined
        ? []
        : this.navigateToQuestion(
            item,
            (this.state.review?.questions.list.offset ?? 0) +
              Math.max(
                0,
                this.state.review?.questions.list.items.findIndex(
                  candidate => candidate.itemIdentity === item.itemIdentity,
                ) ?? 0,
              ),
          );
    }
    return [];
  }

  move(direction: -1 | 1): readonly ReviewingModelEffect[] {
    if (this.state.screen === 'home') return this.moveHome(direction, true);
    if (this.state.screen !== 'review' || this.state.review === undefined) return [];
    if (this.state.focus === 'files' && this.state.shownStep !== undefined) return this.moveChangedFile(direction);
    if (this.state.focus === 'questions' && this.state.shownStep !== undefined && this.state.review.history) {
      return this.moveStep(direction, true);
    }
    if (this.state.focus === 'files') return this.moveFile(direction);
    if (this.state.focus === 'questions') {
      return (this.state.review?.messages.messages.total ?? 0) > 0
        ? this.moveMessage(direction)
        : this.moveQuestion(direction);
    }
    return this.moveDiff(direction);
  }

  page(direction: -1 | 1): readonly ReviewingModelEffect[] {
    const visible = Math.max(1, this.state.height - 10);
    if (this.state.screen === 'home') return this.moveHome(direction * visible);
    if (this.state.screen !== 'review') return [];
    const region = this.state.focus as ReviewRegion;
    const scroll = this.state.paneScroll[region];
    const visual = scrollWithinOversizedSelection(scroll, direction, scroll.viewportSize);
    if (visual.moved) {
      this.state.paneScroll[region] = visual.state;
      return [];
    }
    const distance = direction < 0 ? scroll.pageUp : scroll.pageDown;
    if (region === 'files' && this.state.shownStep !== undefined) {
      return this.moveChangedFile(direction * distance, true);
    }
    if (region === 'files') return this.moveFile(direction * distance);
    if (region === 'questions') {
      return (this.state.review?.messages.messages.total ?? 0) > 0
        ? this.moveMessage(direction * distance)
        : this.moveQuestion(direction * distance);
    }
    return this.moveDiff(direction * distance);
  }

  moveToEdge(edge: 'first' | 'last'): readonly ReviewingModelEffect[] {
    // Edge jumps clamp to the opposite extreme; only single steps and pages cycle.
    const direction = edge === 'first' ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    if (this.state.screen === 'home') return this.moveHome(direction);
    if (this.state.screen !== 'review') return [];
    if (this.state.focus === 'files' && this.state.shownStep !== undefined) {
      return this.moveChangedFile(direction, true);
    }
    if (this.state.focus === 'files') return this.moveFile(direction, true);
    if (this.state.focus === 'questions') {
      return (this.state.review?.messages.messages.total ?? 0) > 0
        ? this.moveMessage(direction, true)
        : this.moveQuestion(direction, true);
    }
    if (this.selectedFileEntry()?.status === 'unchanged') return this.moveUnchangedContentLine(direction);
    return this.moveDiff(direction, true);
  }

  private moveHome(delta: number, cycleSingleStep: boolean = false): readonly ReviewingModelEffect[] {
    const home = this.state.home;
    if (home === undefined) return [];
    if (this.state.homeMode === 'launcher') {
      const options: HomeLauncherSelection[] = [
        'primary',
        ...(home.currentReview === undefined ? [] : ['new-current' as const]),
        'comparison',
        ...(home.header.totalPastReviews > 0 ? ['history' as const] : []),
      ];
      const current = Math.max(0, options.indexOf(this.state.homeLauncherSelection));
      const target = cycleSingleStep
        ? (current + delta + options.length) % options.length
        : clamp(current + delta, 0, options.length - 1);
      this.state.homeLauncherSelection = options[target] ?? 'primary';
      return [];
    }
    if (this.state.homeMode === 'comparison') {
      const commits = this.commitGraphCommits();
      if (commits.length === 0) return [];
      const current = Math.max(
        0,
        commits.findIndex(commit => commit.objectIdentity === this.state.selectedCommitIdentity),
      );
      const target = cycleSingleStep
        ? (current + delta + commits.length) % commits.length
        : clamp(current + delta, 0, commits.length - 1);
      const selected = commits[target];
      if (selected === undefined || selected.objectIdentity === this.state.selectedCommitIdentity) {
        return [];
      }
      return this.selectComparisonCommit(selected.objectIdentity);
    }
    if (home.reviews.items.length === 0) return [];
    const currentLocal = Math.max(
      0,
      home.reviews.items.findIndex(item => item.reviewIdentity === this.state.selectedReviewIdentity),
    );
    const currentAbsolute = home.reviews.offset + currentLocal;
    const targetAbsolute = clamp(currentAbsolute + delta, 0, Math.max(0, home.header.totalPastReviews - 1));
    if (targetAbsolute >= home.reviews.offset && targetAbsolute < home.reviews.offset + home.reviews.items.length) {
      this.state.selectedReviewIdentity = home.reviews.items[targetAbsolute - home.reviews.offset]?.reviewIdentity;
      return [];
    }
    const offset = Math.floor(targetAbsolute / HOME_WINDOW_SIZE) * HOME_WINDOW_SIZE;
    this.setLoading('Loading Review history', 'home');
    return [
      {
        type: 'show-home',
        offset,
      },
    ];
  }

  private beginHistoricalDialog(returnTarget: ReviewLoadTarget): void {
    if (this.state.historicalDialog !== undefined) return;
    const review = this.state.review;
    if (review?.source.kind !== 'live') return;
    this.state.historicalDialog = {
      returnTarget,
      base: {
        review,
        focus: this.state.focus,
        balancedContext: this.state.balancedContext,
        selectedFileIdentity: this.state.selectedFileIdentity,
        selectedRowIdentity: this.state.selectedRowIdentity,
        selectedQuestionIdentity: this.state.selectedQuestionIdentity,
        expandedQuestionIdentity: this.state.expandedQuestionIdentity,
        selectedQuestionBody: this.state.selectedQuestionBody,
        questionCardScrollOffset: this.state.questionCardScrollOffset,
        anchorSide: this.state.anchorSide,
        diffMode: this.state.diffMode,
        wrapDiffLines: this.state.wrapDiffLines,
        diffHorizontalOffset: this.state.diffHorizontalOffset,
        loading: this.state.loading,
        notice: this.state.notice,
        showDetails: this.state.showDetails,
      },
    };
    this.state.showDetails = false;
  }

  private closeHistoricalDialog(): readonly ReviewingModelEffect[] {
    const dialog = this.state.historicalDialog;
    if (dialog === undefined) return [];
    const base = dialog.base;
    this.state.review = base.review;
    this.state.focus = base.focus;
    this.state.balancedContext = base.balancedContext;
    this.state.selectedFileIdentity = base.selectedFileIdentity;
    this.state.selectedRowIdentity = base.selectedRowIdentity;
    this.state.selectedQuestionIdentity = base.selectedQuestionIdentity;
    this.state.expandedQuestionIdentity = base.expandedQuestionIdentity;
    this.state.selectedQuestionBody = base.selectedQuestionBody;
    this.state.questionCardScrollOffset = base.questionCardScrollOffset;
    this.state.anchorSide = base.anchorSide;
    this.state.diffMode = base.diffMode;
    this.state.wrapDiffLines = base.wrapDiffLines;
    this.state.diffHorizontalOffset = base.diffHorizontalOffset;
    this.state.loading = base.loading;
    this.state.notice = base.notice;
    this.state.showDetails = base.showDetails;
    this.state.historicalDialog = undefined;
    return [{ type: 'show-review', target: dialog.returnTarget }];
  }

  private currentReviewTarget(fileIdentity = this.state.selectedFileIdentity): ReviewLoadTarget | undefined {
    const review = this.state.review;
    if (review === undefined) return undefined;
    return {
      reviewIdentity: review.manifest.header.reviewIdentity,
      ...(review.source.kind === 'snapshot' ? { reviewSnapshotIdentity: review.source.reviewSnapshotIdentity } : {}),
      ...(this.state.activeReviewBasisIdentity === undefined
        ? {}
        : { reviewBasisIdentity: this.state.activeReviewBasisIdentity }),
      versionsOffset: review.versions.versions.offset,
      ...(review.liveFiles?.status === 'available' ? { liveFilesOffset: review.liveFiles.files.offset } : {}),
      manifestOffset: review.manifest.manifest.offset,
      ...(fileIdentity === undefined ? {} : { fileIdentity }),
      diffOffset: diffReloadOffset(this.state),
      messageOffset: review.messages.messages.offset,
      questionOffset: review.questions.list.offset,
    };
  }

  private moveVersion(delta: -1 | 1): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined) return [];
    const versions = review.versions.versions;
    if (review.source.kind === 'live') {
      if (delta > 0) {
        this.say('Already at now. Press [ to open the saved Versions.', 'info');
        return [];
      }
      const latest = versions.items.find(item => item.isLatest);
      if (latest === undefined) return [];
      return this.openVersion(latest.reviewSnapshotIdentity);
    }
    const selectedSnapshotIdentity = review.source.reviewSnapshotIdentity;
    const current = versions.items.find(item => item.reviewSnapshotIdentity === selectedSnapshotIdentity);
    if (current === undefined) return [];
    const nextOrdinal = current.ordinal + delta;
    if (nextOrdinal > versions.total) {
      if (this.state.historicalDialog !== undefined) return this.closeHistoricalDialog();
      if (review.manifest.header.retention !== 'current' || review.manifest.header.title !== 'Review current changes') {
        this.say('This is the newest Version.', 'info');
        return [];
      }
      return this.returnToLiveChanges();
    }
    if (nextOrdinal < 1) {
      this.say('This is the oldest Version.', 'info');
      return [];
    }
    const next = versions.items.find(item => item.ordinal === nextOrdinal);
    if (next === undefined) {
      this.say('That Version isn’t loaded yet; scroll to it first.', 'info');
      return [];
    }
    return this.openVersion(next.reviewSnapshotIdentity);
  }

  private openVersion(reviewSnapshotIdentity: ReviewSnapshotIdentity): readonly ReviewingModelEffect[] {
    const target = this.currentReviewTarget();
    if (target === undefined) return [];
    this.beginHistoricalDialog(target);
    this.setLoading('Opening immutable Review Version', 'diff');
    return [
      {
        type: 'show-review',
        target: {
          ...target,
          reviewSnapshotIdentity,
          manifestOffset: 0,
          diffOffset: 0,
          questionOffset: 0,
        },
        selection: {
          ...(this.state.selectedFileIdentity === undefined ? {} : { fileIdentity: this.state.selectedFileIdentity }),
        },
      },
    ];
  }

  returnToLiveChanges(): readonly ReviewingModelEffect[] {
    if (this.state.historicalDialog !== undefined) {
      return this.closeHistoricalDialog();
    }
    const review = this.state.review;
    const target = this.currentReviewTarget();
    if (
      review === undefined ||
      target === undefined ||
      review.source.kind === 'live' ||
      review.manifest.header.retention !== 'current' ||
      review.manifest.header.title !== 'Review current changes'
    ) {
      if (review !== undefined) {
        this.say(
          review.source.kind === 'live'
            ? 'Already showing Live Changes.'
            : 'R returns to Live Changes only in a Review of your current changes.',
          'info',
        );
      }
      return [];
    }
    this.setLoading('Returning to Live Changes', 'diff');
    const { reviewSnapshotIdentity: _selected, ...liveTarget } = target;
    return [
      {
        type: 'show-review',
        target: {
          ...liveTarget,
          manifestOffset: 0,
          diffOffset: 0,
          questionOffset: 0,
        },
        selection: {
          ...(this.state.selectedFileIdentity === undefined ? {} : { fileIdentity: this.state.selectedFileIdentity }),
        },
      },
    ];
  }

  /** Follows Files-pane selection with a bounded Diff load; skipped for unchanged files. */
  previewSelectedFile(anchorLine?: number): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const file = this.selectedFileEntry();
    if (review === undefined || file === undefined) {
      this.state.unchangedContent = undefined;
      return [];
    }
    if (review.source.kind !== 'live' || file.status === 'unchanged' || file.diffFileIdentity === undefined) {
      this.state.selectedRowIdentity = undefined;
      return this.previewUnchangedFile(file, anchorLine);
    }
    // A refreshed Review bundle can retain the already selected Diff. Do not
    // erase its row selection merely because preview reconciliation revisits
    // the same file after the row has been selected locally.
    const shown = diffView(this.state);
    if (
      shown !== undefined &&
      shown.file.fileIdentity === file.diffFileIdentity &&
      diffSourceKey(shown) === reviewingSourceKey(review)
    ) {
      // Back on the file already shown (J then K): a load started for the one
      // left behind no longer counts.
      if (this.state.loading?.region === 'diff') this.state.loading = undefined;
      return [];
    }
    this.state.selectedRowIdentity = undefined;
    const cached = this.#diffCache.get(`${reviewingSourceKey(review)}:${file.diffFileIdentity}`);
    if (cached !== undefined && cached.status === 'available') {
      // Cached views passed applyReviewDiff's guards when they were first loaded.
      const anchorRow =
        anchorLine === undefined
          ? undefined
          : (cached.window.rows.find(row => row.newLine === anchorLine) ??
            cached.window.rows.find(row => row.oldLine === anchorLine));
      const jumpRow = cached.firstChangedRow;
      const row =
        anchorRow ??
        (jumpRow !== undefined &&
        jumpRow >= cached.window.offset &&
        jumpRow < cached.window.offset + cached.window.rows.length
          ? preferCurrentSide(cached.window.rows, jumpRow - cached.window.offset)
          : preferCurrentSide(cached.window.rows, 0));
      this.state.review = { ...review, diff: cached };
      this.state.selectedRowIdentity = row?.rowIdentity;
      this.state.anchorSide = row?.newLine !== undefined ? 'new' : 'old';
      return [];
    }
    const current = this.currentReviewTarget(file.diffFileIdentity);
    if (current === undefined) return [];
    return [
      {
        type: 'preview-file',
        target: {
          ...current,
          fileIdentity: file.diffFileIdentity,
          diffOffset: 0,
          ...(anchorLine === undefined ? {} : { anchorLine }),
        },
        selection: {
          fileIdentity: file.fileIdentity,
          ...(anchorLine === undefined ? {} : { anchorLine }),
        },
      },
    ];
  }

  private previewUnchangedFile(
    file: ReviewingFileItem | undefined,
    anchorLine?: number,
    windowLine?: number,
  ): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined || review.source.kind !== 'live' || file?.status !== 'unchanged') {
      this.state.unchangedContent = undefined;
      this.#unchangedContentReload = undefined;
      return [];
    }
    const retainedContent = this.state.unchangedContent;
    const retainedSamePath = retainedContent?.pathBytesBase64 === file.pathBytesBase64;
    const reload = this.#unchangedContentReload;
    const reloadingSamePath =
      reload?.reviewIdentity === review.manifest.header.reviewIdentity &&
      reload.pathBytesBase64 === file.pathBytesBase64;
    const previouslyLoadedSamePath = retainedSamePath || reloadingSamePath;
    const requestedLine =
      anchorLine ?? (retainedSamePath ? this.state.unchangedContentLine : reloadingSamePath ? reload?.line : undefined);
    const readLine = windowLine ?? requestedLine ?? 1;
    const retainedIsCurrent =
      retainedSamePath &&
      retainedContent !== undefined &&
      contentCacheKey(retainedContent.view, file.pathBytesBase64) ===
        `${reviewingSourceKey(review)}:${file.pathBytesBase64}`;
    if (
      retainedIsCurrent &&
      (retainedContent.view.status !== 'available' ||
        contentWindowContainsLine(retainedContent.view, Math.min(readLine, retainedContent.view.content.totalLines)))
    ) {
      if (anchorLine !== undefined) this.unchangedContentLineTo(anchorLine);
      return [];
    }
    const cached = this.#contentCache.get(`${reviewingSourceKey(review)}:${file.pathBytesBase64}`);
    if (
      cached !== undefined &&
      (cached.status !== 'available' ||
        contentWindowContainsLine(cached, Math.min(readLine, cached.content.totalLines)))
    ) {
      this.state.unchangedContent = { pathBytesBase64: file.pathBytesBase64, view: cached };
      this.#unchangedContentReload = undefined;
      if (requestedLine !== undefined) this.unchangedContentLineTo(requestedLine);
      else if (!previouslyLoadedSamePath) this.state.unchangedContentLine = 1;
      return [];
    }
    // Remember position across repeated refreshes, but never present old bytes
    // under the new source's label while a replacement load is pending.
    this.#unchangedContentReload =
      requestedLine === undefined
        ? undefined
        : {
            reviewIdentity: review.manifest.header.reviewIdentity,
            pathBytesBase64: file.pathBytesBase64,
            line: requestedLine,
          };
    // A page load of the same source can keep its old window visible. A source
    // replacement still hides stale bytes until the matching read arrives.
    if (!retainedIsCurrent) this.state.unchangedContent = undefined;
    return [
      {
        type: 'preview-file-content',
        reviewIdentity: review.manifest.header.reviewIdentity,
        liveChangesIdentity: review.source.liveChangesIdentity,
        pathBytesBase64: file.pathBytesBase64,
        // A refresh keeps the selected line; a new file starts at line one.
        ...(requestedLine === undefined ? {} : { anchorLine: requestedLine }),
        ...(windowLine === undefined ? {} : { windowLine }),
      },
    ];
  }

  applyUnchangedFileContent(
    pathBytesBase64: string,
    view: ReviewLiveFileContentView,
    anchorLine?: number,
    windowLine?: number,
  ): void {
    const review = this.state.review;
    if (
      review === undefined ||
      review.source.kind !== 'live' ||
      review.manifest.header.reviewIdentity !== view.reviewIdentity ||
      view.stateVersion !== review.stateVersion ||
      view.liveChangesIdentity !== review.source.liveChangesIdentity ||
      (view.status === 'available' && view.path.bytesBase64 !== pathBytesBase64)
    ) {
      return;
    }
    const reload = this.#unchangedContentReload;
    const reloadingSamePath =
      reload?.reviewIdentity === review.manifest.header.reviewIdentity && reload.pathBytesBase64 === pathBytesBase64;
    const previouslyLoadedSamePath =
      this.state.unchangedContent?.pathBytesBase64 === pathBytesBase64 || reloadingSamePath;
    const requestedLine = anchorLine ?? (reloadingSamePath ? reload?.line : undefined);
    this.#synchronizeSourceCaches(review);
    this.#contentCache.set(contentCacheKey(view, pathBytesBase64), view);
    if (this.selectedFileEntry()?.pathBytesBase64 !== pathBytesBase64) return;
    this.state.unchangedContent = { pathBytesBase64, view };
    this.#unchangedContentReload = undefined;
    // A replacement keeps its selected line, even after intermediate refreshes
    // have hidden the old content while waiting for this exact source.
    if (requestedLine !== undefined) this.unchangedContentLineTo(requestedLine);
    else if (!previouslyLoadedSamePath) this.state.unchangedContentLine = 1;
    if (
      view.status === 'available' &&
      windowLine !== undefined &&
      !contentWindowContainsLine(view, this.state.unchangedContentLine)
    ) {
      this.unchangedContentLineTo(
        clamp(windowLine, view.content.firstLine, view.content.firstLine + view.content.lineCount - 1),
      );
    }
  }

  failUnchangedFileContent(pathBytesBase64: string): void {
    if (this.selectedFileEntry()?.pathBytesBase64 !== pathBytesBase64) return;
    this.say('Couldn’t load this file.', 'error');
  }

  /** Stores a prefetched Diff so hovering that file renders synchronously. */
  warmDiff(diff: ReviewDiffView | ReviewLiveDiffView): void {
    if (diff.status !== 'available') return;
    const review = this.state.review;
    if (review === undefined || diffSourceKey(diff) !== reviewingSourceKey(review)) return;
    this.#synchronizeSourceCaches(review);
    this.#diffCache.set(diffCacheKey(diff), this.#widenDiff(diff));
  }

  /** Stores prefetched unchanged-file content. */
  warmContent(view: ReviewLiveFileContentView): void {
    const review = this.state.review;
    if (review?.source.kind !== 'live' || view.status !== 'available') return;
    const key = contentCacheKey(view, view.path.bytesBase64);
    if (key !== `${reviewingSourceKey(review)}:${view.path.bytesBase64}`) return;
    this.#synchronizeSourceCaches(review);
    this.#contentCache.set(key, view);
  }

  /** The visible files adjacent to the selection, for idle prefetch. */
  neighborPreviewables(): readonly (
    | { readonly kind: 'diff'; readonly fileIdentity: string }
    | { readonly kind: 'content'; readonly liveChangesIdentity: string; readonly pathBytesBase64: string }
  )[] {
    const review = this.state.review;
    if (review === undefined || this.state.screen !== 'review') return [];
    const nodes = this.visibleTreeNodes();
    const index = this.findNodeIndex(nodes);
    if (index < 0) return [];
    const result: (
      | { readonly kind: 'diff'; readonly fileIdentity: string }
      | { readonly kind: 'content'; readonly liveChangesIdentity: string; readonly pathBytesBase64: string }
    )[] = [];
    for (const neighbor of [nodes[index - 1], nodes[index + 1]]) {
      if (neighbor?.kind !== 'file') continue;
      const file = neighbor.file;
      if (file.status === 'unchanged') {
        if (review.source.kind === 'live') {
          result.push({
            kind: 'content',
            liveChangesIdentity: review.source.liveChangesIdentity,
            pathBytesBase64: file.pathBytesBase64,
          });
        }
        continue;
      }
      if (
        file.diffFileIdentity !== undefined &&
        this.#diffCache.get(`${reviewingSourceKey(review)}:${file.diffFileIdentity}`) === undefined
      ) {
        result.push({ kind: 'diff', fileIdentity: file.diffFileIdentity });
      }
    }
    return result;
  }

  /** Accepts the View's visible content-line budget. */
  synchronizeUnchangedContentPageSize(size: number): void {
    this.state.unchangedContentPageSize = clamp(Math.floor(size), 1, 200);
  }

  /** Selects an absolute 1-based content line, keeping it in view. */
  unchangedContentLineTo(line: number): void {
    const view = this.state.unchangedContent?.view;
    if (view?.status !== 'available') return;
    const total = view.content.totalLines;
    const selected = clamp(Math.floor(line), 1, total);
    this.state.unchangedContentLine = selected;
    const pageSize = this.state.unchangedContentPageSize;
    const offset = this.state.unchangedContentOffset;
    if (selected - 1 < offset) this.state.unchangedContentOffset = selected - 1;
    else if (selected - 1 >= offset + pageSize) this.state.unchangedContentOffset = selected - pageSize;
  }

  moveUnchangedContentLine(delta: number): readonly ReviewingModelEffect[] {
    this.unchangedContentLineTo(this.state.unchangedContentLine + delta);
    const content = this.state.unchangedContent?.view;
    const file = this.selectedFileEntry();
    const load =
      content?.status === 'available' &&
      file?.status === 'unchanged' &&
      !contentWindowContainsLine(content, this.state.unchangedContentLine)
        ? this.previewUnchangedFile(file, this.state.unchangedContentLine)
        : [];
    return [
      ...load,
      ...this.openMessagesOn(messagesOnLines(this.state).new.get(this.state.unchangedContentLine) ?? []),
    ];
  }

  /**
   * Landing on a line that has Messages selects the first of them, so its card
   * opens beneath the line; the selection stays put on lines without one.
   */
  private openMessagesOn(onLine: readonly ReviewMessageListItem[]): readonly ReviewingModelEffect[] {
    const first = onLine[0];
    if (first === undefined) return [];
    const changes = this.state.shownStep;
    if (onLine.some(item => item.reviewMessageIdentity === this.state.selectedMessageIdentity)) {
      if (changes !== undefined) this.state.shownStep = { ...changes, openMessage: this.state.selectedMessageIdentity };
      return [];
    }
    if (changes !== undefined) this.state.shownStep = { ...changes, openMessage: first.reviewMessageIdentity };
    this.state.selectedMessageIdentity = first.reviewMessageIdentity;
    this.state.selectedMessageBody = undefined;
    this.state.selectedMessageResponseBody = undefined;
    this.state.questionCardScrollOffset = 0;
    return this.loadSelectedMessageBody();
  }

  private selectedFileEntry(): ReviewingFileItem | undefined {
    return reviewingFiles(this.state.review, this.state.fileScope).find(
      candidate => candidate.fileIdentity === this.state.selectedFileIdentity,
    );
  }

  private fileListSource(): { readonly offset: number; readonly total: number } | undefined {
    const review = this.state.review;
    if (review === undefined) return undefined;
    return this.state.fileScope === 'all' && review.liveFiles?.status === 'available'
      ? { offset: review.liveFiles.files.offset, total: review.liveFiles.files.total }
      : { offset: review.manifest.manifest.offset, total: review.manifest.manifest.totalFiles };
  }

  private visibleTreeNodes(): readonly ReviewFileTreeNode[] {
    return reviewFileTreeNodes(
      reviewingFiles(this.state.review, this.state.fileScope),
      this.state.collapsedDirectories,
    );
  }

  private findNodeIndex(nodes: readonly ReviewFileTreeNode[]): number {
    if (this.state.selectedDirectory !== undefined) {
      const directory = nodes.findIndex(
        node => node.kind === 'directory' && node.directory === this.state.selectedDirectory,
      );
      if (directory >= 0) return directory;
    }
    if (this.state.selectedFileIdentity !== undefined) {
      const file = nodes.findIndex(
        node => node.kind === 'file' && node.file.fileIdentity === this.state.selectedFileIdentity,
      );
      if (file >= 0) return file;
    }
    return -1;
  }

  private selectTreeNode(node: ReviewFileTreeNode): readonly ReviewingModelEffect[] {
    if (node.kind === 'directory') {
      if (this.state.selectedDirectory === node.directory) return [];
      // A folder selection keeps the last file's Diff on screen; the Files pane
      // just moves the highlight.
      this.state.selectedDirectory = node.directory;
      this.state.selectedRowIdentity = undefined;
      return [];
    }
    if (this.state.selectedDirectory === undefined && this.state.selectedFileIdentity === node.file.fileIdentity) {
      return [];
    }
    this.state.selectedDirectory = undefined;
    this.state.selectedFileIdentity = node.file.fileIdentity;
    return this.previewSelectedFile();
  }

  /** Moves selection to a visible node when a collapse hides it. */
  private fixupCollapsedSelection(): boolean {
    const nodes = this.visibleTreeNodes();
    if (this.findNodeIndex(nodes) >= 0) return false;
    const files = reviewingFiles(this.state.review, this.state.fileScope);
    const selectedFlat = files.findIndex(file => file.fileIdentity === this.state.selectedFileIdentity);
    const next =
      nodes.find(node => node.flat > selectedFlat) ??
      [...nodes].reverse().find(node => node.flat < selectedFlat) ??
      nodes[0];
    if (next === undefined) return false;
    if (next.kind === 'directory') {
      this.state.selectedDirectory = next.directory;
      this.state.selectedFileIdentity = undefined;
    } else {
      this.state.selectedDirectory = undefined;
      this.state.selectedFileIdentity = next.file.fileIdentity;
    }
    return true;
  }

  /** neo-tree h: collapse the selected folder, or the file's parent folder. */
  collapseSelected(): readonly ReviewingModelEffect[] {
    if (this.state.selectedDirectory !== undefined) {
      const directory = this.state.selectedDirectory;
      if (!this.state.collapsedDirectories.includes(directory)) {
        this.state.collapsedDirectories = Object.freeze([...this.state.collapsedDirectories, directory]);
        this.state.notice = `Collapsed ${directory}`;
      }
      return [];
    }
    const file = this.selectedFileEntry();
    const slash = file?.displayPath.lastIndexOf('/') ?? -1;
    if (file === undefined || slash < 0) {
      this.state.notice = 'Root files cannot be collapsed.';
      return [];
    }
    const parent = `${file.displayPath.slice(0, slash)}/`;
    if (!this.state.collapsedDirectories.includes(parent)) {
      this.state.collapsedDirectories = Object.freeze([...this.state.collapsedDirectories, parent]);
      this.state.notice = `Collapsed ${parent}`;
    }
    // The cursor moves onto the collapsed folder; the Diff keeps the last file.
    this.state.selectedDirectory = parent;
    return [];
  }

  /** neo-tree l: expand the selected folder, descend into it, or open the file. */
  expandSelected(): readonly ReviewingModelEffect[] {
    if (this.state.selectedDirectory !== undefined) {
      const directory = this.state.selectedDirectory;
      if (this.state.collapsedDirectories.includes(directory)) {
        this.state.collapsedDirectories = Object.freeze(
          this.state.collapsedDirectories.filter(item => item !== directory),
        );
        this.state.notice = `Expanded ${directory}`;
        return [];
      }
      const nodes = this.visibleTreeNodes();
      const index = nodes.findIndex(node => node.kind === 'directory' && node.directory === directory);
      const child = nodes[index + 1];
      if (child === undefined) return [];
      return this.selectTreeNode(child);
    }
    return this.openSelectedFile();
  }

  /** neo-tree W/E equivalents: fold or unfold every folder at once. */
  collapseAllFolders(): readonly ReviewingModelEffect[] {
    const directories = new Set<string>();
    for (const file of reviewingFiles(this.state.review, this.state.fileScope)) {
      const slash = file.displayPath.lastIndexOf('/');
      if (slash < 0) continue;
      const segments = file.displayPath.slice(0, slash).split('/');
      for (let depth = 1; depth <= segments.length; depth += 1) {
        directories.add(`${segments.slice(0, depth).join('/')}/`);
      }
    }
    this.state.collapsedDirectories = Object.freeze([...directories]);
    this.state.notice = 'All folders collapsed.';
    this.fixupCollapsedSelection();
    return this.previewSelectedFile();
  }

  expandAllFolders(): readonly ReviewingModelEffect[] {
    this.state.collapsedDirectories = Object.freeze([]);
    this.state.notice = 'All folders expanded.';
    return this.previewSelectedFile();
  }

  private toggleDirectory(directory: string): readonly ReviewingModelEffect[] {
    if (this.state.collapsedDirectories.includes(directory)) {
      this.state.collapsedDirectories = Object.freeze(
        this.state.collapsedDirectories.filter(item => item !== directory),
      );
      this.state.notice = `Expanded ${directory}`;
      return [];
    }
    this.state.collapsedDirectories = Object.freeze([...this.state.collapsedDirectories, directory]);
    this.state.notice = `Collapsed ${directory}`;
    // If the selection lived inside, move the cursor onto the collapsed folder.
    if (this.selectedFileEntry()?.displayPath.startsWith(directory)) {
      this.state.selectedDirectory = directory;
    }
    return [];
  }

  openSelectedFile(): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined) return [];
    const file = reviewingFiles(review, this.state.fileScope).find(
      candidate => candidate.fileIdentity === this.state.selectedFileIdentity,
    );
    if (file === undefined) return [];
    this.state.focus = 'diff';
    if (file.diffFileIdentity === undefined || file.status === 'unchanged') {
      this.state.notice = `${file.displayPath} has no changes here. Press a to leave a Message on line 1.`;
      return this.previewUnchangedFile(file);
    }
    if (diffView(this.state)?.file.fileIdentity === file.diffFileIdentity) return [];
    const current = this.currentReviewTarget(file.diffFileIdentity);
    if (current === undefined) return [];
    this.state.selectedRowIdentity = undefined;
    this.setLoading('Loading selected Diff', 'diff');
    return [
      {
        type: 'show-review-diff',
        target: { ...current, fileIdentity: file.diffFileIdentity, diffOffset: 0 },
        selection: { fileIdentity: file.fileIdentity },
      },
    ];
  }

  private loadSelectedMessageBody(): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const item = messageItem(this.state);
    if (review === undefined || item === undefined) return [];
    const reviewIdentity = review.manifest.header.reviewIdentity;
    const effects: ReviewingModelEffect[] = [];
    if (item.body.truncated && this.state.selectedMessageBody?.reviewMessageIdentity !== item.reviewMessageIdentity) {
      effects.push({
        type: 'load-message-body',
        part: 'message',
        reviewIdentity,
        reviewMessageIdentity: item.reviewMessageIdentity,
      });
    }
    if (
      item.response?.body.truncated === true &&
      this.state.selectedMessageResponseBody?.reviewMessageIdentity !== item.reviewMessageIdentity
    ) {
      effects.push({
        type: 'load-message-body',
        part: 'response',
        reviewIdentity,
        reviewMessageIdentity: item.reviewMessageIdentity,
      });
    }
    return effects;
  }

  private openSelectedMessage(): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const item = messageItem(this.state);
    if (review === undefined || item === undefined) return [];
    const local = review.messages.messages.items.indexOf(item);
    return this.navigateToMessage(item, review.messages.messages.offset + Math.max(0, local), true);
  }

  /**
   * Follows one Messages-pane selection into the Diff: the anchored row is
   * selected and its file window loaded, or the Message's origin basis is
   * opened when it belongs to another Review point.
   */
  private navigateToMessage(
    item: ReviewMessageListItem,
    messageAbsolute: number,
    /** Load the Message's file when it isn't loaded: Enter does, moving through History doesn't. */
    reach = false,
    /** A refresh following the Message keeps what the status line just said (its answer, a commit). */
    keepNotice = false,
  ): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined) return [];
    this.state.selectedMessageIdentity = item.reviewMessageIdentity;
    this.state.selectedMessageBody = undefined;
    this.state.selectedMessageResponseBody = undefined;
    const loadBody = this.loadSelectedMessageBody();
    if (item.originReviewBasisIdentity !== this.state.activeReviewBasisIdentity) {
      return [
        ...loadBody,
        {
          type: 'open-review-message-origin',
          reviewIdentity: review.manifest.header.reviewIdentity,
          reviewMessageIdentity: item.reviewMessageIdentity,
          messageAbsolute,
        },
      ];
    }
    const line = item.location.line;
    const file = reviewingFiles(review, this.state.fileScope).find(
      candidate => candidate.pathBytesBase64 === item.location.file.bytesBase64,
    );
    const path = item.location.file.bytesBase64;
    if (file === undefined) {
      const request = this.#messageFileRequest?.path === path ? this.#messageFileRequest : undefined;
      // Still loading the file Enter asked for: wait for it.
      if (request !== undefined && !request.landed) return loadBody;
      const current = this.currentReviewTarget();
      if (request !== undefined || current === undefined) {
        // Loaded and still not listed: the file has no changes now.
        this.#messageFileRequest = undefined;
        this.#landingNotice = undefined;
        this.say(
          this.state.fileScope === 'all'
            ? `${item.location.file.display} isn’t in this Review’s files.`
            : `${item.location.file.display} has no changes now; press f to show all files, then Enter again.`,
          'warning',
        );
        return loadBody;
      }
      if (!reach) {
        // Moving through History never starts a load; Enter does.
        this.say(
          `Press Enter to open ${messageOrdinal(this.state, item)} at ${item.location.file.display}:${line}.`,
          'info',
        );
        return loadBody;
      }
      // The file is in a part of the list that isn't loaded: ask for it by path.
      this.#messageFileRequest = { path, landed: false };
      const { fileIdentity: _fileIdentity, fileAbsolute: _fileAbsolute, ...withoutFile } = current;
      this.setLoading(`Opening ${item.location.file.display}`, 'diff', keepNotice);
      return [
        ...loadBody,
        {
          type: 'show-review',
          target: { ...withoutFile, filePathBytesBase64: path, diffOffset: 0 },
          selection: { messageAbsolute, anchorLine: line },
        },
      ];
    }
    if (this.#messageFileRequest?.path === path) this.#messageFileRequest = undefined;
    this.state.selectedFileIdentity = file.fileIdentity;
    this.state.questionCardScrollOffset = 0;
    if (file.diffFileIdentity === undefined) {
      if (review.source.kind === 'live') {
        this.state.selectedRowIdentity = undefined;
        return [...loadBody, ...this.previewUnchangedFile(file, line)];
      }
      this.say(`The Message is at ${file.displayPath}:${line}; open that file to read it in context.`, 'info');
      return loadBody;
    }
    const visibleDiff = diffView(this.state);
    if (visibleDiff !== undefined && visibleDiff.file.fileIdentity === file.diffFileIdentity) {
      const row =
        visibleDiff.window.rows.find(candidate => candidate.newLine === line) ??
        visibleDiff.window.rows.find(candidate => candidate.oldLine === line);
      if (row !== undefined) {
        this.state.selectedRowIdentity = row.rowIdentity;
        this.state.anchorSide = row.newLine !== undefined ? 'new' : 'old';
        this.announceLanding();
        return loadBody;
      }
    }
    const target = this.currentReviewTarget(file.diffFileIdentity);
    if (target === undefined) return loadBody;
    this.setLoading('Opening Message at its Diff line', 'diff');
    return [
      ...loadBody,
      {
        type: 'show-review-diff',
        target: { ...target, fileIdentity: file.diffFileIdentity, diffOffset: 0, anchorLine: line },
        selection: { fileIdentity: file.fileIdentity, anchorLine: line, messageAbsolute },
      },
    ];
  }

  private moveMessage(delta: number, bounded = false): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined || review.messages.messages.items.length === 0) return [];
    const list = review.messages.messages;
    const currentLocal = Math.max(
      0,
      list.items.findIndex(item => item.reviewMessageIdentity === this.state.selectedMessageIdentity),
    );
    const currentAbsolute = list.offset + currentLocal;
    const targetAbsolute = bounded
      ? clamp(currentAbsolute + delta, 0, list.total - 1)
      : cycledTarget(currentAbsolute, delta, list.total);
    if (targetAbsolute >= list.offset && targetAbsolute < list.offset + list.items.length) {
      const item = list.items[targetAbsolute - list.offset];
      if (item === undefined) return [];
      return this.navigateToMessage(item, targetAbsolute);
    }
    const offset = Math.floor(targetAbsolute / QUESTION_WINDOW_SIZE) * QUESTION_WINDOW_SIZE;
    const target = this.currentReviewTarget();
    if (target === undefined) return [];
    this.setLoading('Loading Discussions', 'questions');
    return [
      {
        type: 'show-review',
        target: { ...target, messageOffset: offset },
        selection: { messageAbsolute: targetAbsolute },
      },
    ];
  }

  private moveFile(delta: number, bounded = false): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const source = this.fileListSource();
    if (review === undefined || source === undefined) return [];
    const nodes = this.visibleTreeNodes();
    if (nodes.length === 0) return [];
    const currentIndex = Math.max(0, this.findNodeIndex(nodes));
    const anchorFlat = source.offset + (nodes[currentIndex]?.flat ?? 0);
    const requestedIndex = currentIndex + delta;
    const edgeJump = bounded && Math.abs(delta) > nodes.length;
    if (!edgeJump && requestedIndex >= 0 && requestedIndex < nodes.length) {
      const node = nodes[requestedIndex];
      return node === undefined ? [] : this.selectTreeNode(node);
    }
    // With the whole list loaded, wrapping or jumping to an end stays local: a
    // reload here lands late and would move the reader off a file opened since.
    if (source.offset === 0 && reviewingFiles(review, this.state.fileScope).length >= source.total) {
      const index = edgeJump
        ? delta < 0
          ? 0
          : nodes.length - 1
        : bounded
          ? clamp(requestedIndex, 0, nodes.length - 1)
          : requestedIndex < 0
            ? nodes.length - 1
            : 0;
      const node = nodes[index];
      return node === undefined || index === currentIndex ? [] : this.selectTreeNode(node);
    }

    // Crossing the admitted tree window pages by flat file ordinal. This keeps
    // collapsed synthetic folder rows from wrapping inside one 64-file window.
    let targetFlat: number;
    if (edgeJump) {
      targetFlat = delta < 0 ? 0 : Math.max(0, source.total - 1);
    } else if (requestedIndex < 0) {
      targetFlat = source.offset > 0 ? Math.max(0, anchorFlat + delta) : bounded ? 0 : Math.max(0, source.total - 1);
    } else {
      const loadedFiles = reviewingFiles(review, this.state.fileScope).length;
      targetFlat =
        source.offset + loadedFiles < source.total
          ? Math.min(source.total - 1, Math.max(anchorFlat + delta, source.offset + loadedFiles))
          : bounded
            ? Math.max(0, source.total - 1)
            : 0;
    }
    if (targetFlat === anchorFlat) return [];
    const offset = Math.floor(targetFlat / MANIFEST_WINDOW_SIZE) * MANIFEST_WINDOW_SIZE;
    const pagingTarget = this.currentReviewTarget();
    if (pagingTarget === undefined) return [];
    this.setLoading('Loading Files', 'files');
    return [
      {
        type: 'show-review',
        target: {
          ...pagingTarget,
          ...(this.state.fileScope === 'all' ? { liveFilesOffset: offset } : { manifestOffset: offset }),
          fileAbsolute: targetFlat,
        },
        selection: { fileAbsolute: targetFlat },
      },
    ];
  }

  private moveDiff(delta: number, bounded = false): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const view = diffView(this.state);
    if (review === undefined || view === undefined || view.window.rows.length === 0) return [];
    const currentLocal = Math.max(
      0,
      view.window.rows.findIndex(row => row.rowIdentity === this.state.selectedRowIdentity),
    );
    const currentAbsolute = view.window.offset + currentLocal;
    const targetAbsolute = bounded
      ? clamp(currentAbsolute + delta, 0, view.window.totalRows - 1)
      : cycledTarget(currentAbsolute, delta, view.window.totalRows);
    if (targetAbsolute >= view.window.offset && targetAbsolute < view.window.offset + view.window.rows.length) {
      const row = view.window.rows[targetAbsolute - view.window.offset];
      this.state.selectedRowIdentity = row?.rowIdentity;
      this.state.anchorSide = row?.newLine !== undefined ? 'new' : 'old';
      return row === undefined ? [] : this.openMessagesOn(rowMessages(messagesOnLines(this.state), row));
    }
    const offset = Math.floor(targetAbsolute / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE;
    const changes = this.state.shownStep;
    if (changes !== undefined) {
      this.setLoading('Loading Diff rows', 'diff');
      return [
        {
          type: 'load-step-change-diff',
          reviewIdentity: review.manifest.header.reviewIdentity,
          from: changes.from,
          to: changes.to,
          fileIdentity: view.file.fileIdentity,
          offset,
          rowAbsolute: targetAbsolute,
        },
      ];
    }
    const target = this.currentReviewTarget(view.file.fileIdentity);
    if (target === undefined) return [];
    this.setLoading('Loading Diff rows', 'diff');
    return [
      {
        type: 'show-review-diff',
        target: { ...target, diffOffset: offset },
        selection: {
          fileIdentity: view.file.fileIdentity,
          rowAbsolute: targetAbsolute,
        },
      },
    ];
  }

  private navigateToQuestion(
    item: ReviewProjectedQuestionItem,
    questionAbsolute: number,
    openImmutableSnapshot = true,
  ): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined) return [];
    const targetSnapshotIdentity = item.target.reviewSnapshotIdentity as ReviewSnapshotIdentity;
    const sourceMatchesLiveTarget =
      !openImmutableSnapshot &&
      review.source.kind === 'live' &&
      review.source.matchesLatestSnapshot &&
      review.manifest.header.latestReviewSnapshotIdentity === targetSnapshotIdentity;
    if (review.source.kind === 'live' && !sourceMatchesLiveTarget) {
      const returnTarget = this.currentReviewTarget();
      if (returnTarget !== undefined) this.beginHistoricalDialog(returnTarget);
    }
    this.state.expandedQuestionIdentity = item.itemIdentity;
    const loadBody: readonly ReviewingModelEffect[] =
      this.state.selectedQuestionBody?.itemIdentity === item.itemIdentity
        ? []
        : [
            {
              type: 'load-question-discussion',
              reviewIdentity: review.manifest.header.reviewIdentity,
              itemIdentity: item.itemIdentity,
            },
          ];
    if (this.state.selectedQuestionBody?.itemIdentity !== item.itemIdentity) {
      this.state.selectedQuestionBody = undefined;
    }
    const target = item.target;
    const locateQuestion: ReviewingModelEffect = {
      type: 'locate-question',
      reviewIdentity: review.manifest.header.reviewIdentity,
      itemIdentity: item.itemIdentity,
      questionAbsolute,
    };
    const sourceMatchesTarget =
      (review.source.kind === 'snapshot' && review.source.reviewSnapshotIdentity === targetSnapshotIdentity) ||
      (!openImmutableSnapshot &&
        review.source.kind === 'live' &&
        review.source.matchesLatestSnapshot &&
        review.manifest.header.latestReviewSnapshotIdentity === targetSnapshotIdentity);
    let fileAbsolute = target.fileAbsolute;
    if (fileAbsolute === undefined) {
      const local = review.manifest.manifest.files.findIndex(file => file.fileIdentity === target.fileIdentity);
      if (local >= 0) fileAbsolute = review.manifest.manifest.offset + local;
    }
    if (target.kind === 'review.whole-file') {
      if (fileAbsolute === undefined) return [...loadBody, locateQuestion];
      this.state.questionCardScrollOffset = 0;
      this.state.selectedFileIdentity = target.fileIdentity;
      this.state.selectedRowIdentity = undefined;
      this.state.anchorSide = target.side;
      const manifest = review.manifest.manifest;
      const fileIsInManifest =
        fileAbsolute >= manifest.offset && fileAbsolute < manifest.offset + manifest.files.length;
      if (fileIsInManifest && sourceMatchesTarget) return loadBody;
      const current = this.currentReviewTarget(target.fileIdentity);
      if (current === undefined) return loadBody;
      this.setLoading('Opening Question at its exact whole-file Anchor', 'diff');
      return [
        ...loadBody,
        {
          type: 'show-review',
          target: {
            ...current,
            reviewSnapshotIdentity: targetSnapshotIdentity,
            manifestOffset: Math.floor(fileAbsolute / MANIFEST_WINDOW_SIZE) * MANIFEST_WINDOW_SIZE,
            fileIdentity: target.fileIdentity,
            fileAbsolute,
            diffOffset: 0,
          },
          selection: { fileAbsolute, questionAbsolute },
        },
      ];
    }
    let rowAbsolute = target.rowAbsolute;
    let rowIdentity = target.rowIdentity;
    const visibleLiveCoordinates = !openImmutableSnapshot && review.source.kind === 'live' && sourceMatchesTarget;
    if (
      (visibleLiveCoordinates || rowAbsolute === undefined || rowIdentity === undefined) &&
      review.diff?.status === 'available' &&
      review.diff.file.fileIdentity === target.fileIdentity
    ) {
      const local = review.diff.window.rows.findIndex(
        row => (target.side === 'old' ? row.oldLine : row.newLine) === target.line,
      );
      if (local >= 0) {
        rowAbsolute = review.diff.window.offset + local;
        rowIdentity = review.diff.window.rows[local]?.rowIdentity;
      }
    }
    if (fileAbsolute === undefined || rowAbsolute === undefined || rowIdentity === undefined) {
      return [...loadBody, locateQuestion];
    }
    this.state.questionCardScrollOffset = 0;
    this.state.selectedFileIdentity = target.fileIdentity;
    this.state.selectedRowIdentity = rowIdentity;
    this.state.anchorSide = target.side;
    const manifest = review.manifest.manifest;
    const diff = review.diff?.status === 'available' ? review.diff : undefined;
    const alreadyLoaded =
      sourceMatchesTarget &&
      fileAbsolute >= manifest.offset &&
      fileAbsolute < manifest.offset + manifest.files.length &&
      diff?.file.fileIdentity === target.fileIdentity &&
      rowAbsolute >= diff.window.offset &&
      rowAbsolute < diff.window.offset + diff.window.rows.length;
    if (alreadyLoaded) return loadBody;
    const current = this.currentReviewTarget(target.fileIdentity);
    if (current === undefined) return loadBody;
    this.setLoading('Opening Question at its exact Diff Anchor', 'diff');
    const fileIsInManifest = fileAbsolute >= manifest.offset && fileAbsolute < manifest.offset + manifest.files.length;
    return [
      ...loadBody,
      {
        type: fileIsInManifest ? 'show-review-diff' : 'show-review',
        target: {
          ...current,
          reviewSnapshotIdentity: targetSnapshotIdentity,
          manifestOffset: fileIsInManifest
            ? manifest.offset
            : Math.floor(fileAbsolute / MANIFEST_WINDOW_SIZE) * MANIFEST_WINDOW_SIZE,
          fileIdentity: target.fileIdentity,
          fileAbsolute,
          diffOffset: Math.floor(rowAbsolute / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE,
        },
        selection: { fileAbsolute, rowAbsolute, questionAbsolute },
      },
    ];
  }

  private moveQuestion(delta: number, bounded = false): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    if (review === undefined || review.questions.list.items.length === 0) return [];
    const list = review.questions.list;
    const currentLocal = Math.max(
      0,
      list.items.findIndex(item => item.itemIdentity === this.state.selectedQuestionIdentity),
    );
    const currentAbsolute = list.offset + currentLocal;
    const targetAbsolute = bounded
      ? clamp(currentAbsolute + delta, 0, list.totalItems - 1)
      : cycledTarget(currentAbsolute, delta, list.totalItems);
    if (targetAbsolute >= list.offset && targetAbsolute < list.offset + list.items.length) {
      const item = list.items[targetAbsolute - list.offset];
      if (item === undefined) return [];
      const returnTarget = this.currentReviewTarget();
      if (returnTarget !== undefined) this.beginHistoricalDialog(returnTarget);
      this.state.selectedQuestionIdentity = item.itemIdentity;
      return this.navigateToQuestion(item, targetAbsolute);
    }
    const offset = Math.floor(targetAbsolute / QUESTION_WINDOW_SIZE) * QUESTION_WINDOW_SIZE;
    const target = this.currentReviewTarget();
    if (target === undefined) return [];
    this.state.questionCardScrollOffset = 0;
    this.setLoading('Loading Questions', 'questions');
    return [
      {
        type: 'show-review',
        target: { ...target, questionOffset: offset },
        selection: { questionAbsolute: targetAbsolute },
      },
    ];
  }

  handleHomeAction(data: ReviewingInput, now: number): readonly ReviewingModelEffect[] {
    const home = this.state.home;
    if (home === undefined) return [];
    if (this.state.homeMode === 'comparison') {
      if (data.text === 'n') {
        this.state.comparisonMode = 'range-to-head';
        this.state.comparisonInput = { kind: 'count', value: '2', cursor: 1, suggested: true };
        this.state.notice = undefined;
        return [];
      }
      if (data.text === '/') {
        const commits = this.commitGraphCommits();
        const projectedSelection =
          commits.find(commit => commit.objectIdentity === this.state.selectedCommitIdentity)?.objectIdentity ??
          commits[0]?.objectIdentity;
        this.state.comparisonInput = {
          kind: 'message-search',
          value: '',
          cursor: 0,
          matchingCommitIdentities: commits.map(commit => commit.objectIdentity),
          selectedCommitIdentity: projectedSelection,
        };
        this.state.notice = undefined;
        return [];
      }
      if (data.text === 'r') {
        this.state.comparisonInput = { kind: 'revision', value: '', cursor: 0 };
        this.state.notice = undefined;
        return [];
      }
      return matchesKey(data, Key.enter) ? this.handleComparisonAction(now) : [];
    }
    if (this.state.homeMode === 'history') {
      if (!matchesKey(data, Key.enter) || this.state.selectedReviewIdentity === undefined) {
        return [];
      }
      this.state.reviewReturn = 'history';
      const selected = home.reviews.items.find(item => item.reviewIdentity === this.state.selectedReviewIdentity);
      this.beginPendingReviewShell({
        reviewIdentity: this.state.selectedReviewIdentity,
        retention: 'previous',
        stateVersion: home.stateVersion,
        ...(selected === undefined ? {} : { totalFiles: selected.totalFiles }),
      });
      return [
        {
          type: 'show-review',
          target: {
            reviewIdentity: this.state.selectedReviewIdentity,
            manifestOffset: 0,
            diffOffset: 0,
            questionOffset: 0,
          },
        },
      ];
    }
    if (matchesKey(data, Key.enter)) {
      if (this.state.homeLauncherSelection === 'new-current') {
        this.state.reviewReturn = 'launcher';
        return this.executeProjectedAction('review.current-changes.start', now);
      }
      if (this.state.homeLauncherSelection === 'comparison') {
        this.state.homeMode = 'comparison';
        this.state.reviewReturn = 'launcher';
        this.state.comparisonMode = 'commit';
        this.state.comparisonInput = undefined;
        this.state.comparisonPreview = undefined;
        this.state.comparisonRequestedSelection = undefined;
        this.state.commitGraph = undefined;
        this.state.selectedCommitIdentity = undefined;
        this.state.selectedMergeParentIdentity = undefined;
        this.state.notice = undefined;
        this.setLoading('Loading local commit history', 'home');
        return [{ type: 'load-commit-graph' }];
      }
      if (this.state.homeLauncherSelection === 'history' && home.header.totalPastReviews > 0) {
        this.state.homeMode = 'history';
        this.state.selectedReviewIdentity = home.reviews.items[0]?.reviewIdentity;
        this.state.notice = undefined;
        if (home.reviews.offset !== 0) {
          this.setLoading('Loading newest Past reviews', 'home');
          return [{ type: 'show-home', offset: 0, mode: 'history' }];
        }
        return [];
      }
      if (home.header.currentReviewIdentity !== undefined) {
        this.state.reviewReturn = 'launcher';
        this.beginPendingReviewShell({
          reviewIdentity: home.header.currentReviewIdentity,
          retention: 'current',
          stateVersion: home.stateVersion,
          ...(home.currentReview === undefined ? {} : { totalFiles: home.currentReview.totalFiles }),
        });
        return [
          {
            type: 'show-review',
            target: {
              reviewIdentity: home.header.currentReviewIdentity,
              manifestOffset: 0,
              diffOffset: 0,
              questionOffset: 0,
            },
          },
        ];
      }
      this.state.reviewReturn = 'launcher';
      return this.executeProjectedAction('review.current-changes.start', now);
    }
    return [];
  }

  commitGraphCommits(): readonly ReviewCommitGraphCommit[] {
    const graph = this.state.commitGraph;
    return graph?.status === 'available' ? graph.rows.filter(row => row.kind === 'commit') : [];
  }

  private selectComparisonCommit(objectIdentity: string): readonly ReviewingModelEffect[] {
    const selected = this.commitGraphCommits().find(commit => commit.objectIdentity === objectIdentity);
    if (selected === undefined || selected.objectIdentity === this.state.selectedCommitIdentity) {
      return [];
    }
    this.state.selectedCommitIdentity = selected.objectIdentity;
    this.state.selectedMergeParentIdentity = undefined;
    this.state.comparisonInput = undefined;
    this.state.comparisonPreview = undefined;
    this.state.comparisonRequestedSelection = undefined;
    this.state.loading = undefined;
    this.state.notice = undefined;
    return this.previewSelectedCommit();
  }

  previewSelectedCommit(): readonly ReviewingModelEffect[] {
    const revision = this.state.selectedCommitIdentity;
    if (revision === undefined) return [];
    if (this.state.comparisonMode === 'commit') {
      const commit = this.commitGraphCommits().find(item => item.objectIdentity === revision);
      if (commit !== undefined && commit.parentIdentities.length > 1) {
        const parentRevision = this.state.selectedMergeParentIdentity;
        if (parentRevision === undefined || !commit.parentIdentities.includes(parentRevision)) {
          // The card's preview says why and offers h/l; the status line stays quiet.
          this.state.comparisonPreview = undefined;
          this.state.loading = undefined;
          this.state.notice = undefined;
          return [];
        }
        return this.requestComparisonPreview({
          kind: 'commit',
          revision,
          parentRevision,
        });
      }
      return this.requestComparisonPreview({ kind: 'commit', revision });
    }
    return this.requestComparisonPreview({ kind: 'commit-to-head', revision });
  }

  moveMergeParent(direction: -1 | 1): readonly ReviewingModelEffect[] {
    if (this.state.comparisonMode !== 'commit') return [];
    const commit = this.commitGraphCommits().find(item => item.objectIdentity === this.state.selectedCommitIdentity);
    if (commit === undefined || commit.parentIdentities.length < 2) return [];
    const current = commit.parentIdentities.indexOf(this.state.selectedMergeParentIdentity ?? '');
    const next =
      current < 0
        ? direction > 0
          ? 0
          : commit.parentIdentities.length - 1
        : (current + direction + commit.parentIdentities.length) % commit.parentIdentities.length;
    this.state.selectedMergeParentIdentity = commit.parentIdentities[next];
    this.state.comparisonPreview = undefined;
    this.state.comparisonRequestedSelection = undefined;
    this.state.notice = undefined;
    return this.previewSelectedCommit();
  }

  private requestComparisonPreview(selection: ReviewComparisonSelection): readonly ReviewingModelEffect[] {
    this.state.comparisonRequestedSelection = selection;
    this.state.comparisonPreview = undefined;
    this.setLoading('Inspecting local commit comparison', 'home');
    return [{ type: 'preview-comparison', selection }];
  }

  private handleComparisonAction(now: number): readonly ReviewingModelEffect[] {
    if (this.state.loading !== undefined) return [];
    const preview = this.state.comparisonPreview;
    if (preview?.status === 'available') {
      if (preview.action.availability !== 'direct') {
        this.state.notice = actionNotice(preview.action);
        this.state.showDetails = true;
        return [];
      }
      const command: WorkspaceCommand = {
        kind: 'review.comparison.start',
        commandIdentity: commandIdentity(),
        expectedStateVersion: preview.action.gateBasis.expectedStateVersion,
        selection: preview.selection,
        expectedBasisObjectIdentity: preview.basisEndpointIdentity,
        expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
        ...(preview.comparisonResolutionIdentity === undefined
          ? {}
          : {
              expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
            }),
      };
      this.state.reviewReturn = 'launcher';
      this.beginPending({ kind: 'review.comparison.start' }, command.commandIdentity, 'home', now);
      this.beginPendingReviewShell({ retention: 'current', stateVersion: preview.stateVersion });
      return [{ type: 'execute', command }];
    }
    return this.previewSelectedCommit();
  }

  private requestReviewSearch(offset = 0, requestedResultAbsolute?: number): readonly ReviewingModelEffect[] {
    const search = this.state.search;
    const reviewIdentity = this.state.review?.manifest.header.reviewIdentity;
    if (search === undefined || reviewIdentity === undefined) return [];
    const query = search.query.trim();
    search.requestedResultAbsolute = requestedResultAbsolute;
    search.preview = undefined;
    search.previewResultIdentity = undefined;
    search.previewLoading = false;
    if (query.length === 0) {
      search.view = undefined;
      search.selectedResultIdentity = undefined;
      search.loading = false;
      return [];
    }
    search.loading = true;
    return [{ type: 'search-review', reviewIdentity, query, offset }];
  }

  private requestSearchPreview(): readonly ReviewingModelEffect[] {
    const search = this.state.search;
    if (search === undefined) return [];
    const result = this.selectedSearchResult();
    const reviewIdentity = this.state.review?.manifest.header.reviewIdentity;
    // Keep the currently rendered preview until its replacement arrives.
    // A transient loading row makes rapid search navigation visually noisy.
    search.previewResultIdentity = result?.resultIdentity;
    search.previewLoading = result !== undefined;
    if (result === undefined || reviewIdentity === undefined) return [];
    return [
      {
        type: 'preview-search-result',
        reviewIdentity,
        resultIdentity: result.resultIdentity,
        fileIdentity: result.fileIdentity,
        rowAbsolute: result.kind === 'change' ? result.rowAbsolute : 0,
      },
    ];
  }

  private selectedSearchResult(): ReviewSearchItem | undefined {
    const search = this.state.search;
    if (search?.view?.status !== 'available') return undefined;
    return search.view.results.find(item => item.resultIdentity === search.selectedResultIdentity);
  }

  private handleSearchInput(data: ReviewingInput): readonly ReviewingModelEffect[] {
    const search = this.state.search;
    if (search === undefined) return [];
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    if (matchesKey(data, Key.escape)) {
      this.state.search = undefined;
      this.state.notice = undefined;
      return [];
    }
    if (matchesKey(data, Key.enter)) {
      const searchView = search.view;
      const result = this.selectedSearchResult();
      if (result === undefined)
        return this.requestReviewSearch(searchView?.status === 'available' ? searchView.offset : 0);
      const review = this.state.review;
      if (review === undefined || searchView?.status !== 'available') return [];
      this.state.search = undefined;
      this.state.focus = result.kind === 'file' ? 'files' : 'diff';
      this.setLoading('Opening search result', this.state.focus);
      return [
        {
          type: 'show-review',
          target: {
            reviewIdentity: review.manifest.header.reviewIdentity,
            // Search results and previews address the immutable saved Snapshot.
            // Opening that same source preserves the result's file/row identities
            // even when the working tree has moved since the search was indexed.
            reviewSnapshotIdentity: searchView.reviewSnapshotIdentity as ReviewSnapshotIdentity,
            manifestOffset: Math.floor(result.fileAbsolute / MANIFEST_WINDOW_SIZE) * MANIFEST_WINDOW_SIZE,
            fileIdentity: result.fileIdentity,
            diffOffset:
              result.kind === 'change' ? Math.floor(result.rowAbsolute / DIFF_WINDOW_SIZE) * DIFF_WINDOW_SIZE : 0,
            questionOffset: review.questions.list.offset,
          },
          selection: {
            fileIdentity: result.fileIdentity,
            ...(result.kind === 'change' ? { rowAbsolute: result.rowAbsolute } : { rowAbsolute: 0 }),
          },
          fromSearch: true,
        },
      ];
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      if (search.view?.status !== 'available' || search.view.results.length === 0) return [];
      const direction = matchesKey(data, Key.up) ? -1 : 1;
      const currentLocal = Math.max(
        0,
        search.view.results.findIndex(item => item.resultIdentity === search.selectedResultIdentity),
      );
      const currentAbsolute = search.view.offset + currentLocal;
      const targetAbsolute = cycledTarget(currentAbsolute, direction, search.view.totalResults);
      if (targetAbsolute >= search.view.offset && targetAbsolute < search.view.offset + search.view.results.length) {
        search.selectedResultIdentity = search.view.results[targetAbsolute - search.view.offset]?.resultIdentity;
        return this.requestSearchPreview();
      }
      return this.requestReviewSearch(
        Math.floor(targetAbsolute / SEARCH_RESULT_WINDOW_SIZE) * SEARCH_RESULT_WINDOW_SIZE,
        targetAbsolute,
      );
    }
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)) {
      if (search.view?.status !== 'available') return [];
      const direction = matchesKey(data, Key.pageUp) ? -1 : 1;
      const nextOffset = clamp(
        search.view.offset + direction * SEARCH_RESULT_WINDOW_SIZE,
        0,
        Math.max(0, search.view.totalResults - 1),
      );
      return this.requestReviewSearch(Math.floor(nextOffset / SEARCH_RESULT_WINDOW_SIZE) * SEARCH_RESULT_WINDOW_SIZE);
    }
    if (matchesKey(data, Key.left)) {
      search.cursor = Math.max(0, search.cursor - 1);
      return [];
    }
    if (matchesKey(data, Key.right)) {
      search.cursor = Math.min(search.query.length, search.cursor + 1);
      return [];
    }
    if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl('a'))) {
      search.cursor = 0;
      return [];
    }
    if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl('e'))) {
      search.cursor = search.query.length;
      return [];
    }
    if (matchesKey(data, Key.ctrl('u'))) {
      search.query = search.query.slice(search.cursor);
      search.cursor = 0;
      return this.requestReviewSearch();
    }
    if (matchesKey(data, Key.backspace)) {
      if (search.cursor > 0) {
        search.query = search.query.slice(0, search.cursor - 1) + search.query.slice(search.cursor);
        search.cursor -= 1;
      }
      return this.requestReviewSearch();
    }
    if (matchesKey(data, Key.delete)) {
      if (search.cursor < search.query.length) {
        search.query = search.query.slice(0, search.cursor) + search.query.slice(search.cursor + 1);
      }
      return this.requestReviewSearch();
    }
    const printable = printableInput(data)?.replace(/[\u0000-\u001f\u007f]/gu, '');
    if (printable === undefined || printable.length === 0) return [];
    const next = search.query.slice(0, search.cursor) + printable + search.query.slice(search.cursor);
    if (Buffer.byteLength(next.trim()) > 256) {
      this.say('Search text can be at most 256 bytes.', 'warning');
      return [];
    }
    search.query = next;
    search.cursor += printable.length;
    return this.requestReviewSearch();
  }

  private comparisonMessageMatches(query: string): readonly ReviewCommitGraphCommit[] {
    const normalized = query.trim().toLowerCase();
    return this.commitGraphCommits().filter(
      commit => normalized.length === 0 || commit.subject.toLowerCase().includes(normalized),
    );
  }

  private synchronizeComparisonMessageMatches(input: ReviewComparisonMessageSearchState): void {
    const matches = this.comparisonMessageMatches(input.value);
    input.matchingCommitIdentities = matches.map(commit => commit.objectIdentity);
    if (
      input.selectedCommitIdentity === undefined ||
      !input.matchingCommitIdentities.includes(input.selectedCommitIdentity)
    ) {
      input.selectedCommitIdentity = matches[0]?.objectIdentity;
    }
    this.state.notice = undefined;
  }

  private moveComparisonMessageSearch(
    input: ReviewComparisonMessageSearchState,
    delta: number,
    cycleSingleStep: boolean,
  ): void {
    const matches = input.matchingCommitIdentities;
    if (matches.length === 0) return;
    const current = Math.max(0, matches.indexOf(input.selectedCommitIdentity ?? ''));
    const target = cycleSingleStep
      ? (current + delta + matches.length) % matches.length
      : clamp(current + delta, 0, matches.length - 1);
    input.selectedCommitIdentity = matches[target];
  }

  private handleComparisonMessageSearchInput(
    input: ReviewComparisonMessageSearchState,
    data: ReviewingInput,
  ): readonly ReviewingModelEffect[] {
    if (matchesKey(data, Key.escape)) {
      this.state.comparisonInput = undefined;
      this.state.notice = 'Commit-message search cancelled.';
      return [];
    }
    if (matchesKey(data, Key.enter)) {
      const selected = input.selectedCommitIdentity;
      if (selected === undefined) {
        this.say('No commit message matches that search.', 'info');
        return [];
      }
      this.state.comparisonInput = undefined;
      return this.selectComparisonCommit(selected);
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
      this.moveComparisonMessageSearch(input, matchesKey(data, Key.up) ? -1 : 1, true);
      return [];
    }
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)) {
      const pageSize = Math.max(1, Math.floor((this.state.height - 20) / 2));
      this.moveComparisonMessageSearch(input, (matchesKey(data, Key.pageUp) ? -1 : 1) * pageSize, false);
      return [];
    }
    if (matchesKey(data, Key.ctrl('u'))) {
      input.value = '';
      input.cursor = 0;
      this.synchronizeComparisonMessageMatches(input);
      return [];
    }
    if (matchesKey(data, Key.left)) {
      input.cursor = Math.max(0, input.cursor - 1);
      return [];
    }
    if (matchesKey(data, Key.right)) {
      input.cursor = Math.min(input.value.length, input.cursor + 1);
      return [];
    }
    if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl('a'))) {
      input.cursor = 0;
      return [];
    }
    if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl('e'))) {
      input.cursor = input.value.length;
      return [];
    }
    if (matchesKey(data, Key.backspace)) {
      if (input.cursor > 0) {
        input.value = input.value.slice(0, input.cursor - 1) + input.value.slice(input.cursor);
        input.cursor -= 1;
        this.synchronizeComparisonMessageMatches(input);
      }
      return [];
    }
    if (matchesKey(data, Key.delete)) {
      if (input.cursor < input.value.length) {
        input.value = input.value.slice(0, input.cursor) + input.value.slice(input.cursor + 1);
        this.synchronizeComparisonMessageMatches(input);
      }
      return [];
    }
    const printable = printableInput(data)?.replace(/[\u0000-\u001f\u007f-\u009f]/gu, '');
    if (printable === undefined || printable.length === 0) return [];
    const next = input.value.slice(0, input.cursor) + printable + input.value.slice(input.cursor);
    if (Buffer.byteLength(next.trim()) > 256) {
      this.say('Search text can be at most 256 bytes.', 'warning');
      return [];
    }
    input.value = next;
    input.cursor += printable.length;
    this.synchronizeComparisonMessageMatches(input);
    this.state.notice = undefined;
    return [];
  }

  private handleComparisonInput(data: ReviewingInput): readonly ReviewingModelEffect[] {
    const input = this.state.comparisonInput;
    if (input === undefined) return [];
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    if (input.kind === 'message-search') {
      return this.handleComparisonMessageSearchInput(input, data);
    }
    if (matchesKey(data, Key.escape)) {
      this.state.comparisonInput = undefined;
      this.state.notice = 'Comparison input cancelled.';
      return [];
    }
    if (matchesKey(data, Key.enter)) {
      let selection: ReviewComparisonSelection | undefined;
      if (input.kind === 'count') {
        const count = Number(input.value);
        if (!/^[1-9][0-9]*$/u.test(input.value) || count > 500) {
          this.say('Enter a number of commits from 1 to 500.', 'warning');
          return [];
        }
        selection = { kind: 'head-ancestry', commitCount: count };
      } else {
        const revision = input.value;
        if (
          !/^[A-Za-z0-9._/@+][A-Za-z0-9._/@+/-]*$/u.test(revision) ||
          revision.includes('..') ||
          revision.includes('//') ||
          revision.endsWith('.lock') ||
          Buffer.byteLength(revision) > 256
        ) {
          this.say('Enter a commit hash, branch or tag from this repository.', 'warning');
          return [];
        }
        selection =
          this.state.comparisonMode === 'commit' ? { kind: 'commit', revision } : { kind: 'commit-to-head', revision };
      }
      this.state.comparisonInput = undefined;
      return this.requestComparisonPreview(selection);
    }
    if (matchesKey(data, Key.left)) {
      delete input.suggested;
      input.cursor = Math.max(0, input.cursor - 1);
      return [];
    }
    if (matchesKey(data, Key.right)) {
      input.cursor = Math.min(input.value.length, input.cursor + 1);
      return [];
    }
    if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl('a'))) {
      input.cursor = 0;
      return [];
    }
    if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl('e'))) {
      input.cursor = input.value.length;
      return [];
    }
    if (matchesKey(data, Key.backspace)) {
      delete input.suggested;
      if (input.cursor > 0) {
        input.value = input.value.slice(0, input.cursor - 1) + input.value.slice(input.cursor);
        input.cursor -= 1;
      }
      return [];
    }
    const printable = printableInput(data);
    if (printable === undefined) return [];
    const accepted =
      input.kind === 'count' ? printable.replace(/[^0-9]/gu, '') : printable.replace(/[^A-Za-z0-9._/@+/-]/gu, '');
    if (accepted.length === 0) return [];
    if (input.suggested === true) {
      input.value = '';
      input.cursor = 0;
    }
    delete input.suggested;
    input.value = input.value.slice(0, input.cursor) + accepted + input.value.slice(input.cursor);
    input.cursor += accepted.length;
    return [];
  }

  private selectedMessageTarget():
    | {
        readonly reviewIdentity: ReviewIdentity;
        readonly originReviewBasisIdentity: ReviewBasisIdentity;
        readonly pathBytesBase64: string;
        readonly fileLabel: string;
        readonly line: number;
      }
    | undefined {
    const review = this.state.review;
    const originReviewBasisIdentity = this.state.activeReviewBasisIdentity;
    const file = reviewingFiles(review, this.state.fileScope).find(
      candidate => candidate.fileIdentity === this.state.selectedFileIdentity,
    );
    if (review === undefined || originReviewBasisIdentity === undefined || file === undefined) return undefined;
    // A deleted file has no new side: there is no line, here or in a saved copy, to ask about.
    if (file.status === 'deleted') return undefined;
    // The line selected in the Diff is the anchor wherever focus is: it is the
    // highlighted line, and the composer opens beneath it. Line 1 is used only
    // when this file's Diff has no selected line.
    const shownView = diffView(this.state);
    const row =
      this.state.selectedDirectory === undefined &&
      shownView !== undefined &&
      (shownView.file.fileIdentity === file.diffFileIdentity || shownView.file.fileIdentity === file.fileIdentity)
        ? diffRow(this.state)
        : undefined;
    let line: number | undefined;
    if (row !== undefined) {
      if (row.newLine === undefined) return undefined;
      line = row.newLine;
    } else if (
      this.state.unchangedContent?.pathBytesBase64 === file.pathBytesBase64 &&
      this.state.unchangedContent.view.status === 'available'
    ) {
      // The unchanged-file content view carries its own selected line.
      line = this.state.unchangedContentLine;
    } else {
      line = 1;
    }
    if (line === undefined) return undefined;
    return {
      reviewIdentity: review.manifest.header.reviewIdentity,
      originReviewBasisIdentity,
      pathBytesBase64: file.pathBytesBase64,
      fileLabel: file.displayPath,
      line,
    };
  }

  openCreateEditor(): readonly ReviewingModelEffect[] {
    if (this.state.pending !== undefined) return [];
    if (this.state.loading !== undefined) {
      this.sayStillLoading('a');
      return [];
    }
    const target = this.selectedMessageTarget();
    if (target === undefined) {
      const selectedFile = reviewingFiles(this.state.review, this.state.fileScope).find(
        candidate => candidate.fileIdentity === this.state.selectedFileIdentity,
      );
      this.state.notice =
        selectedFile?.status === 'deleted'
          ? 'This file was deleted, so it has no line to ask about. Pick another file.'
          : diffRow(this.state)?.newLine === undefined && diffRow(this.state) !== undefined
            ? 'A removed line can’t hold a Message. Select a line that exists now.'
            : this.state.fileScope === 'changed' && reviewingFiles(this.state.review, 'changed').length === 0
              ? 'Nothing has changed yet. Press f to show all files, then select a line and press a.'
              : 'Select a file or a Diff line before writing a Message.';
      return [];
    }
    this.state.editor = {
      ...target,
      body: '',
      cursor: 0,
      reselectionRequired: false,
    };
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.state.provisionalMessage = undefined;
    this.state.notice = undefined;
    return [];
  }

  continueComparisonWithLiveChanges(now: number): readonly ReviewingModelEffect[] {
    if (this.state.pending !== undefined || this.state.editor !== undefined || this.state.loading !== undefined) {
      return [];
    }
    const continuation = this.state.review?.continuation;
    if (continuation?.status !== 'available') {
      this.state.notice =
        continuation?.reason === 'inspection-failed'
          ? 'Current HEAD and Live Changes are temporarily unverified.'
          : 'Only the current fixed commit/range Review can continue.';
      return [];
    }
    if (continuation.headMoved) {
      this.state.continuationChoice = { selected: 'saved-endpoint' };
      this.state.notice = undefined;
      return [];
    }
    return this.executeCurrentHeadContinuation(continuation, now);
  }

  private handleContinuationChoiceInput(data: ReviewingInput, now: number): readonly ReviewingModelEffect[] {
    const choice = this.state.continuationChoice;
    if (choice === undefined) return [];
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    if (matchesKey(data, Key.escape)) {
      this.state.continuationChoice = undefined;
      this.state.notice = 'Cancelled; the saved Review is unchanged.';
      return [];
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift('tab'))) {
      choice.selected = choice.selected === 'saved-endpoint' ? 'current-head' : 'saved-endpoint';
      return [];
    }
    if (this.state.layout === 'linear' && (matchesKey(data, Key.up) || data.text === 'k')) {
      choice.selected = 'saved-endpoint';
      return [];
    }
    if (this.state.layout === 'linear' && (matchesKey(data, Key.down) || data.text === 'j')) {
      choice.selected = 'current-head';
      return [];
    }
    if (this.state.layout !== 'linear' && (matchesKey(data, Key.left) || data.text === 'h')) {
      choice.selected = 'saved-endpoint';
      return [];
    }
    if (this.state.layout !== 'linear' && (matchesKey(data, Key.right) || data.text === 'l')) {
      choice.selected = 'current-head';
      return [];
    }
    if (!matchesKey(data, Key.enter)) return [];
    if (choice.selected === 'saved-endpoint') {
      this.state.continuationChoice = undefined;
      this.state.notice = 'Stayed with the saved Review; no new Review was started.';
      return [];
    }
    const continuation = this.state.review?.continuation;
    this.state.continuationChoice = undefined;
    if (continuation?.status !== 'available' || !continuation.headMoved) {
      this.say('Your changes moved while choosing; choose again.', 'warning');
      return [];
    }
    return this.executeCurrentHeadContinuation(continuation, now);
  }

  private executeCurrentHeadContinuation(
    continuation: Extract<ReviewContinuationView, { status: 'available' }>,
    now: number,
  ): readonly ReviewingModelEffect[] {
    const action = continuation.currentHeadAction;
    if (action.availability !== 'direct') {
      this.state.notice = actionNotice(action);
      this.state.showDetails = true;
      return [];
    }
    const command: WorkspaceCommand = {
      kind: 'review.comparison.continue-live',
      commandIdentity: commandIdentity(),
      expectedStateVersion: action.gateBasis.expectedStateVersion,
      reviewIdentity: continuation.reviewIdentity,
      expectedReviewSnapshotIdentity: continuation.sourceReviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: continuation.savedEndpoint.objectIdentity,
      expectedCurrentHeadObjectIdentity: continuation.currentHead.objectIdentity,
      expectedLiveChangesIdentity: continuation.liveChangesIdentity,
    };
    this.beginPending(action, command.commandIdentity, this.state.focus, now);
    return [{ type: 'execute', command }];
  }

  private executeProjectedAction(kind: ReviewProjectedActionKind, now: number): readonly ReviewingModelEffect[] {
    if (this.state.pending !== undefined || this.state.editor !== undefined || this.state.loading !== undefined) {
      return [];
    }
    let action: ReviewProjectedAction | undefined;
    if (kind === 'review.current-changes.start') {
      action = directAction(this.state.home?.actions ?? [], kind);
    } else if (kind.startsWith('review.question.disposition.')) {
      action = directAction(questionItem(this.state)?.actions ?? [], kind);
    } else {
      action = directAction(reviewActions(this.state), kind);
    }
    if (action === undefined) return [];
    if (action.availability !== 'direct') {
      this.state.notice = actionNotice(action);
      this.state.showDetails = true;
      return [];
    }
    const command = this.commandForAction(action);
    if (command === undefined) return [];
    const returnFocus: ReviewingFocus =
      kind.startsWith('review.question.disposition.') || kind === 'review.question-batch.commit'
        ? 'questions'
        : kind === 'review.current-changes.start'
          ? 'home'
          : this.state.focus;
    this.beginPending(action, command.commandIdentity, returnFocus, now);
    if (kind === 'review.current-changes.start') {
      this.beginPendingReviewShell({
        retention: 'current',
        stateVersion: action.gateBasis.expectedStateVersion,
      });
    }
    return [{ type: 'execute', command }];
  }

  private commandForAction(action: ReviewProjectedAction): WorkspaceCommand | undefined {
    const basis = action.gateBasis;
    const identity = commandIdentity();
    if (action.kind === 'review.current-changes.start') {
      return {
        kind: 'review.current-changes.start',
        commandIdentity: identity,
        expectedStateVersion: basis.expectedStateVersion,
      };
    }
    if (basis.reviewIdentity === undefined) return undefined;
    if (action.kind === 'review.question-batch.commit') {
      return {
        kind: 'review.question-batch.commit',
        commandIdentity: identity,
        expectedStateVersion: basis.expectedStateVersion,
        reviewIdentity: basis.reviewIdentity,
        draftIdentities: basis.targetIdentities as readonly ReviewQuestionDraftIdentity[],
      };
    }
    if (action.kind.startsWith('review.question.disposition.')) {
      const selected = questionItem(this.state);
      if (selected?.kind !== 'question') return undefined;
      const disposition = action.kind.endsWith('.answered')
        ? 'answered'
        : action.kind.endsWith('.open')
          ? 'open'
          : 'dismissed';
      return {
        kind: 'review.question.disposition.set',
        commandIdentity: identity,
        expectedStateVersion: basis.expectedStateVersion,
        reviewIdentity: basis.reviewIdentity,
        questionIdentity: selected.itemIdentity as ReviewQuestionIdentity,
        disposition,
      };
    }
    if (action.kind === 'review.complete') {
      return {
        kind: 'review.complete',
        commandIdentity: identity,
        expectedStateVersion: basis.expectedStateVersion,
        reviewIdentity: basis.reviewIdentity,
      };
    }
    if (action.kind === 'review.cancel') {
      return {
        kind: 'review.cancel',
        commandIdentity: identity,
        expectedStateVersion: basis.expectedStateVersion,
        reviewIdentity: basis.reviewIdentity,
      };
    }
    return undefined;
  }

  private beginPendingReviewShell(shell: PendingReviewShell): void {
    this.state.screen = 'review';
    this.state.review = undefined;
    this.state.pendingReviewShell = shell;
    this.state.focus = 'diff';
    this.state.balancedContext = this.state.filePaneVisible ? 'files' : 'questions';
    this.state.selectedFileIdentity = undefined;
    this.state.selectedRowIdentity = undefined;
    this.state.selectedMessageIdentity = undefined;
    this.state.hoveredMessageIdentity = undefined;
    this.state.selectedMessageBody = undefined;
    this.state.selectedMessageResponseBody = undefined;
    this.state.loading = {
      label: `Opening ${shell.retention === 'current' ? 'Current' : 'Previous'} Review shell; Snapshot pending`,
    };
    this.state.notice = undefined;
  }

  private beginPending(
    action: { readonly kind: PendingAction },
    identity: string,
    returnFocus: ReviewingFocus,
    now: number,
    authority?: ReviewMessageAuthority,
  ): void {
    this.state.pending = {
      commandIdentity: identity,
      action: action.kind,
      returnFocus,
      navigateToActiveReview:
        action.kind === 'review.current-changes.start' ||
        action.kind === 'review.comparison.start' ||
        action.kind === 'review.comparison.continue-live',
      startedAt: now,
      phase: 'awaiting-result',
      ...(authority === undefined ? {} : { authority }),
    };
    this.state.notice = undefined;
  }

  private handleEditorInput(data: ReviewingInput, now: number): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    if (editor === undefined) return [];
    const pending = this.state.pending;
    if (pending !== undefined || editor.inspectionRequest?.purpose === 'submit') {
      if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
      // A Message being checked and saved locally takes a moment; keep the
      // moves typed meanwhile instead of dropping them or editing the sent
      // text. Nothing that acts or sends is held.
      const savingMessage =
        pending === undefined || (pending.action === 'review.message.commit' && pending.phase !== 'result-unavailable');
      if (savingMessage && this.#heldNavigation.length < HELD_NAVIGATION_LIMIT && isHeldNavigation(data)) {
        this.#heldNavigation.push(data);
      }
      return [];
    }
    if (matchesKey(data, Key.super('c')) || matchesKey(data, Key.ctrlShift('c'))) {
      this.state.notice = 'Select Message text before copying.';
      return [];
    }
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    if (data.name === 'f3') {
      if (this.state.messageCommitGate !== undefined) {
        this.state.messagePreview = this.state.messagePreview === undefined ? this.state.messageCommitGate : undefined;
        return [];
      }
      if (editor.body.trim().length === 0) {
        this.say('Write a Message before previewing it.', 'warning');
        return [];
      }
      // The key is not offered until an agent connects; say why instead of
      // flashing a preview that closes on the refusal.
      if (
        !agentConnected(this.state) &&
        editor.inspectionRequest === undefined &&
        this.state.messagePreview === undefined
      ) {
        this.say(reasonSentence('attachment-not-found'), 'warning');
        return [];
      }
      // The pending overlay opens on the same key press, so the exact facts
      // fill in without the operator watching an unchanged composer.
      if (this.state.messagePreview !== undefined || editor.inspectionRequest?.purpose === 'preview') {
        this.state.messagePreview = undefined;
        delete editor.inspectionRequest;
        this.state.notice = undefined;
        return [];
      }
      return this.requestMessageInspection('preview');
    }
    if (data.name === 'f4') return this.reselectMessageTarget();
    if (matchesKey(data, Key.escape)) {
      if (this.state.messagePreview !== undefined || editor.inspectionRequest?.purpose === 'preview') {
        this.state.messagePreview = undefined;
        delete editor.inspectionRequest;
        this.state.notice = undefined;
        return [];
      }
      if (this.state.messageCommitGate !== undefined) {
        this.state.messageCommitGate = undefined;
        this.state.provisionalMessage = undefined;
        this.state.notice = 'Back to your draft; nothing was sent.';
        return [];
      }
      // Esc also means "leave insert mode" to Vim hands, and drafts are not
      // kept anywhere: typed text needs a second Esc to throw away.
      if (editor.body.trim().length > 0 && editor.discardArmed !== true) {
        editor.discardArmed = true;
        this.say('Press Esc again to discard this draft. Nothing has been sent.', 'warning');
        return [];
      }
      this.state.editor = undefined;
      this.state.provisionalMessage = undefined;
      this.state.notice = 'Message discarded; nothing was sent.';
      return [];
    }
    if (editor.discardArmed === true) {
      delete editor.discardArmed;
      this.state.notice = undefined;
    }
    if (matchesKey(data, Key.enter)) return this.submitEditor(now);
    // Ordinary editing is owned by the focused OpenTUI Textarea.
    return [];
  }

  private submitEditor(_now: number): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    if (editor === undefined || editor.body.trim().length === 0) {
      this.say('Write a Message before sending.', 'warning');
      return [];
    }
    if (editor.reselectionRequired) {
      this.say('Press F4 to target the current line before sending.', 'warning');
      return [];
    }
    if (this.state.messageCommitGate !== undefined) {
      return this.commitInspectedMessage(this.state.messageCommitGate, _now, true);
    }
    if (this.state.messagePreview !== undefined) {
      return this.commitInspectedMessage(this.state.messagePreview, _now, false);
    }
    return this.requestMessageInspection('submit');
  }

  private rejectProvisionalMessage(localIdentity: string, detail: string): void {
    // Nothing will be saved, so the moves held for after the save are dropped.
    this.#heldNavigation.length = 0;
    if (this.state.provisionalMessage?.localIdentity !== localIdentity) return;
    this.state.provisionalMessage = {
      ...this.state.provisionalMessage,
      status: 'rejected',
      detail,
    };
  }

  private commitInspectedMessage(
    inspection: Extract<DefaultReviewMessageInspectionView, { readonly status: 'available' }>,
    now: number,
    confirmed: boolean,
  ): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    if (editor === undefined) return [];
    if (inspection.commitment.status === 'gate' && !confirmed) {
      // A confirmation step needs your attention first; earlier moves no longer apply.
      this.#heldNavigation.length = 0;
      this.state.messageCommitGate = inspection;
      this.state.messagePreview = undefined;
      if (this.state.provisionalMessage !== undefined) {
        this.state.provisionalMessage = {
          ...this.state.provisionalMessage,
          status: 'awaiting-confirmation',
          detail: 'Confirmation required · not sent',
        };
      }
      this.state.notice = undefined;
      return [];
    }
    const command: WorkspaceCommand = {
      kind: 'review.message.commit',
      commandIdentity: commandIdentity(),
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: editor.reviewIdentity,
      originReviewBasisIdentity: editor.originReviewBasisIdentity,
      location: { pathBytesBase64: editor.pathBytesBase64, line: editor.line },
      body: editor.body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    };
    this.state.messageCommitGate = undefined;
    // Messages shows the outgoing entry beside the Diff; focus stays put so the
    // next move continues where you were reading.
    this.state.balancedContext = 'questions';
    this.state.provisionalMessage = {
      ...(this.state.provisionalMessage ?? {
        localIdentity: command.commandIdentity,
        reviewIdentity: editor.reviewIdentity,
        originReviewBasisIdentity: editor.originReviewBasisIdentity,
        location: {
          pathBytesBase64: editor.pathBytesBase64,
          fileLabel: editor.fileLabel,
          line: editor.line,
        },
        body: editor.body,
      }),
      localIdentity: command.commandIdentity,
      status: 'committing',
      detail: 'Saving before dispatch · not yet durable',
    };
    this.beginPending(
      { kind: 'review.message.commit' },
      command.commandIdentity,
      this.state.focus,
      now,
      inspection.capability.authority,
    );
    return [{ type: 'execute', command }];
  }

  private requestMessageInspection(purpose: 'preview' | 'submit'): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    if (editor === undefined || editor.inspectionRequest !== undefined) return [];
    const requestIdentity = commandIdentity();
    editor.inspectionRequest = { requestIdentity, purpose };
    if (purpose === 'submit') {
      // Show the local entry in Messages right away; focus stays where it was.
      this.state.balancedContext = 'questions';
      this.state.provisionalMessage = {
        localIdentity: requestIdentity,
        reviewIdentity: editor.reviewIdentity,
        originReviewBasisIdentity: editor.originReviewBasisIdentity,
        location: {
          pathBytesBase64: editor.pathBytesBase64,
          fileLabel: editor.fileLabel,
          line: editor.line,
        },
        body: editor.body,
        status: 'inspecting',
        detail: 'Checking the line · not sent',
      };
    }
    // The composer card and the preview say what is happening; the status line stays quiet.
    this.state.notice = undefined;
    return [
      {
        type: 'inspect-review-message',
        requestIdentity,
        purpose,
        reviewIdentity: editor.reviewIdentity,
        originReviewBasisIdentity: editor.originReviewBasisIdentity,
        location: { pathBytesBase64: editor.pathBytesBase64, line: editor.line },
        body: editor.body,
      },
    ];
  }

  private reselectMessageTarget(): readonly ReviewingModelEffect[] {
    const editor = this.state.editor;
    const target = this.selectedMessageTarget();
    if (editor === undefined || target === undefined) {
      this.say('That line can’t take a Message; pick another file or line.', 'warning');
      return [];
    }
    this.state.editor = {
      ...target,
      body: editor.body,
      cursor: editor.cursor,
      reselectionRequired: false,
    };
    this.state.messagePreview = undefined;
    this.state.messageCommitGate = undefined;
    this.state.provisionalMessage = undefined;
    this.say(`Now targeting ${target.fileLabel}:${target.line}. Your text is kept; press Enter to send.`, 'success');
    return [];
  }

  private handleBasisPickerInput(data: ReviewingInput, now: number): readonly ReviewingModelEffect[] {
    const picker = this.state.basisPicker;
    const bases = pickableBases(this.state);
    if (picker === undefined) return [];
    if (matchesKey(data, Key.ctrl('c'))) return [{ type: 'stop' }];
    if (matchesKey(data, Key.escape) || data.text === 't') {
      this.state.basisPicker = undefined;
      this.state.notice = undefined;
      return [];
    }
    if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || data.text === 'j' || data.text === 'k') {
      if (bases.length === 0) return [];
      const current = Math.max(
        0,
        bases.findIndex(item => item.reviewBasisIdentity === picker.selectedReviewBasisIdentity),
      );
      const direction = matchesKey(data, Key.up) || data.text === 'k' ? -1 : 1;
      picker.selectedReviewBasisIdentity = bases[cycledTarget(current, direction, bases.length)]!.reviewBasisIdentity;
      return [];
    }
    if (!matchesKey(data, Key.enter)) return [];
    return this.openBasis(picker.selectedReviewBasisIdentity, now);
  }

  private openBasis(reviewBasisIdentity: ReviewBasisIdentity, now: number): readonly ReviewingModelEffect[] {
    const review = this.state.review;
    const basis = review?.bases.bases.items.find(item => item.reviewBasisIdentity === reviewBasisIdentity);
    const target = this.currentReviewTarget();
    if (review === undefined || basis === undefined || target === undefined) return [];
    if (basis.kind === 'git-commit' && basis.capture.status === 'capture-on-open') {
      const command: WorkspaceCommand = {
        kind: 'review.basis.git-commit.capture',
        commandIdentity: commandIdentity(),
        expectedStateVersion: review.stateVersion,
        reviewIdentity: review.manifest.header.reviewIdentity,
        reviewBasisIdentity: basis.reviewBasisIdentity,
        commitObjectIdentity: basis.source.commit.objectIdentity,
      };
      this.beginPending({ kind: 'review.basis.git-commit.capture' }, command.commandIdentity, this.state.focus, now);
      this.state.loading = { label: 'Capturing selected Git commit', region: 'diff' };
      return [{ type: 'execute', command }];
    }
    this.state.basisPicker = undefined;
    this.state.activeReviewBasisIdentity = basis.reviewBasisIdentity;
    this.setLoading('Switching Review point', 'diff');
    if (basis.kind === 'live') {
      const { reviewSnapshotIdentity: _snapshot, ...liveTarget } = target;
      return [
        {
          type: 'show-review',
          target: {
            ...liveTarget,
            reviewBasisIdentity: basis.reviewBasisIdentity,
            manifestOffset: 0,
            diffOffset: 0,
          },
        },
      ];
    }
    if (basis.capture.status !== 'captured') return [];
    return [
      {
        type: 'show-review',
        target: {
          ...target,
          reviewBasisIdentity: basis.reviewBasisIdentity,
          reviewSnapshotIdentity: basis.capture.reviewSnapshotIdentity,
          manifestOffset: 0,
          diffOffset: 0,
        },
      },
    ];
  }
}
