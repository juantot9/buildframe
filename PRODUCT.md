# Product

<!-- impeccable:product-schema 1 -->

## Platform

terminal

<!-- Not one of Impeccable's web/ios/android/adaptive values: BuildFrame is a
terminal UI built on OpenTUI. Web and native-mobile conventions do not apply. -->

## Users

The primary user is a solo developer, currently the author, who uses BuildFrame
daily. They work in a Git worktree beside an AI coding harness (Pi or
Claude Code). Their job is to review what the harness
changed, ask precise questions anchored to exact lines, and keep a trustworthy
record of what was asked, what was answered, and what changed in between.

The first public release is a quiet, Reviewing-only `0.1.0` preview for
developers on macOS and Linux (see `.issues/WF-287`); native Windows follows
in the next release (`.issues/WF-304`). Design for the solo
developer first.

## Product Purpose

BuildFrame is a terminal companion that makes the work between a developer, their
AI coding harnesses, and their editor easier to understand and control.

The v1 spine is Reviewing. It covers current working changes and exact local
commit or range comparisons, immutable Snapshot navigation, bounded
Files/Diff/Question views, exact old/new-side Anchors, Question submission to
one compatible harness Attachment, retained Current/Previous Reviews, and
read-only history. Planning workflows are defined in the domain model but are
not yet the focus.

Success means the developer can see at any moment what the harness was told,
what it answered, what changed, and what BuildFrame can and cannot truthfully
claim about each of those.

## Positioning

BuildFrame is a companion to AI coding harnesses. It is not an agent and not an
editor. It keeps a durable, truthful local record of what you asked, what was
answered, and what changed, and it asks for explicit consent before anything
leaves the machine.

An agent or editor could not honestly make the same claim. BuildFrame's authority
sits beside the harness's runtime permissions and stays separate from them.
Every consequential step is committed locally before it takes effect.

## Operating Context

- It runs in the developer's terminal, often in a split pane next to the
  harness session and an editor.
- One BuildFrame writer owns the Authoritative Workflow State for each Workspace
  Identity. That state is private, local, and kept outside the repository.
  There is no network sync.
- It is launched for a specific worktree. During development this is the
  `pnpm dogfood -- /path/to/worktree` route.
- Review Messages use a built-in structure or an optional user
  `message-template.md`. `F3` previews exactly what will be sent.
- Domain vocabulary lives in `CONTEXT.md`. The issue tracker in `.issues/` is
  the record of work.

## Capabilities and Constraints

- The TUI is built on OpenTUI, running on Node with `--experimental-ffi`.
- `--no-color` and `--ascii` must keep the interface fully usable.
- It must stay usable at narrow widths, in split panes and small terminals.
- It must read well on light terminal themes as well as dark ones.
- Every action must be reachable from the keyboard. Mouse use is welcome, but
  nothing may require it.
- Perceived latency and smoothness count as much as raw speed.
- The Interaction Language is familiar wording on top of precise domain
  records. Internal concept names surface only when a distinction changes
  consent, authority, recovery, or what BuildFrame can truthfully claim.
  Truth-critical distinctions (prepared, started, ended, or unresolved;
  current, stale, or unverified; discussion versus mutation) must never be
  collapsed to simplify the UI.
- Consent friction is proportionate. A clear action is its own consent.
  Preflights are reserved for mutation authority, destructive action, a
  capability downgrade, or real ambiguity.
- What goes to a harness goes as written. BuildFrame never scans a Message or
  its quoted source for secrets and never asks before sending it.
- Release scope is settled in `.issues/WF-287`. A Pi or Claude Code session
  connects once with `/buildframe`, then receives every Send directly. Install is
  `npm i -g @buildframe/cli` (or pnpm), on macOS, Linux and Windows with Node 26.
  `support/manifest.json` is generated from the app's support facts.

## Brand Commitments

- The name is BuildFrame.
- The vocabulary in `CONTEXT.md` is binding for product copy. Its _Avoid_ lists
  apply to UI wording too. For example, never call BuildFrame an agent or editor,
  and never present "Sent" as a universal state.

## Evidence on Hand

- `CONTEXT.md` holds the domain model and vocabulary.
- `docs/research/` and `WORKFLOW_RESEARCH.md` hold the TUI pattern research
  (Codex, Claude Code, OpenCode, Gemini CLI, Crush, Pi).
- `docs/testing/` holds the manual exploratory testing guides.
- There are no users beyond the author, and no testimonials, metrics, or public
  claims. None may be invented.

## Product Principles

1. Never let the UI claim more than the evidence supports. Prefer showing
   uncertainty over showing false completion.
2. Commit locally first, then act. The record is the product.
3. Use plain words by default, and give exact detail on demand.
4. Treat the terminal as the home environment. Narrow panes, light themes, and
   no-color or ASCII modes are first-class.
5. Feel matters. Responsiveness and calm motion through large diffs are part of
   being trustworthy.

## Accessibility & Inclusion

- It must work without color (`--no-color`) and without box-drawing or Unicode
  glyphs (`--ascii`). Meaning must never depend on color alone.
- Everything must be fully keyboard-operable.
- It must stay legible on both light and dark terminal backgrounds.
