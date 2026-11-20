import type { ClipboardService, CliRenderer, KeyEvent } from '@opentui/core';

/**
 * A Windows console leaves pasting to the program: Ctrl+V arrives as the key
 * 0x16, and right-click is ours because BuildFrame owns the mouse. So on
 * Windows, Ctrl+V reads the system clipboard and hands the text to OpenTUI as
 * a bracketed paste, and every input takes it exactly as a terminal paste.
 * Terminals that paste on Ctrl+V themselves never send the key, so nothing
 * pastes twice. Elsewhere Ctrl+V is not paste and stays untouched.
 */
export const PASTES_ON_CTRL_V: boolean = process.platform === 'win32';

function isCtrlV(event: KeyEvent): boolean {
  return event.name === 'v' && event.ctrl && !event.meta && !event.option && !event.super && !event.hyper;
}

/** Starts listening; the returned function stops it and drops any read in flight. */
export function pasteOnCtrlV(renderer: CliRenderer, clipboard: ClipboardService): () => void {
  let sequence = 0;
  let stopped = false;
  const paste = async (current: number): Promise<void> => {
    let bytes: Uint8Array | undefined;
    try {
      const result = await clipboard.read({ preferredTypes: ['text/plain'] });
      if (result.status === 'read' && result.representation.mimeType.startsWith('text/plain')) {
        bytes = result.representation.bytes;
      }
    } catch {
      bytes = undefined;
    }
    if (stopped || current !== sequence || bytes === undefined || bytes.length === 0) return;
    renderer.keyInput.processPaste(bytes);
  };
  const onKeyPress = (event: KeyEvent): void => {
    if (event.eventType === 'release' || !isCtrlV(event)) return;
    // Registered before the screens' own listeners, so no screen sees the key.
    event.preventDefault();
    event.stopPropagation();
    void paste(++sequence);
  };
  renderer.keyInput.on('keypress', onKeyPress);
  return () => {
    stopped = true;
    renderer.keyInput.off('keypress', onKeyPress);
  };
}
