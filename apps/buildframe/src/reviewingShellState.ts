import type { ReviewingApplicationState } from './reviewingModel.js';
import type { ShellSharedState } from './shellScreen.js';

type Linked =
  | 'actionLookupOpen'
  | 'showDetails'
  | 'configurationWindow'
  | 'reviewingTheme'
  | 'background'
  | 'customThemes'
  | 'terminalThemeMode';

/**
 * WF-301 scaffolding: the `?` list, the `!` checks, the Configuration window,
 * the theme and the background belong to the shell. Reviewing's state keeps
 * these fields, but they now read and write the shell's, so there is one of
 * each while Reviewing's code still uses the fields directly.
 */
export function lendShellState(state: ReviewingApplicationState, shell: ShellSharedState): void {
  const link = <K extends Linked>(
    key: K,
    get: () => ReviewingApplicationState[K],
    set: (value: ReviewingApplicationState[K]) => void,
  ): void => {
    Object.defineProperty(state, key, { get, set, enumerable: true, configurable: true });
  };
  const { overlays, settings } = shell;
  const display = settings.display;
  link(
    'actionLookupOpen',
    () => overlays.keyListOpen,
    value => {
      overlays.keyListOpen = value;
    },
  );
  link(
    'showDetails',
    () => overlays.checksOpen,
    value => {
      overlays.checksOpen = value;
    },
  );
  link(
    'configurationWindow',
    () => settings.window as ReviewingApplicationState['configurationWindow'],
    value => {
      settings.window = value;
    },
  );
  link(
    'reviewingTheme',
    () => display.reviewingTheme,
    value => {
      display.reviewingTheme = value;
    },
  );
  link(
    'background',
    () => display.background,
    value => {
      display.background = value;
    },
  );
  link(
    'customThemes',
    () => display.customThemes,
    value => {
      display.customThemes = value;
    },
  );
  link(
    'terminalThemeMode',
    () => display.terminalThemeMode,
    value => {
      display.terminalThemeMode = value;
    },
  );
}
