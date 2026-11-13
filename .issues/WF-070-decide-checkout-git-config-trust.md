---
id: WF-070
title: "Decide whether the Workspace treats a checkout's own Git configuration as untrusted input"
status: closed
labels:
  - wayfinder:grilling
parent: WF-053
assignee: juanan
blocked_by: []
created: 2026-08-07
assets:
  - docs/audit/pre-p17-codebase-findings.md
---

## Question

Every `git` command the Workspace runs reads the checked-out repository's own
`.git/config`, and some configuration keys are *commands* that Git then executes.
Two such keys are now confirmed live on the Workspace's `status` invocation.
Neither was found by enumeration — each was found by someone thinking of it.

Decide the standing rule: does the Workspace harden **per confirmed vector**, one
key at a time as each is discovered, or does it adopt a **general posture**
toward a checkout's configuration as untrusted input?

The two candidate postures, so the discussion has something concrete to react to:

- **Per-vector.** Add the argument that closes each key as it is confirmed. Cheap
  per fix, and each one is verifiable. Its cost is that the rule is only ever as
  complete as the last person's imagination, and nothing tells a future reader
  that the surface was never enumerated.
- **General.** Decide once that a checkout obtained as a *directory* is untrusted,
  and derive the mechanism from that — a scan of `.git/config` against a
  known-dangerous key list before the first command, a normalized environment
  that neutralizes classes of key rather than instances, or an explicit operator
  consent gate on first open. More expensive, and each mechanism has a
  behavioural cost that has to be paid knowingly.

This is a general policy question of the kind this map's destination says it
answers, and it is deliberately **not** the fix design for **S-01** — that
belongs to **P16C**.

## Established facts

- **Two vectors are confirmed, both on Git 2.51.2, both reproduced against the
  exact argument vector at `workspaceEvidence.ts:877`.** `core.fsmonitor` runs a
  command during the index refresh, closed by `-c core.fsmonitor=`. A
  `filter.<name>.clean` driver, selected by the repository's tracked
  `.gitattributes`, runs a command during the same call and is **not** closed by
  that argument.
- **The second vector is the more reachable of the two.** It fires whenever the
  index stat cache is invalid rather than only when content changed, so the first
  `status` after an archive extraction or a directory copy — which is exactly the
  delivery method **S-01** describes — runs it across the whole tree.
- **Per-key blanking does not generalize.** The driver name is attacker-chosen,
  so there is no finite set of `-c filter.X.clean=` arguments to add.
- **A name-independent suppression exists and its cost is unmeasured.**
  `GIT_ATTR_SOURCE=<empty tree>` closes the clean-filter vector by making Git
  read no attributes. The probe that tried to price it was confounded: `status`
  already reports a legitimately-filtered file as modified when its cleaned
  content matches the index, so the false-positive question is open. **Re-measure
  before leaning on this**; do not carry the suppression forward as free.
- **Four keys have been checked in total** — `core.fsmonitor`, the clean filter,
  `diff.external`, and `core.pager`/`core.editor`. The last three are closed on
  this invocation. Four is not an enumeration, and Git has many more keys whose
  values are commands.
- **The environment is already centralized.** `processEnvironment`
  (`workspaceEvidence.ts:624`) sets `GIT_NO_LAZY_FETCH`, `GIT_OPTIONAL_LOCKS`,
  `GIT_PAGER`, `GIT_TERMINAL_PROMPT`, `LANG`, and `LC_ALL` for every `runGit`
  call, and `runGit` spawns through a single `spawn('git', …)`. A general posture
  has one obvious place to live, and per-call-site hardening would be the
  departure from the existing pattern rather than the continuation of it.
- **There is a second `runGit`.** `workspaceIdentity.ts:209` runs only
  `rev-parse`, through `execFile` with its own `gitEnvironment()`. Any general
  rule has to cover both or say why it does not.
- **The assumed attacker is already written down** in the ledger's `security`
  category, along with what the v1 application trusts (**S-06**). Start there
  rather than re-deriving a threat model.

