---
id: WF-020
title: "Probe Claude Code’s attached Plan and Review paths"
status: closed
labels:
  - wayfinder:task
parent: WF-001
assignee: "JuanAn Aranda Triana"
blocked_by: [WF-018]
created: 2026-07-14
assets:
  - "git branch task/claude-attached-paths at d3b0b2d"
  - "docs/research/claude-attached-live-probes.md on that branch"
  - "docs/probes/claude-attached/ on that branch"
---

## Question

Run focused live probes against the pinned Claude Code version to record whether synchronous `ExitPlanMode` gating and a user-invoked Neoflow Review skill can be correlated durably across normal stops, failures, interrupts, workspace changes, and plugin or TUI unavailability.

## Blocked by

- [Choose the harness operating posture](./WF-018-choose-harness-operating-posture.md)

## Resolution comment

Claude Code 2.1.209 live probes confirm a conservative attached Plan gate and user-pulled Review path. `PreToolUse:ExitPlanMode` synchronously carried the complete proposal plus session, prompt, and cwd identity; Neoflow could fsync its revision and decision before replying. Denial kept Plan mode active and delivered revision feedback, while allow with complete `updatedInput` exited Plan mode without another native dialog. Claude labelled the hook allow as “User approved Claude’s plan,” so production must allow only after a real durable Neoflow user decision.

A manual `/neoflow:review` skill correlated one immutable batch through `UserPromptExpansion`, `UserPromptSubmit`, and normal `Stop` using stable session/prompt identity and a canonical workspace. The expansion identity must be persisted before dynamic resolution because `UserPromptSubmit` contains only the original slash command, not expanded batch context. Duplicate invocation was blocked before a second model turn; matching `StopFailure` failed the receipt.

Ctrl+C emitted neither Stop nor StopFailure. A mid-turn host disconnect missed the later normal Stop and left the authoritative receipt unresolved. Interactive `/cd` emitted no configured `CwdChanged` callback, although later hooks carried the new cwd; every workflow event must therefore revalidate canonical root/git-dir identity. A linked worktree was correctly distinct. Missing host failed closed at Plan and Review gates only while the bridge remained loaded; with the plugin absent, Review was simply unavailable. No replay, automatic resend, semantic Review success, read-only guarantee, host push, foreground cancellation, or authoritative busy state is established.

Report and reproducible assets: `docs/research/claude-attached-live-probes.md` and `docs/probes/claude-attached/` on branch `task/claude-attached-paths`, commit `d3b0b2d`.
