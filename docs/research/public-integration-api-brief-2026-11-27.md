# Brief: a public integration API and its skill (WF-322)

Sources: the [research note](public-integration-api-2026-11-26.md) (ACP, MCP,
A2A and the four harnesses' own APIs, from primary sources), the decision in
[ADR 0001](../adr/0001-public-integration-api.md), and the throwaway
prototype on branch `prototype/wf322-wire` (`prototypes/wf322-wire/`).
Approved 2026-11-27: every question with the recommended answer.

## What is already decided

Two levels (basic: deliver and acknowledge; full: turn start and end with the
answer, interrupt, idle/busy). Unverified integrations get the same authority
choices, labelled unverified. The wire is the contract; an SDK is a
convenience. v1 is the same-user Unix socket with no token. A four-field
public manifest. Discovery through `bframe endpoint --json`. A conformance
runner, `bframe integration check`. The skill ships in `@buildframe/cli`.
0.2.0, experimental until two outside integrations work.

## What the research and the prototype found

- **No standard can be the contract.** ACP's client launches the agent; MCP
  servers can't start turns (Claude Code's channels are a Claude-only
  preview); A2A is a remote HTTPS service. None reaches a session the person
  already has open, which is the whole point of BuildFrame.
- **Today's seam is the right shape but too private to publish.** The
  framing (UTF-8 JSON, one per line, 1 MiB) and the same-user socket stay.
  Three version numbers, the bootstrap identity, `hae_` ID prefixes, base64
  bodies, the full capability manifest and the workspace frames don't.
- **The wire is an hour, the harness is the afternoon.** The prototype's
  `integration.py` does the full level in 58 lines of stdlib Python. The
  real work for an author is submitting text to their harness and watching
  its turn, which BuildFrame can't do for them.
- **Prototype findings that change the design:**
  1. idle/busy raced the turn events: BuildFrame delivered the second
     Message before the first turn's `idle` arrived;
  2. acknowledging every event was most of the code (a pending map, a lock,
     a reader thread);
  3. interrupt is naturally two steps: "asked" now, `cancelled` at turn end.

## The proposed v1 wire

JSON-RPC 2.0, one message per line (LF), UTF-8, at most 1 MiB, on the socket
`bframe endpoint --json` names. Method names are ours; outcome words borrow
ACP's `stopReason` where the meaning matches.

| Direction | Method | Kind | Level | Carries |
| --- | --- | --- | --- | --- |
| integration → BF | `buildframe/initialize` | request | both | `protocolVersion: 1`, `workspace`, `manifest {name, version, level, canInterrupt}`; result: `protocolVersion`, `trust: "unverified"` |
| BF → integration | `message/deliver` | request | both | `messageId`, `text` (exact), `sha256`; result: `{accepted: true}` or `{notDelivered: {reason}}` |
| integration → BF | `turn/started` | notification | full | `messageId`, or none for a turn the person started (Q5) |
| integration → BF | `turn/ended` | notification | full | `messageId`, `stopReason` (`end_turn`, `cancelled`, `failed`, `refusal`, `max_tokens`), `answer`, `answerTruncated` |
| integration → BF | `turn/lost` | notification | full | `messageId`: the integration can no longer tell what happened |
| integration → BF | `session/status` | notification | full | `state: idle \| busy`, outside turns only (finding 1) |
| BF → integration | `turn/interrupt` | request | full, `canInterrupt` | `messageId`; result: `{requested: true}`; the outcome arrives as `turn/ended cancelled` |
| BF → integration | `buildframe/released` | notification | both | another session took the connection (Q9) |

BuildFrame expands the public manifest into today's internal capability
contract, marked unverified, with its own defaults (no-start timeout, answer
cap; basic means start and end are unavailable, so the outcome stays
unknown). The internal adapters keep their reviewed contracts.

## Questions

❓ **Q1 - `"jsonrpc": "2.0"`**: BuildFrame always sends it. Should it also
accept messages that leave it out, as Codex's app-server does?

➡️ Yes. Strict in what we send, lenient on this one field in what we accept;
every other envelope rule stays strict.

❓ **Q2 - Who names the Message**: BuildFrame mints `messageId`. Should the
integration be able to return its harness's own ID in `accepted`
(`nativeId`, like Codex's client message ID or OpenCode's `msg_`), kept for
History and support only?

➡️ Yes. Correlation always uses BuildFrame's ID; the native one helps a
person find the turn in the harness.

