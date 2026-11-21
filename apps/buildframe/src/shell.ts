import type { CliRenderer, KeyEvent } from '@opentui/core';
import type { Workspace, WorkspaceCommand } from '@buildframe/workspace';
import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { reviewingInputFromKeyEvent, type ReviewingInput } from './reviewingInput.js';
import { noticeGlyph, noticeStatusTone, type NoticeTone } from './reviewingStatus.js';
import { Box } from './renderTree.js';
import { actionChecksPanel, agentIndicator, keyListPanel, shellHeader } from './shellChrome.js';
import {
  ShellClipboard,
  productionClipboard,
  type ClipboardOutcome,
  type ShellClipboardFactory,
} from './shellClipboard.js';
import { executeCommand, semanticError } from './shellCommands.js';
import {
  configurationDialog,
  configurationKey,
  type ConfigurationRow,
  type ConfigurationWindow,
} from './shellConfiguration.js';
import { backgroundRow, DISPLAY_DESCRIPTIONS, themeRow } from './shellDisplaySettings.js';
import { shellFrame, type FrameLook } from './shellFrame.js';
import { routeShellKey, type ShellKeyHost } from './shellInput.js';
import { footerSentence, keyList, keysRow } from './shellKeys.js';
import { theme, type Look } from './shellLook.js';
import { DebouncedSave } from './shellPreferences.js';
import { ShellPulse } from './shellPulse.js';
import { ShellRoots } from './shellRoots.js';
import { dispatchScreenKey, type Screen, type ScreenEffect } from './shellScreen.js';
import { ShellTerminal } from './shellTerminal.js';
import { ShellViews } from './shellViews.js';
import {
  DEFAULT_REVIEWING_PREFERENCES,
  createEphemeralUserConfiguration,
  type ReviewingPreferences,
  type ReviewingThemeDefinition,
  type UserConfiguration,
} from './userConfiguration.js';

export interface ShellOptions {
  /** A connected runtime's closed Workspace Interface. */
  readonly workspace: Workspace;
  // Screens keep their own state types; the shell only hands each its own.
  readonly screens: readonly Screen<any, any>[];
  /** The screen shown first, and what it opens with. */
  readonly first: { readonly screen: string; readonly args?: unknown };
  readonly presentation?: Partial<Look['presentation']>;
  /** Portable UI preferences; production supplies the file-backed Module. */
  readonly userConfiguration?: UserConfiguration;
  /** A renderer a test provides instead of the terminal, owned by the shell once opened. */
  readonly renderer?: CliRenderer;
  readonly createClipboard?: ShellClipboardFactory;
}

export interface Shell {
  /** Resolves when terminal ownership and the connected Workspace use have ended. */
  readonly closed: Promise<void>;
  /** Opens the terminal and shows the first screen, unless stopped during startup. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

type ShellEffect = ScreenEffect | { readonly type: 'stop' };

interface OpenScreen {
  readonly screen: Screen<any, any>;
  readonly state: unknown;
}

const ROOT_ID = 'shell';

function copyOutcomeNotice(what: string, outcome: ClipboardOutcome): { text: string; tone: NoticeTone } {
  if (outcome === 'written') return { text: `Copied ${what}.`, tone: 'success' };
  if (outcome === 'attempted') {
    return { text: `Copied ${what} (your terminal may not support copying; check before pasting).`, tone: 'info' };
  }
  return { text: `Couldn’t copy ${what}: no clipboard is available.`, tone: 'warning' };
}

/**
 * Runs screens defined with `defineScreen`: it owns the terminal, the frame,
 * the shell's keys, copying, running commands and keeping each screen's views
 * current. Screens are stacked: `open` shows another, Esc returns.
 */
class ShellApplication implements Shell {
  readonly closed: Promise<void>;
  readonly #options: ShellOptions;
  readonly #screens: ReadonlyMap<string, Screen<any, any>>;
  readonly #stack: OpenScreen[] = [];
  readonly #views: ShellViews;
  readonly #presentation: Look['presentation'];
  /** The theme and background, changed in place by Configuration. */
  readonly #display: {
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
  readonly #userConfiguration: UserConfiguration;
  #preferences: ReviewingPreferences = DEFAULT_REVIEWING_PREFERENCES;
  readonly #preferencesSave: DebouncedSave<ReviewingPreferences>;
  #configuration: ConfigurationWindow | undefined;
  #checksOpen = false;
  #openingTerminal: Promise<ShellTerminal> | undefined;
  #terminal: ShellTerminal | undefined;
  #roots: ShellRoots | undefined;
  #clipboard: ShellClipboard | undefined;
  #connection: HarnessConnectionView | undefined;
  #unsubscribeFromConnection: (() => void) | undefined;
  #said: { readonly text: string; readonly tone: NoticeTone } | undefined;
  readonly #pulse = new ShellPulse(() => this.#render());
  #keyListOpen = false;
  #saving = 0;
  #starting: Promise<void> | undefined;
  #stopping: Promise<void> | undefined;
  #stopped = false;
  #resolveClosed!: () => void;

