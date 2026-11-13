# Neoflow workflow reference audit

Audited: 2026-07-12

This audit focuses on interaction patterns rather than visual imitation. Neoflow keeps the minimal dark system in `DESIGN.md` and adopts only patterns that fit its role as an attached-session review/control surface.

## References

- Claude Code repository/changelog at `d4d8fbbb333c627d8fe2c1c583a5ccc26fdb1aed`
- Codex repository/TUI at `9e552e9d15ba52bed7077d5357f3e18e330f8f38`
- OpenCode repository/TUI docs at `34e58090595d44e3e7cc37498f16753a98627456`
- Gemini CLI repository/docs at `f354eebaf43b25bacb176007e449bb9a638fd101`
- Crush repository/README at `26fef9b1b232fd89ce31cb5b79d5f08bf2b9799d`
- Pi 0.80.6 README and keybinding documentation

## Recurring successful patterns

### Transcript

- Transcript movement is independent from composer movement.
- Page/line/top/bottom navigation is available; new output follows only while the user is already at the bottom.
- Tool calls are first-class timeline entries with compact summaries and optional detail expansion.
- Errors, denials, cancellations, and partial responses remain visible instead of becoming transient notices.
- Long or pasted content is collapsed by default and can be expanded deliberately.

### Composer

- Multiline input supports cursor movement, word movement, line start/end, forward/backward deletion, and history.
- External-editor handoff is common for substantial prompts.
- Submission while busy is explicit: queue, steer, follow up, or reject. It is never ambiguous.
- File/context references are visible in or near the composed request.

### Plan workflow

- Plan is a safety state, not a differently titled chat.
- Read-only constraints are enforced by the harness/policy layer, not only requested in prose.
- Discussion precedes a concrete plan artifact.
- The concrete plan can be reviewed, revised, edited externally, approved, or cancelled.
- Approval is an explicit transition from planning to implementation.

### Review and approvals

- Requests requiring human authority interrupt the normal timeline with a focused decision surface.
- Choices state their scope: once, session, file/project, or deny.
- Pending action, denial reason, and completion are durable and visible.

### Sessions and status

- Session identity, workspace, model, activity state, approval mode, and context usage are compact persistent metadata.
- Session history is workspace-scoped and resumable.
- Branch/fork/side-conversation workflows prevent exploratory work from polluting the main thread.
- Attention signals distinguish completion, error, permission, and question states.

## Product-specific lessons

### Claude Code

- Strong differentiation between working, waiting for input, blocked, failed, and completed sessions.
- Permission/plan modes are continuously visible rather than hidden in settings.
- Queued input, transcript scrolling, jump-to-bottom, background sessions, and session peeking are treated as core workflows.
- For Neoflow connectivity, research official hooks/plugins before assuming Pi-style full-duplex control.

### Codex

- A running turn accepts an explicitly queued message with `Tab`.
- `/side` creates temporary exploratory conversation without contaminating the main thread.
- Status, permissions, review, fork, resume, transcript, and latest-response copy are direct actions.
- Plans and proposed-plan transcript cells have distinct data/rendering paths.

### OpenCode

- Leader-key commands keep the default surface compact while retaining broad navigation.
- Transcript supports line, half-page, page, first/last, previous/next, and last-user movement.
- Tool details, thinking visibility, session timeline, session hierarchy, and responsive diff style are explicit toggles.
- The composer has full readline-style editing and history rather than append/backspace-only behavior.

### Gemini CLI

- Plan mode is an explicit read-only environment with a concrete Markdown artifact and formal approval transition.
- Users can directly edit/comment on a plan in an external editor before approval.
- Prompt history, reverse search, scrolling, queued prompts, external editor, and configurable keybindings are integrated.
- Tool approvals communicate duration/scope, and sessions retain tool events and usage metadata.

### Crush

- Multiple clients can share a workspace and session state, including messages, busy state, permissions, and queued prompts.
- Session selection and explicit joining avoid silently mixing conversations.
- Permission and completion notifications are separate attention events.

### Pi

- Tool output and thinking are independently collapsible.
- Steering messages and follow-up messages have distinct delivery semantics.
- Escape aborts and restores queued input instead of losing it.
- Session tree navigation and filtering make long histories manageable without flattening them.

## Neoflow decisions

Implement in this order:

1. Separate Chat, Plan, and Review transcript/request state.
2. Render normalized tool activity as compact durable timeline entries.
3. Add transcript viewport navigation with sticky follow-at-bottom behavior.
4. Replace the append-only composer with cursor-aware multiline editing and history.
5. Give Plan a concrete artifact/revision/approval surface when connector capabilities support it.
6. Give Review a durable submitted-batch receipt and result state.
7. Add host-initiated plan/review gates for Claude Code when supported by official integration APIs.

Defer general session management, configurable keymaps, queued steering, and provider-owned context accounting until the core attached-session workflows are stable.
