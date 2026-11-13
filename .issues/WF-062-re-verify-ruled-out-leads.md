---
id: WF-062
title: "Re-verify the ledger's ruled-out leads"
status: closed
labels:
  - wayfinder:task
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-06
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

The ledger's **Ruled out** section dismisses 27 leads with their reasons recorded, plus one ruling since found wrong. How many of the 27 rest on reasoning that does not actually establish what it claims—and is a full re-check worth its cost, a targeted one, or none at all?

## Established facts

- **One ruling in 28 was wrong, and it was found by accident.** "Dead `ReviewingModelEffect` variants — not confirmed; there are none" established that every union member has a dispatch arm in `#runEffects`, which is the *consumer* side, and concluded that none is unreachable. Dead means never **constructed**. Confirmed afterwards as **A-05**, an unreachable 100-line feature path. It surfaced only because [Decide whether the `reviewingModel` refactor is in scope](./WF-058-decide-reviewingmodel-refactor-scope.md) happened to depend on that exact ruling; nothing systematic found it.
- **No ruling has been independently re-checked.** The section exists so that no lead is investigated twice, which makes a wrong ruling *load-bearing*: it actively prevents the re-investigation that would catch it.
- **The confirm rate on the original leads was close to half**, as the ledger's **Summary** records. The sweep was already in a regime where a lead was about as likely to dissolve as to survive—which is exactly where a too-easily-satisfied test does the most damage.
- The wrong ruling is **retained** in the section and marked as wrong, faulty reasoning intact, so the error class is legible without reading git history.

## Notes

- **Search for the error class, not for the specific bug.** A-05's ruling failed by testing a *necessary* condition and reporting it as *sufficient*. The cheap first pass is to re-read all 27 rulings asking only **does the stated evidence establish the stated conclusion**, re-doing no investigation. That is a reading task over one file, not a second audit, and it should be costed before anything heavier is considered.
- **A ruling that is sound but thin is not a finding here.** The map's evidence-driven rule holds: only a ruling whose reasoning cannot support its conclusion is re-opened, and re-opening means either confirming the lead properly or re-ruling it with better evidence.
- **"None worth re-checking" is a legitimate outcome.** One error in 28 is a rate, not a pattern, and the cost of full re-verification is real. Accepting the section as it stands, with the known error rate recorded in the Summary, resolves this ticket honestly.
- Findings confirmed here go to the same ledger under the same standard, and the **Summary** counts move with them. The severity tally is checkable mechanically: `awk` over `^- \*\*Severity:\*\*` lines above `## Ruled out`, taking each line's first word, with the "not a defect" entries counted as the fact-only ones.
- Takeable in parallel with [Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md); it depends on nothing. It overlaps [Audit dead code, unused exports, and test quality](./WF-060-audit-dead-code-and-test-quality.md) only in the single `apps/neoflow` dead-code ruling, which **A-05** already settled. The other two `apps/neoflow` entries in that section—command-normalization idempotency and manifest polling—are correctness rulings and are in scope here like any other.
- No code changes, per the map.

## Resolution comment

**The full re-check was worth doing, it is now done, and it should not be repeated
on a schedule.** All 27 rulings were re-read against one question — does the stated
evidence establish the stated conclusion — and the 10 that failed that reading were
taken back to the code. **Two conclusions were wrong**, both now confirmed
findings; **three more were right on reasoning that could not support them** and are
re-ruled in place; **one count was wrong**; the remaining 21 stand as written. The
error rate is **2 in 28**, and it is recorded in the ledger's **Summary** alongside
what the re-check covered, so the section can now be trusted at a stated standard
instead of an assumed one.

### The two wrong conclusions

**A-06 — a visible current Review re-runs three `git` processes every 750 ms,
forever.** Medium, performance. `#scheduleCurrentSourceVerification`
(`apps/neoflow/src/reviewingApplication.ts:555`) arms a 750 ms timer that
`#verifyVisibleCurrentSource` re-arms from its own `finally` (`:607`), so it is a
self-rescheduling poll for as long as the route is a Review with `current`
retention. Each tick reads `review.manifest`, which reaches `#readSnapshotStatus`
(`packages/workspace/src/projection.ts:1319`) → `current-changes.verify` →
`inspect` (`workspaceEvidence.ts:2420`), and `inspect` spawns **three** `git`
processes including a whole-working-tree `status --porcelain=v2`. The
`#snapshotStatusReads` map deletes its entry in a `finally`, so it dedupes
concurrent callers only and caches nothing between ticks. Proposed **deferred** to
the Live Changes package, whose accepted design replaces Application-side polling
with Workspace-owned hint-driven verification — with the note that the cadence
alone is one constant, and that this loop unattendedly re-enters the exact `runGit`
path of **W-07** (high) 80 times a minute.

