import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type ClipboardService,
  type ClipboardWriteResult,
  type CliRenderer,
  type HostClipboardService,
} from '@opentui/core';

import { pasteOnCtrlV, PASTES_ON_CTRL_V } from './clipboardPaste.js';

const CLIPBOARD_WRITE_LIMIT_BYTES = 64 * 1024;

export type ClipboardOutcome = 'written' | 'attempted' | 'unavailable';
export type ShellClipboardFactory = (renderer: CliRenderer) => ClipboardService;

function unsupportedHostClipboard(): HostClipboardService {
  return {
    maxWriteBytes: CLIPBOARD_WRITE_LIMIT_BYTES,
    read: async () => ({ status: 'unsupported' }),
    writeText: async () => ({ status: 'unsupported' }),
    clear: async () => ({ status: 'unsupported' }),
    dispose: async () => undefined,
  };
}

function composedClipboard(renderer: CliRenderer, host: HostClipboardService): ClipboardService {
  return createClipboard({ host, terminal: createRendererClipboardAdapter(renderer) });
}

/** The system clipboard, falling back to the terminal's own (OSC 52). */
export function productionClipboard(renderer: CliRenderer): ClipboardService {
  let host: HostClipboardService;
  try {
    host = createHostClipboard({ timeoutMs: 1_000, maxWriteBytes: CLIPBOARD_WRITE_LIMIT_BYTES });
  } catch {
    host = unsupportedHostClipboard();
  }
  return composedClipboard(renderer, host);
}

/** The terminal's clipboard only; tests never touch the host's. */
export function terminalFallbackClipboard(renderer: CliRenderer): ClipboardService {
  return composedClipboard(renderer, unsupportedHostClipboard());
}

function clipboardOutcome(result: ClipboardWriteResult): ClipboardOutcome {
  if (result.host.status === 'written') return 'written';
  if (result.terminal.status === 'attempted') return 'attempted';
  return 'unavailable';
}

/**
 * Copying, for every screen, and Ctrl+V pasting where the console leaves it
 * to us (`clipboardPaste.ts`). Copy is an optional presentation action: a
 * clipboard that cannot start reports one truthful "unavailable" later
 * instead of failing startup. Only the newest copy reports its outcome.
 * Construct it before any screen listens for keys, so Ctrl+V reaches it first.
 */
export class ShellClipboard {
  readonly #service: ClipboardService | undefined;
  readonly #stopPasting: (() => void) | undefined;
  #sequence = 0;

  constructor(factory: ShellClipboardFactory, renderer: CliRenderer, pastesOnCtrlV: boolean = PASTES_ON_CTRL_V) {
    let service: ClipboardService | undefined;
    try {
      service = factory(renderer);
    } catch {
      service = undefined;
    }
    this.#service = service;
    this.#stopPasting = service !== undefined && pastesOnCtrlV ? pasteOnCtrlV(renderer, service) : undefined;
  }

  /** The outcome, or undefined when a newer copy or a stop superseded this one. */
  async copy(text: string): Promise<ClipboardOutcome | undefined> {
    const sequence = ++this.#sequence;
    let outcome: ClipboardOutcome = 'unavailable';
    try {
      const result = await this.#service?.writeText(text, { destination: 'best-available', selection: 'clipboard' });
      if (result !== undefined) outcome = clipboardOutcome(result);
    } catch {
      outcome = 'unavailable';
    }
    return sequence === this.#sequence ? outcome : undefined;
  }

  /** Drops the outcome of any copy still in flight, and stops pasting. */
  cancel(): void {
    this.#sequence += 1;
    this.#stopPasting?.();
  }

  async dispose(): Promise<void> {
    this.#stopPasting?.();
    await this.#service?.dispose();
  }
}
