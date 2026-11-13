---
id: WF-069
title: "Decide whether the Workspace Writer vocabulary drift obliges a rename"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: [WF-064]
created: 2026-08-07
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

`CONTEXT.md` is the canonical vocabulary authority and defines **Workspace
Writer** as "the single local Neoflow process authorized to commit Authoritative
Workflow State for one Workspace Identity". The implemented concept never uses
that name. Decide whether the code adopts it, and if so how far the rename
reaches.

This is **X-07**, the one ledger finding whose proposed disposition is not a
single value — it reads `accepted or fixed`, because a rename is cheap and
mechanical but lands a large diff on source that Gate A and Gate B just proved,
and no defect traces to it.

Three sub-questions, in the order they bind:

1. **Does the canonical term win at all?** The alternative is that `CONTEXT.md`
   is amended to the implemented vocabulary, which is a smaller diff and a
   different kind of loss.
2. **If it wins, how far does the rename go?** The concept appears under three
   distinct words — owner, authority, and holder — and only one of them is a type
   name. A rename that fixes the type and leaves the state and error vocabulary
   spelled two other ways buys much less than the full sweep.
3. **Is a vocabulary gate wanted, or is this a one-off?** The evidence is settled
   that the code matches `CONTEXT.md` everywhere else a concept is implemented,
   so drift is currently 1 in N rather than a trend. Deciding "one-off" here is
   the same call the linter and unused-export tickets already made twice — revisit
   on evidence of growth, never on a schedule — and saying so keeps the answer
   consistent with them.

## Established facts

- **The drift is measured, not impressionistic.** `WorkspaceRuntimeOwner` appears
  22 times, `authorityUnavailable`/`AuthorityUnavailable` 21, and
  `holderIsGone`/`ownerHandle` 13 — **56 occurrences of one canonical concept
  under three words**, with the canonical word `Writer` used nowhere. Two files:
  `packages/workspace/src/workspaceIdentity.ts` and `runtime.ts`.
- **Severity low, category maintainability.** The cost the finding names is that
  reading the lock registry requires knowing all three mean the same thing.
- **No defect traces to it.** So under this map's evidence rule — a finding
  supported only by taste is `accepted`, not `fixed` — the burden is on `fixed`,
  and legibility of a lock registry is the argument that has to carry it.
- **This is a policy question, not just one finding's disposition.** The map's
  destination requires the general policy questions the audit raises to be
  answered, and this is one of two the map named. It is ticketed separately from
  the Workspace disposition pass so it is decided deliberately rather than in
  passing among nineteen others.
- **`/domain-modeling` is the skill for this one**, per the map's Notes, and
  `/grilling` for the cost side.
- **Renaming is explicitly on the list of things the deepening gate's learning
  rule rejects** when no finding demanded it — **P16C** names "rename that no
  finding demanded" alongside speculative abstraction and style-only churn. A
  finding *does* demand this one, which is why it is decidable rather than
  foreclosed; but the rule sets the bar the decision has to clear.

## Blocked by

- [Disposition the findings best decided ahead of the rest](./WF-064-disposition-do-first-findings.md)

## Resolution comment

**Accept X-07. Keep both `CONTEXT.md` and the implementation names unchanged,
and add no vocabulary gate.** The finding's central premise is false: owner,
authority, and holder do not spell one concept three ways.

### The three families are different concepts

- **Workspace Writer** is the domain role already defined by `CONTEXT.md`: the
  single runtime process authorised to commit Authoritative Workflow State for
  one Workspace Identity. Active source already says `writer` at the role's
  consequential sites — the writer-process entrypoint, writer lease,
  `runtime-writer-unavailable` diagnostic, and runtime-owned writer guards.
- **`WorkspaceRuntimeOwner`** is the launcher-only lifetime handle held inside
  that process. It bundles the opened Workspace, reviewed Adapter host and State
  lifetime and releases them through `dispose()`. The handle represents ownership
  of those resources; it is not a second name for the process role.
- **`WorkspaceAuthorityUnavailableDiagnostic` and `authorityUnavailable`** report
  failures to resolve, lock, read or write Workspace **Identity authority** — the
  marker and registry. `workspaceIdentity.ts` explicitly calls the marker the
  identity authority. None of those paths acquires or represents the
  Authoritative State writer lease.
- **`LockOwner`, `holderIsGone`, `ownerFile`, and `ownerHandle`** describe the
  short-lived registry-lock owner used during identity reconciliation. That lock
  can exist before the Workspace Writer starts and is released when bootstrap
  reconciliation finishes.

Reading the lock registry therefore requires understanding one local lock
protocol, not remembering three aliases for Workspace Writer. Renaming its owner
and holder vocabulary to `Writer` would make the code less accurate.

### The count and scope corrections

The finding's arithmetic reveals how the conflation happened but does not support
it. `WorkspaceRuntimeOwner` occurs **22 times in production source** — 16 in
`packages/workspace/src/runtime.ts` and 6 in
`packages/local-runtime/src/lifecycle.ts` — plus 30 occurrences in tests, 52
across eight TypeScript files in total. The authority family contributes 21
production occurrences across `workspace.ts` and `workspaceIdentity.ts`; the
holder/handle pair contributes 13 in `workspaceIdentity.ts`. So 56 was a correct
sum of selected production tokens and an incorrect count of one concept, while
"two files" omitted both `lifecycle.ts` and `workspace.ts`.

The statement that canonical `Writer` vocabulary is used nowhere is also false:
it is absent only from the selected identifier family, while active comments,
diagnostics, guards and tests use it for the actual writer role.

### Disposition and policy

X-07 is **`accepted`, Rank: n/a**. No demonstrated drift remains after the four
concepts are separated, no defect traces to the names, and a rename would collapse
rather than clarify the model. `CONTEXT.md` remains authoritative and needs no
implementation detail added to distinguish an internal lifetime handle or lock
record.

Add no automated vocabulary gate. This case demonstrates why a token-level gate
would be harmful: it would encode the false rule that each domain term must appear
in every implementation identifier near it. Revisit enforcement only if repeated
real drift appears; do not schedule it.

No code, glossary, Interface, or configuration changed. The corrected ruling is
recorded on X-07 in `docs/audit/pre-p17-codebase-findings.md` and linked from the
parent map.
