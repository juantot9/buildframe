---
id: WF-295
title: "Connect OpenCode"
status: open
labels:
  - wayfinder:task
parent: WF-289
assignee: null
blocked_by: [WF-292, WF-293, WF-294]
created: 2026-11-17
---

## Question

Add an OpenCode connector as one new package built on the connector kit,
within what WF-294 proves OpenCode supports.

## Direction (settled by WF-294)

WF-294 found OpenCode 2 can carry the contract with honest unknowns
([note](../docs/research/opencode-connector-wf294.md)). Run the note's seven
experiments before code.

Owner decisions (2026-11-18):

- **Prompts typed during BuildFrame's turn are held** (OpenCode `queue`
  delivery forced by a `prompt` hook) until that turn ends, not refused, so
  nothing the user types is lost and BuildFrame's outcome stays attributable.
- **OpenCode 2 only.** OpenCode 1 is not supported; its own release notes offer
  the upgrade and v1 plugins do not run in v2.

- New package `packages/opencode-adapter`, listed in the dependency firewall
  with only `@buildframe/local-runtime/harness-adapter` and the workspace
  harness types.
- It contains only host glue: manifest and verified host versions, the
  `/buildframe` command, turn start/observe/interrupt mapping.
- Release: decide with the owner how it ships (a third published package or
  inside `@buildframe/cli`) and add it to `support/manifest.json` through
  `apps/buildframe/src/supportManifest.ts`.

## Verification

- Contract tests through the kit's in-memory host.
- One live connect-and-send round trip on each verified OpenCode version.
- `pnpm verify` passes; `doctor` reports the connector.
