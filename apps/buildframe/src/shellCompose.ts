import type { MouseEvent } from '@opentui/core';
import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { noticeGlyph, noticeStatusTone, type NoticeTone } from './shellStatus.js';
import type { RenderChild, RenderNode } from './renderTree.js';
import { actionChecksPanel, agentIndicator, keyListPanel, shellHeader } from './shellChrome.js';
import { shellFrame, type FrameLook, type FrameParts, type FrameStatus } from './shellFrame.js';
import { footerSentence, keyList, keysRow, type KeyListItem, type KeyTable } from './shellKeys.js';
import type { ScreenSettings, ShellSettings } from './shellSettings.js';

/**
 * What a screen gives the frame. A screen made with `defineScreen` has all it
 * needs; the optional parts let a screen draw its own header, status line,
 * footer and layers where the defaults don't fit it.
 */
export interface FrameScreen<S> {
  readonly name: string;
  title(state: S): string;
  mode(state: S): string;
  /** The key table the footer and `?` list come from, unless the screen draws its own. */
  readonly table?: KeyTable<S, string, any, any>;
  context?(state: S, look: FrameLook): readonly RenderChild[];
  body(state: S, look: FrameLook, height: number): readonly RenderChild[];
  checks?(state: S): readonly string[];
  settings?(state: S): ScreenSettings;
  /** The header instead of `BuildFrame / <title>`; zero rows hides it. */
  header?(state: S, look: FrameLook): FrameParts['header'];
  /** What the screen says when the shell says nothing (its spinner, its notices). */
  said?(state: S, look: FrameLook): FrameStatus;
  /** The footer's idle sentence and keys instead of the key table's. */
  footer?(state: S): { readonly sentence: string | undefined; keysRow(width: number): string };
  /** The `?` list instead of the key table's. */
  keyList?(state: S): readonly KeyListItem[];
  /** The screen's own dialogs, drawn above the shell's. */
  layers?(state: S, look: FrameLook, height: number, headerHeight: number): readonly RenderChild[];
  /** Pointer movement anywhere in the frame. */
  mouseMove?(state: S): ((event: MouseEvent) => void) | undefined;
}

/** What the shell itself has open or is saying over the screen. */
export interface ShellLayers {
  readonly said: { readonly text: string; readonly tone: NoticeTone } | undefined;
  readonly checksOpen: boolean;
  readonly keyListOpen: boolean;
  readonly settings: ShellSettings | undefined;
  readonly connection: HarnessConnectionView | undefined;
}

/** The whole frame for one screen: header, context, body with every layer, and the two-row footer. */
export function composeFrame<S>(look: FrameLook, screen: FrameScreen<S>, state: S, shell: ShellLayers): RenderNode {
  const mode = screen.mode(state);
  const said = shell.said;
  const glyph = said === undefined ? '' : noticeGlyph(said.tone, look.presentation.ascii);
  const header =
    screen.header?.(state, look) ??
    shellHeader(
      look,
      screen.name,
      `BuildFrame / ${screen.title(state)}`,
      undefined,
      agentIndicator(look, shell.connection),
    );
  const table = screen.table;
  const footer =
    screen.footer?.(state) ??
    (table === undefined
      ? { sentence: undefined, keysRow: () => '' }
      : {
          sentence: footerSentence(table, mode, state),
          keysRow: (width: number) => keysRow(table, mode, state, width),
        });
  const mouseMove = screen.mouseMove?.(state);
  return shellFrame(look, {
    idPrefix: screen.name,
    header,
    context: screen.context?.(state, look) ?? [],
    body: height => [
      ...screen.body(state, look, height),
      ...(shell.checksOpen ? actionChecksPanel(look, screen.checks?.(state) ?? []) : []),
      ...(shell.keyListOpen
        ? keyListPanel(
            look,
            screen.keyList?.(state) ?? (table === undefined ? [] : keyList(table, mode, state)),
            height,
            screen.name,
          )
        : []),
      ...(shell.settings?.dialog(look, screen.settings?.(state), height, header.height, screen.name) ?? []),
      ...(screen.layers?.(state, look, height, header.height) ?? []),
    ],
    said:
      said === undefined
        ? (screen.said?.(state, look) ?? { text: '', tone: 'muted' })
        : { text: glyph === '' ? said.text : `${glyph} ${said.text}`, tone: noticeStatusTone(said.tone) },
    idleSentence: footer.sentence,
    keysRow: footer.keysRow,
    ...(mouseMove === undefined ? {} : { onMouseMove: mouseMove }),
  });
}
