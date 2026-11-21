import { agentConnected, type ReviewingApplicationState } from './reviewingModel.js';
import { reviewingFiles } from './reviewingFileList.js';
import {
  defineKeyTable,
  type FooterMode,
  type HelpMode,
  type HelpPlacement,
  type KeyBinding,
  type KeyPlacement,
  type KeyTable,
} from './shellKeys.js';

type S = ReviewingApplicationState;
export type FooterName =
  | 'locked'
  | 'saving'
  | 'gatePreview'
  | 'gate'
  | 'preview'
  | 'previewPreparing'
  | 'composerReselect'
  | 'composerDiscard'
  | 'composerEmpty'
  | 'composerTyped'
  | 'keyList'
  | 'jumpFilter'
  | 'jump'
  | 'basisPicker'
  | 'configuration'
  | 'search'
  | 'continuation'
  | 'comparisonInput'
  | 'historical'
  | 'launcher'
  | 'previous'
  | 'comparison'
  | 'none'
  | 'pastStep'
  | 'codeOnly'
  | 'nothingListed'
  | 'review';
export type HelpName = 'launcher' | 'comparison' | 'previous' | 'pastStep' | 'review';

const BINDINGS: Readonly<Record<Id, KeyBinding>> = {
  move: { show: 'j/k' },
  page: { show: 'PgUp/PgDn' },
  ends: { show: 'g/G' },
  enter: { show: 'Enter' },
  tab: { show: 'Tab' },
  search: { show: '/' },
  mergeParent: { show: 'h/l' },
  count: { show: 'n' },
  reference: { show: 'r' },
  folder: { show: 'h/l' },
  allFolders: { show: 'H/L' },
  sideways: { show: 'Shift+←/→' },
  steps: { show: '[ and ]' },
  zoom: { show: 'z' },
  fileJump: { show: 'J/K' },
  diffMode: { show: 'v/w' },
  listFiles: { show: 'e' },
  listMessages: { show: 'm' },
  newMessage: { show: 'a' },
  copy: { show: 'y' },
  interrupt: { show: 'x' },
  resend: { show: 'r' },
  continueComparison: { show: 'C' },
  fileScope: { show: 'f' },
  reviewPoint: { show: 't' },
  live: { show: 'R' },
  filesPane: { show: 's' },
  resize: { show: '< / >' },
  esc: { show: 'Esc' },
  f3: { show: 'F3' },
  f4: { show: 'F4' },
  escF3: { show: 'Esc/F3' },
  closeKeyList: { show: '?/Esc' },
  change: { show: '←/→' },
  enterEsc: { show: 'Enter/Esc' },
} as const;

type Id =
  | 'move'
  | 'page'
  | 'ends'
  | 'enter'
  | 'tab'
  | 'search'
  | 'mergeParent'
  | 'count'
  | 'reference'
  | 'folder'
  | 'allFolders'
  | 'sideways'
  | 'steps'
  | 'zoom'
  | 'fileJump'
  | 'diffMode'
  | 'listFiles'
  | 'listMessages'
  | 'newMessage'
  | 'copy'
  | 'interrupt'
  | 'resend'
  | 'continueComparison'
  | 'fileScope'
  | 'reviewPoint'
  | 'live'
  | 'filesPane'
  | 'resize'
  | 'esc'
  | 'f3'
  | 'f4'
  | 'escF3'
  | 'closeKeyList'
  | 'change'
  | 'enterEsc';

const key = (id: Id, label: KeyPlacement<S, Id>['label'], when?: (state: S) => boolean): KeyPlacement<S, Id> => ({
  id,
  label,
  ...(when === undefined ? {} : { when }),
});
const typing = (keys: readonly KeyPlacement<S, Id>[], sentence?: FooterMode<S, Id>['sentence']): FooterMode<S, Id> => ({
  typing: true,
  keys,
  ...(sentence === undefined ? {} : { sentence }),
});
const keysOnly = (keys: readonly KeyPlacement<S, Id>[]): FooterMode<S, Id> => ({ typing: false, keys });

