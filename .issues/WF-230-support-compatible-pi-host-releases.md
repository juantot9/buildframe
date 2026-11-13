---
id: WF-230
title: "Support compatible Pi host releases"
status: closed
labels:
  - wayfinder:task
parent: WF-004
assignee: juanan
blocked_by: []
created: 2026-09-13
---

## Outcome

Neoflow's reviewed Pi Adapter works across the stable pre-1.0 Pi compatibility family beginning at the first host that supplies the required settled lifecycle, rather than requiring exactly Pi 0.80.6. It records the actual host version, keeps the Workspace's exact manifest-to-Attachment check, and fails closed before dispatch whenever the host version or required native read-only gate cannot support the declared capability.

## Interface

The source package and developer help declare stable Pi `>=0.80.6 <1.0.0`. Each live Adapter instance narrows its Capability Manifest to the actual compatible host version observed from the running Pi package. Unsupported, malformed, unavailable, prerelease, and 1.x host versions never establish an Attachment. The package retains an exact verified-version list separately from the compatibility family.

## Module seam

Pi-specific version discovery, comparison, and admission stay private to the Pi Adapter. Workspace continues validating the generic reviewed Manifest schema and exact membership of the Attachment's host version; it learns no Pi semver rules. The Adapter remains a pure encoder and native lifecycle translator.

## Acceptance

- [x] Stable Pi versions from `0.80.6` through current `0.85.1` establish the same reviewed Direct Review capability; stable later 0.x versions may attempt that contract under fail-closed runtime checks.
- [x] The Adapter derives and records the running host package's actual version rather than the version of its local development dependency.
- [x] Pi below `0.80.6`, prereleases, malformed/unknown versions, and Pi 1.x are refused before Attachment establishment or workflow disclosure.
- [x] Every admitted Adapter Manifest names its exact Attachment host version, preserving Workspace's existing exact compatibility validation and frozen Capability Snapshot evidence.
- [x] Missing or changed native tool APIs withdraw capability without sending a message; callback failures, no-start, correlation loss, and no-replay behavior remain conservative.
- [x] Contract tests cover version boundaries, per-host manifests, and capability withdrawal; the real deterministic-provider probe passes at both the minimum and latest verified Pi versions.
- [x] Requirements, source-package metadata, support metadata, help text, and probe instructions describe the compatibility family and verified evidence honestly.
- [x] Focused suites, full verification, builds, risk probes, and `git diff --check` pass on the repository's pinned Node runtime.

## Constraints

- Do not weaken the registered-tool gate, lifecycle correlation, exact outgoing bytes, result bound, or no-replay rules to gain version coverage.
- Do not teach generic Workspace code Pi version syntax or let environment/user configuration strengthen compatibility evidence.
- Do not imply that a successful transport lifecycle proves answer correctness or that an unverified future Pi release has received the same live matrix coverage.
- Preserve unrelated WF-227 and repository-health work in the working tree.

## Resolution (settled 2026-09-13 from the user's explicit compatibility direction)

### Compatibility policy

The Adapter admits stable semantic versions `>=0.80.6 <1.0.0`. `0.80.6` is the evidence-backed floor: real deterministic-provider probes timed out without the required terminal lifecycle on locally available `0.75.5`, `0.79.4`, and `0.80.3`, while `0.80.6`, `0.80.7`, `0.80.10`, `0.81.0`, `0.81.1`, `0.82.1`, `0.84.1`, and current latest `0.85.1` passed the complete Adapter lifecycle probe. Prereleases are excluded because stable-release evidence does not authorize them. Pi 1.x is a new compatibility decision.

The exact passing releases are retained as the verified matrix. Later stable 0.x releases are an intentionally optimistic compatibility lane matching the user's “try to work with a wide range” direction: they may use the same structural and fail-closed native contract, but the Capability limitation distinguishes them from the live-probed versions. A changed prerequisite withdraws capability; it never silently broadens evidence.

### Actual host identity

The extension reads package identity and version by walking from the active Pi CLI entrypoint to the owning `@earendil-works/pi-coding-agent/package.json`. It does not use the Adapter package's imported `VERSION`, which resolves to the local 0.80.6 development dependency when a newer host loads this source checkout. No environment override or user setting can assert a stronger host identity. If the running host package cannot be identified exactly, Neoflow reports incompatibility and creates no Adapter Attachment.

### Deep compatibility seam

A private Pi-host compatibility Module owns parsing, bounds, verified versions, host-package discovery, and diagnostics. For an admitted host, the Adapter constructs a per-instance Manifest whose `reviewedHostVersions` contains exactly that observed version. Workspace's generic exact-membership check therefore remains unchanged and each durable Capability Snapshot retains the actual host occurrence. Unsupported construction fails before connection.

Native API reads and tool selection are contained as a single pre-dispatch compatibility gate. Missing methods, malformed tool metadata, changed built-in provenance, or inability to install and verify exactly `read`, `grep`, `find`, and `ls` produces `capability-withdrawn` before `sendUserMessage`. Existing guarded event callbacks, correlated start/settlement checks, no-start timeout, and no-replay rules contain later incompatibilities without manufacturing evidence.

### Verification and maintenance

The checked-in deterministic-provider probe remains runnable against the minimum by default and accepts an explicit Pi executable/version so current latest can run the identical scenario. Documentation and metadata publish one range plus the exact verified matrix. Raising the major ceiling or lowering the floor requires a new probe-backed compatibility decision; adding a verified 0.x release requires passing the same real-host probe, not merely editing a version string.

## Resolution status

**Settled from the user's explicit request (2026-09-13).** The request for broad “try to work” behavior selects the optimistic stable pre-1.0 lane, while the existing fail-closed guarantees determine its conservative boundaries and runtime behavior.

## Completion evidence (2026-09-13)

- The Pi Adapter contract and source-island suites pass all 22 tests, covering range boundaries, actual package discovery, exact per-host Manifests, unsupported construction, and pre-disclosure capability withdrawal.
- The identical deterministic-provider lifecycle probe passes on Pi `0.80.6`, `0.80.7`, `0.80.10`, `0.81.0`, `0.81.1`, `0.82.1`, `0.84.1`, and `0.85.1`; Pi `0.80.3` remains rejected below the evidence-backed floor.
- A production extension smoke attached through Pi `0.85.1` in matching real PTYs, while the package-owned discovery probe demonstrated that importing the Adapter checkout's Pi dependency would incorrectly report `0.80.6`.
- The complete Vitest suite passes (40 files, 344 tests). All package and test typechecks, direct builds, build smoke, authoritative-state/runtime/Pi/dogfood risk probes, formatting, dependency firewall, lint, and `git diff --check` pass on Node `26.5.1`; lint reports only the repository's existing warning set.
