import type { ReviewingApplicationModel, ReviewingApplicationState, ReviewingModelEffect } from './reviewingModel.js';
import { firstListedFile, reviewingFiles } from './reviewingFileList.js';
import { Key, type ReviewingInput } from './reviewingInput.js';
import { dispatchKey, either, onKey, onText, type KeyAction } from './shellKeys.js';

type M = ReviewingApplicationModel;
type E = ReviewingModelEffect;

/** Keys that act on the loaded Review: while it loads they say so instead of acting on the wrong thing. */
const ACTS_ON_LOADED_REVIEW = ['a', 'y', 'f', 'r', 'x', 't', 'v', 'w', 'R', 'C'] as const;
/** Keys that change the Review: a past step refuses them until Esc returns to now. */
const SHOWN_STEP_BLOCKED_KEYS = ['a', 'r', 'x', 'f', 't', 'R', 'C'] as const;

const comparison = (model: M): boolean => model.state.screen === 'home' && model.state.homeMode === 'comparison';
const review = (model: M): boolean => model.state.screen === 'review';
const focused =
  (focus: ReviewingApplicationState['focus']) =>
  (model: M): boolean =>
    review(model) && model.state.focus === focus;
const pastStep = (model: M): boolean => review(model) && model.state.shownStep !== undefined;
const say =
  (sentence: string) =>
  (model: M): readonly E[] => {
    model.say(sentence, 'info');
    return [];
  };

function toggleComparisonMode(model: M): readonly E[] {
  const state = model.state;
  state.comparisonMode = state.comparisonMode === 'commit' ? 'range-to-head' : 'commit';
  state.comparisonPreview = undefined;
  state.comparisonRequestedSelection = undefined;
  state.selectedMergeParentIdentity = undefined;
  const graph = state.commitGraph;
  if (
    state.comparisonMode === 'range-to-head' &&
    graph?.status === 'available' &&
    state.selectedCommitIdentity === graph.headObjectIdentity
  ) {
    const parent = model.commitGraphCommits()[0]?.parentIdentities[0];
    if (parent !== undefined) state.selectedCommitIdentity = parent;
  }
  return model.previewSelectedCommit();
}

function chooseReviewPoint(model: M): readonly E[] {
  const state = model.state;
  const active = state.activeReviewBasisIdentity ?? state.review?.bases.liveReviewBasisIdentity;
  if (active !== undefined) {
    state.basisPicker = { selectedReviewBasisIdentity: active };
    state.notice = undefined;
    state.showDetails = false;
  }
  return [];
}

function toggleFileScope(model: M): readonly E[] {
  const state = model.state;
  // Every file exists only for live changes; a fixed Review has its changed files alone.
  if (state.review?.source.kind !== 'live') {
    state.fileScope = 'changed';
    model.say('Only changed files here: every file shows on live changes, in the Current Review.', 'info');
    return [];
  }
  const currentPath = reviewingFiles(state.review, state.fileScope).find(
    file => file.fileIdentity === state.selectedFileIdentity,
  )?.pathBytesBase64;
  state.fileScope = state.fileScope === 'changed' ? 'all' : 'changed';
  const files = reviewingFiles(state.review, state.fileScope);
  // Stay on the same file when the other list has it; otherwise start at
  // the top of the list as it is shown.
  state.selectedFileIdentity = (
    files.find(file => file.pathBytesBase64 === currentPath) ?? firstListedFile(files, state.collapsedDirectories)
  )?.fileIdentity;
  state.selectedDirectory = undefined;
  state.selectedRowIdentity = undefined;
  state.focus = 'files';
  state.balancedContext = 'files';
  state.notice =
    state.fileScope === 'all'
      ? 'Showing all files; you can leave a Message on any line.'
      : 'Showing changed files only.';
  return model.previewSelectedFile();
}

function toggleFilesPane(model: M): readonly E[] {
  const state = model.state;
  state.filePaneVisible = !state.filePaneVisible;
  if (!state.filePaneVisible && state.focus === 'files') state.focus = 'diff';
  if (state.filePaneVisible) {
    state.balancedContext = 'files';
    model.setViewport(state.width, state.height);
  } else if (state.balancedContext === 'files') {
    state.balancedContext = 'questions';
  }
  state.notice = state.filePaneVisible ? 'Files pane shown.' : 'Files pane hidden.';
  return [model.reviewingPreferencesSaveEffect()];
}

function openSearch(model: M): readonly E[] {
  model.state.search = {
    query: '',
    cursor: 0,
    view: undefined,
    selectedResultIdentity: undefined,
    loading: false,
    preview: undefined,
    previewResultIdentity: undefined,
    previewLoading: false,
    requestedResultAbsolute: undefined,
  };
  model.state.notice = undefined;
  return [];
}

