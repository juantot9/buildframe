import { chmod, mkdir, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capture,
  capturedText,
  completeManifest,
  createCheckout,
  fileAt,
  git,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
  restoreGitDirectory,
} from './workspaceEvidenceScenarios.js';
import type { Workspace } from '../../src/index.js';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

describe('current-change Workspace Evidence', () => {
  it('runs an operator-owned global clean filter selected by tracked attributes', async () => {
    const { root, checkout } = await createCheckout();
    const home = path.join(root, 'operator-home');
    const xdg = path.join(root, 'operator-xdg');
    await mkdir(home);
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const marker = path.join(root, 'operator-filter.marker');
    const filter = path.join(root, 'operator-filter.sh');
    await writeFile(filter, `#!/bin/sh\ncat\nprintf executed >> ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "operator"]\n\tclean = ${filter}\n`);
    await writeFile(path.join(checkout, '.gitattributes'), '*.txt filter=operator\n');
    await writeFile(path.join(checkout, 'filtered.txt'), 'content\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'operator filter basis');
    await rm(marker, { force: true });
    const later = new Date(Date.now() + 2_000);
    await utimes(path.join(checkout, 'filtered.txt'), later, later);

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    expect(await readFile(marker, 'utf8')).toContain('executed');
  });

  it('ignores checkout-local info attributes that select an operator command', async () => {
    const { root, checkout } = await createCheckout({ commit: true });
    const home = path.join(root, 'operator-home');
    const xdg = path.join(root, 'operator-xdg');
    await mkdir(home);
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = xdg;

    const marker = path.join(root, 'info-filter.marker');
    const filter = path.join(root, 'info-filter.sh');
    await writeFile(filter, `#!/bin/sh\ncat\nprintf executed >> ${JSON.stringify(marker)}\n`, { mode: 0o700 });
    await writeFile(path.join(home, '.gitconfig'), `[filter "info"]\n\tclean = ${filter}\n`);
    await mkdir(path.join(checkout, '.git', 'info'), { recursive: true });
    await writeFile(path.join(checkout, '.git', 'info', 'attributes'), '*.txt filter=info\n');
    await writeFile(path.join(checkout, 'info-selected.txt'), 'content\n');

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('captures exact local commit and first-parent range comparisons without using the working tree', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'history.txt'), 'before\n');
    await git(checkout, 'add', 'history.txt');
    await git(checkout, 'commit', '-qm', 'history base');
    const base = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'history.txt'), 'middle\n');
    await git(checkout, 'commit', '-qam', 'history middle');
    const middle = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'history.txt'), 'after\n');
    await git(checkout, 'commit', '-qam', 'history head');
    const head = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'history.txt'), 'uncommitted\n');

    const { workspace, workspaceIdentity, canonicalCheckout } = await openWorkspace(checkout);
    const metadataOnly = new WorkspaceEvidence({
      workspaceIdentity,
      canonicalCheckout,
      afterContentCapture: () => {
        throw new Error('Comparison preview must not enter full content capture');
      },
    });
    await expect(metadataOnly.inspectReviewComparison({ kind: 'last-commit' })).resolves.toMatchObject({
      status: 'available',
      totalFiles: 1,
    });
    await expect(metadataOnly.readReviewCommitGraph(100)).resolves.toMatchObject({
      status: 'available',
      headObjectIdentity: head,
      truncated: false,
    });

    const last = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'last-commit' },
    });
    expect(last.status).toBe('captured');
    if (last.status !== 'captured') return;
    expect(last).toMatchObject({
      selection: { kind: 'last-commit' },
      basis: { kind: 'commit', objectIdentity: middle, subject: 'history middle' },
      comparedState: { kind: 'commit', objectIdentity: head, subject: 'history head' },
      manifest: { totalFiles: 1 },
      verification: { state: 'current' },
    });
    const lastFiles = await completeManifest(workspace, last.evidenceIdentity);
    expect(await capturedText(workspace, last.evidenceIdentity, lastFiles[0]!, 'old')).toBe('middle\n');
    expect(await capturedText(workspace, last.evidenceIdentity, lastFiles[0]!, 'new')).toBe('after\n');

    const lastTwo = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'head-ancestry', commitCount: 2 },
    });
    expect(lastTwo).toMatchObject({
      status: 'captured',
      basis: { objectIdentity: base },
      comparedState: { objectIdentity: head },
    });

    const specific = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'commit', revision: middle.slice(0, 12) },
    });
    expect(specific).toMatchObject({
      status: 'captured',
      selection: { kind: 'commit', revision: middle },
      basis: { objectIdentity: base },
      comparedState: { objectIdentity: middle },
    });

    const throughHead = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'commit-to-head', revision: middle },
    });
    expect(throughHead).toMatchObject({
      status: 'captured',
      selection: { kind: 'commit-to-head', revision: middle },
      basis: { objectIdentity: middle },
      comparedState: { objectIdentity: head },
    });
    expect(
      await workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: { kind: 'commit', revision: 'not-a-local-commit' },
      }),
    ).toMatchObject({ status: 'unavailable', reason: 'revision-not-found' });
  });

  it('captures every explicit fixed commit/tree endpoint pair independently of HEAD and working bytes', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'exact.txt'), 'basis\n');
    await git(checkout, 'add', 'exact.txt');
    await git(checkout, 'commit', '-qm', 'exact basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const basisTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await writeFile(path.join(checkout, 'exact.txt'), 'compared\n');
    await git(checkout, 'commit', '-qam', 'exact compared');
    const comparedCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const comparedTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await writeFile(path.join(checkout, 'exact.txt'), 'dirty bytes are irrelevant\n');

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    let retained:
      | Extract<
          Awaited<ReturnType<Workspace['read']>>,
          { readonly kind: 'workspace.review-comparison.capture'; readonly status: 'captured' }
        >
      | undefined;
    for (const [basisKind, comparedKind] of [
      ['commit', 'commit'],
      ['commit', 'tree'],
      ['tree', 'commit'],
      ['tree', 'tree'],
    ] as const) {
      const captured = await opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-pair',
          basis: {
            kind: 'object',
            objectKind: basisKind,
            objectIdentity: basisKind === 'commit' ? basisCommit : basisTree,
          },
          compared: {
            kind: 'object',
            objectKind: comparedKind,
            objectIdentity: comparedKind === 'commit' ? comparedCommit : comparedTree,
          },
        },
      });
      expect(captured.status).toBe('captured');
      if (captured.status !== 'captured') continue;
      expect(captured).toMatchObject({
        selection: { kind: 'revision-pair' },
        basis: {
          kind: basisKind,
          objectIdentity: basisKind === 'commit' ? basisCommit : basisTree,
        },
        comparedState: {
          kind: comparedKind,
          objectIdentity: comparedKind === 'commit' ? comparedCommit : comparedTree,
        },
        comparisonDynamicInputs: [],
        manifest: { totalFiles: 1 },
        verification: { state: 'current' },
      });
      expect(captured.comparisonResolutionIdentity).toMatch(/^rcp_[0-9a-f]{64}$/u);
      const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
      expect(files[0]?.oldSide?.evidenceSource).toBe(basisKind);
      expect(files[0]?.newSide?.evidenceSource).toBe(comparedKind);
      expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'old')).toBe('basis\n');
      expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'new')).toBe('compared\n');
      retained = captured;
    }
    if (retained === undefined) throw new Error('Exact comparison unavailable');

    await git(checkout, 'commit', '--allow-empty', '-qm', 'unrelated head movement');
    await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('current');

    const objectPath = path.join(checkout, '.git', 'objects', basisTree.slice(0, 2), basisTree.slice(2));
    const hiddenObjectPath = `${objectPath}.missing`;
    await rename(objectPath, hiddenObjectPath);
    try {
      await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('unverified');
    } finally {
      await rename(hiddenObjectPath, objectPath);
    }
  });

  it('retains dynamic local-ref witnesses and detects same-tree movement, deletion, and reversion', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'dynamic.txt'), 'basis\n');
    await git(checkout, 'add', 'dynamic.txt');
    await git(checkout, 'commit', '-qm', 'dynamic basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const basisTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await git(checkout, 'branch', 'review-basis', basisCommit);
    await writeFile(path.join(checkout, 'dynamic.txt'), 'compared\n');
    await git(checkout, 'commit', '-qam', 'dynamic compared');
    const comparedCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const comparedTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await git(checkout, 'tag', '-a', '-m', 'review tag', 'review-compared', comparedCommit);
    await git(checkout, 'update-ref', 'refs/remotes/origin/review-compared', comparedCommit);

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'refs/heads/review-basis',
        },
        compared: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'refs/tags/review-compared',
        },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.basis).toMatchObject({
      kind: 'tree',
      objectIdentity: basisTree,
    });
    expect(captured.comparedState).toMatchObject({
      kind: 'tree',
      objectIdentity: comparedTree,
    });
    expect(captured.comparisonDynamicInputs).toHaveLength(2);
    expect(captured.comparisonDynamicInputs?.map(input => input.role)).toEqual(['basis', 'compared']);
    const annotatedTagIdentity = (await git(checkout, 'rev-parse', 'refs/tags/review-compared')).trim();
    expect(annotatedTagIdentity).not.toBe(comparedCommit);
    expect(captured.comparisonDynamicInputs?.[1]).toMatchObject({
      reference: 'refs/tags/review-compared',
      referenceObjectIdentity: annotatedTagIdentity,
      resolvedObjectKind: 'tree',
      resolvedObjectIdentity: comparedTree,
    });
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    const sameTreeCommit = (
      await git(checkout, 'commit-tree', basisTree, '-p', basisCommit, '-m', 'same tree, distinct commit')
    ).trim();
    await git(checkout, 'update-ref', 'refs/heads/review-basis', sameTreeCommit);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await git(checkout, 'update-ref', 'refs/heads/review-basis', basisCommit);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
    await git(checkout, 'update-ref', '-d', 'refs/heads/review-basis');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');

    const remote = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: {
          kind: 'object',
          objectKind: 'tree',
          objectIdentity: basisTree,
        },
        compared: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'refs/remotes/origin/review-compared',
        },
      },
    });
    expect(remote).toMatchObject({
      status: 'captured',
      comparisonDynamicInputs: [
        {
          role: 'compared',
          reference: 'refs/remotes/origin/review-compared',
        },
      ],
    });

    const head = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: {
          kind: 'object',
          objectKind: 'tree',
          objectIdentity: basisTree,
        },
        compared: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'HEAD',
        },
      },
    });
    expect(head.status).toBe('captured');
    if (head.status !== 'captured') return;
    const sameHeadTree = (
      await git(checkout, 'commit-tree', comparedTree, '-p', comparedCommit, '-m', 'same HEAD tree')
    ).trim();
    await git(checkout, 'reset', '--hard', sameHeadTree);
    await expect(verifier.verifyReviewComparison(head)).resolves.toBe('stale');
    await git(checkout, 'reset', '--hard', comparedCommit);
    await expect(verifier.verifyReviewComparison(head)).resolves.toBe('current');
  });

  it('retries when a dynamic ref moves to a distinct commit with the same endpoint tree', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'race-ref.txt'), 'basis\n');
    await git(checkout, 'add', 'race-ref.txt');
    await git(checkout, 'commit', '-qm', 'race ref basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const basisTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await git(checkout, 'branch', 'racing-ref', basisCommit);
    await writeFile(path.join(checkout, 'race-ref.txt'), 'compared\n');
    await git(checkout, 'commit', '-qam', 'race ref compared');
    const comparedTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    const movedCommit = (
      await git(checkout, 'commit-tree', basisTree, '-p', basisCommit, '-m', 'moved same tree')
    ).trim();
    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      afterContentCapture: async attempt => {
        if (attempt === 1) {
          await git(checkout, 'update-ref', 'refs/heads/racing-ref', movedCommit);
        }
      },
    });
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-pair',
        basis: {
          kind: 'local-ref',
          objectKind: 'tree',
          reference: 'refs/heads/racing-ref',
        },
        compared: {
          kind: 'object',
          objectKind: 'tree',
          objectIdentity: comparedTree,
        },
      },
    });
    expect(captured).toMatchObject({
      status: 'captured',
      captureAttempts: 2,
      basis: { kind: 'tree', objectIdentity: basisTree },
      comparisonDynamicInputs: [
        {
          role: 'basis',
          referenceObjectIdentity: movedCommit,
          resolvedObjectIdentity: basisTree,
        },
      ],
    });
  });

  it('captures one unique selected-ref merge base and never falls back when none is local', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'shared.txt'), 'shared\n');
    await git(checkout, 'add', 'shared.txt');
    await git(checkout, 'commit', '-qm', 'shared basis');
    const shared = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const primary = (await git(checkout, 'branch', '--show-current')).trim();
    await git(checkout, 'branch', 'review-target', shared);
    await writeFile(path.join(checkout, 'primary.txt'), 'primary\n');
    await git(checkout, 'add', 'primary.txt');
    await git(checkout, 'commit', '-qm', 'primary compared');
    const compared = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await git(checkout, 'checkout', '-q', 'review-target');
    await writeFile(path.join(checkout, 'target.txt'), 'target\n');
    await git(checkout, 'add', 'target.txt');
    await git(checkout, 'commit', '-qm', 'target tip');
    const target = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await git(checkout, 'checkout', '-q', primary);

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const selection = {
      kind: 'local-ref-merge-base',
      selectedReference: 'refs/heads/review-target',
      comparedCommitIdentity: compared,
    } as const;
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection,
    });
    expect(captured).toMatchObject({
      status: 'captured',
      basis: { kind: 'commit', objectIdentity: shared },
      comparedState: { kind: 'commit', objectIdentity: compared },
      comparisonDynamicInputs: [
        {
          role: 'merge-base-reference',
          reference: 'refs/heads/review-target',
          referenceObjectIdentity: target,
          resolvedObjectIdentity: target,
        },
      ],
    });
    if (captured.status !== 'captured') return;
    const sameTargetTree = (
      await git(checkout, 'commit-tree', `${target}^{tree}`, '-p', target, '-m', 'same target tree')
    ).trim();
    await git(checkout, 'update-ref', 'refs/heads/review-target', sameTargetTree);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await git(checkout, 'update-ref', 'refs/heads/review-target', target);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    const tree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    const orphan = (await git(checkout, 'commit-tree', tree, '-m', 'unrelated root')).trim();
    await git(checkout, 'update-ref', 'refs/heads/unrelated', orphan);
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          ...selection,
          selectedReference: 'refs/heads/unrelated',
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'merge-base-not-found',
    });

    const firstSide = (await git(checkout, 'commit-tree', tree, '-p', shared, '-m', 'first side')).trim();
    const secondSide = (await git(checkout, 'commit-tree', tree, '-p', shared, '-m', 'second side')).trim();
    const firstMerge = (
      await git(checkout, 'commit-tree', tree, '-p', firstSide, '-p', secondSide, '-m', 'first criss-cross merge')
    ).trim();
    const secondMerge = (
      await git(checkout, 'commit-tree', tree, '-p', secondSide, '-p', firstSide, '-m', 'second criss-cross merge')
    ).trim();
    await git(checkout, 'update-ref', 'refs/heads/criss-cross', firstMerge);
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'local-ref-merge-base',
          selectedReference: 'refs/heads/criss-cross',
          comparedCommitIdentity: secondMerge,
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'merge-base-ambiguous',
    });
  });

  it('rejects open or non-exact revision selection shapes before retaining evidence', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const opened = await openWorkspace(checkout);
    const commit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const tree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    const read = async (selection: unknown) =>
      await opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection,
      } as never);

    for (const selection of [
      {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: commit.slice(0, 12) },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      },
      {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: commit.toUpperCase() },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      },
      {
        kind: 'revision-pair',
        basis: { kind: 'local-ref', objectKind: 'commit', reference: 'master' },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      },
      {
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: commit, extra: true },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      },
    ]) {
      await expect(read(selection)).rejects.toThrow(/Review revision endpoint|Review comparison selection/u);
    }

    await expect(
      read({
        kind: 'revision-pair',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: tree },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'revision-not-found',
    });
    await expect(
      read({
        kind: 'revision-pair',
        basis: {
          kind: 'local-ref',
          objectKind: 'commit',
          reference: 'refs/heads/not-present',
        },
        compared: { kind: 'object', objectKind: 'commit', objectIdentity: commit },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'local-ref-not-found',
    });
  });

  it('retains one FIFO across current-change and comparison captures', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'retention.txt'), 'committed\n');
    await git(checkout, 'add', 'retention.txt');
    await git(checkout, 'commit', '-qm', 'retention basis');
    await writeFile(path.join(checkout, 'retention.txt'), 'working A\n');

    const { workspace } = await openWorkspace(checkout);
    const first = await capture(workspace);
    expect(first.status).toBe('captured');
    if (first.status !== 'captured') throw new Error('First capture unavailable');

    const comparison = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'last-commit' },
    });
    expect(comparison.status).toBe('captured');
    if (comparison.status !== 'captured') {
      throw new Error('Comparison capture unavailable');
    }

    await writeFile(path.join(checkout, 'retention.txt'), 'working C\n');
    const third = await capture(workspace);
    expect(third.status).toBe('captured');
    if (third.status !== 'captured') throw new Error('Third capture unavailable');
    expect(new Set([first.evidenceIdentity, comparison.evidenceIdentity, third.evidenceIdentity]).size).toBe(3);

    const manifest = async (evidenceIdentity: string) =>
      await workspace.read({
        kind: 'workspace.current-changes.manifest',
        evidenceIdentity,
        offset: 0,
        limit: 64,
      });
    // The bound must exceed the projection's live set plus an in-flight commit
    // capture (WF-247), so the first three captures all remain retained.
    await expect(manifest(first.evidenceIdentity)).resolves.toMatchObject({
      status: 'available',
      evidenceIdentity: first.evidenceIdentity,
      manifest: { totalFiles: 1 },
    });
    await expect(manifest(comparison.evidenceIdentity)).resolves.toMatchObject({
      status: 'available',
      evidenceIdentity: comparison.evidenceIdentity,
      manifest: { totalFiles: 1 },
    });
    await expect(manifest(third.evidenceIdentity)).resolves.toMatchObject({
      status: 'available',
      evidenceIdentity: third.evidenceIdentity,
      manifest: { totalFiles: 1 },
    });

    const fourth = await workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'last-commit' },
    });
    expect(fourth.status).toBe('captured');
    if (fourth.status !== 'captured') {
      throw new Error('Fourth capture unavailable');
    }
    expect(
      new Set([first.evidenceIdentity, comparison.evidenceIdentity, third.evidenceIdentity, fourth.evidenceIdentity])
        .size,
    ).toBe(4);
    await expect(manifest(first.evidenceIdentity)).resolves.toMatchObject({
      status: 'available',
      evidenceIdentity: first.evidenceIdentity,
      manifest: { totalFiles: 1 },
    });

    const fifth = await capture(workspace);
    expect(fifth.status).toBe('captured');
    if (fifth.status !== 'captured') throw new Error('Fifth capture unavailable');
    await expect(manifest(first.evidenceIdentity)).resolves.toMatchObject({
      status: 'unavailable',
      evidenceIdentity: first.evidenceIdentity,
      verification: {
        state: 'unverified',
        reason: 'evidence-not-retained',
      },
    });
    for (const retained of [comparison, third, fourth, fifth]) {
      await expect(manifest(retained.evidenceIdentity)).resolves.toMatchObject({
        status: 'available',
        evidenceIdentity: retained.evidenceIdentity,
        manifest: { totalFiles: 1 },
      });
    }
  });

  it('refuses to invent a parent for a merge commit comparison', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const primary = (await git(checkout, 'branch', '--show-current')).trim();
    await git(checkout, 'checkout', '-qb', 'comparison-side');
    await writeFile(path.join(checkout, 'side.txt'), 'side\n');
    await git(checkout, 'add', 'side.txt');
    await git(checkout, 'commit', '-qm', 'side commit');
    await git(checkout, 'checkout', '-q', primary);
    await writeFile(path.join(checkout, 'primary.txt'), 'primary\n');
    await git(checkout, 'add', 'primary.txt');
    await git(checkout, 'commit', '-qm', 'primary commit');
    await git(checkout, 'merge', '--no-ff', '-qm', 'merge comparison', 'comparison-side');

    const { workspace, workspaceIdentity, canonicalCheckout } = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({ workspaceIdentity, canonicalCheckout });
    const graph = await evidence.readReviewCommitGraph(100);
    expect(graph.status).toBe('available');
    if (graph.status === 'available') {
      expect(graph.rows.some(row => row.kind === 'connector')).toBe(true);
      const merge = graph.rows.find(row => row.kind === 'commit' && row.subject === 'merge comparison');
      expect(merge).toMatchObject({ kind: 'commit' });
      if (merge?.kind === 'commit') {
        expect(merge.parentIdentities).toHaveLength(2);
        await expect(
          evidence.inspectReviewComparison({
            kind: 'commit',
            revision: merge.objectIdentity,
            parentRevision: merge.parentIdentities[0]!,
          }),
        ).resolves.toMatchObject({ status: 'available' });
      }
    }
    expect(
      await workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: { kind: 'last-commit' },
      }),
    ).toMatchObject({ status: 'unavailable', reason: 'merge-parent-ambiguous' });
  });

  it('captures one complete immutable HEAD-to-effective-working-state manifest with exact old/new bytes', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'overlap.txt'), 'before\n');
    await writeFile(path.join(checkout, 'deleted.txt'), 'delete me\n');
    await writeFile(path.join(checkout, 'rename-source.txt'), 'rename me\n');
    await writeFile(path.join(checkout, 'mode.txt'), 'mode\n');
    await writeFile(path.join(checkout, 'binary.bin'), Buffer.from([1, 0, 2]));
    await writeFile(path.join(checkout, 'quoted " file.txt'), 'quoted before\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'fixture');

    await writeFile(path.join(checkout, 'overlap.txt'), 'staged\n');
    await git(checkout, 'add', 'overlap.txt');
    await writeFile(path.join(checkout, 'overlap.txt'), 'working\n');
    await rm(path.join(checkout, 'deleted.txt'));
    await git(checkout, 'mv', 'rename-source.txt', 'renamed-café.txt');
    await chmod(path.join(checkout, 'mode.txt'), 0o755);
    await writeFile(path.join(checkout, 'binary.bin'), Buffer.from([3, 0, 4]));
    await writeFile(path.join(checkout, 'quoted " file.txt'), 'quoted after\n');
    await writeFile(path.join(checkout, 'staged-added.txt'), 'staged add\n');
    await git(checkout, 'add', 'staged-added.txt');
    await writeFile(path.join(checkout, 'untracked-λ.txt'), 'untracked\n');
    await writeFile(path.join(checkout, 'ignored.txt'), 'excluded\n');

    const { workspace, workspaceIdentity } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;

    expect(captured).toMatchObject({
      workspaceIdentity,
      basis: { kind: 'head', selector: 'HEAD', state: 'resolved' },
      comparedState: {
        kind: 'effective-working-state',
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
      },
      verification: { state: 'current' },
      captureAttempts: 1,
    });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.manifest)).toBe(true);

    const files = await completeManifest(workspace, captured.evidenceIdentity, 3);
    expect(files).toHaveLength(8);
    expect(files.some(file => file.newSide?.path.display === 'ignored.txt')).toBe(false);
    expect(Object.isFrozen(files[0])).toBe(true);

    const overlap = fileAt(files, 'overlap.txt');
    expect(overlap).toMatchObject({
      status: 'modified',
      staging: { index: 'modified', workingTree: 'modified' },
      oldSide: { contentAvailability: 'captured', classification: 'text' },
      newSide: { contentAvailability: 'captured', classification: 'text' },
    });
    expect(await capturedText(workspace, captured.evidenceIdentity, overlap, 'old')).toBe('before\n');
    expect(await capturedText(workspace, captured.evidenceIdentity, overlap, 'new')).toBe('working\n');

    const deleted = fileAt(files, 'deleted.txt');
    expect(deleted.status).toBe('deleted');
    expect(deleted.oldSide).toBeDefined();
    expect(deleted.newSide).toBeUndefined();

    const renamed = fileAt(files, 'renamed-café.txt');
    expect(renamed.status).toBe('renamed');
    expect(renamed.oldSide?.path.display).toBe('rename-source.txt');
    expect(renamed.newSide?.path.display).toBe('renamed-café.txt');
    expect(Buffer.from(renamed.newSide?.path.bytesBase64 ?? '', 'base64').toString('utf8')).toBe('renamed-café.txt');

    const mode = fileAt(files, 'mode.txt');
    expect(mode.status).toBe('mode-changed');
    expect(mode.oldSide?.gitMode).toBe('100644');
    expect(mode.newSide?.gitMode).toBe('100755');

    const binary = fileAt(files, 'binary.bin');
    expect(binary.newSide?.classification).toBe('binary');
    const quoted = fileAt(files, 'quoted " file.txt');
    expect(quoted.newSide?.path.display).toBe('quoted " file.txt');
    expect(fileAt(files, 'staged-added.txt').oldSide).toBeUndefined();
    expect(fileAt(files, 'untracked-λ.txt').staging).toEqual({
      index: 'untracked',
      workingTree: 'untracked',
    });

    const firstTwoBytes = await workspace.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: overlap.fileIdentity,
      side: 'new',
      offset: 0,
      length: 2,
    });
    expect(firstTwoBytes.status).toBe('available');
    if (firstTwoBytes.status === 'available') {
      expect(Buffer.from(firstTwoBytes.bytesBase64, 'base64').toString()).toBe('wo');
      expect(firstTwoBytes.complete).toBe(false);
      expect(firstTwoBytes.byteLength).toBe(2);
    }
    await expect(
      workspace.read({
        kind: 'workspace.current-changes.content',
        evidenceIdentity: captured.evidenceIdentity,
        fileIdentity: overlap.fileIdentity,
        side: 'new',
        offset: 0,
        length: captured.limits.maxContentWindowBytes + 1,
      }),
    ).rejects.toThrow('bounded evidence window');
  });

  it('uses an explicit unborn HEAD basis while retaining staged, unstaged, and untracked evidence once', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'staged.txt'), 'staged\n');
    await git(checkout, 'add', 'staged.txt');
    await writeFile(path.join(checkout, 'staged.txt'), 'working\n');
    await writeFile(path.join(checkout, 'untracked.txt'), 'untracked\n');

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.basis).toMatchObject({
      selector: 'HEAD',
      objectIdentity: null,
      state: 'unborn',
    });
    expect(captured.verification.state).toBe('current');

    const files = await completeManifest(workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(2);
    const staged = fileAt(files, 'staged.txt');
    expect(staged).toMatchObject({
      status: 'added',
      staging: { index: 'added', workingTree: 'modified' },
    });
    expect(staged.oldSide).toBeUndefined();
    expect(await capturedText(workspace, captured.evidenceIdentity, staged, 'new')).toBe('working\n');
  });

  it('captures current changes beside an untracked nested repository without descending into it', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'untracked.txt'), 'untracked\n');
    // A real repository: Git lists it as one `nested/` entry and never its files.
    await mkdir(path.join(checkout, 'nested'), { recursive: true });
    await git(path.join(checkout, 'nested'), 'init', '-q');
    await writeFile(path.join(checkout, 'nested', 'inside.txt'), 'inside\n');

    const opened = await openWorkspace(checkout);
    const workspace = opened.workspace;
    const repositoryFiles = await new WorkspaceEvidence(opened).readCurrentRepositoryFiles();
    expect(repositoryFiles.status).toBe('available');
    if (repositoryFiles.status !== 'available') return;
    expect(repositoryFiles.files.map(file => file.path.display)).toEqual(['untracked.txt']);

    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('current');
    const files = await completeManifest(workspace, captured.evidenceIdentity);
    expect(files.map(file => file.newSide?.path.display)).toEqual(['untracked.txt']);

    // The nested repository still counts as working-state movement.
    await rm(path.join(checkout, 'nested'), { recursive: true, force: true });
    const verified = await workspace.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.evidenceIdentity,
    });
    expect(verified.verification.state).toBe('stale');
  });

  it('retries a changing working file and publishes only the coherent successor bytes', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'race.txt'), 'base\n');
    await git(checkout, 'add', 'race.txt');
    await git(checkout, 'commit', '-qm', 'race base');
    await writeFile(path.join(checkout, 'race.txt'), 'first\n');
    const opened = await openWorkspace(checkout);

    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      afterContentCapture: async attempt => {
        if (attempt === 1) {
          await writeFile(path.join(checkout, 'race.txt'), 'second\n');
        }
      },
    });
    const captured = await evidence.read({ kind: 'workspace.current-changes.capture' });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.captureAttempts).toBe(2);
    expect(captured.verification.state).toBe('current');

    const manifest = await evidence.read({
      kind: 'workspace.current-changes.manifest',
      evidenceIdentity: captured.evidenceIdentity,
      offset: 0,
      limit: 1,
    });
    expect(manifest.status).toBe('available');
    if (manifest.status !== 'available') return;
    const file = manifest.files[0];
    if (file === undefined) throw new Error('missing retry file');
    const content = await evidence.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: file.fileIdentity,
      side: 'new',
      offset: 0,
      length: 64,
    });
    expect(content.status).toBe('available');
    if (content.status === 'available') {
      expect(Buffer.from(content.bytesBase64, 'base64').toString()).toBe('second\n');
    }
  });

  it('degrades per file, keeps the manifest complete, and admits later small files within the remaining budget', async () => {
    const { checkout } = await createCheckout();
    await writeFile(path.join(checkout, 'a-big.txt'), 'x'.repeat(32));
    await writeFile(path.join(checkout, 'z-small.txt'), 'tiny');
    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      limits: {
        maxCapturedContentBytes: 16,
        maxCapturedFileBytes: 64,
        maxVerifiedContentBytes: 128,
        maxVerifiedFileBytes: 128,
      },
    });

    const captured = await evidence.read({ kind: 'workspace.current-changes.capture' });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('current');
    expect(captured.capturedContentBytes).toBe(4);
    expect(captured.manifest.totalFiles).toBe(2);

    const manifest = await evidence.read({
      kind: 'workspace.current-changes.manifest',
      evidenceIdentity: captured.evidenceIdentity,
      offset: 0,
      limit: 2,
    });
    expect(manifest.status).toBe('available');
    if (manifest.status !== 'available') return;
    const big = fileAt(manifest.files, 'a-big.txt');
    const small = fileAt(manifest.files, 'z-small.txt');
    expect(big.newSide).toMatchObject({
      contentAvailability: 'not-captured',
      contentLimitation: 'aggregate-capture-limit',
      contentIdentity: { algorithm: 'sha256' },
    });
    expect(small.newSide).toMatchObject({
      contentAvailability: 'captured',
      classification: 'text',
    });

    const omitted = await evidence.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: big.fileIdentity,
      side: 'new',
      offset: 0,
      length: 16,
    });
    expect(omitted).toMatchObject({
      status: 'unavailable',
      reason: 'aggregate-capture-limit',
    });
    const admitted = await evidence.read({
      kind: 'workspace.current-changes.content',
      evidenceIdentity: captured.evidenceIdentity,
      fileIdentity: small.fileIdentity,
      side: 'new',
      offset: 0,
      length: 16,
    });
    expect(admitted.status).toBe('available');
    if (admitted.status === 'available') {
      expect(Buffer.from(admitted.bytesBase64, 'base64').toString()).toBe('tiny');
    }
  });

  it('derives current, stale, and unverified from scope-relevant evidence without treating inspection failure as a difference', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'tracked.txt'), 'base\n');
    await git(checkout, 'add', 'tracked.txt');
    await git(checkout, 'commit', '-qm', 'tracked base');
    await writeFile(path.join(checkout, 'tracked.txt'), 'snapshot\n');
    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;

    await writeFile(path.join(checkout, 'ignored.txt'), 'irrelevant\n');
    const ignoredOnly = await workspace.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.evidenceIdentity,
    });
    expect(ignoredOnly.verification.state).toBe('current');

    await writeFile(path.join(checkout, 'tracked.txt'), 'different\n');
    const changed = await workspace.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.evidenceIdentity,
    });
    expect(changed.verification).toMatchObject({
      state: 'stale',
      reason: 'content-changed',
    });

    await writeFile(path.join(checkout, 'tracked.txt'), 'snapshot\n');
    const reverted = await workspace.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.evidenceIdentity,
    });
    expect(reverted.verification.state).toBe('current');

    await git(checkout, 'commit', '--allow-empty', '-qm', 'move head without changing tree');
    const movedHead = await workspace.read({
      kind: 'workspace.current-changes.verify',
      evidenceIdentity: captured.evidenceIdentity,
    });
    expect(movedHead.verification).toMatchObject({
      state: 'stale',
      reason: 'head-moved',
    });

    const gitDirectory = path.join(checkout, '.git');
    const hiddenGitDirectory = path.join(checkout, '.git-unavailable');
    await rename(gitDirectory, hiddenGitDirectory);
    try {
      const unavailable = await workspace.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: captured.evidenceIdentity,
      });
      expect(unavailable.verification).toMatchObject({
        state: 'unverified',
        reason: 'inspection-failed',
      });
    } finally {
      await restoreGitDirectory(hiddenGitDirectory, gitDirectory);
    }
  });

  it('survives early Git exit while at least 1,600 tracked object identities drain to stdin', async () => {
    const { checkout } = await createCheckout({ commit: true });
    const fileCount = 1_600;
    for (let start = 0; start < fileCount; start += 100) {
      await Promise.all(
        Array.from({ length: 100 }, async (_, offset) => {
          const index = start + offset;
          await writeFile(path.join(checkout, `tracked-${String(index).padStart(4, '0')}.txt`), `before ${index}\n`);
        }),
      );
    }
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'tracked object basis');
    for (let start = 0; start < fileCount; start += 100) {
      await Promise.all(
        Array.from({ length: 100 }, async (_, offset) => {
          const index = start + offset;
          await writeFile(path.join(checkout, `tracked-${String(index).padStart(4, '0')}.txt`), `after ${index}\n`);
        }),
      );
    }

    const { workspaceIdentity, canonicalCheckout } = await openWorkspace(checkout);
    const gitDirectory = path.join(checkout, '.git');
    const hiddenGitDirectory = path.join(checkout, '.git-early-exit');
    let forceEarlyExit = true;
    let gitDirectoryHidden = false;
    const evidence = new WorkspaceEvidence({
      workspaceIdentity,
      canonicalCheckout,
      afterInitialInspection: async () => {
        if (!forceEarlyExit) return;
        forceEarlyExit = false;
        await rename(gitDirectory, hiddenGitDirectory);
        gitDirectoryHidden = true;
      },
    });

    try {
      await expect(evidence.read({ kind: 'workspace.current-changes.capture' })).resolves.toMatchObject({
        status: 'unverified',
        verification: { reason: 'inspection-failed' },
      });
    } finally {
      if (gitDirectoryHidden) {
        await restoreGitDirectory(hiddenGitDirectory, gitDirectory);
        gitDirectoryHidden = false;
      }
    }

    await expect(evidence.read({ kind: 'workspace.current-changes.capture' })).resolves.toMatchObject({
      status: 'captured',
      manifest: { totalFiles: fileCount },
    });
  }, 90_000);

  it('captures the complete 1,000-file, 50 MiB textual floor without eager content in the manifest view', async () => {
    const { checkout } = await createCheckout();
    const totalBytes = 50 * 1024 * 1024;
    const smaller = Buffer.alloc(52_428, 0x78);
    const larger = Buffer.alloc(52_429, 0x79);
    for (let start = 0; start < 1_000; start += 100) {
      await Promise.all(
        Array.from({ length: 100 }, async (_, offset) => {
          const index = start + offset;
          const bytes = index < 800 ? larger : smaller;
          await writeFile(path.join(checkout, `file-${String(index).padStart(4, '0')}.txt`), bytes);
        }),
      );
    }

    const { workspace } = await openWorkspace(checkout);
    const captured = await capture(workspace);
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.verification.state).toBe('current');
    expect(captured.manifest.totalFiles).toBe(1_000);
    expect(captured.capturedContentBytes).toBe(totalBytes);
    expect(JSON.stringify(captured).length).toBeLessThan(10_000);

    const files = await completeManifest(workspace, captured.evidenceIdentity);
    expect(files).toHaveLength(1_000);
    expect(
      files.every(
        file =>
          file.oldSide === undefined &&
          file.newSide?.contentAvailability === 'captured' &&
          file.newSide.classification === 'text',
      ),
    ).toBe(true);
  }, 60_000);
});
