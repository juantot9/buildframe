# OpenTUI 0.5.1 selection, clipboard, paste, and Textarea mechanics

Date: 2026-08-05

## Question

Which exact OpenTUI `0.5.1` mechanics should Neoflow use for terminal-native displayed-content selection/copy and a wrapped, selectable Question composer?

## Primary sources

The exact first-party release is [`v0.5.1`](https://github.com/anomalyco/opentui/releases/tag/v0.5.1), commit [`ad9a818`](https://github.com/anomalyco/opentui/tree/ad9a818d7a9d73f3386e92a445d0feb4b395c69e). Sources reviewed:

- `packages/core/src/renderer.ts` and `lib/clipboard.ts`;
- `packages/core/src/lib/selection.ts`, `lib/paste.ts`, and `lib/KeyHandler.ts`;
- `packages/core/src/renderables/Textarea.ts` and `EditBufferRenderable.ts`;
- `packages/core/src/editor-view.ts`;
- official skill pages `docs/core-concepts/renderer.mdx`, `keyboard.mdx`, `testing.mdx`, and `docs/components/textarea.mdx`.

The official OpenTUI skill from the same tag is installed at `~/.pi/agent/skills/opentui` with its sibling documentation and source metadata.

## Findings

- `CliRenderer` enables terminal mouse reporting by default (`useMouse ?? true`) and exposes a runtime setter. Mouse reporting is required for the application to identify a clicked File, Diff row, or Question. Ordinary unmodified drag then belongs to OpenTUI rather than the terminal emulator; terminal-native modifier-drag remains terminal-dependent.
- OpenTUI application-owned drag selection is active while mouse reporting is enabled. Completing it emits `CliRenderEvents.SELECTION`; selection does not itself imply a clipboard write. Neoflow must explicitly copy a non-empty completed selection through OSC 52 and must defer any rerender until OpenTUI has finished the gesture.
- OpenTUI's native hit grid changes only when a rendered frame commits. If an application replaces an immutable VDOM tree after mouse-up and immediately destroys the detached Renderables, input arriving before the replacement frame can resolve the old numeric hit-grid identity after it has been removed from `Renderable.renderablesByNumber`; the event is then dropped. Neoflow retains detached presented trees through the replacement `frame` event and additionally defers their destruction while a drag selection remains active.
- Release-time Selection state is insufficient to express one-click semantic activation: crossing panes or replacing an earlier selection may otherwise spend the first gesture only changing Selection. Neoflow records the exact renderer-neutral target and origin cell on mouse-down, classifies travel on mouse-up, and uses that one gesture either for activation or for drag selection. Ordinary two-cell wobble activates the pressed target while a longer drag remains non-semantic selection.
- A selectable Diff label may deliver the semantic mouse handler at its enclosing pane even when the gesture coordinates are inside a rendered row. Neoflow normalizes a Diff-region mouse-down against only the currently rendered bounded row boxes, upgrading it to the exact row and old/new side. This is UI hit normalization, not inference of source or Workspace state.
- Under the pinned Node 26.4.0 experimental-FFI PTY path, a `queueMicrotask` scheduled by Neoflow from OpenTUI's selectable-text mouse-up did not execute until the next terminal input event. This exactly produced a one-click-behind Diff cursor: the first click emitted no frame, then a second click rendered the first target before the second. Deferring activation is no longer necessary because Neoflow retains the presented tree through the replacement frame. Synchronous mouse-up activation emitted the first target frame immediately in the same real-PTY probe. Evidence: `/tmp/neoflow-cycle10-deferred-mouse-pty.log` and `/tmp/neoflow-cycle10-sync-mouse-pty.log`.
- OSC 52 clipboard writes remain explicit through `copyToClipboardOSC52`. The call checks capability policy and truthfully returns false when blocked, but true cannot prove terminal acceptance.
- `TextareaRenderable.handlePaste` decodes structured paste bytes, strips ANSI sequences, and inserts through the selection-aware editor buffer.
- `TextareaRenderable` owns Shift+movement and Super+A selection. `EditBufferRenderable.moveCursorUp` and `moveCursorDown` call `EditorView.moveUpVisual` / `moveDownVisual`, so navigation follows post-wrap rows rather than requiring newline characters in the draft.
- `TextareaRenderable` exposes its exact `plainText`, cursor offset, selection text, logical cursor, visual cursor, wrap mode, and editor viewport. Its default cursor style is a blinking block; Neoflow sets that style explicitly.
- OpenTUI's internal key dispatcher runs global handlers before focused-renderable handlers. A global handler can prevent or stop propagation. Neoflow uses that seam only for host-owned Escape, submit coordination, and OSC 52 copy; ordinary editor keys and paste continue to the focused Textarea.
- The official `TextareaRenderable` has no Construct factory in `0.5.1`, but a concrete `Renderable` is a valid VDOM child. Neoflow retains one private Textarea instance while reconstructing the surrounding Reviewing tree, detaching it before recursive destruction and refocusing it after reparenting.

## Decision

Use five deliberately separate private mechanics:

1. OpenTUI button reporting without idle movement traffic (`useMouse: true`, `enableMouseMovement: false`) for clicked File, Diff-row, and Question identity;
2. OpenTUI selectable Review text, with zero-distance mouse-up interpreted as activation and a real drag retained as selection rather than navigation;
3. explicit OSC 52 copy of a completed non-empty Review selection, with Ctrl+C also copying the retained selection instead of quitting;
4. one focused OpenTUI `TextareaRenderable` for wrapped visual-row navigation, block cursor, selection, replacement, and sanitized paste;
5. continuous synchronization of the Textarea's exact plain text into the local Reviewing model, which remains the source used to construct the atomic Ask command and enforce the 64 KiB bound, plus explicit OSC 52 copy of its selected text.

This updates the earlier terminal-native posture after human acceptance of click navigation. Modifier-drag may still invoke terminal-native selection in supporting terminals, but Neoflow does not depend on that terminal-specific escape hatch.

Enter submits the Question; wrapping creates the visible rows. Neoflow does not require synthetic newline commands to navigate the rows the user sees. Pasted text may still contain real newlines, which remain exact draft content.

Do not add a generic renderer, clipboard, pointer, or editor Interface to the package root. The concrete OpenTUI interaction implementation remains private inside the deep Reviewing Application Module.