The ruling it corrects said "no polling exists" in `apps/neoflow/src`, on a `grep`
for `setInterval`, `poll`, `watch`, `interval`, `mtime`, `stat(` reported as
returning nothing. `interval` returns two hits — the search was case-sensitive
against `CURRENT_SOURCE_VERIFICATION_INTERVAL_MS`. The file-scoped half of that
ruling is correct and kept: `userConfiguration.ts` really does not poll.

**S-07 — box titles are the one rendered text the view never filters.** Low,
security. `borderedBox` (`reviewingView.ts:265`) spreads its caller's options into
`Box`, so a `title` never meets `safeText`; one of the three titles interpolates
`editor.fileLabel` (`:1390`), a repository file path, in the reachable
`create-question` composer. It is **not exploitable today**, and the reason is in
another package: `evidencePath`
(`workspaceEvidence.ts:1493`) escapes C0 and DEL out of every path string before it
leaves the Workspace. Proposed **fixed** — filter inside `borderedBox`, which closes
the class rather than the instance. The margin is thin: commit subjects are decoded
raw (`workspaceEvidence.ts:1005`) and are safe only because they render through
`label()`.

### The three re-rulings

- **OSC 52 clipboard write** — conclusion holds; the evidence never supported it.
  It rested on the base64 *alphabet string* being present in `libopentui.dylib`,
  which any base64 implementation must contain and which says nothing about whether
  that function encodes that input. Re-ruled on the call graph instead:
  disassembling the exported `_copyToClipboardOSC52` shows it calling
  `_base64.Base64Encoder.encode`, and the `]52;` framing is native. Residual gap
  stated: the entry point dispatches on a terminal-capability byte and only the
  traced branch was verified.
- **Escape-sequence injection through rendered repository content** — conclusion
  holds; the stated mechanism is false. `TextareaRenderable` is not the only path
  outside `label()`, so the claim that no per-call-site audit was needed rested on
  an enumeration that had missed one. Produced **S-07**.
- **A hostile Pi response reaching a dangerous operation** — conclusion holds today
  for a reason the ruling never gave, and that reason **expires**. The ruling checked
  that the adapter contains no sinks of its own, which is the declaring module, not
  the flow. What actually makes it true: nothing imports
  `@neoflow/pi-adapter-source` — only build, typecheck and probe scripts reference
  it, and `support/manifest.json` carries `"piAdapterPackage": null`. The first
  commit that wires it in invalidates the ruling, and the re-check then is a forward
  trace to each reachable sink.

### The corrected count

**Unbounded polling in test helpers** — conclusion unchanged, count wrong. There are
**six** wait helpers in the active suites, not four; all six are bounded and throw,
though one is deadline-bounded (`performance.now() + 10_000`) rather than
attempt-bounded, which the original wording did not describe. No active suite
contains a `while (true)`, `for (;;)` or `while (1)`.

### What the errors have in common, which is the reusable part

Every citation in the section checked out. Not one error was a wrong line number or
a misread file. All of them were the same move: **reporting a necessary condition as
a sufficient one.** A consumer-side check for a producer-side property (**A-05**). A
token `grep` for a behaviour (**A-06**). A string in a binary for a call (OSC 52).
A module's own sinks for a value's reach (Pi). An enumeration asserted where the
conclusion's whole value was that the enumeration was complete (rendered content).
The practical form: when a ruling's worth is that it makes further investigation
unnecessary, the claim doing that work is finding-grade and needs evidencing like
one — and a negative result has to state the search that produced it precisely
enough to be wrong (which tokens, which case sensitivity, which roots).

Three rulings were re-verified and *improved the ledger's confidence* rather than
changing it, and are worth naming because they show the standard is reachable: the
request-ID leak ruling checks add-sites against remove-sites and says "no path adds
an entry that nothing removes"; the private-state path-traversal ruling verifies
that each regex runs *before* its `path.join` rather than merely existing; and the
Local Runtime socket ruling verifies after acting (`chmod`, then re-`lstat` for
type, owner and mode) and states the residual `listen`→`chmod` window instead of
eliding it.

### Should this be repeated?

**No, and not because the section is now clean.** The re-check cost one working
session and found two findings, one of them medium — a good return, but it was
front-loaded: the errors clustered in rulings that dismissed a *behaviour* by
searching for a *token* or a *type*, and those have now all been re-read. A second
pass over the same 28 entries would re-read the same reasoning. What is worth
carrying forward is not a scheduled re-audit but the standard, applied when a
ruling is *relied on*: any future ticket that narrows its own scope because this
section ruled something out should re-derive that ruling first, exactly as
[Decide whether the `reviewingModel` refactor is in scope](./WF-058-decide-reviewingmodel-refactor-scope.md)
accidentally did. The Pi-response entry is the one with a known expiry, and it says
so in place.

Asset: `docs/audit/pre-p17-codebase-findings.md` — **42 findings** (1 high,
16 medium, 23 low, 2 fact-only), 28 **Ruled out** entries of which two are retained
as wrong and three carry re-rulings. The Summary tally was reproduced mechanically
before and after.
