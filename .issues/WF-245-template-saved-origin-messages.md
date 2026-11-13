---
id: WF-245
title: "Template saved-origin Messages with source and origin placeholders"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-16
---

## Outcome

The user-level `message-template.md` can structure a saved-origin Message as well as a live one. `{{source}}` supplies the exact fenced historical passage with its canonical not-current-code line, and `{{origin}}` supplies the labelled origin header. A template written as `{{message}}`, `{{origin}}`, `{{source}}` reproduces the fixed quoted structure byte for byte; a template without the historical placeholders keeps that fixed structure for saved-origin Messages, so nothing changes silently for existing templates. WF-240's deferred Option B is closed.

## Finding

WF-240 deferred historical templating ("Saved-origin Messages keep the fixed quoted-source structure (Option A)"). WF-228 fixes the saved-origin contract: the outgoing material carries the exact labelled historical passage, and the closing line always states that the historical source is not current code. The template renderer accepts exactly `{{message}}` and `{{location}}` once each; `composeReviewMessageMaterial` ignores the template entirely for a non-live origin.

## Interface

`{{message}}` is required exactly once. A live template uses `{{location}}` exactly once and no historical placeholders. A saved-origin template uses `{{source}}` and `{{origin}}` together, each at most once, with `{{location}}` optional (at most once) because the historical facts already name it. A saved-origin template renders for a saved-origin Message and is `message-template-invalid` for a live one, because no historical source exists to show. A template with no historical placeholders keeps today's behavior: live rendering as before, fixed quoted structure for saved origin. Expansions:

- `{{origin}}` — `From <historical origin label> — <file>:<line>:`, the fixed structure's provenance header;
- `{{source}}` — the exact historical passage in a fence wide enough for its longest backtick run, then a blank line and `<file>:<line> — historical source (saved review point, not current code)`.

The prepared inspection keeps replaying the exact template at commit, and the outgoing digest, sensitivity occurrences, and representation stay the committed material's, so no wire or durable shape changes.

## Acceptance

- [x] The documented live template still renders byte-identically, and unknown or duplicate placeholders still fail closed.
- [x] `{{message}}\n\n{{origin}}\n\n{{source}}` reproduces the saved-origin fixed structure byte for byte.
- [x] A saved-origin template with an unpaired `{{source}}` or `{{origin}}` is invalid and sends nothing.
- [x] A saved-origin template applied to a live Message is invalid rather than fabricating history.
- [x] A saved-origin Message under a live template keeps the fixed structure; under a historical template the committed bytes match the preview and survive commit revalidation.
- [x] Focused scenarios, full verification, the compiled dogfood probe, and `git diff --check` pass with unrelated work untouched.

## Resolution

`reviewMessageTemplateShape` validates the contract once for both origins: `{{message}}` exactly once; `{{source}}` and `{{origin}}` together, each at most once; `{{location}}` exactly once for a live template and at most once for a historical one, because `{{origin}}` and `{{source}}` already name the location. `renderReviewMessageTemplate` takes exact facts plus optional historical facts and refuses a historical template on a live Message. A saved-origin Message renders the template only when it names the historical pair; otherwise the fixed quoted-source structure is composed exactly as before. `{{origin}}` is the provenance header and `{{source}}` is the safely fenced historical passage plus the canonical not-current-code line, so `{{message}}\n\n{{origin}}\n\n{{source}}` is byte-identical to the fixed structure. The prepared inspection still replays the exact template at commit, and the README, the manual testing document, the request contract comment, and the application's invalid-template notice state the live/historical rules.

## Completion evidence (2026-09-16)

- A new Harness Interaction scenario proves the byte-equivalent decomposition, a structured historical template previewing and committing exactly those bytes, the unpaired `{{source}}` refusal, the live template leaving the saved-origin structure fixed, and the historical template refusing a live Message.
- All 24 Harness Interaction scenarios pass; the existing live template, literal-placeholder, and refusal scenarios pass unchanged; lint, format, dependency firewall, package and test typechecks, clean builds, build smoke, and all four compiled risk probes pass on Node 26.5.1.
- The full suite passes 380/380 in 44 files with a 60-second per-test bound under load average ~8; with the default 20-second bound two different untouched load-sensitive scenarios timed out and each passed in isolation (164ms and 1.7s). A retry also hit the known startup `ERR_IPC_CHANNEL_CLOSED` trap and was re-run with `--pool=threads`.
- `git diff --check` is clean and the unrelated repository-health backlog remains untracked and untouched.
