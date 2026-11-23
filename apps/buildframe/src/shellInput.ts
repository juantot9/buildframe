import { Key, matchesKey, type KeyInput } from './keyInput.js';

/**
 * What the shell needs from the screen to route one key. The shell owns the
 * order in which keys are claimed; the screen supplies its typing layers, its
 * guard, its own Esc, and everything the shell does not claim. A host is built
 * fresh for each key, so its facts describe the moment the key arrived.
 */
export interface ShellKeyHost<E> {
  readonly stop: E;
  /** A typing layer the screen has open (composer, inputs, lists) takes every key. */
  capture(input: KeyInput): readonly E[] | undefined;
  /** A screen layer that refuses or closes on some keys before the shell's own (a read-only Snapshot). */
  guard(input: KeyInput): readonly E[] | undefined;
  /** Whether a screen layer that refuses shell dialogs is open. */
  readonly guarded: boolean;
  /** The shell's own keys act only on a screen that is up (not while starting or failed). */
  readonly ready: boolean;
  /** Something loads: `q` waits. */
  readonly loading: boolean;
  /** A command is being saved: every other key waits too. */
  readonly saving: boolean;
  sayStillLoading(key: string): void;
  readonly keyList: { readonly open: boolean; show(open: boolean): void };
  readonly configuration: { readonly open: boolean; show(): void; input(input: KeyInput): readonly E[] };
  readonly details: { readonly open: boolean; show(open: boolean): void };
  /** Esc once nothing the shell owns is open: the screen closes its own layer or leaves. */
  escape(): readonly E[];
  /** Every key the shell does not claim. */
  screenKey(input: KeyInput): readonly E[];
}

function isPlainSpace(input: KeyInput): boolean {
  return input.name === 'space' && input.text === ' ' && !input.ctrl && !input.alt && !input.shift && !input.super;
}

/**
 * Routes one key in the shell's fixed order: the screen's typing layers,
 * Ctrl+C, the open key list, the screen's guard, Configuration, `q` (only when
 * nothing loads or saves), the save lock, `?`, `c`, Esc (debug details first,
 * then the screen), `!`, and finally the screen.
 */
export function routeShellKey<E>(input: KeyInput, host: ShellKeyHost<E>): readonly E[] {
  const captured = host.capture(input);
  if (captured !== undefined) return captured;
  if (matchesKey(input, Key.ctrl('c'))) return [host.stop];
  const plainSpace = isPlainSpace(input);
  if (host.keyList.open) {
    if (plainSpace || input.text === '?' || matchesKey(input, Key.enter) || matchesKey(input, Key.escape)) {
      host.keyList.show(false);
    }
    return [];
  }
  const guarded = host.guard(input);
  if (guarded !== undefined) return guarded;
  if (host.configuration.open) return host.configuration.input(input);
  if (input.text === 'q' && host.ready) {
    // A q typed ahead while something loads or saves is more likely a word
    // than a decision to leave; quit only once nothing is in flight.
    if (!host.loading && !host.saving) return [host.stop];
    host.sayStillLoading('q');
    return [];
  }
  if (host.saving) return [];
  if ((plainSpace || input.text === '?') && !host.guarded && host.ready) {
    host.keyList.show(true);
    host.details.show(false);
    return [];
  }
  if (input.text === 'c' && host.ready) {
    host.configuration.show();
    return [];
  }
  if (matchesKey(input, Key.escape)) {
    // Esc closes what is open first; it only leaves the screen when nothing is.
    if (host.details.open) {
      host.details.show(false);
      return [];
    }
    return host.escape();
  }
  if (input.text === '!') {
    host.details.show(!host.details.open);
    return [];
  }
  return host.screenKey(input);
}
