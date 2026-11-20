import type { ClipboardReadResult, ClipboardService, KeyEvent } from '@opentui/core';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { ShellClipboard } from '../../src/shellClipboard.js';

const CTRL_V = '\u0016'; // What conhost sends for Ctrl+V.

let terminal: TestRendererSetup | undefined;
let clipboard: ShellClipboard | undefined;

afterEach(async () => {
  await clipboard?.dispose();
  terminal?.renderer.destroy();
  await terminal?.renderer.closed;
  clipboard = undefined;
  terminal = undefined;
});

const text = (value: string): ClipboardReadResult => ({
  status: 'read',
  representation: { mimeType: 'text/plain;charset=utf-8', bytes: new TextEncoder().encode(value) },
});

async function setup(read: () => Promise<ClipboardReadResult>, pastesOnCtrlV = true) {
  terminal = await createTestRenderer({ width: 40, height: 6, exitOnCtrlC: false });
  const service = { read, dispose: async () => undefined } as unknown as ClipboardService;
  clipboard = new ShellClipboard(() => service, terminal.renderer, pastesOnCtrlV);
  const pasted: string[] = [];
  const keys: string[] = [];
  // A screen listens after the clipboard, as the shell and Reviewing do.
  terminal.renderer.keyInput.on('paste', event => pasted.push(new TextDecoder().decode(event.bytes)));
  terminal.renderer.keyInput.on('keypress', (event: KeyEvent) => keys.push(event.name));
  return { terminal, pasted, keys };
}

const settle = async () => await new Promise(resolve => setTimeout(resolve, 20));

describe('Ctrl+V on a Windows console', () => {
  it('pastes the clipboard text as a bracketed paste, line breaks kept, and hides the key', async () => {
    const { terminal, pasted, keys } = await setup(async () => text('first line\r\nsecond ñ'));
    terminal.mockInput.pressKeys([CTRL_V]);
    await settle();
    expect(pasted).toEqual(['first line\r\nsecond ñ']);
    expect(keys).toEqual([]);
  });

  it('pastes nothing from an empty or non-text clipboard', async () => {
    const results: ClipboardReadResult[] = [
      { status: 'empty' },
      { status: 'unsupported' },
      { status: 'read', representation: { mimeType: 'image/png', bytes: new Uint8Array([1, 2]) } },
    ];
    const { terminal, pasted } = await setup(async () => results.shift()!);
    terminal.mockInput.pressKeys([CTRL_V, CTRL_V, CTRL_V]);
    await settle();
    expect(pasted).toEqual([]);
  });

  it('pastes only the newest of two quick presses, and nothing after stopping', async () => {
    const reads: ((result: ClipboardReadResult) => void)[] = [];
    const { terminal, pasted } = await setup(async () => await new Promise(resolve => reads.push(resolve)));
    terminal.mockInput.pressKeys([CTRL_V, CTRL_V]);
    reads[0]!(text('old'));
    reads[1]!(text('new'));
    await settle();
    expect(pasted).toEqual(['new']);

    terminal.mockInput.pressKeys([CTRL_V]);
    clipboard!.cancel();
    reads[2]!(text('late'));
    await settle();
    expect(pasted).toEqual(['new']);
  });

  it('leaves Ctrl+V alone where the terminal pastes', async () => {
    let read = false;
    const { terminal, pasted, keys } = await setup(async () => {
      read = true;
      return text('unused');
    }, false);
    terminal.mockInput.pressKeys([CTRL_V]);
    await settle();
    expect(read).toBe(false);
    expect(pasted).toEqual([]);
    expect(keys).toEqual(['v']);
  });

  it('still takes a terminal bracketed paste once', async () => {
    const { terminal, pasted } = await setup(async () => text('unused'));
    await terminal.mockInput.pasteBracketedText('from the terminal');
    await settle();
    expect(pasted).toEqual(['from the terminal']);
  });
});
