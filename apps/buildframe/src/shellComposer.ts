import { TextareaRenderable, type CliRenderer } from '@opentui/core';

/** Control characters never enter a draft, typed or pasted. */
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;

class ComposerTextareaRenderable extends TextareaRenderable {
  override insertText(text: string): void {
    // OpenTUI routes ordinary input and decoded, ANSI-free paste through here.
    super.insertText(text.replace(CONTROL_PATTERN, ''));
  }
}

export interface ShellComposerHost {
  /** The draft the screen holds, or undefined while no composer is open. */
  draft(): { readonly body: string; readonly cursor: number } | undefined;
  /** The text or cursor changed; returns false when the screen refuses it and its draft wins. */
  edited(body: string, cursor: number): boolean;
  /** Enter in the composer. */
  submit(): void;
  /** Redraws the screen. */
  render(): void;
  /** Whether the screen is still up. */
  running(): boolean;
}

/**
 * A text composer: an OpenTUI Textarea that wraps by word and moves by
 * visual rows, kept in step with the screen's draft both ways. It survives
 * each tree swap (it leaves the old tree before that tree retires) and is
 * dropped once the screen closes its draft.
 */
export class ShellComposer {
  readonly #renderer: CliRenderer;
  readonly #id: string;
  readonly #host: ShellComposerHost;
  #textarea: TextareaRenderable | undefined;
  #synchronizing = false;

  constructor(renderer: CliRenderer, id: string, host: ShellComposerHost) {
    this.#renderer = renderer;
    this.#id = id;
    this.#host = host;
  }

  /** The textarea while a draft is open. */
  get textarea(): TextareaRenderable | undefined {
    return this.#host.draft() === undefined ? undefined : this.#textarea;
  }

  /** Before the tree retires: an open composer leaves it, so it survives the swap. */
  detach(): void {
    const textarea = this.#textarea;
    if (this.#host.draft() === undefined || textarea === undefined || textarea.isDestroyed) return;
    textarea.blur();
    textarea.parent?.remove(textarea);
  }

  /** The tree was replaced: a closed composer is let go. */
  replaced(): void {
    if (this.#host.draft() === undefined) this.#textarea = undefined;
  }

  /** The textarea for the next tree, created or brought up to date with the draft. */
  ensure(): TextareaRenderable | undefined {
    const draft = this.#host.draft();
    if (draft === undefined) return undefined;
    let textarea = this.#textarea;
    if (textarea === undefined || textarea.isDestroyed) {
      textarea = new ComposerTextareaRenderable(this.#renderer, {
        id: this.#id,
        width: '100%',
        height: 2,
        initialValue: draft.body,
        wrapMode: 'word',
        cursorStyle: { style: 'block', blinking: true },
        keyBindings: [
          { name: 'return', action: 'submit' },
          { name: 'kpenter', action: 'submit' },
          { name: 'linefeed', action: 'submit' },
        ],
        onContentChange: () => this.#synchronize(),
        onCursorChange: () => this.#synchronize(),
        onSubmit: () => this.#submit(),
      });
      this.#textarea = textarea;
      this.#place(textarea, draft);
    } else if (textarea.plainText !== draft.body) {
      this.#synchronizing = true;
      textarea.setText(draft.body);
      this.#place(textarea, draft);
      this.#synchronizing = false;
    }
    return textarea;
  }

  stop(): void {
    this.#textarea = undefined;
  }

  #place(textarea: TextareaRenderable, draft: { readonly body: string; readonly cursor: number }): void {
    if (draft.cursor >= draft.body.length) textarea.gotoBufferEnd();
    else textarea.cursorOffset = draft.cursor;
  }

  #synchronize(): void {
    if (this.#synchronizing) return;
    const textarea = this.#textarea;
    const before = this.#host.draft();
    if (textarea === undefined || before === undefined) return;
    const wasEmpty = before.body.length === 0;
    if (this.#host.edited(textarea.plainText, textarea.cursorOffset)) {
      // Footer keys can differ for an empty draft and a typed one; redraw only
      // when that flips, not on every key.
      if (wasEmpty !== (this.#host.draft()?.body.length === 0)) {
        queueMicrotask(() => {
          if (this.#host.running()) this.#host.render();
        });
      }
      return;
    }
    const draft = this.#host.draft()!;
    this.#synchronizing = true;
    textarea.setText(draft.body);
    this.#place(textarea, draft);
    this.#synchronizing = false;
    queueMicrotask(() => {
      if (this.#host.running()) this.#host.render();
    });
  }

  #submit(): void {
    const textarea = this.#textarea;
    if (textarea === undefined) return;
    this.#synchronize();
    queueMicrotask(() => {
      if (!this.#host.running() || this.#textarea !== textarea || this.#host.draft() === undefined) return;
      this.#host.submit();
    });
  }
}
