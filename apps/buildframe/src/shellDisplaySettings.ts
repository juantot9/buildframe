import type { ConfigurationRow } from './shellConfiguration.js';
import { MATCH_TERMINAL_THEME } from './shellLook.js';
import type { ReviewingBackground, ReviewingThemeDefinition } from './userConfiguration.js';

/** The settings every screen shares: the theme and whose background is painted. */

/** Where the theme and background live; a row reads and changes them in place. */
export interface DisplayTarget {
  reviewingTheme: ReviewingThemeDefinition;
  background: ReviewingBackground;
  readonly customThemes: readonly ReviewingThemeDefinition[];
  readonly terminalThemeMode: 'dark' | 'light' | undefined;
}

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
} as const;

/** Every description these rows can show. */
export const DISPLAY_DESCRIPTIONS: readonly string[] = Object.values(DESCRIPTIONS).flatMap(variants =>
  Object.values(variants),
);

const THEME_PRESETS: readonly ReviewingThemeDefinition[] = [
  Object.freeze({ inherits: 'match-terminal', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'quiet-graphite', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'quiet-paper', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'warm-carbon', colors: Object.freeze({}) }),
  Object.freeze({ inherits: 'indigo-night', colors: Object.freeze({}) }),
];

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

function themeDescription(target: DisplayTarget): string {
  if (target.reviewingTheme.inherits !== MATCH_TERMINAL_THEME) return DESCRIPTIONS.theme.presets;
  if (target.terminalThemeMode === undefined) return DESCRIPTIONS.theme.unreported;
  return target.terminalThemeMode === 'light' ? DESCRIPTIONS.theme.matchedLight : DESCRIPTIONS.theme.matchedDark;
}

/** The presets, then the user's named themes, wrapping at both ends. */
function nextTheme(target: DisplayTarget, direction: -1 | 1): ReviewingThemeDefinition {
  const choices = [...THEME_PRESETS, ...target.customThemes];
  const current =
    target.reviewingTheme.name === undefined
      ? THEME_PRESETS.findIndex(preset => preset.inherits === target.reviewingTheme.inherits)
      : choices.findIndex(theme => theme.name === target.reviewingTheme.name);
  const start = current < 0 ? (direction > 0 ? -1 : 0) : current;
  return choices[(start + direction + choices.length) % choices.length]!;
}

export function themeRow(target: DisplayTarget): ConfigurationRow {
  return {
    id: 'theme',
    name: 'Theme',
    value: themeName(target.reviewingTheme),
    description: themeDescription(target),
    change: direction => {
      target.reviewingTheme = nextTheme(target, direction);
    },
  };
}

export function backgroundRow(target: DisplayTarget): ConfigurationRow {
  return {
    id: 'background',
    name: 'Background',
    value: target.background === 'terminal' ? 'Terminal' : 'Theme',
    description: target.background === 'terminal' ? DESCRIPTIONS.background.terminal : DESCRIPTIONS.background.theme,
    change: () => {
      target.background = target.background === 'theme' ? 'terminal' : 'theme';
    },
  };
}
