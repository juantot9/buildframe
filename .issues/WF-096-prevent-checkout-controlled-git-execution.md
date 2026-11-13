---
id: WF-096
title: "Prevent checkout-controlled Git execution"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-095]
created: 2026-08-12
---

## Question

Can S-01 enforce the settled rule that opening a checkout is not consent to execute commands selected by checkout-controlled Git configuration, across both Workspace Git seams and without breaking legitimate repository interpretation?

## Blocked by

- [Resolve the Git executable and retest the Node ceiling](./WF-095-resolve-git-executable-and-retest-node-ceiling.md)

## Acceptance evidence

- A class-level completeness argument identifies and closes checkout-controlled executable effects before the first Git invocation at both Workspace production seams; a seam exception requires affirmative evidence.
- Regressions reproduce both confirmed vectors—`core.fsmonitor` and an attacker-named clean filter activated by tracked `.gitattributes`—and prove neither command runs when the Workspace opens or inspects the checkout.
- Checkout-local includes and checkout content that activates local command configuration remain inside the untrusted-input rule, while operator-owned global and system configuration are not silently reclassified.
- The chosen mechanism measures legitimate repository behavior, including a clean-filter repository and the previously confounded `GIT_ATTR_SOURCE` suppression option, rather than assuming broad suppression is free.
- If transparent class-wide prevention cannot preserve required behavior, the Workspace fails closed or requires explicit checkout-specific trust; known-key blanking alone is not reported as closure.
- The Workspace package Interface and dependency firewall remain unchanged, and focused Interface evidence, canonical v1 verification, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1.

## Authority

- [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- S-01 in [`docs/audit/pre-p17-codebase-findings.md`](../docs/audit/pre-p17-codebase-findings.md)
- [Decide whether the Workspace treats a checkout's own Git configuration as untrusted input](./WF-070-decide-checkout-git-config-trust.md)

## Constraints

- Absolute executable resolution controls `PATH`; it does not satisfy this checkout-configuration rule.
- Do not claim closure from `-c core.fsmonitor=` or another finite dangerous-key list.
- Do not blanket-ignore semantically relevant Git configuration without measuring the behavioral cost.
- Keep W-03's Authoritative State request deadline in its separately ordered work.
- Preserve the unrelated local root `package.json` pnpm bump.

## Resolution comment

Yes, by failing closed on checkout-owned executable configuration rather than
pretending Git offers a transparent local-scope disable switch. The
package-private `gitProcess` Module now prepares a provenance-isolated inspection
context before either Workspace seam's first repository-aware Git call. Identity
finds `.git` directories and gitfiles with filesystem operations. Preparation
strips every inherited `GIT_*` variable, parses only the common config with the
fixed no-repository `git config --file ... --no-includes` form, validates a
small structural repository-format projection, and routes production Git through
a private `GIT_COMMON_DIR`. The routed metadata links object/ref storage but
supplies an inert local config and excludes checkout-owned hooks,
`config.worktree`, `info/attributes`, and worktree metadata; `info/exclude` is
retained. Unsupported extensions, worktree config, partial clone, includes,
filters, fsmonitor, aliases/diff drivers, and unknown structural settings reject
instead of falling back to ordinary Git.

The real per-worktree `GIT_DIR` remains visible, preserving linked-worktree HEAD
and index behavior and native operator `includeIf.gitdir` matching. System/global
configuration remains native rather than flattened or replayed; the unsupported
cross-scope `includeIf.hasconfig:remote.*.url` condition fails closed. Tracked
attributes remain active, and a regression proves an operator-owned global clean
filter still executes. Checkout-local `core.fsmonitor`, local includes, and an
attacker-named clean filter selected by tracked `.gitattributes` all reject before
their marker commands run. Checkout-local `info/attributes` cannot select even an
operator command. A legitimate local clean-filter repository is explicitly
rejected while ordinary Git reports it clean, documenting the accepted
fail-closed cost rather than returning false evidence. The research record at
`docs/research/git-checkout-configuration-execution-wf096.md` includes the
corrected `GIT_ATTR_SOURCE` experiment and the class-level provenance argument.

Every Evidence operation prepares one context and removes it in `finally`;
Identity does the same around bootstrap inspection. The linked-worktree admin
path is passed through package-private owner state (including runtime assembly),
with no Workspace Interface or dependency-firewall change. A linked-worktree
regression captures real evidence through that path. The broader suite exposed a
latent scripted-terminal race (`n` and Enter were dispatched back-to-back); the
test now flushes the first key before sending Enter, with no application behavior
change.

On Node 26.5.1 with pnpm 11.20.0, `pnpm v1:verify` passed the dependency
firewall, all 19 files / 121 tests, typecheck, builds, and smoke. All four
compiled risk probes passed: Authoritative State, Local Runtime, reviewed Pi
0.80.6 Adapter, and end-to-end dogfood. `git diff --check` is clean. The
pre-existing root `package.json` package-manager bump remains untouched and
excluded from WF-096.
