---
id: WF-050
title: "Shape packaging, setup, and release topology"
status: closed
labels:
  - wayfinder:grilling
parent: WF-039
assignee: juanan
blocked_by: [WF-042, WF-043, WF-044, WF-046, WF-047]
created: 2026-07-17
assets: []
---

## Question

How should one developer build, package, install, start, diagnose, upgrade, and roll back the local Neoflow runtime, Pi and Claude Code integrations, and Neovim companion across supported macOS, Linux, and WSL2 environments while preserving state compatibility, explicit version support, simple dogfooding, and the product blueprint’s setup and release evidence?

## Blocked by

- [Choose the local runtime and Workspace Writer topology](./WF-042-choose-local-runtime-topology.md)
- [Choose the Authoritative Workflow State architecture](./WF-043-choose-authoritative-state-architecture.md)
- [Validate the Harness Interaction Module implementation seam](./WF-044-validate-harness-module-implementation-seam.md)
- [Validate the Editor Companion implementation seam](./WF-046-validate-editor-companion-seam.md)
- [Choose the first dogfoodable vertical slice](./WF-047-choose-first-dogfood-slice.md)

## Resolution comment

> **Amendment, 2026-11-11 — first-release scope, from
> [Ship the 0.1.0 public preview](./WF-287-ship-the-0-1-0-public-preview.md).**
> The rules below remain the target for a stable release. For `0.1.0`:
>
> - Three artifacts ship: the app, the Pi package and the Claude plugin. The
>   Neovim mirror is out.
> - npm and pnpm only. The curl bootstrap is deferred, and Homebrew is no
>   longer ruled out for a later release.
> - macOS and Linux only. WSL2 is not claimed, and native Windows is the next
>   platform goal.
> - `neoflow doctor` is small and read-only, and there is no `neoflow setup`.
> - No migration or rollback rehearsal, since no predecessor exists.
> - The candidate gate is reduced to WF-287's promotion gate.
>
> Data-safety rules (no reverse migration, and no rollback that hides a
> Durable Commit) bind from `0.2.0`.

Ship Neoflow v1 as a **public MIT-licensed preview** through one coordinated product release, while keeping product Modules deep and source-package seams private. The main application, Pi package, Claude Code plugin, and Neovim companion share one Neoflow SemVer and one source commit; store-format, record-schema, local-runtime protocol, and Adapter protocol versions remain independent compatibility identifiers rather than being inferred from product SemVer.

```text
one source commit + one Neoflow version
                   │
        ┌──────────┼──────────────┬────────────────┐
        ▼          ▼              ▼                ▼
  neoflow npm   neoflow-pi    Claude plugin   neoflow.nvim
 launcher/TUI   Pi package     marketplace     generated mirror
 runtime/bridge
        │          │              │                │
 npm · pnpm ·   pi install     claude plugin    native Neovim
 curl bootstrap               marketplace       package manager
```

The integrations remain independently optional and host-managed. Coordinated versioning does not force simultaneous installation or update: a machine-readable compatibility manifest and a short supported protocol-skew window let staged upgrades remain truthful, while Connections & Diagnostics names an incompatible or stale integration precisely.

### Build and release assembly

Retain the settled source topology: `packages/workspace` owns the deep Workspace Module, `packages/local-runtime` owns process lifecycle and private IPC, `apps/neoflow` owns the executable surfaces and process entrypoints, separately host-loaded Pi and Claude Adapter source packages contain only their reviewed native integration, and `nvim/` remains the canonical thin Neovim Adapter source. Do not publish logical workflow Modules or a generic protocol package.

Build `apps/neoflow` into a small allowlisted ESM release assembly containing the `neoflow` launcher/CLI, TUI, workspace-runtime worker, diagnostics and setup commands, and `editor-bridge`. Bundle the private Workspace and local-runtime implementations into that assembly so npm consumers never resolve workspace links, development export conditions, or private package seams. Build the Pi Adapter as one independently loaded `neoflow-pi` Pi package, bundling its private runtime client while leaving Pi-owned extension imports as host peers. Build the Claude Adapter as a versioned marketplace plugin whose hooks and Review skill call an argv-form `neoflow` bridge command; it neither embeds a second workflow runtime nor reads State. Generate a distribution-only `neoflow.nvim` repository from canonical `nvim/` source for ordinary Neovim package managers; the mirror is release output, never a second editable source.

