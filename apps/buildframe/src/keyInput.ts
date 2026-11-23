/** Key and paste input as every screen reads it: names, modifiers and printed text. */

import { decodePasteBytes, stripAnsiSequences, type KeyEvent, type PasteEvent } from '@opentui/core';

export type KeyName =
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
export interface KeyInput {
  readonly name?: KeyName;
  readonly text?: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly super: boolean;
}

export interface KeySpec {
  readonly name: KeyName;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly super: boolean;
}

const key = (name: KeyName, modifiers: Partial<Pick<KeySpec, 'ctrl' | 'alt' | 'shift' | 'super'>> = {}): KeySpec => ({
  name,
  ctrl: modifiers.ctrl ?? false,
  alt: modifiers.alt ?? false,
  shift: modifiers.shift ?? false,
  super: modifiers.super ?? false,
});

/** Model-local key vocabulary retained while OpenTUI owns native decoding. */
export const Key: Readonly<{
  backspace: KeySpec;
  delete: KeySpec;
  down: KeySpec;
  end: KeySpec;
  enter: KeySpec;
  escape: KeySpec;
  home: KeySpec;
  left: KeySpec;
  pageDown: KeySpec;
  pageUp: KeySpec;
  right: KeySpec;
  tab: KeySpec;
  up: KeySpec;
  ctrl(name: KeyName): KeySpec;
  ctrlShift(name: KeyName): KeySpec;
  alt(name: KeyName): KeySpec;
  shift(name: KeyName): KeySpec;
  super(name: KeyName): KeySpec;
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
  ctrl: (name: KeyName): KeySpec => key(name, { ctrl: true }),
  ctrlShift: (name: KeyName): KeySpec => key(name, { ctrl: true, shift: true }),
  alt: (name: KeyName): KeySpec => key(name, { alt: true }),
  shift: (name: KeyName): KeySpec => key(name, { shift: true }),
  super: (name: KeyName): KeySpec => key(name, { super: true }),
});

export function matchesKey(input: KeyInput, expected: KeySpec): boolean {
  return (
    input.name === expected.name &&
    input.ctrl === expected.ctrl &&
    input.alt === expected.alt &&
    input.shift === expected.shift &&
    input.super === expected.super
  );
}

function normalizedName(name: string): KeyName {
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

export function keyInputFromKeyEvent(keyEvent: KeyEvent): KeyInput | undefined {
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

export function keyInputFromPasteEvent(event: PasteEvent): KeyInput {
  return Object.freeze({
    text: stripAnsiSequences(decodePasteBytes(event.bytes)),
    ctrl: false,
    alt: false,
    shift: false,
    super: false,
  });
}

export function printableInput(input: KeyInput): string | undefined {
  return input.text;
}
