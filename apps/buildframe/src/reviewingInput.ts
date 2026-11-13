import { decodePasteBytes, stripAnsiSequences, type KeyEvent, type PasteEvent } from '@opentui/core';

export type ReviewingKeyName =
  | 'backspace'
  | 'delete'
  | 'down'
  | 'end'
  | 'enter'
  | 'escape'
  | 'home'
  | 'left'
  | 'pageDown'
  | 'pageUp'
  | 'right'
  | 'tab'
  | 'up'
  | string;

/** Renderer-neutral local input consumed only inside the Reviewing Application Module. */
export interface ReviewingInput {
  readonly name?: ReviewingKeyName;
  readonly text?: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly super: boolean;
}

export interface ReviewingKeySpec {
  readonly name: ReviewingKeyName;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly super: boolean;
}

const key = (
  name: ReviewingKeyName,
  modifiers: Partial<Pick<ReviewingKeySpec, 'ctrl' | 'alt' | 'shift' | 'super'>> = {},
): ReviewingKeySpec => ({
  name,
  ctrl: modifiers.ctrl ?? false,
  alt: modifiers.alt ?? false,
  shift: modifiers.shift ?? false,
  super: modifiers.super ?? false,
});

/** Model-local key vocabulary retained while OpenTUI owns native decoding. */
export const Key: Readonly<{
  backspace: ReviewingKeySpec;
  delete: ReviewingKeySpec;
  down: ReviewingKeySpec;
  end: ReviewingKeySpec;
  enter: ReviewingKeySpec;
  escape: ReviewingKeySpec;
  home: ReviewingKeySpec;
  left: ReviewingKeySpec;
  pageDown: ReviewingKeySpec;
  pageUp: ReviewingKeySpec;
  right: ReviewingKeySpec;
  tab: ReviewingKeySpec;
  up: ReviewingKeySpec;
  ctrl(name: ReviewingKeyName): ReviewingKeySpec;
  ctrlShift(name: ReviewingKeyName): ReviewingKeySpec;
  alt(name: ReviewingKeyName): ReviewingKeySpec;
  shift(name: ReviewingKeyName): ReviewingKeySpec;
  super(name: ReviewingKeyName): ReviewingKeySpec;
}> = Object.freeze({
  backspace: key('backspace'),
  delete: key('delete'),
  down: key('down'),
  end: key('end'),
  enter: key('enter'),
  escape: key('escape'),
  home: key('home'),
  left: key('left'),
  pageDown: key('pageDown'),
  pageUp: key('pageUp'),
  right: key('right'),
  tab: key('tab'),
  up: key('up'),
  ctrl: (name: ReviewingKeyName): ReviewingKeySpec => key(name, { ctrl: true }),
  ctrlShift: (name: ReviewingKeyName): ReviewingKeySpec => key(name, { ctrl: true, shift: true }),
  alt: (name: ReviewingKeyName): ReviewingKeySpec => key(name, { alt: true }),
  shift: (name: ReviewingKeyName): ReviewingKeySpec => key(name, { shift: true }),
  super: (name: ReviewingKeyName): ReviewingKeySpec => key(name, { super: true }),
});

export function matchesKey(input: ReviewingInput, expected: ReviewingKeySpec): boolean {
  return (
    input.name === expected.name &&
    input.ctrl === expected.ctrl &&
    input.alt === expected.alt &&
    input.shift === expected.shift &&
    input.super === expected.super
  );
}

function normalizedName(name: string): ReviewingKeyName {
  switch (name.toLowerCase()) {
    case 'return':
      return 'enter';
    case 'esc':
      return 'escape';
    case 'pagedown':
    case 'page_down':
      return 'pageDown';
    case 'pageup':
    case 'page_up':
      return 'pageUp';
    case 'arrowdown':
      return 'down';
    case 'arrowleft':
      return 'left';
    case 'arrowright':
      return 'right';
    case 'arrowup':
      return 'up';
    default:
      return name.toLowerCase();
  }
}

function printableSequence(keyEvent: KeyEvent): string | undefined {
  if (keyEvent.ctrl || keyEvent.meta || keyEvent.option || keyEvent.super || keyEvent.hyper) return undefined;
  const sequence = keyEvent.sequence;
  if (
    sequence.length > 0 &&
    !sequence.includes('\u001b') &&
    [...sequence].every(character => character.codePointAt(0)! >= 0x20)
  ) {
    return sequence;
  }
  return undefined;
}

export function reviewingInputFromKeyEvent(keyEvent: KeyEvent): ReviewingInput | undefined {
  if (keyEvent.eventType === 'release') return undefined;
  const text = printableSequence(keyEvent);
  return Object.freeze({
    name: normalizedName(keyEvent.name),
    ...(text === undefined ? {} : { text }),
    ctrl: keyEvent.ctrl,
    alt: keyEvent.meta || keyEvent.option,
    shift: keyEvent.shift,
    super: keyEvent.super ?? false,
  });
}

export function reviewingInputFromPasteEvent(event: PasteEvent): ReviewingInput {
  return Object.freeze({
    text: stripAnsiSequences(decodePasteBytes(event.bytes)),
    ctrl: false,
    alt: false,
    shift: false,
    super: false,
  });
}

export function printableInput(input: ReviewingInput): string | undefined {
  return input.text;
}