❓ **Q3 - Turn events are notifications**: Should `turn/*` and
`session/status` be fire-and-forget notifications instead of acknowledged
requests (today's evidence is acknowledged)? An event that names an unknown
Message is dropped and logged, and `bframe integration check` reports it.

➡️ Yes. It halves an author's code (finding 2). The socket is reliable while
it lives; when it drops, unfinished Messages become unknown, which is what
an acknowledgement would have told us anyway.

❓ **Q4 - Basic stops at accepted**: After `accepted`, should a basic
integration report nothing more, with the outcome shown as unknown, rather
than an optional `delivered`?

➡️ Yes. A "delivered" with no turn behind it is the kind of claim the
Truth-Critical Distinction exists to stop. An integration that can say more
is a full one.

❓ **Q5 - A turn the person started**: Should the full level require
`turn/started` without a `messageId` when the person types into the harness,
so BuildFrame marks any open Message's outcome unknown instead of
attributing that turn to it?

➡️ Yes. Without it, the answer to the person's own question could be shown
as the answer to a Message.

❓ **Q6 - Unknown fields and versions**: Should both sides ignore unknown
fields, answer unknown methods with `-32601`, add only optional fields and
new methods within v1, and negotiate anything breaking as v2 in
`buildframe/initialize`?

➡️ Yes. Today's `hasOnlyKeys` strictness suits a private seam we change in
one commit; it breaks every outside integration on the first addition.

❓ **Q7 - Long answers**: Should the answer be capped at 512 KiB, with the
integration cutting it and setting `answerTruncated: true`, so a turn end
always fits one frame?

➡️ Yes. History shows the cut, and the person reads the rest in the
harness.

❓ **Q8 - What `bframe endpoint --json` prints**: `{protocolVersions,
socket, workspace}` for the checkout it runs in. Should the workspace
identity be treated as not secret, with the skill stating the trust model
plainly: any process running as you can connect?

➡️ Yes. That's v1's same-user trust already. A token would protect nothing
from a process that can read your files, and it comes with remote use.

❓ **Q9 - A second integration**: When another integration (or session)
connects to the same checkout, should the newest one take the connection and
the first get `buildframe/released`, as `/buildframe` does today?

➡️ Yes. One rule for every harness: the session you last connected is the
one Messages go to.

❓ **Q10 - Delivering while busy**: Should `accepted` mean "the harness will
run this as its own turn when it's free" (Claude's `prompt.submit` and
Codex's queue already do this), so BuildFrame never gates delivery on
idle/busy? An integration that can't queue answers `notDelivered: busy`.

➡️ Yes. It removes the race in finding 1 instead of fixing it; idle/busy
becomes display only.

❓ **Q11 - Finding an endpoint**: Should an integration first read
`BUILDFRAME_ENDPOINT` (a path to the endpoint JSON) and only then run
`bframe endpoint --json`?

➡️ Yes. The conformance runner and tests need to point an integration at a
scratch endpoint without a running BuildFrame.

❓ **Q12 - The conformance runner**: Should `bframe integration check --
<command>` start a scratch endpoint, run the integration with
`BUILDFRAME_ENDPOINT` set, drive the cases its declared level needs
(deliver, a text that must arrive exactly, a turn, interrupt if declared, a
release), and print pass or fail per case with the frame that failed?

➡️ Yes. It is the test an author runs, and the one our Codex adapter must
pass first.

❓ **Q13 - The SDK comes from Codex**: Should the TypeScript SDK not be
written up front, but pulled out of the Codex adapter once it runs on the
public wire (milestone 7), and published with 0.2.0 only if it stays small?

➡️ Yes. The wire is the contract; an SDK designed before its first user
guesses its shape.

❓ **Q14 - The skill**: Should it be called `buildframe-integration`, hold
the wire table, the two levels, one worked example per level (Python and
TypeScript), the trust model and how to run the check, and be installed with
`bframe skill install [--target claude|codex|opencode|pi]` or printed with
`bframe skill print`?

➡️ Yes. The worked examples come from the prototype, so the skill is tested
against the real check before it ships.

❓ **Q15 - Where "unverified" shows**: Beyond preview, History and doctor,
should the Review header name the integration from its manifest with
`unverified` beside it, e.g. `my-harness · unverified`?

➡️ Yes, once per header, in the muted tone: it is a fact about the
connection, not a warning.

## Build order after approval

1. The public wire inside the runtime, beside today's seam (milestone 5):
   endpoint command, initialize, deliver, the turn notifications, release.
2. `bframe integration check` and its cases.
3. Codex moves onto the public wire and must pass the check (milestone 7).
4. The skill, with the worked examples run against the check (milestone 6).
5. OpenCode and Claude Code move; Pi last; the private adapter seam is
   removed when nothing uses it (milestone 8).
