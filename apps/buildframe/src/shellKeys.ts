import { displayCells, fitDisplayCellsEnd } from './displayCells.js';
import { matchesKey, type KeyInput, type KeySpec } from './keyInput.js';

/**
 * A screen's keys as data. One table names every key once, and each mode says
 * which keys its footer shows and which its `?` list explains, so the two can
 * be checked against each other instead of drifting apart. The shell draws the
 * keys row and the `?` list from it.
 */

export type KeyGroup = 'MOVE' | 'OPEN' | 'VIEW' | 'WORKSPACE';
export type Text<S> = string | ((state: S) => string);

export interface KeyListItem {
  readonly group: KeyGroup;
  readonly key: string;
  readonly label: string;
}

/** One key: how it is printed. */
export interface KeyBinding {
  readonly show: string;
}

/**
 * A key placed in a footer or a `?` list, with its words there. Today's words
 * differ between the keys row and `?`, and between screens, so each placement
 * carries its own.
 */
export interface KeyPlacement<S, Id extends string> {
  readonly id: Id;
  readonly label: Text<S>;
  readonly when?: (state: S) => boolean;
}

export interface HelpPlacement<S, Id extends string> extends KeyPlacement<S, Id> {
  readonly group: KeyGroup;
  /** One `?` row that explains several footer keys (`e / m`). */
  readonly alsoCovers?: readonly Id[];
  readonly show?: string;
}

/** What the footer says in one mode: a sentence when nothing else is said, and its keys. */
export interface FooterMode<S, Id extends string> {
  /** Letters are being typed: the anchor reads `[Ctrl+C] quit`. */
  readonly typing: boolean;
  readonly sentence?: Text<S>;
  readonly keys: readonly KeyPlacement<S, Id>[];
}

/** What `?` lists for one screen state, before the shell's own keys. */
export interface HelpMode<S, Id extends string> {
  readonly keys: readonly HelpPlacement<S, Id>[];
  /** Esc's words in the App group; absent where Esc does nothing. */
  readonly escape?: string;
}

export interface KeyTable<S, Id extends string, F extends string, H extends string> {
  readonly bindings: Readonly<Record<Id, KeyBinding>>;
  readonly footer: Readonly<Record<F, FooterMode<S, Id>>>;
  readonly help: Readonly<Record<H, HelpMode<S, Id>>>;
  /** The `?` list that explains each non-typing footer mode's keys. */
  readonly helpFor: Readonly<Partial<Record<F, H>>>;
}

const MAXIMUM_FOOTER_KEYS = 4;

/**
 * Checks a table once, when it is defined: every footer holds at most four
 * keys, and every key a non-typing footer shows is explained by its `?` list
 * (Esc by the App group's Esc row).
 */
export function defineKeyTable<S, Id extends string, F extends string, H extends string>(
  table: KeyTable<S, Id, F, H>,
): KeyTable<S, Id, F, H> {
  for (const [name, mode] of Object.entries<FooterMode<S, Id>>(table.footer)) {
    if (mode.keys.length > MAXIMUM_FOOTER_KEYS) {
      throw new TypeError(`Footer mode ${name} shows more than ${MAXIMUM_FOOTER_KEYS} keys`);
    }
    const helpName = table.helpFor[name as F];
    if (mode.typing || helpName === undefined) continue;
    const help = table.help[helpName];
    const explained = new Set(help.keys.flatMap(placement => [placement.id, ...(placement.alsoCovers ?? [])]));
    for (const placement of mode.keys) {
      const escape = table.bindings[placement.id].show === 'Esc' && help.escape !== undefined;
      if (!explained.has(placement.id) && !escape) {
        throw new TypeError(`Footer mode ${name} shows ${placement.id}, which its key list does not explain`);
      }
    }
  }
  return table;
}

function words<S>(text: Text<S>, state: S): string {
  return typeof text === 'function' ? text(state) : text;
}

function placed<S, Id extends string, P extends KeyPlacement<S, Id>>(placements: readonly P[], state: S): P[] {
  return placements.filter(placement => placement.when === undefined || placement.when(state));
}

export function footerSentence<S, Id extends string, F extends string, H extends string>(
  table: KeyTable<S, Id, F, H>,
  mode: F,
  state: S,
): string | undefined {
  const sentence = table.footer[mode].sentence;
  return sentence === undefined ? undefined : words(sentence, state);
}