  constructor(options: ShellOptions) {
    this.closed = new Promise(resolve => {
      this.#resolveClosed = resolve;
    });
    this.#options = options;
    this.#screens = new Map(options.screens.map(screen => [screen.name, screen]));
    if (!this.#screens.has(options.first.screen)) throw new TypeError(`No screen named ${options.first.screen}`);
    this.#presentation = { ascii: false, noColor: false, ...options.presentation };
    const configuration = (this.#userConfiguration = options.userConfiguration ?? createEphemeralUserConfiguration());
    this.#preferencesSave = new DebouncedSave(async preferences => {
      try {
        const result = await configuration.saveReviewingPreferences(preferences);
        if (result.status === 'rejected') this.#say(`Settings were not saved: ${result.reason}.`, 'warning');
      } catch (error) {
        this.#say(`Couldn’t save the settings. ${semanticError(error)}`, 'warning');
      }
    });
    this.#views = new ShellViews(options.workspace, {
      changed: () => this.#render(),
      say: (sentence, tone) => this.#say(sentence, tone),
    });
  }

  start(): Promise<void> {
    if (this.#stopped) return this.closed;
    return (this.#starting ??= this.#start().catch(async error => {
      if (this.#stopped) return;
      await this.stop().catch(() => undefined);
      throw error;
    }));
  }

  async #start(): Promise<void> {
    const configuration = this.#userConfiguration;
    let warning: string | undefined;
    try {
      const loaded = await configuration.load();
      this.#preferences = loaded.preferences;
      this.#display.reviewingTheme = loaded.preferences.theme;
      this.#display.background = loaded.preferences.background;
      this.#display.customThemes = loaded.themes;
      warning = loaded.warning;
    } catch (error) {
      warning = `Couldn’t read your settings, so defaults are in use. ${semanticError(error)}`;
    }
    if (this.#stopped) return;
    this.#openingTerminal = ShellTerminal.open({
      provided: this.#options.renderer,
      noColor: this.#presentation.noColor,
      host: {
        attention: attention => {
          if (!this.#stopped) this.#options.workspace.setAttention(attention);
        },
        themeMode: mode => {
          this.#display.terminalThemeMode = mode;
          this.#render();
        },
      },
    });
    const terminal = await this.#openingTerminal;
    if (this.#stopped) return; // stop owns a terminal that arrives after cancellation.
    this.#openingTerminal = undefined;
    this.#terminal = terminal;
    const renderer = terminal.renderer;
    this.#clipboard = new ShellClipboard(this.#options.createClipboard ?? productionClipboard, renderer);
    if (this.#stopped) return;
    const terminalThemeMode = await terminal.listen();
    if (this.#stopped) return;
    this.#display.terminalThemeMode = terminalThemeMode;
    this.#roots = new ShellRoots(renderer, ROOT_ID);
    this.#roots.start();
    renderer.keyInput.on('keypress', this.#onKeyPress);
    renderer.on('resize', this.#onResize);
    this.#subscribeToConnection();
    if (warning !== undefined) this.#say(warning, 'warning');
    await this.#open(this.#options.first.screen, this.#options.first.args);
  }

  stop(): Promise<void> {
    this.#stopped = true;
    return (this.#stopping ??= Promise.resolve()
      .then(async () => await this.#stop())
      .finally(() => this.#resolveClosed()));
  }

  async #stop(): Promise<void> {
    // Opening a renderer can acquire the terminal; wait for that handle, not settings or theme detection.
    const terminal = this.#terminal ?? (await this.#openingTerminal?.catch(() => undefined));
    this.#openingTerminal = undefined;
    try {
      this.#clipboard?.cancel();
      this.#views.stop();
      this.#unsubscribeFromConnection?.();
      this.#pulse.stop();
      terminal?.renderer.keyInput.off('keypress', this.#onKeyPress);
      terminal?.renderer.off('resize', this.#onResize);
      this.#roots?.stop();
      terminal?.stopResizing();
    } finally {
      try {
        await this.#clipboard?.dispose();
      } finally {
        this.#terminal = undefined;
        await terminal?.close();
        await this.#preferencesSave.settle();
      }
    }
  }

  get #look(): Look {
    const display = this.#display;
    return {
      presentation: this.#presentation,
      reviewingTheme: display.reviewingTheme,
      background: display.background,
      terminalThemeMode: display.terminalThemeMode,
    };
  }

  /** Configuration's rows: the theme and background, then the screen's own. */
  #settings(open: OpenScreen): {
    readonly rows: readonly ConfigurationRow[];
    readonly descriptions: readonly string[];
  } {
    const own = open.screen.settings?.(open.state);
    return {
      rows: [themeRow(this.#display), backgroundRow(this.#display), ...(own?.rows ?? [])],
      descriptions: [...DISPLAY_DESCRIPTIONS, ...(own?.descriptions ?? [])],
    };
  }

  #configure(input: ReviewingInput): readonly ShellEffect[] {
    const window = this.#configuration;
    const open = this.#current;
    if (window === undefined || open === undefined) return [];
    const outcome = configurationKey(window, input, this.#settings(open).rows);
    if (outcome === 'closed') {
      this.#configuration = undefined;
      this.#say('Settings saved.', 'success');
    } else if (outcome === 'changed') {
      const { reviewingTheme: theme, background } = this.#display;
      this.#preferences = { ...this.#preferences, theme, background };
      this.#preferencesSave.schedule(this.#preferences);
    }
    return [];
  }

  get #current(): OpenScreen | undefined {
    return this.#stack.at(-1);
  }

  #subscribeToConnection(): void {
    try {
      this.#unsubscribeFromConnection = this.#options.workspace.subscribe({ kind: 'harness.connection' }, update => {
        if (this.#stopped) return;
        this.#connection = update;
        this.#render();
      });
    } catch {
      // A Workspace without the runtime-owned writer has no agents: no indicator.
    }
  }

  async #open(name: string, args: unknown): Promise<void> {
    const screen = this.#screens.get(name);
    if (screen === undefined) throw new TypeError(`No screen named ${name}`);
    this.#stack.push({ screen, state: screen.open(args) });
    await this.#show();
  }

  /** Shows the top screen afresh: its own subscriptions, its views read. */
  async #show(): Promise<void> {
    this.#keyListOpen = false;
    const open = this.#current;
    await this.#views.show(
      open?.screen.views === undefined
        ? undefined
        : {
            scopes: () => open.screen.views!(open.state),
            receive: views => open.screen.receive?.(open.state, views),
          },
    );
  }

  readonly #onResize = (): void => this.#render();

  readonly #onKeyPress = (event: KeyEvent): void => {
    const input = reviewingInputFromKeyEvent(event);
    if (input === undefined || this.#stopped) return;
    this.#run(routeShellKey(input, this.#keyHost()));
    this.#render();
  };

  #keyHost(): ShellKeyHost<ShellEffect> {
    const open = this.#current;
    return {
      stop: { type: 'stop' },
      capture: () => undefined,
      guard: () => undefined,
      guarded: false,
      ready: open !== undefined,
      loading: this.#views.loading,
      saving: this.#saving > 0,
      sayStillLoading: key =>
        this.#say(
          key === 'q'
            ? `Still ${this.#views.loading ? 'loading' : 'saving'}; press q again once it’s done to quit.`
            : `Still loading; press ${key} again in a moment.`,
          'info',
        ),
      keyList: { open: this.#keyListOpen, show: open => (this.#keyListOpen = open) },
      configuration: {
        open: this.#configuration !== undefined,
        show: () => {
          this.#configuration = { selected: 'theme' };
          this.#checksOpen = false;
        },
        input: input => this.#configure(input),
      },
      details: {
        open: this.#checksOpen,
        show: open => {
          this.#checksOpen = open;
        },
      },
      escape: () => {
        if (open === undefined) return [];
        // A screen's own Esc closes its own layer; false (or no Esc of its own) leaves the screen.
        const result = open.screen.escape === undefined ? false : open.screen.escape(open.state);
        if (result !== false) return result ?? [];
        if (this.#stack.length > 1) {
          this.#stack.pop();
          void this.#show();
        }
        return [];
      },
      screenKey: (input: ReviewingInput) =>
        open === undefined ? [] : dispatchScreenKey(open.screen, open.state, input),
    };
  }

  #run(effects: readonly ShellEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'stop':
          void this.stop();
          return;
        case 'say':
          this.#say(effect.text, effect.tone);
          break;
        case 'open':
          void this.#open(effect.screen, effect.args).catch(error =>
            this.#say(`Couldn’t open that. ${semanticError(error)}`, 'error'),
          );
          break;
        case 'copy':
          void this.#copy(effect.text, effect.what);
          break;
        case 'execute':
          this.#execute(effect.command);
          break;
      }
    }
    this.#views.reconcile();
  }

  #execute(command: WorkspaceCommand): void {
    const open = this.#current;
    if (open === undefined || this.#terminal === undefined) return;
    this.#saving += 1;
    // Workspace I/O waits until the screen's own pending state is on screen.
    void this.#terminal.renderer
      .idle()
      .then(async () => {
        if (!this.#stopped) return await executeCommand(this.#options.workspace, command, () => this.#stopped);
      })
      .then(outcome => {
        this.#saving -= 1;
        if (outcome === undefined || outcome.status === 'stopped' || this.#stopped) return;
        if (outcome.status === 'lost') this.#say(outcome.sentence, 'error');
        this.#run(open.screen.settled?.(open.state, command, outcome) ?? []);
        this.#render();
      });
  }

  async #copy(text: string, what: string): Promise<void> {
    const outcome = this.#clipboard === undefined ? 'unavailable' : await this.#clipboard.copy(text);
    if (this.#stopped || outcome === undefined) return;
    const notice = copyOutcomeNotice(what, outcome);
    this.#say(notice.text, notice.tone);
  }

  #say(text: string, tone: NoticeTone): void {
    if (this.#stopped) return;
    // A new object each time: saying the same words again restarts their lifetime.
    this.#said = { text, tone };
    this.#render();
  }

  #render(): void {
    const open = this.#current;
    const roots = this.#roots;
    const renderer = this.#terminal?.renderer;
    if (open === undefined || roots === undefined || renderer === undefined || this.#stopped) return;
    const { screen, state } = open;
    const look: FrameLook = {
      ...this.#look,
      width: renderer.width,
      height: renderer.height,
      layout: renderer.width >= 100 ? 'wide' : 'narrow',
    };
    const mode = screen.mode(state);
    const said = this.#said;
    const glyph = said === undefined ? '' : noticeGlyph(said.tone, look.presentation.ascii);
    const frame = shellFrame(look, {
      idPrefix: screen.name,
      header: shellHeader(
        look,
        screen.name,
        `BuildFrame / ${screen.title(state)}`,
        undefined,
        agentIndicator(look, this.#connection),
      ),
      context: screen.context?.(state, look) ?? [],
      body: height => [
        ...screen.body(state, look, height),
        ...(this.#checksOpen ? actionChecksPanel(look, screen.checks?.(state) ?? []) : []),
        ...(this.#keyListOpen ? keyListPanel(look, keyList(screen.table, mode, state), height, screen.name) : []),
        ...(this.#configuration === undefined
          ? []
          : configurationDialog(
              look,
              this.#configuration,
              { title: 'Display', ...this.#settings(open) },
              height,
              0,
              screen.name,
            )),
      ],
      said:
        said === undefined
          ? { text: '', tone: 'muted' }
          : { text: glyph === '' ? said.text : `${glyph} ${said.text}`, tone: noticeStatusTone(said.tone) },
      idleSentence: footerSentence(screen.table, mode, state),
      keysRow: width => keysRow(screen.table, mode, state, width),
    });
    renderer.setBackgroundColor(look.presentation.noColor ? 'transparent' : theme(look).background);
    roots.retire(() => undefined);
    roots.mount(Box({ id: ROOT_ID, width: '100%', height: '100%' }, frame));
    roots.present();
    this.#pulse.follow({
      animating: () => screen.animating?.(state) === true,
      advance: () => screen.advance?.(state),
      notice: () => (said === undefined ? undefined : { identity: said, tone: said.tone }),
      expire: identity => {
        if (this.#said !== identity) return false;
        this.#said = undefined;
        return true;
      },
    });
  }
}

export function createShell(options: ShellOptions): Shell {
  return new ShellApplication(options);
}
