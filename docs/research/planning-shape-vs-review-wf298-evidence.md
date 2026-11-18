# WF-298 evidence: plan review tools, native plan modes, BuildFrame code

Cited evidence for [the WF-298 note](./planning-shape-vs-review-wf298.md),
which holds the question, verdict and recommendation. Nothing was run against a
real agent or account: every claim comes from reading source and official docs
on 2026-11-18.

## Sources and versions

| Source | Version | Where |
| --- | --- | --- |
| Plannotator | `328b5f9d6899e16f3333118c0c78ff1c6380e777` (main, 2026-11-18); Apache-2.0 | [backnotprop/plannotator](https://github.com/backnotprop/plannotator/tree/328b5f9d6899e16f3333118c0c78ff1c6380e777) |
| OpenCode 2 | `v2.3.0`, `a6b15d33daf6ab7d35569f6d711fdb630b9f04e7` (same commit as WF-294) | [anomalyco/opencode](https://github.com/anomalyco/opencode/tree/a6b15d33daf6ab7d35569f6d711fdb630b9f04e7) |
| Pi | `efd284ecca3788ca1345fdcc927a1f97e7ceeeaf` (main, 2026-11-18) | [earendil-works/pi](https://github.com/earendil-works/pi/tree/efd284ecca3788ca1345fdcc927a1f97e7ceeeaf) |
| Claude Code | live docs, fetched 2026-11-18 | [permission-modes](https://code.claude.com/docs/en/permission-modes), [hooks](https://code.claude.com/docs/en/hooks), [best-practices](https://code.claude.com/docs/en/best-practices) |
| Codex | live docs, fetched 2026-11-18 (`developers.openai.com/codex/...` now redirects to `learn.chatgpt.com`) | [best practices](https://learn.chatgpt.com/guides/best-practices), [hooks](https://learn.chatgpt.com/docs/hooks), [slash commands](https://developers.openai.com/codex/cli/slash-commands) |
| BuildFrame | working tree on `wf-289-connectors-and-features` at `1e7b9d3` | this repository |

Plannotator paths below are relative to its repository root at that commit.
Earlier BuildFrame work on Plannotator: WF-002 (artifact-review loop, v0.23.1)
and [plannotator-tui-claude-delivery.md](./plannotator-tui-claude-delivery.md)
(delivery routes).

## Plannotator

**What it is.** "A local, browser-based review surface for AI coding agents."
When the agent "proposes a decision, plan, html, or finishes working, the app
opens in your browser and you mark it up, comment, and send feedback directly
to the agent" (`README.md`). 13,251 GitHub stars on 2026-11-18 (GitHub API):
a popularity signal, not evidence of how people use it.

**Plan review is the default and needs no command.** "Plan mode is wired in
through each harness's hooks. Any time your agent creates a plan, the markdown
review surface opens for you" (`README.md`, Commands → Plan mode). Its flow:
the agent calls `ExitPlanMode` → the hook reads the plan → the browser opens →
"Approve: agent proceeds"; "Deny: structured feedback sent to agent"; "Agent
revises, plan diff shows what changed" (`README.md`, How it works).

**How it hooks into each host** (`README.md` install table and app READMEs):

| Host | Hook point | Plan text comes from |
| --- | --- | --- |
| Claude Code (classic) | `PermissionRequest` hook, matcher `ExitPlanMode`, blocks up to 345600 s; deny carries feedback in `decision.message` | hook input `tool_input.plan` |
| Claude Code ≥ 2.1.287 (mod) | `tool.call` hook on `ExitPlanMode` answers `deny` at once, opens the review detached; the decision arrives later through `$.prompt.submit`; approval asks Claude to "Call ExitPlanMode once more with the approved plan" | `planFilePath` when trustworthy and ≤ 2 MiB, else inline `plan` (`apps/hook/hooks/mod/controller.ts:1311-1323`, `plan.ts:12`, `delivery.ts:48-50`) |
| OpenCode 1 and 2 | adds its own `submit_plan` tool for the `plan` agent; the model is told "Don't use `plan_exit` — use `submit_plan` instead" and to send line-range edits on revision | tool arguments (`apps/opencode-plugin/planning-prompt.ts`) |
| Pi | Pi has no plan mode, so the extension **adds one**: `--plan` or `/plannotator-plan-mode`, tools narrowed to `grep`, `find`, `ls`, `plannotator_submit_plan`, writes limited to a plan file | the plan file (`apps/pi-extension/README.md`, Plan mode) |
| Codex | experimental `Stop` hook: "when a turn stops, Plannotator reads the current rollout transcript, extracts the latest plan"; deny returns continuation feedback | the transcript (`apps/codex/README.md`) |
| Copilot CLI, Gemini CLI, DeepSeek Harness | their plan-mode hook (README; not verified against those hosts' docs) | per host |
| Droid | "Commands only, no plan interception yet" | — |

**Feedback model.** Annotation types are `DELETION`, `COMMENT` and
`GLOBAL_COMMENT`, each anchored to `originalText`, the selected text
(`packages/ui/types.ts:20-24,85-96`). All annotations go back as **one**
Markdown message: "# Plan Feedback … I've reviewed this plan and have N
pieces of feedback", in document order (`packages/ui/utils/parser.ts:1470-1523`).
Feedback over 12 KiB goes to a file Claude is told to read
(`apps/hook/hooks/mod/delivery.ts:45-46,203-204`).

**No pre-plan context curation in the core product.** Nothing in the plan
flow lets the user pick files or lines before the agent explores. The closest
feature is an **optional extra skill**, `plannotator-setup-goal`, "not
installed by default" (`apps/marketing/src/content/docs/guides/claude-code.md:148`).
It is agent-led: the agent restates the goal, sends an interview bundle "with
your recommended answer", builds a fact sheet the user accepts or edits in the
browser, then explores and writes `plan.md`, which is gated with
`plannotator annotate … --gate` (`apps/skills/extra/plannotator-setup-goal/SKILL.md`,
phases 1-4). Even the shaping step is "agent drafts, human marks up".

## Claude Code plan mode

- "Claude reads files, runs shell commands to explore, and writes a plan, but
  does not edit your source." Enter with `Shift+Tab`, `/plan`, or
  `--permission-mode plan` ([permission-modes](https://code.claude.com/docs/en/permission-modes)).
- Approval options: "Yes, and use auto mode", "Yes, manually approve edits",
  "No, keep planning: stay in plan mode and tell Claude what to change". `Ctrl+G`
  opens the plan in an editor. Feedback is free text; there is no line-anchored
  comment. Plan files live in `~/.claude/plans/` or `plansDirectory`.
- **The plan is exposed to extensions.** `ExitPlanMode` `tool_input` gets
  `plan` ("Plan content in Markdown. Injected from the plan file on disk") and
  `planFilePath`. `PermissionRequest` can return `allow` (with `updatedInput`)
  or `deny` with a `message` that "tells Claude why". `PostToolUse` has
  `tool_response.plan` ([hooks](https://code.claude.com/docs/en/hooks), ExitPlanMode input).
- Context advice: "Only write down what Claude can't find by reading the repo"
  and "current models are *very* good at this". For a vague idea, "Ask Claude to
  interview you instead" ([best-practices](https://code.claude.com/docs/en/best-practices),
  Tell Claude what it can't see).

## OpenCode 2 plan agent

`packages/core/src/plugin/plan.ts:14-42`: the built-in `plan` agent is
"Read-only agent for exploring the codebase and planning work before
implementation". Edits are denied except under `~/.opencode/plan`. Its reminder
says: "Discuss the plan with the user directly in the conversation. Do not
create or update plan files unless the user explicitly asks you to … You remain
in Plan mode until the user switches agents." There is **no exit or approval
tool**: the plan is ordinary assistant text, and leaving means switching
agents. A plugin sees it the way it sees any message (Plannotator adds
`submit_plan` to get a structured hand-off).

## Pi

"Pi ships with powerful defaults but skips features like sub-agents and plan
mode" (`packages/coding-agent/README.md`). The repository ships an **example**
extension, `examples/extensions/plan-mode/`: `/plan` disables edit and write,
allowlists read-only bash, and on `agent_end` extracts the numbered steps under
a `Plan:` header from **the last assistant message** (`index.ts:225-300`).
Then it asks "Execute the plan (track progress)" (`index.ts:315-321`). This is
the same "plan = final answer" shape BuildFrame's Response capture already uses.

## Codex

- "Plan mode lets Codex gather context, ask clarifying questions, and build a
  stronger plan before implementation. Toggle with `/plan` or Shift+Tab." When
  ready: "Yes, clear context and implement".
- Prompt advice: include **Goal**, **Context** ("Which files, folders, docs,
  examples, or errors matter for this task?"), **Constraints**, **Done when**;
  "You can @ mention certain files as context"; "ask Codex to question you
  first" ([best practices](https://learn.chatgpt.com/guides/best-practices)).
- Hooks have **no plan-specific event**: no `ExitPlanMode`. `permission_mode`
  can be `plan`. The `update_plan` tool can be matched. `Stop` receives
  `last_assistant_message` and can return `decision: "block"` with a `reason`,
  which "acts as a new user prompt" ([hooks](https://learn.chatgpt.com/docs/hooks)).

## BuildFrame code facts

**Send path.** The connector kit puts `turn.text` into the session "as one
user input, unchanged, at most once" (`packages/local-runtime/src/connector/contracts.ts:47-52`).
It already has a seam for other kinds of directive: `render?(directive, …)`, "Text for
directive kinds other than a Review Message" (`:59-60`). It also has `prepare?`,
which narrows the session before submit, such as Pi's read-only tools (`:61-62`).
The only Handoff kind is `'submit-review-batch'`
(`packages/workspace/src/harness-interaction/contracts.ts:97`).

**Outgoing size.** Question body ≤ 64 KiB, whole Message ≤ 256 KiB
(`packages/workspace/src/harness-interaction/limits.ts:36,39`). The Claude
prompt bound is 768 KiB (`packages/claude-adapter/src/direct/claudeDirectAdapter.ts:18`).
A goal plus pointers fits easily.

**Message shape.** Exactly user text + one `path:line`, or, for a saved
origin, the exact quoted lines labelled with their origin
(`packages/workspace/src/harness-interaction/reviewMessage.ts:107-150`;
WF-228 Resolution). That is one location per Message. Saved-origin quoting is
the nearest existing form for quoting plan lines, because a plan is not a file
in the checkout.

**Response bound: 16 KiB, both hosts, enforced by Workspace.**

- Pi: `artifactResultContract.maximumBytes: 16 * 1024`, `artifactKind:
  'review-response'`, source `settled-final-assistant-text`
  (`packages/pi-adapter/src/capability.ts:67-74`). An answer over the bound is
  dropped: `byteLength > maximumBytes` returns `undefined`
  (`packages/pi-adapter/src/piAdapter.ts:108-134,350-352`).
- Claude: the same contract, `claude-code-direct-final-answer-v1`,
  `maximumBytes: 16 * 1024` (`packages/claude-adapter/src/direct/capability.ts:78-85`).
  "An empty answer or one over the bound settles the lifecycle without a
  Response" (`:31-32`). The mod forwards an answer only when it is ≤ 16 Ki
  characters (`packages/claude-adapter/plugin/hooks/register.js:12,282`); the
  helper's 256 KiB request bound is sized for "a 16 KiB answer"
  (`packages/claude-adapter/src/direct/helperServer.ts:13-14`).
- Workspace rejects any manifest whose bound is not exactly 16 KiB or whose kind
  is not `review-response`
  (`packages/workspace/src/harness-interaction/normalization.ts:170-174`;
  `MAX_REVIEW_RESPONSE_BYTES`, `limits.ts:47`).
- Only the final assistant message's text is captured. If the agent writes the
  plan and then sends a short summary, the summary is what BuildFrame gets.

**Authority.** Pi can run Sends with an enforced read-only tool gate
(`question-only` capability, `packages/pi-adapter/src/capability.ts:42-57`).
Claude's capability is `workspace-write` with a "communicated" constraint only
(`packages/claude-adapter/src/direct/capability.ts:59-67`). A busy Claude
session refuses a Send; any other prompt during the turn makes the outcome
unknown (`:27-30`).

**Context capture.** `packages/workspace/src/contextEvidence.ts` implements
WF-024's engine: explicit selections (file, directory, ignored,
outside-checkout; `:20-28`), up to 64 selections (`:97`), manifest (`:590`),
exact byte capture (`:1051`), verify (`:1499`) and revalidate (`:1680`). It is
used only inside `packages/workspace/src/reviewing/`. The app
(`apps/buildframe/src`) never calls it, and WF-228 removed it from the Send
path. No Planning code exists in `packages/` or `apps/`.

**Reviewing today can already show a plan file.** Current-changes evidence
lists untracked files (`--untracked-files=all`,
`packages/workspace/src/workspaceEvidence/content.ts:347-371`). WF-225 makes
unchanged files reviewable too. A plan the agent writes into the checkout can
be opened, and its lines can be targets of Review Messages, with no new code.