The preferred public npm coordinates are the currently unclaimed `neoflow` and `neoflow-pi`; the controlled fallback coordinates are the matching names under the personal npm scope established by P02 (expected to be `@juantot9/neoflow` and `@juantot9/neoflow-pi` if that account name is obtained). Keep the selected package coordinate configurable until genuine package assembly. Recheck the preferred names at each packaging milestone and claim them only by publishing genuine usable artifacts. Never publish empty, placeholder, or negligible packages merely to reserve a name: npm's Open Source Terms identify name-only reservation content as unacceptable squatting. If a preferred name is unavailable when the genuine artifact is ready, adopt the already-controlled scoped fallback explicitly and update every manifest, guide, support record, and installer from the same decision; the executable and product name remain `neoflow`.

The application package declares only explicitly tested Node major ranges beginning at the settled **Node 22.19.0** floor. It has an allowlisted `files` set,

> **Correction, 2026-08-06 — the 22.19.0 floor named above is void.** The
> principle it carries, *declare only explicitly tested ranges*, still holds and
> is what superseded it. The floor is stale twice over: Gate A settled the
> renderer on OpenTUI `0.5.1` under Node 26 with `--experimental-ffi` after this
> ticket closed, and
> [Decide the declared Node version range](./WF-056-decide-declared-node-version-range.md)
> then retired `>=22.19.0` outright as never-tested — it could not have been
> tested, since the v1 test route injects a flag absent below Node 26. The
> tested range is now `>=26.4.0 <26.6.0`, bounded above by a measured
> `child_process` spawn regression introduced in Node 26.6.0.
>
> This has consequences for packaging that are **not** decided here or in
> WF-056: the resolution below rules out bundling Node, so a public `neoflow`
> consumer must supply their own runtime, and the supported window is currently
> three patch releases on a line that is not yet LTS. See WF-056's resolution
> comment for the evidence.
>
> **Resolved 2026-08-06** by
> [Decide whether the OpenTUI renderer choice survives public distribution](./WF-059-decide-renderer-survives-public-distribution.md):
> the renderer is kept, the upper bound is a Neoflow defect rather than a renderer
> cost and is filed for repair, and the fallback if the window is still narrow at
> packaging is that the support manifest this ticket already requires names one
> exact tested version. Nothing in that resolution reopens the rules below —
> bundling a runtime stays ruled out. executable shebangs, MIT license, dependency notices, exact build metadata, and no lifecycle install script. Pin source builds to the repository's declared pnpm version and frozen lockfile. Keep runtime dependencies minimal and bundle internal workspaces; `node:sqlite` remains the built-in State implementation rather than a native package dependency.

Release assembly must fail on a dirty or untracked generated output, mismatched product versions, forbidden outward dependency, missing license or manifest, undeclared runtime import, non-allowlisted tarball content, or inability to import every built entrypoint from the packed artifact. `.issues`, disposable prototypes, legacy source after cutover, test data not intentionally shipped, workspace links, credentials, and local state never enter a release package.

### Installation, setup, and start

Support three documented application installation paths over the **same npm artifact**:

- `npm install -g --ignore-scripts <app-package>@<version>`;
- `pnpm add -g --ignore-scripts <app-package>@<version>`; and
- a versioned HTTPS curl bootstrap that verifies release metadata, checks for a supported Node and npm or pnpm, then invokes the selected package manager with an exact Neoflow version.

The curl path neither installs Node, uses `sudo`, edits shell startup files silently, nor maintains a separate binary installation. It reuses the existing installation method on upgrade, refuses ambiguous mixed npm/pnpm ownership, and offers an inspect-before-run form beside the convenience pipe. pnpm is an end-user installation option, not a runtime requirement; repository development continues to use the exact declared pnpm toolchain. Do not add Homebrew, standalone Node bundles, platform binaries, containers, or a self-updater in v1.