function scrollSideways(model: M, input: ReviewingInput): readonly E[] {
  if (model.state.wrapDiffLines) {
    model.say('Lines wrap, so there is nothing to scroll sideways. Press w to stop wrapping.', 'info');
    return [];
  }
  const direction = onKey(Key.shift('left'))(input) ? -4 : 4;
  model.state.diffHorizontalOffset = Math.max(0, model.state.diffHorizontalOffset + direction);
  return [];
}

function anchorSide(side: 'old' | 'new') {
  return (model: M): readonly E[] => {
    const row = model.selectedDiffRow;
    if (side === 'old' ? row?.oldLine !== undefined : row?.newLine !== undefined) model.state.anchorSide = side;
    else if (row !== undefined) {
      model.say(
        side === 'old'
          ? 'This line was added, so it has no old side.'
          : 'This line was removed, so it has no new side.',
        'info',
      );
    }
    return [];
  };
}

function toggleWrap(model: M): readonly E[] {
  const state = model.state;
  state.wrapDiffLines = !state.wrapDiffLines;
  state.diffHorizontalOffset = 0;
  state.notice = state.wrapDiffLines
    ? 'Diff line wrapping enabled.'
    : 'Diff line wrapping disabled; use Shift+Left/Right to scroll code.';
  return [];
}

function toggleDiffMode(model: M): readonly E[] {
  model.state.diffMode = model.state.diffMode === 'inline' ? 'side-by-side' : 'inline';
  model.state.notice = model.state.diffMode === 'inline' ? 'Showing inline Diff.' : 'Showing side-by-side Diff.';
  return [];
}

function openFromFiles(model: M): readonly E[] {
  return model.state.selectedDirectory !== undefined ? model.expandSelected() : model.openSelectedFile();
}

/** The Review's own keys, after the guards. */
// r and x act on the selected Message from any pane: its card says so wherever it shows.
const REVIEW_KEYS: readonly KeyAction<M, E>[] = [
  { actsFor: ['resend'], match: onText('r'), run: model => model.sendSelectedMessageAgain() },
  { actsFor: ['interrupt'], match: onText('x'), run: (model, _input, now) => model.interruptSelectedMessage(now) },
  { actsFor: ['steps'], match: onText('['), run: model => model.moveStep(-1) },
  { actsFor: ['steps'], match: onText(']'), run: model => model.moveStep(1) },
  { actsFor: ['live'], match: onText('R'), run: model => model.returnToLiveChanges() },
  {
    actsFor: ['continueComparison'],
    match: onText('C'),
    run: (model, _input, now) => model.continueComparisonWithLiveChanges(now),
  },
  // Ctrl+H arrives as Backspace on terminals without the kitty keyboard protocol.
  {
    actsFor: ['resize'],
    match: either(onText('<'), onKey(Key.ctrl('h'))),
    run: model => model.resizeFocusedPaneBorder(-2),
  },
  {
    actsFor: ['resize'],
    match: either(onText('>'), onKey(Key.ctrl('l'))),
    run: model => model.resizeFocusedPaneBorder(2),
  },
  { actsFor: ['reviewPoint'], match: onText('t'), run: chooseReviewPoint },
  { actsFor: ['fileScope'], match: onText('f'), run: toggleFileScope },
  {
    actsFor: ['folder'],
    match: either(onText('h'), onKey(Key.left)),
    when: focused('files'),
    run: model => model.collapseSelected(),
  },
  {
    actsFor: ['folder'],
    match: either(onText('l'), onKey(Key.right)),
    when: focused('files'),
    run: model => model.expandSelected(),
  },
  { actsFor: ['allFolders'], match: onText('H'), when: focused('files'), run: model => model.collapseAllFolders() },
  { actsFor: ['allFolders'], match: onText('L'), when: focused('files'), run: model => model.expandAllFolders() },
  { actsFor: ['zoom'], match: onText('z'), run: model => model.toggleCodeOnly() },
  { actsFor: ['listFiles'], match: onText('e'), run: model => model.openJumpList('files') },
  { actsFor: ['listMessages'], match: onText('m'), run: model => model.openJumpList('messages') },
  { actsFor: ['fileJump'], match: onText('J'), run: model => model.jumpFile(1) },
  { actsFor: ['fileJump'], match: onText('K'), run: model => model.jumpFile(-1) },
  { actsFor: ['filesPane'], match: onText('s'), run: toggleFilesPane },
  { actsFor: ['search'], match: onText('/'), run: openSearch },
  {
    actsFor: ['sideways'],
    match: onKey(Key.shift('left'), Key.shift('right')),
    when: focused('diff'),
    run: scrollSideways,
  },
  { actsFor: [], match: either(onKey(Key.left), onText('h')), when: focused('diff'), run: anchorSide('old') },
  { actsFor: [], match: either(onKey(Key.right), onText('l')), when: focused('diff'), run: anchorSide('new') },
  { actsFor: ['diffMode'], match: onText('w'), when: focused('diff'), run: toggleWrap },
  { actsFor: ['diffMode'], match: onText('v'), when: focused('diff'), run: toggleDiffMode },
  {
    actsFor: [],
    match: onText('w', 'v'),
    run: (model, input) =>
      say(
        `Press Tab to reach the Diff, then press ${input.text} to ${input.text === 'w' ? 'wrap lines' : 'switch the Diff layout'}.`,
      )(model),
  },
  { actsFor: ['newMessage'], match: onText('a'), run: model => model.openCreateEditor() },
  { actsFor: ['enter'], match: onKey(Key.enter), when: focused('files'), run: openFromFiles },
  // Enter opens the Message where it lives: the Diff takes focus on its line.
  { actsFor: ['enter'], match: onKey(Key.enter), when: focused('questions'), run: model => model.openListedMessage() },
  {
    actsFor: ['enter'],
    match: onKey(Key.enter),
    when: focused('diff'),
    run: say('Press a to write a Message on this line.'),
  },
];

