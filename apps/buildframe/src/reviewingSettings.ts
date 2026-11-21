import type { ConfigurationContent, ConfigurationRow } from './shellConfiguration.js';
import { MATCH_TERMINAL_THEME } from './shellLook.js';
import type { ReviewingApplicationState } from './reviewingModel.js';
import type { ReviewArrangement, ReviewingThemeDefinition } from './userConfiguration.js';

/** Reviewing's settings as the Configuration window lists them. */

/** Every description the Configuration dialog can show, so its height can be fixed to the longest. */
const DESCRIPTIONS = {
  theme: {
    presets: 'Built-in presets and named custom themes.',
    unreported: 'Your terminal didn’t report its background, so Quiet Graphite (dark) is in use.',
    matchedLight: 'Quiet Graphite on dark terminals, Quiet Paper on light. Now: Quiet Paper.',
    matchedDark: 'Quiet Graphite on dark terminals, Quiet Paper on light. Now: Quiet Graphite.',
  },
  background: {
    terminal: 'Use the terminal’s own background; changed lines keep their tint.',
    theme: 'Use the selected theme background and pane surfaces.',
  },
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

const ALL_DESCRIPTIONS: readonly string[] = Object.values(DESCRIPTIONS).flatMap(variants => Object.values(variants));

const THEME_PRESETS: readonly ReviewingThemeDefinition[] = [
  Object.freeze({ inherits: 'match-terminal', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'quiet-graphite', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'quiet-paper', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'warm-carbon', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'indigo-night', colors: Object.freeze({}) }),
];

const ARRANGEMENTS: readonly ReviewArrangement[] = ['workspace', 'code-spotlight', 'review-notebook'];

function themeName(theme: ReviewingThemeDefinition): string {
  return (
    theme.name ??
    (theme.inherits === MATCH_TERMINAL_THEME
      ? 'Match terminal'
      : theme.inherits === 'warm-carbon'
        ? 'Warm Carbon'
        : theme.inherits === 'indigo-night'
          ? 'Indigo Night'
          : theme.inherits === 'quiet-graphite'
            ? 'Quiet Graphite'
            : theme.inherits === 'quiet-paper'
              ? 'Quiet Paper'
              : 'Custom')
  );
}

function themeDescription(state: ReviewingApplicationState): string {
  if (state.reviewingTheme.inherits !== MATCH_TERMINAL_THEME) return DESCRIPTIONS.theme.presets;
  if (state.terminalThemeMode === undefined) return DESCRIPTIONS.theme.unreported;
  return state.terminalThemeMode === 'light' ? DESCRIPTIONS.theme.matchedLight : DESCRIPTIONS.theme.matchedDark;
}

function nextTheme(state: ReviewingApplicationState, direction: -1 | 1): ReviewingThemeDefinition {
  const choices = [...THEME_PRESETS, ...state.customThemes];
  const current =
    state.reviewingTheme.name === undefined
      ? THEME_PRESETS.findIndex(preset => preset.inherits === state.reviewingTheme.inherits)
      : choices.findIndex(theme => theme.name === state.reviewingTheme.name);
  const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
  return choices[(start + direction + choices.length) % choices.length]!;
}

/** The window's content for Reviewing, read from its state; changes write back to it. */
export function reviewingSettings(
  state: ReviewingApplicationState,
  setCodeOnly: (codeOnly: boolean) => void,
): ConfigurationContent {
  const arrangement = state.arrangement;
  const rows: ConfigurationRow[] = [
    {
      id: 'theme',
      name: 'Theme',
      value: themeName(state.reviewingTheme),
      description: themeDescription(state),
      change: direction => {
        state.reviewingTheme = nextTheme(state, direction);
      },
    },
    {
      id: 'background',
      name: 'Background',
      value: state.background === 'terminal' ? 'Terminal' : 'Theme',
      description: state.background === 'terminal' ? DESCRIPTIONS.background.terminal : DESCRIPTIONS.background.theme,
      change: () => {
        state.background = state.background === 'theme' ? 'terminal' : 'theme';
      },
    },
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
  return { title: 'Review display', rows, descriptions: ALL_DESCRIPTIONS };
}
