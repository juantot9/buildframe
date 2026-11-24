import { RGBA, StyledText, TextAttributes, type BorderCharacters, type MouseEvent } from '@opentui/core';

import { Box, Text, type RenderChild } from './renderTree.js';
import type { StatusTone } from './shellStatus.js';
import type { ReviewingPreferences, ReviewingThemeDefinition, ReviewingTokenPalette } from './userConfiguration.js';

/**
 * How the shell draws: theme roles and presets, the ASCII stand-ins, safe
 * text, and the label and box primitives every screen builds on. It reads
 * only these presentation facts, never a screen's own state.
 */
export interface Look {
  readonly presentation: { readonly ascii: boolean; readonly noColor: boolean };
  readonly reviewingTheme: ReviewingThemeDefinition;
  readonly background: ReviewingPreferences['background'];
  readonly terminalThemeMode: 'dark' | 'light' | undefined;
}

export type ThemeColor = string;

export interface SemanticTheme {
  readonly background: ThemeColor;
  readonly surface: ThemeColor;
  readonly raised: ThemeColor;
  readonly border: ThemeColor;
  readonly text: ThemeColor;
  readonly muted: ThemeColor;
  readonly accent: ThemeColor;
  readonly accentSoft: ThemeColor;
  readonly success: ThemeColor;
  readonly successSoft: ThemeColor;
  readonly danger: ThemeColor;
  readonly dangerSoft: ThemeColor;
  readonly warning: ThemeColor;
  readonly code: ThemeColor;
  readonly tokens: ReviewingTokenPalette;
}

export const QUIET_GRAPHITE: SemanticTheme = Object.freeze({
  background: '#0d1014',
  surface: '#12171d',
  raised: '#192029',
  border: '#303a46',
  text: '#d8dee9',
  muted: '#7d8998',
  accent: '#70b7d4',
  accentSoft: '#17313c',
  success: '#8ebd8b',
  successSoft: '#162a20',
  danger: '#d8898b',
  dangerSoft: '#301a20',
  warning: '#d5b875',
  code: '#c8d0dc',
  tokens: Object.freeze({
    keyword: '#b6a0da',
    string: '#a9c995',
    number: '#e8a07a',
    comment: '#7d8998',
    function: '#9fb2e8',
    type: '#91c9c0',
    constant: '#e8a07a',
    property: '#b3c5db',
    tag: '#9fb2e8',
    markup: '#b6a0da',
  }),
});

export const WARM_CARBON: SemanticTheme = Object.freeze({
  background: '#0b0b0a',
  surface: '#11110f',
  raised: '#191815',
  border: '#3b382f',
  text: '#e3dfd4',
  muted: '#888276',
  accent: '#e0ad62',
  accentSoft: '#332615',
  success: '#a9bd75',
  successSoft: '#202719',
  danger: '#cc8175',
  dangerSoft: '#2c1916',
  warning: '#e6d36a',
  code: '#ddd8cc',
  tokens: Object.freeze({
    keyword: '#c39fd1',
    string: '#b6c58a',
    number: '#d7ba78',
    comment: '#888276',
    function: '#9fbfcf',
    type: '#a7c4b0',
    constant: '#d7ba78',
    property: '#d2c6ab',
    tag: '#9fbfcf',
    markup: '#c39fd1',
  }),
});

export const INDIGO_NIGHT: SemanticTheme = Object.freeze({
  background: '#0b1020',
  surface: '#10182b',
  raised: '#18233b',
  border: '#32415f',
  text: '#d7e0f3',
  muted: '#8290ad',
  accent: '#9b8cda',
  accentSoft: '#292348',
  success: '#79b99a',
  successSoft: '#17312c',
  danger: '#da8291',
  dangerSoft: '#351c2a',
  warning: '#d7b76d',
  code: '#cfd9ee',
  tokens: Object.freeze({
    keyword: '#d79fdb',
    string: '#8cc8af',
    number: '#e3a17c',
    comment: '#8290ad',
    function: '#91bdec',
    type: '#86c9ce',
    constant: '#e3a17c',
    property: '#b9c8e5',
    tag: '#91bdec',
    markup: '#d79fdb',
  }),
});

/** Quiet Graphite's light counterpart; every foreground clears 4.5:1 on every fill. */
export const QUIET_PAPER: SemanticTheme = Object.freeze({
  background: '#e9edf1',
  surface: '#f5f7f9',
  raised: '#ffffff',
  border: '#a9b4c0',
  text: '#1d2630',
  muted: '#556372',
  accent: '#17698a',
  accentSoft: '#d3e7f0',
  success: '#2f6e33',
  successSoft: '#deefdc',
  danger: '#a8323b',
  dangerSoft: '#f6dfe0',
  warning: '#7f5c0e',
  code: '#26313d',
  tokens: Object.freeze({
    keyword: '#6544a8',
    string: '#356f28',
    number: '#9a4a14',
    comment: '#556372',
    function: '#2f55a4',
    type: '#16706a',
    constant: '#9a4a14',
    property: '#37577e',
    tag: '#2f55a4',
    markup: '#6544a8',
  }),
});

