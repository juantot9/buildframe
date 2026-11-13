---
id: WF-046
title: "Validate the Editor Companion implementation seam"
status: closed
labels:
  - wayfinder:prototype
parent: WF-039
assignee: juanan
blocked_by: [WF-041, WF-042, WF-045]
created: 2026-07-17
assets:
  - "ab9e1ce:apps/editor-companion-prototype/ on evidence/validated-implementation-probes (disposable evidence only)"
  - "ba374d1:evidence/validated-implementation-probes/README.md on evidence/validated-implementation-probes"
---

## Question

How should the persistent Editor Companion Interface, Neovim Adapter, attachment identity, acknowledged commands, Artifact Buffers, exact buffer revalidation, status projection, navigation, and TUI return flow fit the local runtime; and can a disposable end-to-end probe validate reconnect and stale-content behavior without coupling Neovim to workflow storage or Harness mechanics?

## Blocked by

- [Define the target Module architecture](./WF-041-define-target-module-architecture.md)
- [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md)
- [Validate the TUI implementation foundation](./WF-045-validate-tui-foundation.md)

## Resolution comment

Use one **persistent attachment-scoped projection/command session** between Neovim and the workspace runtime. Neovim starts one long-lived argv-form `neoflow editor-bridge` job; the bridge owns runtime discovery, private IPC, framing, protocol bootstrap, and transport reconnect. After bootstrap, the Adapter sees only Editor Attachment registration, scoped projections, closed Editor Commands, exact navigation requests, and structured acknowledgements. It never sees a socket path, State Adapter, workflow repository, Harness event, or persistence location.

```text
Neovim
  thin native Adapter: buffers · extmarks · native movement
             │
             │ argv job + bounded private frames
             ▼
neoflow editor-bridge
  discovery · framing · compatibility · reconnect
             │
             │ private local IPC
             ▼
workspace runtime
  Workspace Interface
  Editor Companion Module · Projection · Authoritative State
```

The Workspace Interface from [Define the target Module architecture](./WF-041-define-target-module-architecture.md) remains the application-facing seam. Editor-originated actions enter as typed `execute` calls, Editor Status and marker data arrive through scoped `read` and `subscribe`, and runtime-to-editor native effects use a narrow attachment-session delivery port inside the local-runtime implementation. The production Neovim bridge and an in-memory scripted Editor Host Adapter justify that internal test seam; transport framing is not another product Interface.

### Ownership and attachment

The **Editor Companion Module** owns Editor Attachment Identity, selected Editor Target, attachment-scoped buffer evidence, command idempotency and result lookup, exact Anchor matching, navigation lifecycle, Artifact Location resolution, TUI routing, and Editor Return Location validity. Projection builds bounded Editor Status and editor-native marker descriptors. The **Neovim Adapter** owns only the live editor-instance nonce, native buffer handles and options, just-in-time witness capture, extmarks, read-only native buffers, user commands or Lua mapping targets, native movement, notifications, and acknowledgements.

An Editor Attachment handshake combines a nonce generated once for the live Neovim instance with a canonical checkout revalidated by Workspace Evidence. Process id, window id, `cwd`, active file, and the bridge connection are not identity. A transport reconnect retains the Attachment Identity only when the same instance nonce and canonical checkout both match; a new Neovim process or checkout is a new Attachment Candidate and requires the settled selection policy. Reconnect shares no workflow context, transfers no consent, and resumes no navigation or TUI action.

The bridge requests fresh registration evidence after every transport connection. It may reconnect below Lua, but it never queues or automatically repeats an Editor Command. While disconnected, actions fail visibly. Re-registration restores the selected Editor Target, bounded projections, Artifact locations, and known idempotent command outcomes only after relevant open buffers are freshly witnessed; changed or dirty buffers make prior matches stale. Runtime replacement follows the same handshake through the launcher and never treats a new process generation as semantic evidence.

### Exact buffers and commands

A buffer witness is scoped to one Attachment and contains an opaque buffer token, lossless source identity, current changed tick, dirty state, canonical logical content length and digest, and the exact bounded bytes required by a command when the action captures source. A changed tick or line number alone never proves a match. Editor Presence can publish path, cursor, selection, and dirty state without source bytes; an explicit Editor Context Contribution command carries its exact selected or whole-buffer content and provenance.

