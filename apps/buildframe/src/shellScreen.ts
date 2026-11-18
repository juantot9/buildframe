import type { WorkspaceCommand, WorkspaceView, WorkspaceViewScope } from '@buildframe/workspace';

import { Key, matchesKey, type ReviewingInput, type ReviewingKeySpec } from './reviewingInput.js';
import type { RenderChild } from './renderTree.js';
import type { CommandOutcome } from './shellCommands.js';
import type { FrameLook } from './shellFrame.js';
import {
  defineKeyTable,
  type FooterMode,
  type HelpMode,
  type KeyGroup,
  type KeyTable,
  type Text,
} from './shellKeys.js';
import type { NoticeTone } from './reviewingStatus.js';

/**
 * A screen as data: what it shows, which keys it answers and what they do,
 * which Workspace views it reads, and what it does when a command settles.
 * Screens never do I/O: they change their own state and return effects, and
 * the shell carries those out.
 */

export type ScreenEffect =
  | { readonly type: 'execute'; readonly command: WorkspaceCommand }
  | { readonly type: 'open'; readonly screen: string; readonly args?: unknown }
  | { readonly type: 'copy'; readonly text: string; readonly what: string }
  | { readonly type: 'say'; readonly text: string; readonly tone: NoticeTone };

/** What a key or a settled command returns: effects, or nothing. */
export type ScreenResult = readonly ScreenEffect[] | void;

/** One key, its words in the footer and in `?`, and what it does. */
export interface ScreenKey<S, Mode extends string> {
  /** Stable name, unique in the screen. */
  readonly id: string;
  /** Printed characters (`'a'`) and named keys (`Key.enter`) that press it. */
  readonly keys: readonly (string | ReviewingKeySpec)[];
  /** How the key is printed: `a`, `Enter`, `j/k`. */
  readonly show: string;
  /** Footer words; a key without them is listed in `?` only. */
  readonly label?: Text<S>;
  /** `?` words and group. */
  readonly help: { readonly group: KeyGroup; readonly text: Text<S> };
  /** The modes the key acts in; every mode when absent. */
  readonly modes?: readonly Mode[];
  /** The key acts on something still loading: it says so instead of acting. */
  readonly waits?: (state: S) => boolean;
  /** The key cannot act now: it keeps its slot and this says why. */
  readonly blocked?: (state: S) => string | undefined;
  run(state: S, input: ReviewingInput): ScreenResult;
}

export interface ScreenMode<S> {
  /** What the footer says when nothing else is being said. */
  readonly sentence?: Text<S>;
  /** Esc's words in `?`; absent where Esc does nothing. */
  readonly escape?: string;
}

export interface ScreenDefinition<S, Mode extends string = string> {
  /** Prefix of the screen's renderable ids, and its name in `open` effects. */
  readonly name: string;
  open(args: unknown): S;
  /** The header's words after `BuildFrame / `. */
  title(state: S): string;
  mode(state: S): Mode;
  readonly modes: Readonly<Record<Mode, ScreenMode<S>>>;
  readonly keys: readonly ScreenKey<S, Mode>[];
  /** Rows between the header and the body. */
  context?(state: S, look: FrameLook): readonly RenderChild[];
  body(state: S, look: FrameLook, height: number): readonly RenderChild[];
  /** The views the screen shows; the shell reads them together at one State version. */
  views?(state: S): Readonly<Record<string, WorkspaceViewScope>>;
  /** The views, read together; called again whenever one changes. */
  receive?(state: S, views: Readonly<Record<string, WorkspaceView>>): void;
  /** A command this screen asked for has an outcome. */
  settled?(state: S, command: WorkspaceCommand, outcome: CommandOutcome): ScreenResult;
  /** Esc once nothing the shell owns is open; returns false to leave the screen. */
  escape?(state: S): ScreenResult | false;
}

/** A checked screen, with the key table the shell draws its footer and `?` list from. */
export interface Screen<S, Mode extends string = string> extends ScreenDefinition<S, Mode> {
  readonly table: KeyTable<S, string, Mode, Mode>;
}

