---
id: WF-128
title: "Explain short runtime fixture roots"
status: closed
labels:
  - wayfinder:task
parent: WF-093
assignee: juanan
blocked_by: [WF-127]
created: 2026-08-27
---

## Question

Do both Local Runtime contract fixtures record why their apparently non-portable `/tmp` roots are required to keep real socket state inside the fixture?

## Acceptance evidence

- A concise rationale sits immediately beside each hardcoded `mkdtemp('/tmp/...')` call in `localRuntime.test.ts` and `harnessAdapterRuntime.test.ts`.
- Both comments state the load-bearing mechanism: macOS `os.tmpdir()` can push the Unix endpoint beyond the private 100-byte bound, causing runtime discovery to use its shared fallback outside the fixture; the short `/tmp` root keeps socket state fixture-owned.
- A focused process measurement exercises both fixture prefixes under `/tmp` and this machine's `os.tmpdir()`, recording endpoint byte lengths and proving only the long roots fall back outside their fixtures.
- Both contract files still pass together under default Vitest settings, `--no-isolate --no-file-parallelism`, and `--pool=threads --no-isolate`; no `pool`, `isolate`, or `fileParallelism` setting is added.
- Comment-stripped source is byte-identical before and after. No import, test behavior, timeout, production source, package Interface, or configuration changes.
- Canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0.

## Authority

- Parent package-order checkpoint: [Deepen the active Modules](./WF-093-deepen-active-modules.md)
- Settled X-05 mechanism and narrowed comment-only repair: [Disposition the root configuration and legacy findings](./WF-068-disposition-root-and-legacy-findings.md)
- Ranked finding: [`X-05`](../docs/audit/pre-p17-codebase-findings.md#x-05--two-contract-suites-depend-on-an-unexplained-short-runtime-root)
- Endpoint selection implementation: [`runtimeLocation.ts`](../packages/local-runtime/src/runtimeLocation.ts)

## Seam decision

Keep the rationale at the two load-bearing fixture values. Do not hide it in global Vitest configuration or extract a shared test helper: the short path is owner-local setup knowledge, and each future cleanup must encounter the warning before changing its own root.

## Constraints

- Change only comments in the two named Local Runtime contract files plus issue records.
- Do not replace `/tmp` with `os.tmpdir()`, alter endpoint selection, export the endpoint bound, or add a test-only production seam.
- Do not pin Vitest worker/isolation defaults; the suites do not depend on them.
- Preserve both owner-local setup/cleanup paths and exact test behavior.
- Preserve the unrelated root `package.json` pnpm bump outside this child.

## Resolution comment

Both contract fixtures now carry the same two-line rationale immediately before their hardcoded `/tmp` setup: the short root prevents macOS `os.tmpdir()` from pushing the Unix endpoint beyond its 100-byte bound and silently selecting the shared fallback outside the fixture. The comments keep this owner-local knowledge at the exact values a future cleanup might otherwise replace.

A focused compiled `runtimeLocationForWorkspace` measurement proves the mechanism for both prefixes. The direct `/tmp` runtime-contract fixture selects its own 84-byte endpoint, while the `os.tmpdir()` equivalent would be 128 bytes and instead selects the 64-byte shared fallback. The Harness Adapter fixture similarly selects its own 91-byte endpoint; its long equivalent would be 135 bytes and falls back to the same shared root. In both cases only the short root keeps socket state inside the fixture.

The two files pass together as 2 files / 9 tests under default Vitest settings, `--no-isolate --no-file-parallelism`, and `--pool=threads --no-isolate`. No worker, isolation, or file-parallelism setting changed. TypeScript transpilation with comments removed retains exact SHA-256 outputs `97b0697c…ce57` and `9e510fd8…f789`, proving the test programs are unchanged.

On Node 26.5.1 with pnpm 11.20.0, canonical `pnpm v1:verify` passes all 25 files / 145 tests, dependency checks, typecheck, builds, and smoke. All four compiled risk probes pass and `git diff --check` is clean. No import, executable statement, timeout, production source, package Interface, or configuration changed; the unrelated root `package.json` bump remains excluded.
