---
id: WF-239
title: "Let the harness modify the workspace by default"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

An attached Harness can change the code, not only answer questions. A direct Review Capability defaults to workspace write, `/neoflow` attaches Pi with workspace write, `/neoflow readonly` narrows that session to discussion only, and Neoflow discloses the authority on every message preview and settlement. The contract is harness-neutral so future Claude Code, OpenCode, Codex, and other reviewed Adapters follow the same default.

## Finding

Every direct Review Capability was hard-coded to `authority: 'discussion-only'` with an enforced `workspace-read-only` constraint: the contract type, manifest validation, all disclosure and receipt payloads, the Pi Adapter's prompt, its non-read tool blocker, and a Pi tool set of `read,grep,find,ls`. The blueprint recorded "a message never authorizes an edit". The owner needs the harness to apply the change it is asked for and then see those changes as ordinary live changes under review.

## Interface

`DirectReviewAuthority` is `'discussion-only' | 'workspace-write'`. Read-only keeps the enforced `workspace-read-only` constraint; workspace write uses a communicated `harness-tools` constraint: the Harness may modify the workspace with the tools its session actually has, including its shell, and Neoflow communicates that authority without claiming an operating-system sandbox. The authority travels from the Attachment's Capability into each Handoff disclosure, commitment receipt, and Capability Snapshot; a message still never infers it from prose.

The Pi Adapter defaults to workspace write, advertises `pi-direct-workspace-write-review-v1`, narrows nothing, and blocks nothing; `authority: 'discussion-only'` keeps the enforced read gate unchanged. The extension command names the mode on attach and status, and `readonly`/`write` switch it by re-attaching with a fresh session epoch. Neoflow's exact outgoing preview states the authority, and the settlement notice repeats it for workspace write.

## Module seam

The authority lives on the reviewed Capability, so the Workspace Interface keeps one inspection/commit path per Handoff and the adapter remains the only place that enforces or communicates tool limits. No message payload, command shape, or projection version changes; stored read-only disclosures, manifests, digests, and history remain byte-identical.

## Acceptance

- [ ] The workspace contract validates both authority/constraint pairs and rejects mismatched pairs.
- [ ] The Pi Adapter defaults to workspace write, leaves the session tools untouched, and blocks no tool; read-only mode keeps the exact previous gate.
- [ ] `/neoflow` attaches with workspace write, `/neoflow readonly` narrows, `/neoflow write` restores, and `status` reports the mode.
- [ ] Message inspection, disclosure, and Capability Snapshot carry the attachment authority; the legacy Question handoff stays read-only.
- [ ] Neoflow's preview and settlement notice disclose workspace write.
- [ ] Focused adapter, extension, Harness Interaction, and application scenarios, full verification, compiled dogfood, and `git diff --check` pass with unrelated work untouched.

## Resolution

The owner settled the product decision on 2026-09-15: write is the default and a Pi command disables it, other Harnesses should follow the same pattern, and the boundary is the tools the harness actually has. Read-only remains available because some questions should not touch the tree, and it keeps its stronger enforced claim; write is honest that its constraint is communicated, not sandboxed.

## Completion evidence (2026-09-15)

- `DirectReviewAuthority` and `DirectReviewEffectConstraint` are in the reviewed contract; manifest normalization accepts `discussion-only`/enforced/read-only and `workspace-write`/communicated/harness-tools and rejects any other pairing.
- The Pi Adapter advertises `pi-direct-workspace-write-review-v1` by default, skips tool narrowing and tool blocking in write mode, and keeps the prompt, tool gate, and manifest byte-compatible for `discussion-only`.
- The extension attaches with workspace write by default; `/neoflow readonly` and `/neoflow write` switch by re-attaching, `status` names the mode, and the fixture launcher grants `edit`, `write`, and `bash` session tools.
- The app preview reads `Assessment: … · may modify the working tree.` and the settlement notice appends `The Harness may modify the working tree.`
- New tests cover the contract pair validation, the write-default manifest and untouched session tools, the write-mode dispatch directive and disclosure, the extension command text, and the application preview/settlement disclosure.
- Verification on Node 26.5.1: lint, format, dependency firewall, typechecks, clean builds, build smoke, the compiled dogfood probe (pinned to the enforced read-only path), and `git diff --check` pass. The consolidated run of every touched suite (application scenarios, Harness Interaction, Pi Adapter, host compatibility, extension) passes 64/64; the full suite was also attempted twice under heavy machine load (8–11) and reported only `Test timed out in 20000ms` failures in three untouched timing-sensitive scenarios, each of which passes in isolation (workspace identity deadline, context revalidation, empty-diff restart).
- Addendum (2026-09-16, WF-237): the Pi Adapter live probe now constructs its adapter with `authority: 'discussion-only'` so its enforced read-only assertions hold again under the write default; `pnpm v1:risk:pi` passes. No WF-239 source changed.