/** The preset that follows the terminal: Quiet Paper on light, otherwise Quiet Graphite. */
export const MATCH_TERMINAL_THEME = 'match-terminal';

function matchedTerminalTheme(state: Look): SemanticTheme {
  return state.terminalThemeMode === 'light' ? QUIET_PAPER : QUIET_GRAPHITE;
}

export const ASCII_BORDER: BorderCharacters = Object.freeze({
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  topT: '+',
  bottomT: '+',
  leftT: '+',
  rightT: '+',
  cross: '+',
});

const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu;

/**
 * ASCII stand-ins for the interface's own characters, so `--ascii` never turns
 * chrome into `?`, which is reserved for unknown states and for content
 * characters that have no ASCII form.
 */
const ASCII_STAND_INS: Readonly<Record<string, string>> = Object.freeze({
  '·': '-',
  '…': '...',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '—': '--',
  '–': '-',
  '•': '*',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '↳': '->',
  '↑': '^',
  '↓': 'v',
  '›': '>',
  '‹': '<',
  '▸': '>',
  '▾': 'v',
  '▶': '>',
  '◀': '<',
  '◆': '@',
  '◇': '#',
  '●': '*',
  '○': 'o',
  '■': '#',
  '◷': 'o',
  '✓': '+',
  '✗': 'x',
  '✎': '*',
  '＋': '+',
  '─': '-',
  '━': '-',
  '┄': '-',
  '│': '|',
  '┃': '|',
  '└': '+',
  '▌': '|',
  '▏': '|',
});

function asciiStandIn(character: string): string {
  return ASCII_STAND_INS[character] ?? '?';
}

/** `exactContent` marks source code: a stand-in could pass for real syntax, so it keeps `?`. */
export function safeText(value: string, ascii: boolean, exactContent = false): string {
  const controlled = value.replaceAll('\t', '  ').replace(CONTROL_PATTERN, ascii ? '?' : '�');
  if (!ascii) return controlled;
  return exactContent ? controlled.replace(/[^\x00-\x7f]/gu, '?') : controlled.replace(/[^\x00-\x7f]/gu, asciiStandIn);
}

export function wrappedRows(value: string, width: number): readonly string[] {
  const rows: string[] = [];
  const boundedWidth = Math.max(1, width);
  for (const logicalLine of value.split('\n')) {
    let remaining = [...logicalLine];
    if (remaining.length === 0) {
      rows.push('');
      continue;
    }
    while (remaining.length > boundedWidth) {
      const candidate = remaining.slice(0, boundedWidth);
      let breakAt = candidate.length;
      for (let index = candidate.length - 1; index > 0; index -= 1) {
        if (/\s/u.test(candidate[index] ?? '')) {
          breakAt = index;
          break;
        }
      }
      rows.push(candidate.slice(0, breakAt).join(''));
      remaining = remaining.slice(breakAt);
      while (/\s/u.test(remaining[0] ?? '')) remaining = remaining.slice(1);
    }
    rows.push(remaining.join(''));
  }
  return rows;
}

function inheritedTheme(state: Look): SemanticTheme {
  switch (state.reviewingTheme.inherits) {
    case 'warm-carbon':
      return WARM_CARBON;
    case 'indigo-night':
      return INDIGO_NIGHT;
    case 'quiet-paper':
      return QUIET_PAPER;
    case MATCH_TERMINAL_THEME:
      return matchedTerminalTheme(state);
    default:
      return QUIET_GRAPHITE;
  }
}

function configuredTheme(state: Look): SemanticTheme {
  const inherited = inheritedTheme(state);
  return {
    ...inherited,
    ...state.reviewingTheme.colors,
    tokens: { ...inherited.tokens, ...state.reviewingTheme.tokens },
  };
}

export function controlPlaneTheme(state: Look): SemanticTheme {
  const fallback = inheritedTheme(state);
  const configured = configuredTheme(state);
  return {
    ...configured,
    background: configured.background === 'transparent' ? fallback.background : configured.background,
    surface: configured.surface === 'transparent' ? fallback.surface : configured.surface,
    raised: configured.raised === 'transparent' ? fallback.raised : configured.raised,
    accentSoft: configured.accentSoft === 'transparent' ? fallback.accentSoft : configured.accentSoft,
  };
}

