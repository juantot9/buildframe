---
id: WF-322
title: "A public integration API and its skill"
status: open
labels:
  - wayfinder:map
parent: WF-289
assignee: juanan
blocked_by: []
created: 2026-11-26
---

## Destination

Any harness, and later any other tool, can receive BuildFrame Messages over a
documented public contract, and an agent can read one skill and wire an
integration up in an afternoon. Our four adapters run on the same contract.
Decision record: [docs/adr/0001-public-integration-api.md](../docs/adr/0001-public-integration-api.md).
Ships in 0.2.0 as experimental; not in 0.1.0 (gate 2026-12-02).

## Decided (owner, 2026-11-26, grilling)

- First audience: harnesses. Two levels: basic (receive and acknowledge, the
  outcome stays unknown) and full (start, end, answer, interrupt, idle/busy).
- Unreviewed integrations are allowed as **Unverified Integrations**: the same
  authority choices as reviewed adapters, labelled "unverified" in preview,
  History, doctor and the support manifest (their own group).
- The wire protocol is the contract; a TypeScript SDK is a convenience.
- v1: same-user local Unix socket only, no token. TCP, WebSocket, remote and
  tokens wait for a real request.
- A short public manifest (name, version, level, can interrupt), mapped to
  the private internal Capability Manifest.
- Discovery through `bframe endpoint --json`; the socket path stays private.
- A conformance runner: `bframe integration check`.
- The skill is for integration authors, lives in the repo, is written with
  writing-for-agents, ships in `@buildframe/cli`; `bframe` prints or
  installs it.
- Experimental until two outside integrations work.

## Milestones

1. ADR and the CONTEXT.md term (Unverified Integration).
2. Research (primary sources), `docs/research/public-integration-api-2026-11-26.md`:
   - can ACP, MCP or A2A attach to a session the person already has open;
   - whether they carry what BuildFrame needs: exact text, turn start and end
     tied to the Message, the answer, interruption, idle/busy;
   - how Codex's app-server, the Claude Agent SDK and OpenCode's server
     expose "send a prompt to a running agent";
   - whether publishing today's JSONL seam as v1 is viable, and what it needs.
3. A throwaway Python prototype (outside the repo) that receives a Message
   and reports start and end over the proposed wire.
4. Brief with questions; nothing is built before the owner approves it.
5. API v1 (endpoint, public manifest, the wire beside today's seam).
6. `bframe integration check`.
7. Codex moves onto the public API and passes the check.
8. The skill, its worked examples run against the check; the TypeScript SDK
   pulled out of the Codex adapter if it stays small.
9. OpenCode and Claude Code move; Pi last; the private seam goes when
   nothing uses it.

## Done

- 1 (this commit): ADR 0001, Unverified Integration in CONTEXT.md.
- 2: research note. Verdict: no standard reaches the open session (ACP
  spawns the agent, MCP can't start turns, A2A is remote HTTPS);
  recommendation is our own methods over a JSON-RPC 2.0 envelope, one per
  line, on the existing socket. Ten open questions for the brief.
- 4: brief `docs/research/public-integration-api-brief-2026-11-27.md`,
  approved 2026-11-27 with all 15 recommended answers (the order above
  follows it).
- 3: prototype (branch `prototype/wf322-wire`): `integration.py`, 58 lines of stdlib
  Python, does the full level against a fake BuildFrame (initialize with
  the public manifest, deliver, accepted, turn start/end with answer,
  interrupt, idle/busy). Verdict: the wire is an hour, not an afternoon; the
  afternoon is the harness side. Found for the brief:
  - idle/busy races turn events: msg-2 was delivered before msg-1's `idle`
    arrived. Turn end should imply idle, or BuildFrame queues until idle.
  - Every event being an acknowledged request is most of the code (a
    pending map, a lock, a reader thread); notifications would halve it.
  - Interrupt is two steps (`interrupting`, then `turn/ended cancelled`).
  - The basic level would be about 25 lines.

## Branch

`main`; `planning` merges it in.
