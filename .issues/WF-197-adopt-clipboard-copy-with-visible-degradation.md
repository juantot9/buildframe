---
id: WF-197
title: "Adopt clipboard copy for diff rows and Question bodies"
status: closed
labels:
  - wayfinder:task
parent: WF-051
assignee: juanan
blocked_by: [WF-195]
created: 2026-09-07
---

## Pre-implementation resolution (2026-09-07)

- **Mechanism and lifecycle.** The application creates one OpenTUI `ClipboardService` after it owns the renderer: `createClipboard({ host: createHostClipboard(...), terminal: createRendererClipboardAdapter(renderer) })`. Writes use the standard `clipboard` selection and `destination: 'best-available'`: a local host backend is preferred, unsupported/failed local host writes fall back to OSC 52, and remote sessions use the renderer's terminal path. Host construction failure falls back to an application-local unsupported-host adapter so a usable terminal path is not lost. The application caps writes at the already-settled 64 KiB Question limit, keeps OpenTUI's one-second host deadline, and awaits clipboard disposal before destroying the renderer. The private scripted-Terminal seam substitutes a captured or unsupported host adapter and never touches the test machine's real clipboard.
- **Exact surfaces and keybinding.** In a Review, plain `y` copies according to focus. Diff focus copies only the selected projected row's `text.bytesBase64` decoded as UTF-8: no gutter, add/delete marker, selection marker, truncation explanation, wrapping/clipping glyph, ASCII substitution, or highlighted chunk enters the payload. Questions focus copies only the selected Question's complete exact body: either an untruncated body already present in the bounded Questions window or the complete body already admitted by the existing bounded discussion read. It does not include the Pi Response or card chrome. If the complete body is not yet admitted, the action performs no read and says that it is not ready to copy. Files/Home focus and blocking overlays do not acquire a copy meaning. The existing composer `Ctrl/Cmd+C` and free-form terminal-selection copy remain distinct conveniences but move through the same clipboard mechanism. The action lookup is the discoverable `[y]` surface at every width; persistent narrow chrome does not grow.
- **Truthful result vocabulary.** A host `written` result reports `Copied …`. A terminal `attempted` result reports `Sent … to the terminal clipboard (acceptance unconfirmed)` because OSC 52 dispatch cannot prove terminal acceptance. Every combination with neither result—unsupported capability/backend, timeout, cancellation, local failure, validation failure, or absent service—collapses to one visible source-specific degradation: `Clipboard unavailable; … was not copied.` The quiet automatic selection convenience may suppress success but never suppresses this failure. The latest requested copy owns the status signal, so late completion cannot overwrite newer feedback.
- **Boundedness and scenarios.** `y` resolves its payload synchronously from application state and schedules only the bounded clipboard write; it invokes no Workspace method and performs no Git, filesystem, network, highlighting, or re-render-derived text read. Scripted scenarios use the composed OpenTUI service with captured host adapters to assert byte-identical Unicode Diff-row and Question payloads in rich and no-color/ASCII presentations, then an unsupported host plus unsupported terminal capability to prove visible degradation and the absence of success language. Existing free-form selection/composer coverage remains and is updated only for the more precise terminal-attempt status.

## Outcome

The Reviewing TUI gains explicit clipboard copy for the two rich-content surfaces: the selected diff row's exact decoded bytes and a Question body's exact text. Copy goes through OpenTUI's `createClipboard` — OSC-52 escape sequences where the terminal supports them plus the host backends surfaced by the pinned renderer — with one visible, truthful degradation when no clipboard path is available (a status signal, never a silent no-op or a fabricated success). Copy is an application-level presentation action: it reads only already-admitted bounded window content (the same 64-row diff windows and question body rows rich rendering consumes), performs no Git, filesystem, or network access, and copies exact bytes — never the styled rendering. The exact mechanism surfaces, keybindings, and degradation behavior are settled in this issue's resolution before implementation.

## Interface

No Workspace Interface, State format, record format, limit, deadline, or budget changes. Clipboard copy is a closed application-level presentation action driven by the settled input vocabulary; no content envelope, projection fact, or durable record changes, and copied content is derived at action time from already-admitted exact bytes.

## Module seam

Presentation lives in the Reviewing Application (`apps/neoflow`); the clipboard mechanism is confined to the application package through the pinned `@opentui/core` surface and adds no new dependency class. Workspace Evidence, Projection, Reviewing, and Harness Interaction keep their settled seams.

## Acceptance

- [x] The mechanism, surfaces, keybindings, and unsupported-degradation behavior are recorded in this issue's resolution before implementation lands.
- [x] Copying a diff row and a Question body yields byte-identical content to the admitted slice, proven by scripted scenarios asserting the exact copied payload through a captured clipboard backend.
- [x] When no clipboard path is available, the action degrades with a visible, truthful status and never reports success.
- [x] Scripted Terminal scenarios cover copy on both the rich and fallback presentation paths, and the no-color/ASCII lane's assertions stay unchanged.
- [x] The action stays inside the settled user budgets and performs no Git, filesystem, or network access at copy time.
- [x] Canonical verification, the four compiled risk probes, dependency/package seams, and `git diff --check` pass, with the unrelated root `packageManager` bump still unstaged.

## Constraints

- Keep Node 26.5.1 / pnpm 11.20.0, State format 2, Interface version 1, the three-method Workspace Interface, and all limits/deadlines/budgets unchanged.
- Copy only already-admitted bounded window bytes decoded from projection facts; no re-reads of workspace files or Git objects, and no network access.
- The clipboard mechanism stays confined to `apps/neoflow` via the pinned `@opentui/core`; no new dependency class and no User Configuration surface.
- Never inspect real user repositories or `.neoflow` state; all scenarios use disposable generated fixtures and the established scripted Terminal harness.
- Keep the unrelated root package-manager bump unstaged through every commit.

## Authority

- [Adopt OpenTUI rich content for Reviewing presentation](./WF-195-adopt-opentui-rich-content-reviewing-presentation.md)
- [Choose the terminal interaction system](./WF-012-choose-terminal-interaction-system.md)
- [Define the verification and learning architecture](./WF-048-define-verification-architecture.md)

## Implementation and verification (2026-09-07)

Implemented in the Reviewing application/model/view with one composed clipboard lifetime and captured-host scripted coverage. Exact Diff bytes preserve a leading UTF-8 BOM as well as CJK/emoji; ASCII rendering substitutions never enter the payload. Historical Question copy keeps its hint and live result visible. Composer and free-form selection use the same result vocabulary.

Canonical `v1:verify` passed (34 files / 286 tests, lint/format, dependency firewall, typecheck, build and smoke); all four compiled risk probes and `git diff --check` passed. Direct Vitest runs without the canonical config hit its default five-second timeout in two existing long scenarios; the canonical lane passed without timeout or pool changes. The unrelated root `packageManager` bump remains unstaged.