## Notes

Reachability for both confirmed vectors requires the operator to obtain a
repository *directory* with its `.git` intact — an extracted archive, a copied or
synced folder, a restored backup — and open it in Neoflow. `git clone` does not
carry `.git/config` from the remote. Whether that precondition makes the whole
class `accepted` is itself a legitimate outcome of this ticket, provided it is
decided rather than assumed.

## Resolution comment

**Adopt the general posture. Checkout-controlled Git configuration is untrusted
input for executable effects, and opening a checkout is not consent to run a
command it selects.** The directory-delivery precondition narrows reachability
and keeps the finding at medium; it does not turn an inspect action into execution
intent. A normal clone still does not import the remote's local configuration.

### The standing rule

The rule applies **before the first Git invocation** and covers both production
seams:

- Workspace Identity's `rev-parse` calls through `workspaceIdentity.ts:209`;
- Workspace Evidence's calls through `workspaceEvidence.ts:636`.

The absence of a confirmed `rev-parse` vector is not an exception. Exempting that
seam on the last enumeration would recreate the per-vector posture this decision
rejects. The boundary follows checkout control rather than one literal file: it
includes configuration reached through checkout-local includes and checkout
content such as `.gitattributes` when that content combines with checkout-local
configuration to activate a command. Operator-owned global and system
configuration remain outside this ruling unless separate evidence implicates
them.

"Untrusted" is deliberately narrower than "semantically irrelevant". Neoflow
must not permit checkout-controlled external process execution by default, but
Git configuration needed to interpret a legitimate repository is not blanket
ignored. A non-execution semantic effect becomes repair work only when evidence
shows harm; this ticket does not manufacture a second audit of every Git setting.
If P16C chooses trust elevation as its mechanism, it must be an explicit,
checkout-specific operator decision. Merely opening the directory never supplies
it.

### Why per-vector hardening is rejected

`core.fsmonitor` and the clean driver were found independently by thinking of
keys, not by enumerating the surface. The clean driver's attacker-chosen name
also proves that a finite list of `-c filter.X.clean=` arguments cannot close even
the two-vector surface already known. Four checked keys are not evidence about
Git's full command-valued configuration, and treating today's negative
`rev-parse` result as a permanent carve-out would make the same necessary-for-
sufficient error at the second seam.

Per-vector changes may still land as partial progress. In particular,
`-c core.fsmonitor=` remains a cheap correct repair for one vector. Neither it nor
a blocklist containing both confirmed vectors satisfies the standing rule or
supports a claim that S-01 is closed.

### What P16C must establish

The implementation package still chooses the mechanism; this decision chooses
its burden of proof. Before the deepening gate can call S-01 repaired, P16C must:

1. present a **class-level completeness argument**, not only a list of known
   dangerous keys;
2. enforce the rule at both Git execution seams before their first command, or
   support any seam-specific exception with affirmative evidence;
3. regress both confirmed vectors and the chosen boundary behavior;
4. measure legitimate-repository behavior rather than assume suppression is
   free — specifically, re-measure `GIT_ATTR_SOURCE=<empty tree>` before using
   attribute suppression in the argument; and
5. fail closed or require explicit checkout-specific trust if no transparent,
   class-complete mechanism preserves required behavior. Silent fallback to
   known-vector hardening is not permitted.

A normalized environment, configuration inspection, consent gate, or combination
may be evaluated under those requirements. None is selected here, and no code or
Interface changes are authorized by this ticket. Repository evidence was enough
to settle the policy; no external Git semantic claim was needed.

### Recorded consequences

- `docs/audit/pre-p17-codebase-findings.md` now carries the class-level, two-seam
  execution obligation on S-01 without changing its disposition, rank, severity,
  or pull-forward ruling.
- [Chart the pre-P17 codebase deepening plan](./WF-053-pre-p17-codebase-deepening-plan.md)
  records the linked decision gist. The map remains open for its final vocabulary
  decision.
