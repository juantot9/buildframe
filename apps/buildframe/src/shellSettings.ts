import type { ReviewingInput } from './reviewingInput.js';
import type { NoticeTone } from './reviewingStatus.js';
import type { RenderChild } from './renderTree.js';
import type { SizedLook } from './shellChrome.js';
import { semanticError } from './shellCommands.js';
import {
  configurationDialog,
  configurationKey,
  type ConfigurationRow,
  type ConfigurationWindow,
} from './shellConfiguration.js';
import { backgroundRow, DISPLAY_DESCRIPTIONS, themeRow } from './shellDisplaySettings.js';
import type { Look } from './shellLook.js';
import { DebouncedSave } from './shellPreferences.js';
import {
  DEFAULT_REVIEWING_PREFERENCES,
  type ReviewingPreferences,
  type ReviewingThemeDefinition,
  type UserConfiguration,
} from './userConfiguration.js';

/** Rows a screen adds to Configuration, with every description they can show. */
export interface ScreenSettings {
  readonly rows: readonly ConfigurationRow[];
  readonly descriptions: readonly string[];
}

/**
 * The shell's settings: the theme and background every screen is drawn with,
 * the saved preferences they belong to, and the Configuration window (`c`)
 * that changes them and saves each change.
 */
export class ShellSettings {
  /** The theme and background, changed in place by Configuration. */
  readonly display: {
    reviewingTheme: ReviewingThemeDefinition;
    background: ReviewingPreferences['background'];
    customThemes: readonly ReviewingThemeDefinition[];
    terminalThemeMode: Look['terminalThemeMode'];
  } = {
    reviewingTheme: DEFAULT_REVIEWING_PREFERENCES.theme,
    background: DEFAULT_REVIEWING_PREFERENCES.background,
    customThemes: [],
    terminalThemeMode: undefined,
  };
  readonly #configuration: UserConfiguration;
  readonly #say: (text: string, tone: NoticeTone) => void;
  readonly #save: DebouncedSave<ReviewingPreferences>;
  #preferences: ReviewingPreferences = DEFAULT_REVIEWING_PREFERENCES;
  #window: ConfigurationWindow | undefined;

  constructor(configuration: UserConfiguration, say: (text: string, tone: NoticeTone) => void) {
    this.#configuration = configuration;
    this.#say = say;
    this.#save = new DebouncedSave(async preferences => {
      try {
        const result = await configuration.saveReviewingPreferences(preferences);
        if (result.status === 'rejected') say(`Settings were not saved: ${result.reason}.`, 'warning');
      } catch (error) {
        say(`Couldn’t save the settings. ${semanticError(error)}`, 'warning');
      }
    });
  }

  /** Reads the saved preferences; returns what to warn about, if anything. */
  async load(): Promise<string | undefined> {
    try {
      const loaded = await this.#configuration.load();
      this.#preferences = loaded.preferences;
      this.display.reviewingTheme = loaded.preferences.theme;
      this.display.background = loaded.preferences.background;
      this.display.customThemes = loaded.themes;
      return loaded.warning;
    } catch (error) {
      return `Couldn’t read your settings, so defaults are in use. ${semanticError(error)}`;
    }
  }

  look(presentation: Look['presentation']): Look {
    const display = this.display;
    return {
      presentation,
      reviewingTheme: display.reviewingTheme,
      background: display.background,
      terminalThemeMode: display.terminalThemeMode,
    };
  }

  get open(): boolean {
    return this.#window !== undefined;
  }

  show(): void {
    this.#window = { selected: 'theme' };
  }

  /** One key while the window is open: move, change and save, or close. */
  key(input: ReviewingInput, screen: ScreenSettings | undefined): void {
    const window = this.#window;
    if (window === undefined) return;
    const outcome = configurationKey(window, input, this.#content(screen).rows);
    if (outcome === 'closed') {
      this.#window = undefined;
      this.#say('Settings saved.', 'success');
    } else if (outcome === 'changed') {
      const { reviewingTheme: theme, background } = this.display;
      this.#preferences = { ...this.#preferences, theme, background };
      this.#save.schedule(this.#preferences);
    }
  }

  dialog(look: SizedLook, screen: ScreenSettings | undefined, bodyHeight: number, idPrefix: string): RenderChild[] {
    const window = this.#window;
    if (window === undefined) return [];
    return configurationDialog(look, window, { title: 'Display', ...this.#content(screen) }, bodyHeight, 0, idPrefix);
  }

  /** Saves what is waiting and resolves once every save has finished. */
  async settle(): Promise<void> {
    await this.#save.settle();
  }

  /** The theme and background, then the screen's own rows. */
  #content(screen: ScreenSettings | undefined): ScreenSettings {
    return {
      rows: [themeRow(this.display), backgroundRow(this.display), ...(screen?.rows ?? [])],
      descriptions: [...DISPLAY_DESCRIPTIONS, ...(screen?.descriptions ?? [])],
    };
  }
}