function keyText(key: string, label: string, short: boolean): string {
  const typed = key.startsWith('[') ? key : `[${key}]`;
  return short ? typed : `${typed} ${label}`;
}

/**
 * The keys row: the mode's keys on the left, the anchor on the right. When it
 * doesn't fit, every label shortens to its key at once, so each key keeps its
 * place; only then do keys drop, last first. The anchor never shortens.
 */
export function keysRow<S, Id extends string, F extends string, H extends string>(
  table: KeyTable<S, Id, F, H>,
  mode: F,
  state: S,
  width: number,
): string {
  const footer = table.footer[mode];
  const anchor = (
    footer.typing
      ? [['Ctrl+C', 'quit']]
      : [
          ['?', 'keys'],
          ['q', 'quit'],
        ]
  )
    .map(([key, label]) => keyText(key!, label!, false))
    .join('  ');
  const shown = placed(footer.keys, state).map(placement => ({
    key: table.bindings[placement.id].show,
    label: words(placement.label, state),
  }));
  const gap = 4;
  const room = Math.max(0, width - displayCells(anchor) - gap);
  const join = (keys: readonly { key: string; label: string }[], short: boolean): string =>
    keys.map(key => keyText(key.key, key.label, short)).join('  ');
  let left = join(shown, false);
  if (displayCells(left) > room) {
    const keys = [...shown];
    left = join(keys, true);
    while (keys.length > 0 && displayCells(left) > room) {
      keys.pop();
      left = join(keys, true);
    }
  }
  if (displayCells(anchor) > width) return fitDisplayCellsEnd(anchor, Math.max(1, width), '…');
  return `${left}${' '.repeat(Math.max(gap, width - displayCells(left) - displayCells(anchor)))}${anchor}`;
}

/** The `?` list: the screen's keys in its order, then the shell's own (Configuration, checks, Esc, `?`, quit). */
export function keyList<S, Id extends string, F extends string, H extends string>(
  table: KeyTable<S, Id, F, H>,
  mode: H,
  state: S,
): readonly KeyListItem[] {
  const help = table.help[mode];
  const items: KeyListItem[] = placed(help.keys, state).map(placement => ({
    group: placement.group,
    key: placement.show ?? table.bindings[placement.id].show,
    label: words(placement.label, state),
  }));
  items.push(
    { group: 'VIEW', key: 'c', label: 'Configuration' },
    { group: 'VIEW', key: '!', label: 'Action checks (debug)' },
  );
  if (help.escape !== undefined) items.push({ group: 'WORKSPACE', key: 'Esc', label: help.escape });
  items.push(
    { group: 'WORKSPACE', key: '?', label: 'Show / hide this key list' },
    { group: 'WORKSPACE', key: 'q', label: 'Quit BuildFrame' },
  );
  return items;
}

/**
 * What one key does, in the order a screen checks it. The first action whose
 * key matches and whose condition holds runs; a key nothing matches does
 * nothing. `actsFor` names the table keys this action carries out, so a test
 * can check that every key the footer or `?` shows really acts.
 */
export interface KeyAction<M, E> {
  readonly actsFor: readonly string[];
  readonly match: (input: KeyInput) => boolean;
  readonly when?: (model: M) => boolean;
  run(model: M, input: KeyInput, now: number): readonly E[];
}

export function dispatchKey<M, E>(
  actions: readonly KeyAction<M, E>[],
  model: M,
  input: KeyInput,
  now: number,
): readonly E[] {
  for (const action of actions) {
    if (action.match(input) && (action.when === undefined || action.when(model))) return action.run(model, input, now);
  }
  return [];
}

/** Matches a printed character. */
export const onText =
  (...texts: readonly string[]) =>
  (input: KeyInput): boolean =>
    input.text !== undefined && texts.includes(input.text);

/** Matches a named key or chord. */
export const onKey =
  (...keys: readonly KeySpec[]) =>
  (input: KeyInput): boolean =>
    keys.some(key => matchesKey(input, key));

/** Matches any of several matchers. */
export const either =
  (...matchers: readonly ((input: KeyInput) => boolean)[]) =>
  (input: KeyInput): boolean =>
    matchers.some(matcher => matcher(input));