const help = (
  group: HelpPlacement<S, Id>['group'],
  id: Id,
  label: HelpPlacement<S, Id>['label'],
  extra: Partial<Pick<HelpPlacement<S, Id>, 'when' | 'alsoCovers' | 'show'>> = {},
): HelpPlacement<S, Id> => ({ group, id, label, ...extra });

const agentPreview = key('f3', 'preview', agentConnected);
const zoomLabel = (state: S): string => (state.codeOnly ? 'all panes' : 'code only');
const zoomHelp = (state: S): string => (state.codeOnly ? 'Show every pane' : 'Code only');

function selectedMerge(state: S): boolean {
  const commit =
    state.commitGraph?.status === 'available'
      ? state.commitGraph.rows.find(row => row.kind === 'commit' && row.objectIdentity === state.selectedCommitIdentity)
      : undefined;
  return commit?.kind === 'commit' && commit.parentIdentities.length > 1;
}

const FOOTER: Readonly<Record<FooterName, FooterMode<S, Id>>> = {
  locked: typing([], 'Keys are locked so nothing is sent twice. Reopen BuildFrame to see whether it went through.'),
  saving: typing([], 'Keys you press now wait until it’s saved.'),
  gatePreview: typing([key('escF3', 'close preview')], 'Nothing is sent until you confirm.'),
  gate: typing(
    [key('enter', 'send it'), key('f3', 'preview'), key('esc', 'back to draft')],
    'Going back to the draft sends nothing.',
  ),
  preview: typing([key('escF3', 'close and keep editing')], 'Nothing is sent from here.'),
  previewPreparing: typing([key('escF3', 'cancel')], 'Preparing the preview; nothing is sent.'),
  composerReselect: typing(
    [key('f4', 'target the current line'), key('esc', 'cancel')],
    'Your text is kept; Enter stays blocked until you press F4.',
  ),
  composerDiscard: typing(
    [key('esc', 'discard draft'), key('enter', 'send'), agentPreview],
    'Typing keeps the draft; nothing is sent.',
  ),
  composerEmpty: typing(
    [key('enter', 'send'), agentPreview, key('esc', 'close')],
    'Enter sends; nothing is sent until then.',
  ),
  composerTyped: typing(
    [key('enter', 'send'), agentPreview, key('esc', 'discard')],
    'Typed text needs Esc twice to discard; nothing is sent.',
  ),
  keyList: typing([key('closeKeyList', 'close')], 'Every key for what is on screen now.'),
  jumpFilter: typing([key('enter', 'open'), key('esc', 'clear filter')], 'Type to filter; Up/Down move.'),
  jump: typing(
    [key('enter', 'open'), key('search', 'filter'), key('esc', 'close')],
    state =>
      `Enter opens the ${state.jumpList?.kind === 'files' ? 'file' : 'Message'} in the Diff; the panes stay as they are.`,
  ),
  basisPicker: typing(
    [key('enter', 'open'), key('esc', 'close')],
    'Your files are never checked out; the whole screen switches together.',
  ),
  configuration: typing([key('change', 'change'), key('enterEsc', 'close')], 'Changes show and save right away.'),
  search: typing([key('enter', 'open'), key('esc', 'close')], 'Type to filter; Up/Down move, Ctrl+U clears.'),
  continuation: typing(
    [key('enter', 'choose'), key('esc', 'cancel')],
    'Tab moves between the choices; the saved Review stays unchanged either way.',
  ),
  comparisonInput: typing(
    [
      key('enter', state => (state.comparisonInput?.kind === 'message-search' ? 'choose' : 'compare')),
      key('esc', 'cancel'),
    ],
    state =>
      state.comparisonInput?.kind === 'message-search'
        ? 'Type to filter shown commit messages; Ctrl+U clears.'
        : state.comparisonInput?.kind === 'count'
          ? 'Type how many commits back from HEAD, from 1 to 500.'
          : state.comparisonMode === 'commit'
            ? 'Shows that one commit’s changes.'
            : 'Shows everything from that commit up to HEAD.',
  ),
  historical: keysOnly([key('esc', 'close')]),
  launcher: keysOnly([key('move', 'move'), key('enter', 'open')]),
  previous: keysOnly([key('move', 'move'), key('enter', 'open')]),
  comparison: keysOnly([
    key('enter', 'start Review'),
    // A merge commit needs a parent chosen before it can be compared.
    key('mergeParent', 'parent', state => state.comparisonMode === 'commit' && selectedMerge(state)),
    key('tab', 'commit / range'),
    key('search', 'search'),
  ]),
  none: keysOnly([]),
  pastStep: keysOnly([key('esc', 'back to now'), key('steps', 'older / newer'), key('zoom', zoomLabel)]),
  codeOnly: keysOnly([
    key('newMessage', 'new Message'),
    key('listFiles', 'files'),
    key('listMessages', 'Messages'),
    key('zoom', zoomLabel),
  ]),
  // Live changes have history; a fixed comparison has versions. Decided by the
  // Review's kind, not by whether history has loaded yet, so the word never flips.
  nothingListed: keysOnly([key('fileScope', 'all files'), key('steps', historyWord), key('zoom', zoomLabel)]),
  review: keysOnly([key('newMessage', 'new Message'), key('steps', historyWord), key('zoom', zoomLabel)]),
};