Keep setup documentation-first as settled by [Shape setup, attachment, and diagnostics workflow](./WF-022-shape-setup-attachment-diagnostics.md). Versioned guides are canonical for prerequisites, npm/pnpm/curl installation, Pi package installation, Claude marketplace registration, Neovim package-manager examples, exact supported versions, clean verification, update, rollback, removal, state locations, and troubleshooting. `neoflow setup` is a non-mandatory assistant: it inspects and previews one integration at a time, then may invoke the host's official installer or perform only a fully understood additive repair after explicit approval. It never installs or upgrades a host, edits unfamiliar configuration, chooses a live session, adds mandatory Neovim mappings, or treats installation as attachment or consent.

Use each host's own management path:

- Pi installs, pins, updates, disables, and removes the selected Pi package coordinate (preferred `neoflow-pi`, controlled scoped fallback otherwise) through `pi install`, `pi update`, `pi config`, and `pi remove`; the package carries a `pi` manifest, reviewed Capability Manifest, and explicit Pi host range.
- Claude Code installs the `neoflow` plugin from a Neoflow marketplace using its plugin commands. The plugin carries its own version, hook/skill manifest, and explicit Claude Code range; a host restart is required when Claude says an update needs one.
- Neovim users install `neoflow.nvim` through their chosen package mechanism. The Adapter exposes stable user commands and Lua mapping targets but no key combinations. Release docs cover a manager-neutral native-package fallback and exact removal.

Running `neoflow` resolves the current canonical checkout and Workspace Identity, ensures its on-demand runtime, waits for readiness, and opens the TUI. Explicit launcher subcommands start the CLI surface, writer entrypoint, Adapter bridge, or editor bridge without exposing those process roles as separate products. A Pi, Claude, or Neovim bridge may also ensure the same workspace runtime on first demand. TUI exit never implies runtime or integration shutdown.

### Diagnostics, removal, and network posture

`neoflow doctor` provides human and stable JSON output over the layered Integration Health contract: installed product and source, Node/platform support, release and protocol versions, package integrity, runtime endpoint and writer ownership, store format and migration/recovery condition, bridge reachability, host compatibility and Manifest validity, candidate and Attachment identity, canonical-checkout match, Handoff-specific Capability and Availability, and the shortest repair action. Normal diagnostics are bounded and read-only: no model request, Handoff, workflow disclosure, editor movement, source mutation, State database opening outside the runtime, or fabricated end-to-end evidence. Deep diagnostics redact opaque identities and local paths by default and produce an explicitly previewed support bundle rather than copying workflow records or credentials.

Neoflow performs no automatic background version check, telemetry, crash upload, or other Neoflow-owned network call in v1. Package managers, the curl installer, and host-native plugin managers use their own explicit network operations. Diagnostics work offline and distinguish unavailable release information from incompatibility.

Removal is deliberately layered. First detach or remove optional host integrations through their native managers, then stop idle runtimes, then remove the application with the package manager that installed it. Removing code never deletes User Configuration, Authoritative Workflow State, prior generations, bundles, or legacy source data. Clearing caches and explicitly purging workflow state remain separate product actions under their already-settled consent rules; documentation cannot turn package uninstall into a data-deletion shortcut.

### Compatibility, upgrade, and rollback

Every product release ships one generated support manifest used by docs, runtime bootstrap, setup, diagnostics, contract tests, and release gates. It names exact supported Node and package-manager versions, macOS/Linux/WSL2 environments, Git and terminal prerequisites, Pi/Claude/Neovim host ranges, TUI dependency, product artifacts, store and record formats, local-runtime and Adapter protocols, migration predecessors, and known capability limitations. A broad SemVer peer range or successful socket connection never establishes support. Pinned native fixtures and live probes justify each host range; an unknown newer truth-critical host or protocol is unsupported until tested and released, while the rest of Neoflow remains usable where its own prerequisites still hold.

