# BuildFrame handoff

Last updated: 2026-11-13

## Current checkpoint

BuildFrame is preparing its first public release, a Reviewing-only `0.1.0`
preview. The plan of record is
[`.issues/WF-287-ship-the-0-1-0-public-preview.md`](.issues/WF-287-ship-the-0-1-0-public-preview.md);
read it first. It records the owner's decisions, the children that are done,
and the ones that remain. WF-051 stays the long-range execution plan, amended
by WF-287 for this release.

The active source graph:

```text
apps/buildframe              terminal app, launcher, doctor
packages/workspace        Reviews, Messages, State, Git evidence
packages/local-runtime    background process and local IPC
packages/pi-adapter       Pi connector (Direct, /buildframe)
packages/claude-adapter   Claude Code connector (native Mod plugin, /buildframe)
```

Published as `@buildframe/cli` and `@buildframe/pi` (assembled by
`pnpm release:assemble`), plus the `buildframe` Claude Code plugin from the
`buildframe` marketplace in `.claude-plugin/`.

Public history starts at the 0.1.0 preview commit. Earlier history, and every
older commit ID that `.issues/` and `docs/` mention, lives in the private
`juantot9/neoflow-archive` repository.

## Invariants to preserve

- A harness session connects once with `/buildframe`; every Send then goes
  directly to it. One session per repository: the newest `/buildframe` wins and
  the released session is told and does not reconnect.
- Messages go to the agent exactly as written; Send commits before anything
  leaves BuildFrame; nothing is replayed; an unknown outcome stays unknown; no
  Response is fabricated.
- The Workspace Interface stays `execute`, `read`, `subscribe`.
- Never inspect, copy, print, mutate, or delete real user data. Removing code
  never removes `.neoflow/review.json`, legacy receipts, State, or
  Configuration.
- `support/manifest.json` is generated from `apps/buildframe/src/supportManifest.ts`
  (`pnpm release:manifest`); a test fails if it drifts.
- Same-user programs are trusted (the 0.1.0 safety bar); the Claude helper
  still refuses every caller without its launch token.

## Development environment

Node `26.5.1` (`nvm use`), pnpm `11.10.0`. The canonical checks:

```bash
pnpm verify
pnpm risk:state
pnpm risk:runtime
pnpm risk:pi
pnpm risk:dogfood
pnpm release:assemble
```

`pnpm dogfood -- <repository>` rebuilds on launch; start Pi or Claude Code
sessions after BuildFrame is up. A runtime left from an older build blocks a new
launch; `buildframe doctor` names it.

## Frontier

See WF-287's children. At this checkpoint the remaining release work is
running the release gate on the packed tarballs, then publishing those same
tarballs as `latest` (no `next` channel for 0.1.0).
Publishing needs the owner's `@buildframe` npm organization. Node support is
`>=26.4.0 <27.0.0`; CI runs macOS and Linux on 26.4.0 and the newest 26.x.