/**
 * Every key Reviewing acts on once the shell has passed it on, in the order
 * that decides which meaning wins: the commit picker's keys, movement (which
 * keeps working while a Review loads), Home, the loading and past-step
 * guards, then the Review's own keys.
 */
const REVIEWING_ACTIONS: readonly KeyAction<M, E>[] = [
  { actsFor: ['tab'], match: onKey(Key.tab, Key.shift('tab')), when: comparison, run: toggleComparisonMode },
  {
    actsFor: ['mergeParent'],
    match: either(onKey(Key.left, Key.right), onText('h', 'l')),
    when: comparison,
    run: (model, input) => model.moveMergeParent(onKey(Key.left)(input) || input.text === 'h' ? -1 : 1),
  },
  { actsFor: ['tab'], match: onKey(Key.tab), run: model => model.moveFocus(1) },
  { actsFor: ['tab'], match: onKey(Key.shift('tab')), run: model => model.moveFocus(-1) },
  { actsFor: ['page'], match: onKey(Key.pageUp), run: model => model.page(-1) },
  { actsFor: ['page'], match: onKey(Key.pageDown), run: model => model.page(1) },
  { actsFor: ['ends'], match: either(onKey(Key.home), onText('g')), run: model => model.moveToEdge('first') },
  { actsFor: ['ends'], match: either(onKey(Key.end), onText('G')), run: model => model.moveToEdge('last') },
  { actsFor: ['move'], match: either(onKey(Key.up), onText('k')), run: model => model.move(-1) },
  { actsFor: ['move'], match: either(onKey(Key.down), onText('j')), run: model => model.move(1) },
  {
    actsFor: ['enter', 'count', 'reference', 'search'],
    match: () => true,
    when: model => model.state.screen === 'home',
    run: (model, input, now) => model.handleHomeAction(input, now),
  },
  { actsFor: [], match: () => true, when: model => !review(model), run: () => [] },
  // While the Review loads, a key that acts on what is loading (write, copy,
  // switch, send, interrupt) would act on the wrong thing or on nothing. Say
  // so instead of running it; movement above keeps working.
  {
    actsFor: [],
    match: onText(...ACTS_ON_LOADED_REVIEW),
    when: model => model.state.loading !== undefined,
    run: (model, input) => {
      model.sayStillLoading(input.text!);
      return [];
    },
  },
  { actsFor: ['copy'], match: onText('y'), run: model => model.copyFocusedContent() },
  {
    actsFor: [],
    match: onKey(Key.enter),
    when: model => pastStep(model) && model.state.focus === 'files',
    run: model => {
      model.state.focus = 'diff';
      return [];
    },
  },
  {
    actsFor: [],
    match: onText(...SHOWN_STEP_BLOCKED_KEYS),
    when: pastStep,
    run: say('Press Esc to come back to now first.'),
  },
  {
    actsFor: [],
    match: onText('h', 'l', 'H', 'L'),
    when: model => pastStep(model) && model.state.focus === 'files',
    run: say('Press Esc to come back to now first.'),
  },
  ...REVIEW_KEYS,
];

export function dispatchReviewingKey(model: M, input: ReviewingInput, now: number): readonly E[] {
  return dispatchKey(REVIEWING_ACTIONS, model, input, now);
}

/** Every table key some Reviewing action carries out. */
export const REVIEWING_ACTED_KEYS: ReadonlySet<string> = new Set(REVIEWING_ACTIONS.flatMap(action => action.actsFor));
