---
id: WF-009
title: "Shape the editor-companion workflow"
status: closed
labels:
  - wayfinder:prototype
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-007, WF-008]
created: 2026-07-14
assets:
  - "git branch prototype/editor-companion-workflow at 72cce8a"
  - "apps/tui/prototypes/editor-companion-workflow/ on that branch"
---

## Question

Which Planning and Reviewing context, actions, artifact locations, navigation requests, and status signals must flow bidirectionally between Neoflow and an editor so the companion is useful without duplicating the terminal experience?

## Blocked by

- [Define artifact and annotation semantics](./WF-007-define-artifact-annotation-semantics.md)
- [Define the harness capability seam](./WF-008-define-harness-capability-seam.md)

## Follow-up candidates

- Keep the Editor Companion contract tool-neutral while implementing only Neovim in v1; consider a first-party VS Code Extension Adapter after the v1 boundary is validated.

## Resolution comment

The v1 Editor Companion is a persistent, registered, bidirectional Neovim attachment for one canonical checkout, not a second Neoflow interface. The shared contract remains tool-neutral for a future first-party VS Code Adapter, but v1 promises and validates Neovim only. One-shot Context Import is post-v1 and, if introduced later, never masquerades as an attached editor.

Editor Presence may publish active path, cursor, selection bounds, and dirty status, but source content enters Neoflow only through an explicit action. Exact selections and files become immutable Editor Context Contributions, including unsaved buffer provenance; paths and directories remain Context Locators for bounded TUI curation. An explicit Neoflow-owned Editor Target routes each v1 action to Planning context or Review supporting context. Ambiguity requires a small picker or return to the TUI rather than stale-focus inference. A Code Inquiry draft may become another explicit target only if that post-v1 workflow is introduced.

The editor may create and edit Annotation Drafts, navigate next/previous or pick Annotations, reveal an exact Annotation in its owning Neoflow workflow, record human dispositions from exact Re-review mappings, and explicitly mark a file viewed only while presenting the exact Review Snapshot comparison. A Review Annotation requires exact checkout, file, side, range, and content matching. Draft projections may follow edits but require revalidation before commitment; committed projections become stale rather than moving. Historical, old-side, deleted, unsaved, or mismatched locations open clearly labelled read-only Artifact Buffers instead of approximate working files.

Code Inquiry is post-v1. If introduced later, the editor may directly commit only an unambiguous discussion-only Code Inquiry; a complete correlated answer becomes an immutable Inquiry Response and may appear in a compact read-only editor view without mirroring the harness transcript. In v1, mutation-authorizing Batches, Feedback and Review submission, Plan Approval, Implementation Handoff, Capability Downgrade, and Workflow completion stay in the TUI. When an editor action opens a TUI gate, Neoflow preserves the exact Editor Return Location; completion or cancellation updates compact status and offers explicit return without stealing focus. Changed return source opens exact Artifact content.

Editor Status is compact and actionable: connection, target, focused Artifact, stale or Context Drift state, draft/open/unresolved counts, relevant Invocation state, and TUI attention. Only response-ready, required-action, identity, navigation, failed, or unresolved events interrupt with notifications. Transcripts, streaming, tool activity, Artifact history, and full capability detail remain out of the editor.

Navigation is explicit and acknowledged in both directions; passive Presence never synchronizes cursors. Editor Commands have stable identity and idempotent acknowledgements. Reconnect restores target, status, projections, Artifact locations, and known command outcomes after exact attachment and buffer revalidation, but never replays old navigation or launches/chooses an editor silently.

The user drove and validated the full logic prototype, including editor/TUI commitment separation, Code Inquiry, stale Artifact navigation, Annotation traversal, `Reveal in Neoflow`, exact return location, disposition, and conservative reconnect behavior. Prototype: `apps/tui/prototypes/editor-companion-workflow/` on branch `prototype/editor-companion-workflow`, commit `72cce8a`.