Every Editor Command is a closed versioned variant carrying a stable command occurrence identity, exact Editor Attachment and Editor Target, expected projection state version, command-specific Artifact and Anchor identities, a just-in-time buffer witness, and an exact return location where relevant. The Editor Companion revalidates all of that when handling the command. Dirty, stale, ambiguous, side-mismatched, or content-mismatched Review source fails closed and preserves the draft; neither Lua nor an extmark may re-anchor it. The Authoritative State command ledger retains applied semantic results so repetition returns `already-applied` without duplicating a draft, disposition, viewed marker, gate, or effect. Other outcomes are structured `rejected` or `tui-action-required`, never inferred from a bridge write.

Editor Context capture and exact Review actions use command-specific bytes behind this same Interface rather than broad buffer synchronization. Consequential actions never carry consent logic into Neovim: mutation-authorizing Batches, Feedback or Review submission, Approval, Handoff, Capability Downgrade, and completion return one `tui-action-required` result referring to the complete projected Composed Commitment Gate.

### Projections, navigation, and Artifact Buffers

Editor projections are scoped, versioned, identity-stable, and bounded. Editor Status includes only connection, explicit target, focused Artifact, stale or Context Drift conditions, draft/open/unresolved counts, relevant Invocation state, and TUI attention. Annotation descriptors carry stable Annotation and Artifact identities plus native presentation hints; extmarks remain replaceable projections, never Anchors or Re-anchor Mappings. The Adapter installs stable actions and mapping targets but no mandatory key combinations.

Navigation in either direction is an exact request/acknowledgement exchange. A request carries request identity, Editor Attachment Identity, Artifact Location, expected source identity and content evidence, and an Artifact fallback. Immediately before native movement, the Adapter reacquires the buffer witness. An exact current match moves and acknowledges the actual location; attachment loss, ambiguity, or failure returns a structured visible failure. A stale, dirty, historical, deleted, old-side, or otherwise unrepresentable source opens a clearly labelled read-only `neoflow://artifact/<opaque>` Artifact Buffer rather than moving approximately.

Artifact Buffer content is resolved by Artifact Identity through scoped manifest and chunk reads, never by exposing a persistence path. The Adapter verifies the declared byte length and digest before marking the buffer read-only and retains Artifact Identity and provenance as buffer metadata. Opening current source from an Artifact Buffer is a separate confirmed navigation. Connection loss fails any in-flight native request and removes it from the live delivery set; reconnect never replays it. A lost acknowledgement remains visibly unknown or failed according to the initiating surface rather than being treated as success.

### TUI gate and return flow

A `tui-action-required` result stores one exact Editor Return Location and makes the complete gate available to the TUI's existing scoped projection. Only the explicit editor action may ask the launcher to attach or open a TUI client focused on that gate; terminal placement is native presentation or User Configuration, not workflow meaning. Neovim displays compact waiting status but cannot inspect, reconstruct, accept, or bypass gate acknowledgements.

Gate completion or cancellation publishes `return available`; it never moves editor focus automatically. An explicit `Return to editor` TUI command asks the Editor Companion to issue one acknowledged navigation request to the original Attachment and location. The Adapter revalidates the buffer at that moment: an exact match returns there, changed content opens the exact Artifact Buffer, and a lost or changed Attachment fails visibly. No last-cursor or approximate fallback substitutes for the stored return location.

### Probe verdict

The disposable Editor Companion probe preserved at `ab9e1ce:apps/editor-companion-prototype/` on `evidence/validated-implementation-probes` runs a real headless Neovim process, a long-lived launcher bridge, a scratch Unix socket, and an in-memory workspace runtime. The evidence report at `ba374d1:evidence/validated-implementation-probes/README.md` records the exact `pnpm prototype:editor-companion -- --all` reproduction route.

All nine checks passed: one Attachment Identity survived two exact registrations around a dropped transport; bounded status and an Annotation extmark rendered; one stable command produced one draft plus `already-applied`; dirty content rejected and removed the current-source marker; a consequential command returned the exact TUI gate and return location; matching navigation acknowledged line 2; a changed return source opened byte-exact read-only Artifact content; disconnected navigation failed and was not replayed; and the 26 observed native frames contained no workflow-store, Harness, transcript, tool-activity, or mandatory-mapping contract. Two navigation acknowledgements were recorded and the fixture finished at committed state version 9.

The probe deliberately does not validate production persistence or framing, large/chunked Artifact Buffers, lossless unusual paths, alternate line endings, binary or unrenderable content, deleted and old-side Review locations, multi-window behavior, installation, upgrades, or the supported Neovim/platform matrix. Those remain with the existing verification and packaging tickets. The prototype is untracked planning evidence pending explicit capture approval. No product terminology changed, and this decision surfaces no new ticket or fog.