Package installation does not terminate processes or mutate State. On first launch after an application update, the launcher inspects active runtime and integration versions before any Workspace command. A protocol-compatible existing runtime may continue; an incompatible runtime produces a precise diagnostic and may be stopped only through an explicit graceful action after clients and volatile correlations permit it. The launcher never silently kills or replaces it. A replacement runtime acquires the State writer lease before readiness. Old host sessions may reconnect only within the declared Adapter-protocol window—initially current and immediately preceding protocol versions—and diagnostics require host update/restart before an incompatible path can make a commitment.

A format-preserving code rollback pins the previous coordinated product version through npm, pnpm, or curl and pins each installed host integration independently. A format-changing upgrade uses the already-selected fresh candidate generation, complete validation, durable switch, and retained predecessor. Record whether the new generation has accepted any post-migration Durable Commit:

- before such a commit, code and `CURRENT` may safely return to the verified prior product/generation pair;
- after such a commit, rollback must not reactivate the old generation because that would hide new authoritative records. The older application may enter only its supported diagnostic/read-only newer-format posture; it cannot start a writer. Recovery keeps the new generation authoritative and proceeds through a forward fix.

Do not implement reverse migrations, dual writes, automatic store rollback, or a destructive "roll back anyway" path in v1. A failed migration never switches authority, and package rollback remains separate from state-generation selection.

### Release channels and evidence

Use one low-WIP release path: checkout development, packed local artifact, immutable `next` candidate, then `latest`. No nightly channel is needed. Reserve the intended final SemVer, build every coordinated artifact once from one clean commit, publish it under `next` or an equivalent draft visibility, and dogfood those installed artifacts. Promotion moves channel tags and release visibility without rebuilding; a failed candidate is left immutable and unpromoted and the version is burned.

CI uses trusted publishing/provenance where supported and emits checksums, a dependency/license inventory, build manifest, and release notes tying every artifact to its source commit and support manifest. A release candidate must pass:

- existing fast/full verification and every risk gate named by the changed capabilities;
- source-graph and packed-content checks, compiled process/import smoke tests, and install/uninstall checks from empty temporary homes;
- npm, pnpm, and curl clean installs plus same-format and format-changing upgrade/rollback scenarios;
- launch storms, active old runtime, stale endpoint, current/prior/incompatible Adapter protocol, host restart, and no-replay behavior;
- every supported predecessor migration, exact bundle and legacy-import fixtures, immediate-crash durability, quarantine, and the no-post-write-rollback invariant;
- pinned and live Pi, Claude Code, and headless Neovim compatibility probes over the published host ranges;
- supported macOS and Linux matrix automation plus release-blocking WSL2 evidence with app, Harness, editor, and checkout in one WSL environment;
- packed TUI terminal/accessibility/performance gates and the complete human workflow and setup walkthroughs from [Define the verification and learning architecture](./WF-048-define-verification-architecture.md).

Dogfood must install from `next`, not a workspace symlink or source-condition export. Stable promotion waits for the first Reviewing learning gate, clean new-user setup, integration removal/reinstall, one state-format upgrade rehearsal, and successful rollback on both sides of the no-new-write rule. Repeated setup confusion, version-skew ambiguity, silent process replacement, package-path coupling, a host guarantee outside the published evidence, or any rollback that can hide a Durable Commit blocks promotion.

This adds no product domain term and does not change `CONTEXT.md`. No production packaging is performed by this decision. The package identities, publisher credentials, generated Neovim mirror, marketplace, installer endpoint, CI publishing trust, and MIT files are execution-plan work rather than fresh decision tickets. No new fog or product-blueprint amendment is exposed.

### Execution amendment — npm coordinate control (2026-07-25)

P02 checked npm's current official Open Source Terms and found that content existing only to reserve a package name is explicitly unacceptable. That primary-source fact contradicts the original instruction to reserve the two unscoped names before genuine package assembly. The user approved the narrow correction above: establish a personal publisher and controlled scoped fallback now, retain the unscoped names as preferred availability-dependent coordinates, and never publish a placeholder or premature product merely to claim them.

This changes no product behavior, Module seam, executable name, release evidence, or coordinated-version rule. It makes the package coordinate an explicit support-manifest input until genuine assembly and ensures that a scoped fallback, if needed, changes all installation surfaces together rather than emerging as late drift.
