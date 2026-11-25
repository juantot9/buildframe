import type { ConnectorStatus } from './contracts.js';

/** A tone each host maps to its own success, warning and error colours. */
export type ConnectorIndicatorTone = 'success' | 'warning' | 'error';

/**
 * How a harness shows its BuildFrame connection: a quiet light while it is
 * connected, and a problem the person should read when it is not. Every host
 * places it in its own UI; the states and words are the same everywhere.
 */
export interface ConnectorIndicator {
  readonly connected: boolean;
  /** `●` when connected, `○` otherwise. */
  readonly glyph: '●' | '○';
  readonly tone: ConnectorIndicatorTone;
  /** `read-only`, while connected that way; nothing for the default workspace write. */
  readonly access: 'read-only' | undefined;
  /** What went wrong and what to do, worded to follow `BuildFrame` or a host's own prefix. */
  readonly problem: string | undefined;
}

export interface ConnectorIndicatorOptions {
  readonly readOnly: boolean;
  /** How the person connects again in this harness: `/buildframe`, or `!buildframe` in Codex. */
  readonly command: string;
}

/** The indicator for one connector status; nothing once the session disconnected on purpose. */
export function connectorIndicator(
  status: ConnectorStatus,
  options: ConnectorIndicatorOptions,
): ConnectorIndicator | undefined {
  const notConnected = (tone: ConnectorIndicatorTone, problem: string): ConnectorIndicator => ({
    connected: false,
    glyph: '○',
    tone,
    access: undefined,
    problem,
  });
  switch (status.kind) {
    case 'connected':
      return {
        connected: true,
        glyph: '●',
        tone: 'success',
        access: options.readOnly ? 'read-only' : undefined,
        problem: undefined,
      };
    case 'retrying':
      // Never green: until the runtime answers, nothing can reach this session.
      return status.cause === 'runtime-disconnected'
        ? notConnected('warning', 'reconnecting…')
        : notConnected('warning', 'not open yet · connects when it opens');
    case 'refused':
      return notConnected('error', `couldn’t connect: ${status.label}`);
    case 'replaced':
      return notConnected('warning', `moved to another session · ${options.command} to take it back`);
    case 'cancelled':
      return undefined;
  }
}

/** The one-line light, e.g. `● BuildFrame read-only` or `○ BuildFrame reconnecting…`. */
export function connectorIndicatorText(
  indicator: ConnectorIndicator,
  options: { readonly problem: boolean } = { problem: true },
): string {
  const detail = indicator.access ?? (options.problem ? indicator.problem : undefined);
  return `${indicator.glyph} BuildFrame${detail === undefined ? '' : ` ${detail}`}`;
}
