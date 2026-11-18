import process from 'node:process';

import { createCliRenderer, type CliRenderer } from '@opentui/core';

import { createNoColorOutput } from './noColorOutput.js';

/** How long the first frame waits for the terminal to say whether it is light or dark. */
const TERMINAL_THEME_MODE_WAIT_MS = 100;

export interface ShellTerminalHost {
  /** The terminal gained or lost focus. */
  attention(attention: 'foreground' | 'background'): void;
  /** The terminal reported its light or dark background. */
  themeMode(mode: 'dark' | 'light'): void;
}

/**
 * The terminal the shell draws on: OpenTUI's renderer with the shell's input
 * posture, plain output under `--no-color`, focus and light/dark reports, and
 * a teardown that leaves the terminal as it was.
 */
export class ShellTerminal {
  readonly renderer: CliRenderer;
  readonly #host: ShellTerminalHost;
  readonly #noColorOutput: NodeJS.WriteStream | undefined;
  readonly #onNoColorResize = (): void => {
    this.renderer.resize(process.stdout.columns ?? this.renderer.width, process.stdout.rows ?? this.renderer.height);
  };
  // The Workspace checks the working tree less often while the terminal is
  // unfocused. Terminals that never report focus keep the foreground pace.
  readonly #onFocus = (): void => this.#host.attention('foreground');
  readonly #onBlur = (): void => this.#host.attention('background');
  readonly #onThemeMode = (mode: 'dark' | 'light'): void => this.#host.themeMode(mode);

  private constructor(renderer: CliRenderer, host: ShellTerminalHost, noColorOutput: NodeJS.WriteStream | undefined) {
    this.renderer = renderer;
    this.#host = host;
    this.#noColorOutput = noColorOutput;
  }

  /** Opens the terminal, or adopts the renderer a test provides. */
  static async open(options: {
    readonly provided: CliRenderer | undefined;
    readonly noColor: boolean;
    readonly host: ShellTerminalHost;
  }): Promise<ShellTerminal> {
    const noColorOutput = options.provided === undefined && options.noColor ? createNoColorOutput() : undefined;
    let renderer: CliRenderer;
    try {
      renderer =
        options.provided ??
        (await createCliRenderer({
          exitOnCtrlC: false,
          clearOnShutdown: true,
          // 60 fps only matters while a pane glides; idle screens draw nothing.
          targetFps: 60,
          // Movement tracking expands the pointed Message inline; button
          // tracking still owns activation and native text selection.
          useMouse: true,
          enableMouseMovement: true,
          useKittyKeyboard: { disambiguate: true, alternateKeys: true, events: true, reportText: true },
          ...(noColorOutput === undefined
            ? {}
            : { stdout: noColorOutput, width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 }),
        }));
    } catch (error) {
      noColorOutput?.destroy();
      throw error;
    }
    // The private test adapter may have been created with other defaults.
    // Keep production and tests on the same click-navigation posture.
    renderer.useMouse = true;
    return new ShellTerminal(renderer, options.host, noColorOutput);
  }

  /** Starts listening, and returns the terminal's light or dark once it says (a silent terminal says nothing). */
  async listen(): Promise<'dark' | 'light' | undefined> {
    if (this.#noColorOutput !== undefined) process.on('SIGWINCH', this.#onNoColorResize);
    this.renderer.on('focus', this.#onFocus);
    this.renderer.on('blur', this.#onBlur);
    this.renderer.on('theme_mode', this.#onThemeMode);
    return (await this.renderer.waitForThemeMode(TERMINAL_THEME_MODE_WAIT_MS)) ?? undefined;
  }

  /** Stops resizing plain output; the terminal itself closes later. */
  stopResizing(): void {
    if (this.#noColorOutput !== undefined) process.off('SIGWINCH', this.#onNoColorResize);
  }

  async close(): Promise<void> {
    this.renderer.off('focus', this.#onFocus);
    this.renderer.off('blur', this.#onBlur);
    this.renderer.off('theme_mode', this.#onThemeMode);
    this.renderer.destroy();
    await this.renderer.closed.catch(() => undefined);
    // Terminal restore finishes asynchronously; the no-colour stdout must
    // outlive it, or the renderer reports a closed stream.
    this.#noColorOutput?.destroy();
  }
}
