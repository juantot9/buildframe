---
id: WF-236
title: "Attach the Pi session with an explicit /neoflow command"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

Loading the Neoflow Pi extension attaches nothing by itself. The operator types `/neoflow` in the Pi session they want to use, sees `Neoflow Review attached`, and only then can that session receive Messages. `/neoflow status` reports the attachment and `/neoflow disconnect` detaches it.

## Finding

After the WF-235 routing fix, the owner still saw `more than one Harness session is attached` with what looked like a single Pi session. The persisted attachment index showed pairs of attachments created seconds apart with distinct Pi session identities, because the extension silently attached on every `session_start`. Pi fires `session_start` again on reload and on new or resumed sessions, and a Pi process that is still running keeps its `attachLoop` reconnecting forever, so an old window the owner had forgotten about stayed a live candidate next to the current one. There was no command to inspect or release that attachment.

## Interface

The extension registers one Pi command, `/neoflow`:

- no argument attaches the current session and reports the first outcome;
- `status` reports attached or detached;
- `disconnect` (or `detach`) tears the attachment down;
- anything else prints usage.

`session_start` only clears any previous attachment and sets the footer hint `Neoflow: /neoflow to attach this session`; `session_shutdown` detaches. A connection that resolves after cancellation is disposed instead of left live.

## Module seam

The command lives in the Pi extension that the host loads; the Adapter, the local-runtime transport, and the Workspace Interfaces are unchanged. Attachment remains a reviewed runtime connection whose durable evidence and availability still arrive through the existing evidence path.

## Acceptance

- [x] Loading the extension does not create an attachment; the footer asks the operator to run `/neoflow`.
- [x] `/neoflow` attaches the current session and reports success, an unreachable runtime, or a refusal.
- [x] `/neoflow status` and `/neoflow disconnect` report and release the attachment truthfully.
- [x] Replacing or ending the Pi session detaches the previous attachment and never leaks a connection that landed after cancellation.
- [x] Focused extension, Harness Interaction, and application scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

Attachment is an operator decision, not a side effect of extension loading. The command is idempotent, inspectable, and reversible, which is what the manual test flow needs: one known Pi session attaches, and every other window stays inert until its operator chooses to attach it.

## Completion evidence (2026-09-15)

- `createPiAdapterExtension` no longer attaches on `session_start`; it tears down any previous attachment and shows the `/neoflow` hint. The command attaches the current session, retries while the runtime is unavailable, reports the first outcome through `ctx.ui.notify`, and keeps `status`/`disconnect` truthful.
- `attachLoop` disposes a connection that resolves after cancellation, and the command clears its active attachment when the loop ends, so a refused or detached session can attach again.
- The walkthrough, launcher scripts, and fixture README now say to type `/neoflow` inside Pi and how to inspect or release the attachment.
- A focused extension contract test proves the command is registered, `session_start` attaches nothing and shows the hint, and `status`/usage/`disconnect` report correctly for a detached session; the unsupported-host path explains itself instead of attaching.
- Verification on Node 26.5.1: lint, format, dependency firewall, typechecks, the 41-file/359-test suite, clean builds of all four packages, build smoke, compiled dogfood fault probe, and `git diff --check` pass with unrelated repository-health work unstaged.
- The built Adapter was loaded into the real Pi `0.85.1` host in RPC mode: the extension registers `neoflow` with its description, `session_start` only publishes `Neoflow: /neoflow to attach this session`, and running `/neoflow` against a live runtime reported `Neoflow Review attached` before the session ended and its attachment was recorded as `blocked / disconnected`.
