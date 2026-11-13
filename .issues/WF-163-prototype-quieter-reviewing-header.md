---
id: WF-163
title: "Prototype a quieter Reviewing header"
status: closed
labels:
  - wayfinder:task
parent: WF-147
assignee: juanan
blocked_by: [WF-162]
created: 2026-08-31
---

## Question

Which compact top-header structure makes Neoflow feel intentional across Home, Live Changes, comparison, retained Review, and historical-overlay contexts without competing with the actual Reviewing content?

## Acceptance evidence

- Build exactly three radically different throwaway OpenTUI 0.5.9 header structures against populated, production-density static scenes: Home launcher, local comparison, Current Review Live Changes, Previous Review, and Live Changes beneath saved historical detail. Keep the same body/retention/action-strip geometry around each variant so the header is judged in context rather than in isolation.
- Variant A explores one compact breadcrumb/status rail; Variant B explores a source-first masthead with route hierarchy subordinate; Variant C explores a minimal contextual marker that delegates detailed state to the existing retention/history bands. They must differ in information hierarchy and row structure, not merely color, glyph, or wording.
- Make variant and scene switching explicit, separately labeled, cyclic, and inert with respect to product semantics. The prototype performs no Workspace read, command, State transition, persistence, file inspection, or simulated acceptance. A one-command runner pins Node 26.5.1 and provides normal plus `--no-color --ascii` posture.
- Keep each header complete and non-wrapping at 224x68, 132x50, and 80x24; avoid relying on color, preserve route/source distinction, and show exactly how the historical saved/read-only overlay coexists with the ordinary top frame. Verify resize, terminal restoration, clean exit, true-color, no-color, and ASCII-only output through real PTYs.
- Hand the real prototype to the actual acceptor. Record which complete structure or explicit combination they choose, what information should disappear or move, and any confusion. Do not infer a winner from PTY output.
- Capture prototype source and its README on a pushed throwaway branch, record the branch/commit and human verdict here, remove every local process/capture/helper, and land no prototype source or runner on `main`. Create a separate production child only after a direction is selected.

## Authority

- Human Scenario A header finding: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Current private View seam: [Reconcile the quality-gate surface](./WF-141-reconcile-quality-gate-surface.md)
- Accepted two-stage action discovery process: [Prototype compact contextual action discovery](./WF-157-prototype-compact-contextual-action-discovery.md)
- Throwaway UI discipline: `prototype` skill, UI branch.

## Seam decision

The question is visual hierarchy, not state or Workspace behavior. Use one throwaway OpenTUI scene harness near `apps/neoflow` and repeat enough surrounding production-density content to expose competition, wrapping, and route ambiguity. Do not add a production header Interface or copy the existing View merely to prototype three small structures. The selected direction will later be rewritten inside the private View.

## Constraints

- Do not change production source, tests, package scripts, lockfile, dependencies, commands, model state, Workspace reads, retention bands, historical semantics, or action discovery.
- Do not turn this into a general theme, branding, logo, navigation, responsive-layout, or renderer exercise. Evaluate only the ordinary top frame and its relationship to already accepted content.
- Do not put prototype source on `main`, promote prototype code directly, fabricate a human verdict, or retain temporary PTY captures after evidence is recorded.
- Do not touch P17/P18/P54 scope, legacy/user data, or the unrelated root `package.json` bump.

## Outcome (2026-08-31)

The complete throwaway comparison is preserved only on branch `prototype/wf-163-quieter-reviewing-header` at `2e5448e247a526fe82e25b49e64de1a2ca88f726`. It presents A Breadcrumb rail, B Source-first masthead, and C Minimal context marker against all five populated scenes, with explicit and separate variant/scene controls. Strict TypeScript and real true-color plus no-color/ASCII PTYs pass direct switching, 132x50→80x24 resize, incremental UTF-8, complete ASCII history text, clean Ctrl+C exit, and no residual process. Temporary smoke programs/captures were removed; no prototype file or runner landed on `main`.

The actual acceptor did not choose one exclusive structure. They requested all three as portable Configuration choices plus an independent show/hide setting, then explicitly chose **B — Source-first masthead** as the default. This is a human-selected configuration direction, not permission to promote prototype code. [Configure the Reviewing header](./WF-164-configure-reviewing-header.md) owns the production rewrite inside the existing private User Configuration/model/View seam.
