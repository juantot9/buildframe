import type { ConfigurationContent, ConfigurationRow } from './shellConfiguration.js';
import { backgroundRow, DISPLAY_DESCRIPTIONS, themeRow } from './shellDisplaySettings.js';
import type { ReviewingApplicationState } from './reviewingModel.js';
import type { ReviewArrangement } from './userConfiguration.js';

/** Reviewing's settings as the Configuration window lists them. */

/** Every description Reviewing's own rows can show, so the dialog's height can be fixed to the longest. */
const DESCRIPTIONS = {
  panes: {
    all: 'Show the panes this width allows; z switches to code only.',
    codeOnly: 'Only the Diff, at every width. e lists files, m lists Messages; z shows every pane.',
  },
  arrangement: {
    codeSpotlight: 'Give the Diff most of the terminal; context stays secondary.',
    reviewNotebook: 'Lead with History and keep the Diff beside it as evidence.',
    workspace: 'Keep Files, Diff, and History visible side by side.',
  },
  icons: {
    nerd: 'Nerd Font glyphs for folders and file states; needs a patched terminal font.',
    text: 'Plain text markers that render in every terminal font.',
  },
  header: {
    shown: 'One row with where you are and whether the agent is connected.',
    hidden: 'Hidden; the agent’s status moves to the end of the history row.',
  },
  motion: {
    smooth: 'Panes glide to their new place when they scroll.',
    instant: 'Panes jump straight to their new place; best over slow connections.',
  },
} as const;

const OWN_DESCRIPTIONS: readonly string[] = Object.values(DESCRIPTIONS).flatMap(variants => Object.values(variants));

const ARRANGEMENTS: readonly ReviewArrangement[] = ['workspace', 'code-spotlight', 'review-notebook'];

/** The window's content for Reviewing, read from its state; changes write back to it. */
export function reviewingSettings(
  state: ReviewingApplicationState,
  setCodeOnly: (codeOnly: boolean) => void,
): ConfigurationContent {
  const own = reviewingOwnSettings(state, setCodeOnly);
  return {
    title: own.title,
    rows: [themeRow(state), backgroundRow(state), ...own.rows],
    descriptions: [...DISPLAY_DESCRIPTIONS, ...own.descriptions],
  };
}

/** Reviewing's rows after the shell's theme and background. */
export function reviewingOwnSettings(
  state: ReviewingApplicationState,
  setCodeOnly: (codeOnly: boolean) => void,
): ConfigurationContent {
  const arrangement = state.arrangement;
  const rows: ConfigurationRow[] = [
    {
      id: 'arrangement',
      name: 'Arrangement',
      value:
        arrangement === 'code-spotlight'
          ? 'Code Spotlight'
          : arrangement === 'review-notebook'
            ? 'Review Notebook'
            : 'Workspace',
      description:
        arrangement === 'code-spotlight'
          ? DESCRIPTIONS.arrangement.codeSpotlight
          : arrangement === 'review-notebook'
            ? DESCRIPTIONS.arrangement.reviewNotebook
            : DESCRIPTIONS.arrangement.workspace,
      change: direction => {
        const current = Math.max(0, ARRANGEMENTS.indexOf(state.arrangement));
        state.arrangement = ARRANGEMENTS[(current + direction + ARRANGEMENTS.length) % ARRANGEMENTS.length]!;
      },
    },
    {
      id: 'panes',
      name: 'Panes',
      value: state.codeOnly ? 'Code only' : 'All panes',
      description: state.codeOnly ? DESCRIPTIONS.panes.codeOnly : DESCRIPTIONS.panes.all,
      change: () => setCodeOnly(!state.codeOnly),
    },
    {
      id: 'icons',
      name: 'Icons',
      value: state.icons === 'nerd' ? 'Nerd Font' : 'Text',
      description: state.icons === 'nerd' ? DESCRIPTIONS.icons.nerd : DESCRIPTIONS.icons.text,
      change: () => {
        state.icons = state.icons === 'text' ? 'nerd' : 'text';
      },
    },
    {
      id: 'header-visibility',
      name: 'Header',
      value: state.header.visible ? 'Shown' : 'Hidden',
      description: state.header.visible ? DESCRIPTIONS.header.shown : DESCRIPTIONS.header.hidden,
      change: () => {
        state.header = { ...state.header, visible: !state.header.visible };
      },
    },
    {
      id: 'motion',
      name: 'Scrolling',
      value: state.motion === 'smooth' ? 'Smooth' : 'Instant',
      description: state.motion === 'smooth' ? DESCRIPTIONS.motion.smooth : DESCRIPTIONS.motion.instant,
      change: () => {
        state.motion = state.motion === 'smooth' ? 'off' : 'smooth';
      },
    },
  ];
  return { title: 'Review display', rows, descriptions: OWN_DESCRIPTIONS };
}