export function theme(state: Look): SemanticTheme {
  if (!state.presentation.noColor) {
    const resolved = configuredTheme(state);
    if (state.background === 'theme') return resolved;
    // Surfaces give way to the terminal's own background; the Sage and Rose
    // washes stay, because they say which lines changed.
    return {
      ...resolved,
      background: 'transparent',
      surface: 'transparent',
      raised: 'transparent',
      accentSoft: 'transparent',
    };
  }
  return {
    background: 'transparent',
    surface: 'transparent',
    raised: 'transparent',
    border: 'white',
    text: 'white',
    muted: 'white',
    accent: 'white',
    accentSoft: 'transparent',
    success: 'white',
    successSoft: 'transparent',
    danger: 'white',
    dangerSoft: 'transparent',
    warning: 'white',
    code: 'white',
    tokens: {},
  };
}

export function label(
  state: Look,
  content: string | StyledText,
  options: {
    readonly fg?: ThemeColor;
    readonly bg?: ThemeColor;
    readonly bold?: boolean;
    readonly height?: number;
    readonly width?: number | `${number}%`;
    readonly flexGrow?: number;
    readonly flexShrink?: number;
    readonly wrap?: 'none' | 'char' | 'word';
    readonly truncate?: boolean;
    // Accepted but not drawn: OpenTUI 0.8 painted text over its own padding,
    // so pane text sits flush against the border and the width fitting
    // assumes that. OpenTUI 0.9 honours padding; passing it on would inset
    // every pane row by a cell and cut two cells from its end.
    readonly paddingLeft?: number;
    readonly paddingRight?: number;
    readonly id?: string;
    readonly onMouseDown?: (event: MouseEvent) => void;
    readonly onMouseUp?: (event: MouseEvent) => void;
  } = {},
): RenderChild {
  return Text({
    content: typeof content === 'string' ? safeText(content, state.presentation.ascii) : content,
    ...(state.presentation.noColor || options.fg === undefined ? {} : { fg: options.fg }),
    ...(state.presentation.noColor || options.bg === undefined ? {} : { bg: options.bg }),
    ...(state.presentation.noColor || options.bold !== true ? {} : { attributes: TextAttributes.BOLD }),
    height: options.height ?? 1,
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.flexGrow === undefined ? {} : { flexGrow: options.flexGrow }),
    ...(options.flexShrink === undefined ? {} : { flexShrink: options.flexShrink }),
    wrapMode: options.wrap ?? 'none',
    // Overflow keeps the start of the text: OpenTUI's truncation removes the
    // middle, which damages sentences and paths. Fit known widths explicitly.
    truncate: state.presentation.ascii ? false : (options.truncate ?? false),
    ...(options.id === undefined ? {} : { id: options.id }),
    ...(options.onMouseDown === undefined ? {} : { onMouseDown: options.onMouseDown }),
    ...(options.onMouseUp === undefined ? {} : { onMouseUp: options.onMouseUp }),
    selectable: true,
  });
}

export function borderedBox(state: Look, options: Parameters<typeof Box>[0], ...children: RenderChild[]): RenderChild {
  const colors = theme(state);
  const title = options?.title;
  const bottomTitle = options?.bottomTitle;
  return Box(
    {
      border: true,
      borderStyle: state.presentation.ascii ? 'single' : 'rounded',
      ...(state.presentation.ascii ? { customBorderChars: ASCII_BORDER } : {}),
      ...(state.presentation.noColor ? {} : { borderColor: colors.border }),
      backgroundColor: state.presentation.noColor ? 'transparent' : colors.surface,
      ...options,
      ...(title === undefined ? {} : { title: safeText(title, state.presentation.ascii) }),
      ...(bottomTitle === undefined
        ? {}
        : {
            bottomTitle: safeText(bottomTitle, state.presentation.ascii),
          }),
    },
    ...children,
  );
}

export function toneColor(colors: SemanticTheme, tone: StatusTone): ThemeColor {
  // Work in progress is said by the spinner's motion; the accent means focus only.
  return tone === 'accent' ? colors.text : colors[tone];
}

/** One part of a line drawn in several styles. */
export interface Span {
  readonly text: string;
  readonly fg: ThemeColor;
  readonly bold?: boolean;
}

/**
 * A line in several styles, such as a pane title's bold name and its regular
 * muted detail. Without colour it is the plain text.
 */
export function spans(state: Look, parts: readonly Span[]): string | StyledText {
  if (state.presentation.noColor) return parts.map(part => part.text).join('');
  return new StyledText(
    parts.map(part => ({
      __isChunk: true as const,
      text: safeText(part.text, state.presentation.ascii),
      fg: part.fg === 'transparent' ? RGBA.defaultForeground() : RGBA.fromHex(part.fg),
      attributes: part.bold === true ? TextAttributes.BOLD : 0,
    })),
  );
}
