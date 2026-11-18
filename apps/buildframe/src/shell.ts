import type { CliRenderer, KeyEvent } from '@opentui/core';
import type { Workspace, WorkspaceCommand } from '@buildframe/workspace';
import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { reviewingInputFromKeyEvent, type ReviewingInput } from './reviewingInput.js';
import { NOTICE_LIFETIME_MS, noticeGlyph, noticeStatusTone, type NoticeTone } from './reviewingStatus.js';
import { Box } from './renderTree.js';
import { agentIndicator, keyListPanel, shellHeader } from './shellChrome.js';
import {
  ShellClipboard,
  productionClipboard,
  type ClipboardOutcome,
  type ShellClipboardFactory,
} from './shellClipboard.js';
import { executeCommand, semanticError } from './shellCommands.js';
import { shellFrame, type FrameLook } from './shellFrame.js';
import { routeShellKey, type ShellKeyHost } from './shellInput.js';
import { footerSentence, keyList, keysRow } from './shellKeys.js';
import { theme, type Look } from './shellLook.js';
import { ShellRoots } from './shellRoots.js';
import { dispatchScreenKey, type Screen, type ScreenEffect } from './shellScreen.js';
import { ShellTerminal } from './shellTerminal.js';
import { ShellViews } from './shellViews.js';
import {
  DEFAULT_REVIEWING_PREFERENCES,
  createEphemeralUserConfiguration,
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
  /** A renderer a test provides instead of the terminal. */
  readonly renderer?: CliRenderer;
  readonly createClipboard?: ShellClipboardFactory;
}

export interface Shell {
  /** Resolves when terminal ownership and the connected Workspace use have ended. */
  readonly closed: Promise<void>;
  /** Opens the terminal and resolves once the first screen shows its views. */
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
  #look: Look;
  #terminal: ShellTerminal | undefined;
  #roots: ShellRoots | undefined;
  #clipboard: ShellClipboard | undefined;
  #connection: HarnessConnectionView | undefined;
  #unsubscribeFromConnection: (() => void) | undefined;
  #said: { readonly text: string; readonly tone: NoticeTone } | undefined;
  #saidTimer: NodeJS.Timeout | undefined;
  #keyListOpen = false;
  #saving = 0;
  #started = false;
  #stopped = false;
  #resolveClosed!: () => void;

  constructor(options: ShellOptions) {
    this.closed = new Promise(resolve => {
      this.#resolveClosed = resolve;
    });
    this.#options = options;
    this.#screens = new Map(options.screens.map(screen => [screen.name, screen]));
    if (!this.#screens.has(options.first.screen)) throw new TypeError(`No screen named ${options.first.screen}`);
    this.#look = {
      presentation: { ascii: false, noColor: false, ...options.presentation },
      reviewingTheme: DEFAULT_REVIEWING_PREFERENCES.theme,
      background: DEFAULT_REVIEWING_PREFERENCES.background,
      terminalThemeMode: undefined,
    };
    this.#views = new ShellViews(options.workspace, {
      changed: () => this.#render(),
      say: (sentence, tone) => this.#say(sentence, tone),
    });
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    const configuration = this.#options.userConfiguration ?? createEphemeralUserConfiguration();
    let warning: string | undefined;
    try {
      const loaded = await configuration.load();
      this.#look = {
        ...this.#look,
        reviewingTheme: loaded.preferences.theme,
        background: loaded.preferences.background,
      };
      warning = loaded.warning;
    } catch (error) {
      warning = `Couldn’t read your settings, so defaults are in use. ${semanticError(error)}`;
    }
    this.#terminal = await ShellTerminal.open({
      provided: this.#options.renderer,
      noColor: this.#look.presentation.noColor,
      host: {
        attention: attention => this.#options.workspace.setAttention(attention),
        themeMode: mode => {
          this.#look = { ...this.#look, terminalThemeMode: mode };
          this.#render();
        },
      },
    });
    const renderer = this.#terminal.renderer;
    this.#clipboard = new ShellClipboard(this.#options.createClipboard ?? productionClipboard, renderer);
    this.#look = { ...this.#look, terminalThemeMode: await this.#terminal.listen() };
    this.#roots = new ShellRoots(renderer, ROOT_ID);
    this.#roots.start();
    renderer.keyInput.on('keypress', this.#onKeyPress);
    renderer.on('resize', this.#onResize);
    this.#subscribeToConnection();
    if (warning !== undefined) this.#say(warning, 'warning');
    await this.#open(this.#options.first.screen, this.#options.first.args);
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#clipboard?.cancel();
    this.#views.stop();
    this.#unsubscribeFromConnection?.();
    if (this.#saidTimer !== undefined) clearTimeout(this.#saidTimer);
    const terminal = this.#terminal;
    terminal?.renderer.keyInput.off('keypress', this.#onKeyPress);
    terminal?.renderer.off('resize', this.#onResize);
    this.#roots?.stop();
    terminal?.stopResizing();
    try {
      await this.#clipboard?.dispose();
    } finally {
      this.#terminal = undefined;
      await terminal?.close();
    }
    this.#resolveClosed();
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
    const notHere = (what: string) => () => this.#say(`${what} opens from Reviewing for now.`, 'info');
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
      configuration: { open: false, show: notHere('Configuration'), input: () => [] },
      details: { open: false, show: open => open && notHere('Action checks')() },
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
      .then(async () => await executeCommand(this.#options.workspace, command, () => this.#stopped))
      .then(outcome => {
        this.#saving -= 1;
        if (outcome.status === 'stopped' || this.#stopped) return;
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
    const said = { text, tone };
    this.#said = said;
    if (this.#saidTimer !== undefined) clearTimeout(this.#saidTimer);
    this.#saidTimer = setTimeout(() => {
      if (this.#said !== said) return;
      this.#said = undefined;
      this.#render();
    }, NOTICE_LIFETIME_MS[tone]);
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
        ...(this.#keyListOpen ? keyListPanel(look, keyList(screen.table, mode, state), height, screen.name) : []),
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
  }
}

export function createShell(options: ShellOptions): Shell {
  return new ShellApplication(options);
}