function historyWord(state: S): string {
  return state.review?.history !== undefined || state.review?.source.kind === 'live' ? 'history' : 'versions';
}

const HELP: Readonly<Record<HelpName, HelpMode<S, Id>>> = {
  launcher: { keys: [help('MOVE', 'move', 'Move'), help('OPEN', 'enter', 'Open')] },
  comparison: {
    escape: 'Back to Home',
    keys: [
      help('MOVE', 'move', 'Select commit'),
      help('MOVE', 'page', 'Move one window'),
      help('MOVE', 'ends', 'First / last commit'),
      // Listed whether or not a preview is ready: Enter previews, then starts.
      help('OPEN', 'enter', 'Start a Review of it'),
      help('VIEW', 'tab', 'One commit / range up to HEAD'),
      help('VIEW', 'count', 'Choose HEAD~N'),
      help('VIEW', 'search', 'Search shown messages'),
      help('VIEW', 'reference', 'Exact hash / branch / tag'),
      help('VIEW', 'mergeParent', 'Choose merge parent', { when: selectedMerge }),
    ],
  },
  previous: {
    escape: 'Back to Home',
    keys: [
      help('MOVE', 'move', 'Select Previous Review'),
      help('MOVE', 'page', 'Move one window'),
      help('MOVE', 'ends', 'Newest / oldest Review'),
      help('OPEN', 'enter', 'Open read-only'),
    ],
  },
  pastStep: {
    escape: 'Back to now',
    keys: [
      help('MOVE', 'steps', 'Older / newer step'),
      help('MOVE', 'tab', 'Files / Diff / History'),
      help('MOVE', 'move', state => (state.focus === 'questions' ? 'Older / newer step' : 'Move selection')),
      help('MOVE', 'ends', 'First / last'),
      help('MOVE', 'page', 'Move one page'),
      help('MOVE', 'fileJump', 'Next / previous changed file'),
      help('VIEW', 'diffMode', 'Diff mode / wrapping', { when: state => state.focus === 'diff' }),
      help('VIEW', 'listFiles', 'List files'),
      help('VIEW', 'zoom', zoomHelp),
    ],
  },
  review: {
    escape: 'Back to Home',
    keys: [
      help('MOVE', 'tab', 'Next pane (Shift+Tab: back)'),
      help('MOVE', 'move', 'Move selection'),
      help('MOVE', 'ends', 'First / last'),
      help('MOVE', 'page', state => (state.focus === 'questions' ? 'Scroll the Message' : 'Move one page')),
      help('MOVE', 'fileJump', 'Next / previous changed file'),
      help('MOVE', 'folder', 'Collapse / expand folder', { when: state => state.focus === 'files' }),
      help('MOVE', 'allFolders', 'Collapse / expand all folders', { when: state => state.focus === 'files' }),
      help('MOVE', 'sideways', 'Scroll code sideways', {
        when: state => state.focus === 'diff' && !state.wrapDiffLines,
      }),
      help('OPEN', 'enter', 'Open the selection'),
      help('OPEN', 'newMessage', 'New Message on the selected line'),
      help(
        'OPEN',
        'copy',
        state => (state.focus === 'diff' ? 'Copy selected Diff row' : 'Copy selected Message body'),
        {
          when: state => state.focus === 'diff' || state.focus === 'questions',
        },
      ),
      help('OPEN', 'interrupt', 'Interrupt the selected Message'),
      help('OPEN', 'resend', 'Send the selected Message again'),
      help('OPEN', 'continueComparison', 'Continue this comparison', {
        when: state => state.review?.continuation?.status === 'available',
      }),
      help('VIEW', 'fileScope', 'Changed / All files'),
      help('VIEW', 'reviewPoint', 'Choose review point'),
      help('VIEW', 'steps', state =>
        state.review?.history === undefined ? 'Previous / next Version' : 'Step through history',
      ),
      help('VIEW', 'live', 'Return to Live Changes'),
      help('VIEW', 'diffMode', 'Diff mode / wrapping', { when: state => state.focus === 'diff' }),
      help('VIEW', 'search', 'Search this Review'),
      help('VIEW', 'filesPane', 'Show / hide Files'),
      help('VIEW', 'zoom', zoomHelp),
      help('VIEW', 'listFiles', 'List files / Messages', { show: 'e / m', alsoCovers: ['listMessages'] }),
      help('VIEW', 'resize', 'Resize the pane'),
    ],
  },
};

