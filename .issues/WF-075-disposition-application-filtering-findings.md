---
id: WF-075
title: "Disposition the Application text-filtering findings"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-08
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Settle the disposition and the within-package rank of the **3** Application
findings about text that reaches the terminal and the rules that filter it.

**A-02**, **S-05**, and **S-07**.

One of three tickets from the split of
[Disposition the Application findings](./WF-067-disposition-application-findings.md);
the split's reasoning and the full finding-to-ticket mapping are in its resolution
comment. **Rank within the Application band, not within this ticket.**

All three are proposed `fixed`. The decision on each is whether that survives the
map's evidence rule — a finding supported only by taste is `accepted`, not `fixed`.

## Established facts

- **This is the seam the split was named for, and it exists because two of these
  findings contradict each other without either saying so.** **S-05**'s evidence
  states that `label()` is where `safeText` strips C0 and C1 centrally, "so every
  *other* rendered string, including hostile commit subjects and branch names, is
  already neutralised". **S-07** is precisely a rendered string that does not pass
  through `label()`. **S-05's central claim about the completeness of the defence is
  disproved by the neighbouring finding**, and neither cites the other. Decide them
  together or repeat the error.
- **The generalisable shape is one rule per surface, each with an exception.**
  `label()`/`safeText` for rendered text, with two exceptions (**S-05**'s
  `TextareaRenderable` path, **S-07**'s box titles); `removeAnsiStyles` for no-color
  output, with the exception that it is stateless across chunk boundaries
  (**A-02**). Whether the answer is three repairs or one relocated primitive is this
  ticket's real question, and no finding asks it.
- **A-02's own function is not the defect and was already tested.** `removeAnsiStyles`
  was extracted and run against 17 edge cases and all 17 produced the expected
  output; the documented contract holds exactly. The defect is that
  `createNoColorOutput` applies it per `write` chunk. **The finding names its own
  next step** — measure OpenTUI's write granularity to establish whether this is live
  today — and says it is worth doing first. That is a measurement this ticket can
  make.
- **Two of the three carry an unconfirmed render-time question, and neither
  confirmed it.** S-05: whether a surviving control character reaches the terminal
  uninterpreted depends on how OpenTUI's native renderer writes cells, "not
  confirmed". S-07 is unexploitable today **only because the Workspace escapes
  control characters out of paths** — the protection is in a different Module than
  the gap. Both dispositions can be settled without answering the render question,
  and S-05 says so explicitly; check that claim rather than inheriting it.
- **The cross-package note belongs here.** S-07's current defence lives in
  `packages/workspace/src/workspaceEvidence.ts:1493`–`:1511`, so any ruling that
  relies on it is a constraint on the Workspace, not on this package. The Workspace
  band is fully settled, so a constraint recorded here has no ticket left to absorb
  it — record it on the finding and in the ledger's obligations block.
- **S-05 additionally has a non-security half that is not about filtering at all.**
  A pasted `NUL` makes `synchronizeQuestionEditor` return `false`, so the model stops
  tracking the textarea and the two diverge silently. The finding proposes one repair
  for both halves. **Where a finding proposes one repair for two defects, that is a
  claim** — the counterpart of the rule **W-10** and **X-01** failed on.

## Method

**A ratification pass is not a reading pass.** Every claim these findings make about
*completeness* — "the one rendered text the view never filters", "every other
rendered string is already neutralised", "the one text path that does not pass
through `label()`" — is the exact claim class this ledger has repeatedly found
wrong, and one of them is already known to be wrong. Enumerate the render paths
before ruling on any of the three.

## Record format

**Settled and not reopened here.** `**Disposition:**`, `**Rank:**`, an optional
`**Pulled ahead:**`, and `**Decided:**`, specified in the ledger under **How a
settled finding is recorded**. Rank is a band — `first`, `normal`, or `last` — with a
written reason required for `first` and `last` only, and ties carry no meaning. An
`accepted` finding records `Rank: n/a` rather than a band.

## Resolution comment

**All three `fixed`, none pulled ahead, one severity corrected down, and none of
the three survived with its stated mechanism intact.** This opens the Application
band. Ledger now **30 of 46 settled**; 30 + 16 proposed = 46, and both counts were
re-run after the last edit.

### The enumeration came first, and it is the reusable output

The ticket's Method said to enumerate the render paths before ruling on any
finding, because all three rest on a completeness claim about that surface. Doing
it first was right, and the enumeration is now written into **S-07** rather than
left in a session:

| Surface | Filtered? |
| --- | --- |
| `Text.content` via `label()` | `safeText` on the `string` arm; the `StyledText` arm bypasses it |
| `Box.title` — **four** sites | no |
| `Box.bottomTitle` — one site | no |
| `TextareaRenderable` | no (**S-05**) |

Two things fell out of it that no finding had. The `StyledText` bypass is **already
recorded** in the Ruled-out entry as unreachable, and that re-verified: no
`StyledText` value is constructed anywhere in `apps` or `packages`. But
`bottomTitle` is a text-bearing prop nobody had counted — `BoxOptions` declares
both `title` and `bottomTitle` (`Box.d.ts:13`–`:17`) — so **S-07's class-closing
fix, as proposed, closes half the class**.

### A-02 — the trigger is now a number, and the number moved the severity

The finding named its own next step: measure OpenTUI's write granularity. Done, and
the mechanism turned out to be fully determined rather than probabilistic. A
renderer given a stream other than `process.stdout` pipes bytes through a
`NativeSpanFeed` with `chunkSize: 64 * 1024` and `autoCommitOnFull: true`
(`zig-structs.d.ts:149`–`:164`), and the feed's handler issues **one `write` per
span** (`index.node.js:7221`–`:7225`). Three measurements against the real
renderer with an instrumented stream:

- **The boundary does not accumulate across frames.** 100 frames × 2,616 bytes =
  261,600 bytes, four times the chunk, produced **100 writes — one per frame, none
  at 65,536**. This was the reading that would have made the defect continuous
  rather than rare, and it is false.
- **A single frame over 64 KiB does split, at exactly 65,536.** 450×110 → a
  52,674-byte frame in one write; 500×130 and 600×160 → two writes per frame, the
  first exactly 65,536.
- **So the trigger is a terminal size**: no-color frames cost 1.0–1.36 bytes per
  cell, putting the threshold at roughly **62,000–65,000 character cells** — about
  500×130, some eight times an ordinary terminal's area.

The severity scale reserves medium for conditions "this product will actually
meet". A 500×130 terminal is not one, and the consequence — a colour escape
leaking, bounded by the next preserved reset — is the low row's "costs clarity more
than behaviour". **Corrected to low**, the ledger's second severity correction
after W-13 and the first made by measuring a trigger rather than re-reading an
argument.

Two facts kept alongside. The filter is **not** vestigial: a 200×50 no-color frame
carries **148 SGR sequences, 12.03% of its bytes**, because OpenTUI emits explicit
`ESC[38;2;255;255;255m` and `ESC[49m` even with no colour set — the file's comment
about the missing terminal-default mode is accurate. And **the end-to-end leak was
not reproduced**: 20 frames at 500×130 through the real `createNoColorOutput`
leaked zero styles. That is recorded as not established, not as a negative, because
the frame's byte layout is fixed frame to frame — **twenty frames with the same
layout are one sample, not twenty** — and an attempt to sweep the cut offset across
layouts did not produce splits and was not chased.

### S-05 — right about the outcome, wrong about the module, and its repair changes nothing

The ticket flagged the "one repair for two defects" claim. The answer is sharper
than the question: **three of the finding's four claims are wrong, and the repair
is a no-op for the defect it targets.**

- **The route it names is dead where the damage lands.** `#onPaste`
  (`reviewingView.ts:2343`–`:2348`) returns early whenever the composer textarea
  exists — the reason is written in the code — so `reviewingInputFromPasteEvent`
  **is never called** while the composer is open. The outcome still holds, because
  OpenTUI's `TextareaRenderable.handlePaste` applies the *identical* expression
  (`index.node.js:8379`–`:8381`), but the filtering belongs to the renderer.
- **"The two diverge silently" is false.** `synchronizeQuestionEditor` has exactly
  one caller, and on `false` it **rolls the textarea back** to `editor.body` and
  restores the cursor (`:2400`–`:2413`). The real defect is a silent *discard* —
  the paste is reverted with no notice, where the neighbouring 64 KiB rejection
  sets one.
- **The proposed repair cannot reach the composer**, and its two live consumers
  need it least: Review search already strips every
  `[\u0000-\u001f\u007f]` (`reviewingModel.ts:2090`) and the comparison input
  already allow-lists (`:2169`–`:2170`). The asymmetry is thus **already closed
  everywhere the named route runs**.
- **And the typed rule cannot be applied verbatim.** `printableSequence` does not
  filter, it **rejects the whole sequence** below `0x20`. Run against realistic
  pastes it accepts a one-liner and drops two-line text, indented code, a trailing
  newline, and anything with a `NUL`.

So the repair relocates to the composer boundary and changes shape to **strip, not
reject**, following `:2090`, which this codebase already uses. **The ticket's
question answers yes for that repair and no for the proposed one**: stripping `NUL`
at the composer boundary makes `reviewingModel.ts:482`'s branch dead, while the
proposed change leaves both halves untouched.

Three smaller measurements: a **lone `ESC` consumes the character after it**
(`A<ESC>B` yields `"A"`), so it destroys data rather than surviving; **C1 CSI is
stripped but C1 OSC is not**, so "only OSC and CSI sequences" is asymmetric across
the C1 introducers; and the composer binds `return`/`kpenter`/`linefeed` to
`submit` (`:2453`–`:2457`), so **typing can never introduce any control character
at all** while paste can introduce `LF` — a sharper statement of the asymmetry than
the finding gives.

### S-07 — understates itself three ways, and its fix is a trade rather than a superset

- **Four `title` props, not three, and two carry repository text, not one.** The
  uncounted one is the expanded question card (`:779`), built at `:764`–`:766` from
  `location` to `questionFileLabel` (`:494`–`:501`) to the same `displayPath`. It
  is the *more* reachable of the two: reading a Question thread needs no composer
  open. "One call site changes behaviour today" is **two**.
- **`bottomTitle` is a fifth prop on the same door** (`:784`), literal today.
- **The fix location is confirmed**: all five props sit inside `borderedBox` calls,
  and the file's other 33 `Box(` constructions carry no title — which is what makes
  the class-closing claim true *today* and names the door the fix leaves open.
- **The decisive measurement: `safeText` and `evidencePath` each catch what the
  other misses.** `safeText` neutralises C1 and lets **`CR` and `LF`** through —
  `CONTROL_PATTERN` omits `U+0009`, `U+000A`, `U+000D`, and only tab is handled
  separately. `evidencePath` neutralises `CR` and `LF` and lets **C1** through. So
  routing titles through `safeText` **adds C1 coverage and gives up `CR`/`LF`
  coverage**. `decodeDiffRow` appending a newline replacement is the codebase
  compensating for that gap at exactly one `label()` call site.

**The heading was corrected**, from "Box titles are the one rendered text the view
never filters" — the uniqueness it asserts is contradicted by its own evidence
body, which positions titles as a *second* path alongside S-05's textarea. The
seventh axis again, one session after X-06 established it.

### The cross-package obligation, and it does not expire

The ticket asked for S-07's Workspace dependency to be recorded because the
Workspace band has no open ticket left to absorb it. The measurement makes it
stronger than anticipated: `evidencePath` is **not** a stopgap the Application
repair retires — it is the **only** thing covering `CR` and `LF` on box titles,
before the fix and after it. Recorded on **S-07** and in the ledger's Summary as a
**P16C** constraint, not P16B: whoever changes `evidencePath` owes the
Application's titles a replacement first.

### Recorded in passing, not filed

`tsc --noUnusedLocals` against the v1 sources reports **8 errors across 4 files**
(`fg`, `bg` and `ReviewDiffAvailableView` in `reviewingView.ts`; `decodedBody` in
`reviewingModel.ts`; four more in `harnessInteraction.ts` and `projection.ts`).
[Decide the linter and formatter posture](./WF-055-decide-linter-formatter-posture.md)
settled on adding that flag and `noUnusedParameters` to `tsconfig.v1.json`; neither
is there yet, and with `noEmitOnError: true` already set, **the flags and the
deletions must land in the same change**. Folded into the Summary as an obligation
rather than opened as a finding, matching S-01, L-04 and X-06 — the count stays at
**46**.

### Rank

**A-02 is `last`** — the only Application finding whose trigger is measured to need
a terminal roughly eight times standard area. **S-05 and S-07 are both `normal`,
and the tie is meant**: both are view-boundary filtering repairs and the evidence
separates them on nothing. The format's own rule is that a rank supported only by
taste is the same defect as a disposition supported only by taste, so no ordering
was invented.

### Two rules for the passes behind this one

- **A finding can be right about its outcome and wrong about its module.** S-05
  describes correctly what reaches `editor.body` while naming a function that is
  bypassed on that path — so ratifying the outcome would have ratified a repair
  that changes nothing. **Three of the four corrections in this pass came from
  reading one level out from the cited line**: the caller of
  `synchronizeQuestionEditor`, the caller of `reviewingInputFromPasteEvent`, and
  the callers of `printableInput`.
- **Two filters are not automatically ranked.** Treating one as the real defence
  and the other as luck is what hid a complementary pair for two sessions. Running
  both over the same input took a minute and inverted the conclusion.

### Verification

No code changed. All probes ran in the session scratchpad against the repository's
`node_modules` and the already-built `apps/neoflow/dist`, with `git diff --name-only`
confirming no `.ts`, `.json` or `.mjs` file in the repository was touched. The
`--noUnusedLocals` run used `--noEmit`.