/** Keys the shell answers on every screen. */
const RESERVED: readonly ReviewingKeySpec[] = [Key.ctrl('c'), Key.escape];
const RESERVED_TEXT = new Set(['q', '?', 'c', '!', ' ']);

function keyName(key: string | ReviewingKeySpec): string {
  if (typeof key === 'string') return key;
  const modifiers = (['ctrl', 'alt', 'shift', 'super'] as const).filter(modifier => key[modifier]);
  return [...modifiers, key.name].join('+');
}

function reserved(key: string | ReviewingKeySpec): boolean {
  if (typeof key === 'string') return RESERVED_TEXT.has(key);
  return key.name === 'space' || RESERVED.some(spec => keyName(spec) === keyName(key));
}

function actsIn<S, Mode extends string>(key: ScreenKey<S, Mode>, mode: Mode): boolean {
  return key.modes === undefined || key.modes.includes(mode);
}

/**
 * Checks a screen once, when it is defined: no key the shell owns
 * (`q ? c ! Space Ctrl+C Esc`), no key pressed by two bindings in one mode,
 * and at most four footer keys in any mode.
 */
export function defineScreen<S, Mode extends string>(definition: ScreenDefinition<S, Mode>): Screen<S, Mode> {
  const ids = new Set<string>();
  for (const key of definition.keys) {
    if (ids.has(key.id)) throw new TypeError(`Screen ${definition.name} names ${key.id} twice`);
    ids.add(key.id);
    const taken = key.keys.find(reserved);
    if (taken !== undefined) {
      throw new TypeError(`Screen ${definition.name} binds ${keyName(taken)}, which the shell owns`);
    }
  }
  const modes = Object.keys(definition.modes) as Mode[];
  for (const mode of modes) {
    const claimed = new Map<string, string>();
    for (const key of definition.keys.filter(candidate => actsIn(candidate, mode))) {
      for (const name of key.keys.map(keyName)) {
        const other = claimed.get(name);
        if (other !== undefined) {
          throw new TypeError(`Screen ${definition.name} binds ${name} to both ${other} and ${key.id} in ${mode}`);
        }
        claimed.set(name, key.id);
      }
    }
  }
  const footer = {} as Record<Mode, FooterMode<S, string>>;
  const help = {} as Record<Mode, HelpMode<S, string>>;
  const helpFor = {} as Record<Mode, Mode>;
  for (const mode of modes) {
    const keys = definition.keys.filter(key => actsIn(key, mode));
    const { sentence, escape } = definition.modes[mode];
    footer[mode] = {
      typing: false,
      ...(sentence === undefined ? {} : { sentence }),
      keys: keys.flatMap(key => (key.label === undefined ? [] : [{ id: key.id, label: key.label }])),
    };
    help[mode] = {
      keys: keys.map(key => ({ id: key.id, label: key.help.text, group: key.help.group })),
      ...(escape === undefined ? {} : { escape }),
    };
    helpFor[mode] = mode;
  }
  const table = defineKeyTable<S, string, Mode, Mode>({
    bindings: Object.fromEntries(definition.keys.map(key => [key.id, { show: key.show }])),
    footer,
    help,
    helpFor,
  });
  return { ...definition, table };
}

function presses(key: string | ReviewingKeySpec, input: ReviewingInput): boolean {
  return typeof key === 'string' ? input.text === key : matchesKey(input, key);
}

/** Runs the key the screen binds to `input` in its current mode; a key it doesn't bind does nothing. */
export function dispatchScreenKey<S, Mode extends string>(
  screen: Screen<S, Mode>,
  state: S,
  input: ReviewingInput,
): readonly ScreenEffect[] {
  const mode = screen.mode(state);
  const key = screen.keys.find(candidate => actsIn(candidate, mode) && candidate.keys.some(k => presses(k, input)));
  if (key === undefined) return [];
  const why = key.blocked?.(state);
  if (why !== undefined) return [{ type: 'say', text: why, tone: 'info' }];
  if (key.waits?.(state) === true) {
    return [{ type: 'say', text: `Still loading; press ${key.show} again in a moment.`, tone: 'info' }];
  }
  return key.run(state, input) ?? [];
}