export const REVIEWING_KEYS: KeyTable<S, Id, FooterName, HelpName> = defineKeyTable<S, Id, FooterName, HelpName>({
  bindings: BINDINGS,
  footer: FOOTER,
  help: HELP,
  helpFor: {
    launcher: 'launcher',
    previous: 'previous',
    comparison: 'comparison',
    pastStep: 'pastStep',
    codeOnly: 'review',
    nothingListed: 'review',
    review: 'review',
  },
});

/** The footer mode, in the order that decides which layer the keys belong to. */
export function reviewingFooterMode(state: S): FooterName {
  if (state.pending?.phase === 'result-unavailable') return 'locked';
  if (
    (state.editor?.inspectionRequest?.purpose === 'submit' && state.pending === undefined) ||
    (state.pending !== undefined && state.editor !== undefined)
  ) {
    return 'saving';
  }
  if (state.messageCommitGate !== undefined) return state.messagePreview !== undefined ? 'gatePreview' : 'gate';
  if (state.messagePreview !== undefined) return 'preview';
  if (state.editor?.inspectionRequest?.purpose === 'preview') return 'previewPreparing';
  if (state.editor !== undefined) {
    if (state.editor.reselectionRequired) return 'composerReselect';
    if (state.editor.discardArmed === true) return 'composerDiscard';
    return state.editor.body.length === 0 ? 'composerEmpty' : 'composerTyped';
  }
  if (state.actionLookupOpen) return 'keyList';
  if (state.jumpList !== undefined) return state.jumpList.filtering ? 'jumpFilter' : 'jump';
  if (state.basisPicker !== undefined) return 'basisPicker';
  if (state.configurationWindow !== undefined) return 'configuration';
  if (state.search !== undefined) return 'search';
  if (state.continuationChoice !== undefined) return 'continuation';
  if (state.screen === 'home' && state.homeMode === 'comparison' && state.comparisonInput !== undefined) {
    return 'comparisonInput';
  }
  if (state.historicalDialog !== undefined) return 'historical';
  if (state.screen === 'home') {
    return state.homeMode === 'launcher' ? 'launcher' : state.homeMode === 'comparison' ? 'comparison' : 'previous';
  }
  if (state.screen !== 'review') return 'none';
  if (state.shownStep !== undefined) return 'pastStep';
  if (state.codeOnly) return 'codeOnly';
  // Nothing changed and only changed files listed: f is the way on.
  const nothingListed =
    state.review !== undefined && state.fileScope === 'changed' && reviewingFiles(state.review, 'changed').length === 0;
  return nothingListed ? 'nothingListed' : 'review';
}

/** Which `?` list explains what is on screen. */
export function reviewingHelpMode(state: S): HelpName {
  if (state.screen === 'home') {
    return state.homeMode === 'launcher' ? 'launcher' : state.homeMode === 'comparison' ? 'comparison' : 'previous';
  }
  return state.shownStep !== undefined ? 'pastStep' : 'review';
}
