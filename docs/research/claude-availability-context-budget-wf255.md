# Claude availability and Context Budget Evidence for WF-255

_Researched 2026-09-23. Production compatibility remains pinned to Claude Code 2.1.209; current documentation and a locally installed 2.1.278 binary were used only to identify supported surfaces and later-version boundaries._

## Question

Which Claude Code plugin, hook, and status-line facts can Neoflow use to publish truthful User Pull availability and optional Context Budget Evidence without reading transcripts, estimating tokens, or mistaking observability for Invocation lifecycle evidence?

## Findings

### The exact plugin action is `/neoflow:review`

Claude plugin skills are namespaced as `/plugin-name:skill-name`. The plugin manifest already names the plugin `neoflow`; naming its one skill `review` therefore yields `/neoflow:review`. A skill named `neoflow` would instead yield `/neoflow:neoflow`. The skill remains user-only with `disable-model-invocation: true`.

### Hooks can establish lifecycle and compaction facts, not context usage

Common hook input carries session, current working directory, event name, and (after the first prompt on supported hosts) prompt ID. It does not carry context-window usage or capacity. `PreCompact` and `PostCompact` distinguish `manual` and `auto` triggers. `PostCompact` also carries `compact_summary`, but Neoflow has no need or authority to copy that generated conversation material: phase and trigger are sufficient to invalidate prior usage.

`SessionStart.model` is optional and does not establish later model switches. Current documentation describes `PreModelSwitch`/`PostModelSwitch`, but Neoflow's reviewed host is 2.1.209 and no pinned live evidence establishes those newer callbacks there. WF-255 therefore detects a model change only through a verified status-line observation and invalidates the old reading before accepting later matching usage.

### The main status line is the documented context source

A configured status-line command receives first-party JSON with:

- `session_id`, `prompt_id`, `cwd`, and `version`;
- `model.id` and `model.display_name`;
- `context_window.context_window_size`;
- host-reported total input and output tokens;
- nullable current input/output/cache token components; and
- nullable used and remaining percentages.

`current_usage` is null before the first API response and immediately after compaction until another response. Status-line updates are event-driven (session start, assistant response, compaction, and UI-mode changes); an optional `refreshInterval` can add periodic invocation, but elapsed silence alone still does not prove a disconnect. A reading is therefore labelled as the last response's host-reported evidence, not a live streaming count.

The payload also contains transcript path, costs, rate-limit information, and other unrelated local facts. The bridge must discard those fields before transport.

### A plugin cannot silently install the main status line

Claude's plugin settings surface does not let a plugin provide the user's singleton main `statusLine` setting. A Neoflow status-line bridge must be an explicit opt-in and must preserve any existing renderer. Plugin hooks remain useful without it, but Context Budget Evidence is then unavailable rather than reconstructed from a transcript or inferred from hook activity.

The status-line `version` field is also the documented attached-session host-version witness. Hook-only input has no equivalent exact version field. Consequently the verified status-line path can establish/revalidate the reviewed attachment; a hook-only route must not invent host compatibility.

### Runtime generation is a safe freshness boundary

A successful bridge call proves reachability only for the runtime process that accepted it. Persisted availability from a prior Neoflow runtime process must be stale until exact attachment and contract facts are revalidated. A process-generation witness provides this boundary without a timeout or heartbeat guess. Conversely, when the runtime is unreachable, the Claude-side workflow gate can report that exact reason and fail closed, but the unreachable runtime cannot durably record its own outage. Neoflow must not backfill one later.

### Context facts must remain independently qualified

The context-window size and token counts are Claude-host-reported values. Neoflow can preserve their source and model/session binding, but cannot independently attest the provider limit or tokenizer. It must not:

- estimate proposed-payload tokens;
- add transcript-derived guesses;
- compare Claude and Pi percentages as a universal measure;
- infer semantic quality from occupancy;
- trigger compaction, clearing, route changes, or payload reduction; or
- treat compaction as proof that workflow meaning survived.

Model change, session end/change, compaction, attachment staleness, and telemetry loss all make prior usage unknown until fresh matching evidence arrives.

## Implementation consequences

1. Rename the plugin skill to `review` and recognize only the exact namespaced workflow command.
2. Add bounded `PreCompact`/`PostCompact` sanitization that drops `compact_summary`.
3. Add a bounded status-line sanitizer and explicit compositor entry that forwards only reviewed fields while preserving the configured renderer's stdout.
4. Store one current observability record per exact User Pull attachment, with runtime-generation, compatibility, session/model, invalidation reason, and latest compaction evidence.
5. Keep that record out of Preparation/Invocation transitions. Availability loss cannot expire a Preparation unless the pre-existing semantic identity/capability rules independently do so.
6. Project exact unavailable, blocked, revalidated, and stale reasons plus explicit unknown Context Budget reasons to Reviewing.

## Primary sources

- [Claude Code skills](https://code.claude.com/docs/en/skills) — plugin namespace and skill invocation naming.
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference) — plugin layout and supported plugin settings.
- [Claude Code hooks](https://code.claude.com/docs/en/hooks) — common input, lifecycle, `PreCompact`, and `PostCompact` schemas.
- [Claude Code status line](https://code.claude.com/docs/en/statusline) — update cadence, JSON fields, nullable usage, and `refreshInterval`.
- [Claude Code changelog](https://code.claude.com/docs/en/changelog) — version boundaries for status-line accounting corrections.
- Historical pinned report: `docs/research/pi-claude-context-budget-evidence.md` at commit `0c4abd9` (Claude Code 2.1.211 and Pi 0.80.7).
