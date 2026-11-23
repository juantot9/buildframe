import type { CliRenderer, KeyEvent } from '@opentui/core';
import type { Workspace, WorkspaceCommand } from '@buildframe/workspace';
import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { reviewingInputFromKeyEvent, type ReviewingInput } from './reviewingInput.js';
import type { NoticeTone } from './reviewingStatus.js';
import { Box } from './renderTree.js';
import {
  ShellClipboard,
  productionClipboard,
  type ClipboardOutcome,
  type ShellClipboardFactory,
} from './shellClipboard.js';
import { executeCommand, semanticError } from './shellCommands.js';
import type { FrameLook } from './shellFrame.js';
import { routeShellKey, type ShellKeyHost } from './shellInput.js';
import { theme, type Look } from './shellLook.js';
import { composeFrame } from './shellCompose.js';
import { ShellPulse } from './shellPulse.js';
import { ShellRoots } from './shellRoots.js';
import { ShellSettings } from './shellSettings.js';
import { HOME_SCREEN, homeScreen } from './shellHomeScreen.js';
import {
  dispatchScreenKey,
  type Screen,
  type ScreenEffect,
  type ScreenExtension,
  type ShellOverlays,
} from './shellScreen.js';
import { ShellTerminal } from './shellTerminal.js';
import { ShellViews } from './shellViews.js';
import { createEphemeralUserConfiguration, type UserConfiguration } from './userConfiguration.js';

export interface ShellOptions {
  /** A connected runtime's closed Workspace Interface. */
  readonly workspace: Workspace;
  // Screens keep their own state types; the shell only hands each its own.
  readonly screens: readonly Screen<any, any>[];
  /** The screen shown first, and what it opens with; Home when a screen adds rows to it. */
  readonly first?: { readonly screen: string; readonly args?: unknown };
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
  /** An extended screen listens and draws for itself (WF-301 scaffolding). */
  extension?: ScreenExtension;
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
  readonly #first: { readonly screen: string; readonly args?: unknown };
  readonly #stack: OpenScreen[] = [];
  readonly #views: ShellViews;
  readonly #presentation: Look['presentation'];
  readonly #settings: ShellSettings;
  #loadWarning: string | undefined;
  /** The `?` list and `!` checks; an extended screen shares them (WF-301). */
  readonly #overlays: ShellOverlays = { keyListOpen: false, checksOpen: false };
  #openingTerminal: Promise<ShellTerminal> | undefined;
  #terminal: ShellTerminal | undefined;
  #roots: ShellRoots | undefined;
  #clipboard: ShellClipboard | undefined;
  #connection: HarnessConnectionView | undefined;
  #unsubscribeFromConnection: (() => void) | undefined;
  #said: { readonly text: string; readonly tone: NoticeTone } | undefined;
  readonly #pulse = new ShellPulse(() => this.#render());
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
    const home = options.screens.some(screen => screen.home !== undefined) ? [homeScreen(options.screens)] : [];
    this.#screens = new Map([...home, ...options.screens].map(screen => [screen.name, screen]));
    this.#first = options.first ?? { screen: HOME_SCREEN };
    if (!this.#screens.has(this.#first.screen)) throw new TypeError(`No screen named ${this.#first.screen}`);
    this.#presentation = { ascii: false, noColor: false, ...options.presentation };
    this.#settings = new ShellSettings(
      options.userConfiguration ?? createEphemeralUserConfiguration(),
      (text, tone) => {
        const extension = this.#current?.extension;
        if (extension?.warn === undefined) this.#say(text, tone);
        else if (!this.#stopped) extension.warn(text);
      },
    );
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
    const warning = (this.#loadWarning = await this.#settings.load());
    if (this.#stopped) return;
    this.#openingTerminal = ShellTerminal.open({
      provided: this.#options.renderer,
      noColor: this.#presentation.noColor,
      host: {
        attention: attention => {
          if (!this.#stopped) this.#options.workspace.setAttention(attention);
        },
        themeMode: mode => {
          this.#settings.display.terminalThemeMode = mode;
          this.#current?.extension?.themeMode?.(mode);
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
    this.#settings.display.terminalThemeMode = terminalThemeMode;
    this.#roots = new ShellRoots(renderer, ROOT_ID);
    this.#roots.start();
    renderer.keyInput.on('keypress', this.#onKeyPress);
    renderer.on('resize', this.#onResize);
    this.#subscribeToConnection();
    if (warning !== undefined) this.#say(warning, 'warning');
    await this.#open(this.#first.screen, this.#first.args);
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
      // An extended screen lets go of the terminal before the shell closes it.
      for (const open of [...this.#stack].reverse()) await open.extension?.stop();
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
        await this.#settings.settle();
      }
    }
  }

  get #look(): Look {
    return this.#settings.look(this.#presentation);
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
    const open: OpenScreen = { screen, state: screen.open(args) };
    if (screen.extend !== undefined) {
      if (this.#stack.length > 0) throw new TypeError(`Screen ${name} draws for itself, so it can only be first`);
      const renderer = this.#terminal?.renderer;
      const clipboard = this.#clipboard;
      if (renderer === undefined || clipboard === undefined) return;
      open.extension = screen.extend({
        renderer,
        clipboard,
        terminalThemeMode: this.#settings.display.terminalThemeMode,
        preferences: {
          ...(this.#settings.loaded === undefined ? {} : { loaded: this.#settings.loaded }),
          ...(this.#loadWarning === undefined ? {} : { warning: this.#loadWarning }),
        },
        savePreferences: preferences => this.#settings.save(preferences),
        shared: { overlays: this.#overlays, settings: this.#settings },
        // The screen draws its own header and status line, so the shell lends only its layers.
        layers: () => ({
          said: undefined,
          checksOpen: this.#overlays.checksOpen,
          keyListOpen: this.#overlays.keyListOpen,
          settings: this.#settings,
          connection: undefined,
        }),
        quit: () => void this.stop(),
      });
      this.#stack.push(open);
      await open.extension.start();
      return;
    }
    this.#stack.push(open);
    await this.#show();
  }

  /** Shows the top screen afresh: its own subscriptions, its views read. */
  async #show(): Promise<void> {
    this.#overlays.keyListOpen = false;
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
    // An extended screen listens for itself.
    if (input === undefined || this.#stopped || this.#current?.extension !== undefined) return;
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
      keyList: { open: this.#overlays.keyListOpen, show: open => (this.#overlays.keyListOpen = open) },
      configuration: {
        open: this.#settings.open,
        show: () => {
          this.#settings.show();
          this.#overlays.checksOpen = false;
        },
        input: input => {
          this.#settings.key(input, open?.screen.settings?.(open.state));
          return [];
        },
      },
      details: {
        open: this.#overlays.checksOpen,
        show: open => {
          this.#overlays.checksOpen = open;
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
    if (open === undefined || open.extension !== undefined || roots === undefined || renderer === undefined) return;
    if (this.#stopped) return;
    const { screen, state } = open;
    const look: FrameLook = {
      ...this.#look,
      width: renderer.width,
      height: renderer.height,
      layout: renderer.width >= 100 ? 'wide' : 'narrow',
    };
    const said = this.#said;
    const frame = composeFrame(look, screen, state, {
      said,
      checksOpen: this.#overlays.checksOpen,
      keyListOpen: this.#overlays.keyListOpen,
      settings: this.#settings,
      connection: this.#connection,
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
