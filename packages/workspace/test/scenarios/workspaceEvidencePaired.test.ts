import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  capturedText,
  completeManifest,
  createCheckout,
  git,
  installWorkspaceEvidenceHygiene,
  openWorkspace,
} from './workspaceEvidenceScenarios.js';
import type { Workspace } from '../../src/index.js';
import type { ReviewComparisonSelection } from '@buildframe/workspace/workspace-evidence';
import { WorkspaceEvidence } from '../../src/workspaceEvidence/index.js';

installWorkspaceEvidenceHygiene();

describe('paired index and working Workspace Evidence', () => {
  it('captures commit/tree-to-index comparisons from staged index facts alone', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'exact.txt'), 'basis\n');
    await git(checkout, 'add', 'exact.txt');
    await git(checkout, 'commit', '-qm', 'exact basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const basisTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await writeFile(path.join(checkout, 'exact.txt'), 'staged\n');
    await git(checkout, 'add', 'exact.txt');
    const stagedOid = (await git(checkout, 'hash-object', '-w', 'exact.txt')).trim();
    await writeFile(path.join(checkout, 'exact.txt'), 'dirty working bytes\n');
    await writeFile(path.join(checkout, 'untracked.txt'), 'untracked\n');

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
    for (const basisKind of ['commit', 'tree'] as const) {
      const captured = await opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-index',
          basis: {
            kind: 'object',
            objectKind: basisKind,
            objectIdentity: basisKind === 'commit' ? basisCommit : basisTree,
          },
        },
      });
      expect(captured.status).toBe('captured');
      if (captured.status !== 'captured') continue;
      expect(captured).toMatchObject({
        basis: {
          kind: basisKind,
          objectIdentity: basisKind === 'commit' ? basisCommit : basisTree,
        },
        comparedState: {
          kind: 'index',
          selector: 'index',
          objectFormat: 'sha1',
          entryCount: 2,
          indexFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
        comparisonDynamicInputs: [],
        manifest: { totalFiles: 1 },
        verification: { state: 'current' },
      });
      expect(captured.comparisonResolutionIdentity).toMatch(/^rcp_[0-9a-f]{64}$/u);
      const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
      expect(files[0]?.status).toBe('modified');
      expect(files[0]?.staging).toEqual({
        index: 'modified',
        workingTree: 'unchanged',
      });
      expect(files[0]?.oldSide).toMatchObject({
        evidenceSource: basisKind,
        kind: 'regular',
      });
      expect(files[0]?.newSide).toMatchObject({
        evidenceSource: 'index',
        kind: 'regular',
        objectIdentity: { algorithm: 'sha1', value: stagedOid },
      });
      expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'old')).toBe('basis\n');
      expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'new')).toBe('staged\n');
      retained = captured;
    }
    if (retained === undefined) throw new Error('Index comparison unavailable');

    await writeFile(path.join(checkout, 'exact.txt'), 'irrelevant further dirty bytes\n');
    await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('current');
    await git(checkout, 'commit', '--allow-empty', '-qm', 'unrelated head');
    await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('current');
    await git(checkout, 'add', 'exact.txt');
    await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('stale');
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${stagedOid},exact.txt`);
    await expect(verifier.verifyReviewComparison(retained)).resolves.toBe('current');
  });

  it('derives staging provenance from index facts and never from working bytes', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'provenance.txt'), 'basis\n');
    await git(checkout, 'add', 'provenance.txt');
    await git(checkout, 'commit', '-qm', 'provenance basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'provenance.txt'), 'staged\n');
    const stagedOid = (await git(checkout, 'hash-object', '-w', 'provenance.txt')).trim();
    // The working file was reverted to the committed bytes after staging a
    // different blob, so only the index facts know about the change.
    await writeFile(path.join(checkout, 'provenance.txt'), 'basis\n');
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${stagedOid},provenance.txt`);

    const opened = await openWorkspace(checkout);
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-index',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.manifest.totalFiles).toBe(1);
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    expect(files[0]?.staging).toEqual({
      index: 'modified',
      workingTree: 'unchanged',
    });
    expect(files[0]?.status).toBe('modified');
    expect(files[0]?.newSide).toMatchObject({
      evidenceSource: 'index',
      objectIdentity: { value: stagedOid },
    });
    expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'old')).toBe('basis\n');
    expect(await capturedText(opened.workspace, captured.evidenceIdentity, files[0]!, 'new')).toBe('staged\n');
  });

  it('captures revision-to-working-state comparisons with independent staging provenance', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'a.txt'), 'a\n');
    await writeFile(path.join(checkout, 'b.txt'), 'b\n');
    await git(checkout, 'add', 'a.txt', 'b.txt');
    await git(checkout, 'commit', '-qm', 'working basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const aOriginal = (await git(checkout, 'hash-object', '-w', 'a.txt')).trim();
    await writeFile(path.join(checkout, 'a.txt'), 'a-staged\n');
    await git(checkout, 'add', 'a.txt');
    const aStaged = (await git(checkout, 'hash-object', '-w', 'a.txt')).trim();
    await writeFile(path.join(checkout, 'a.txt'), 'a-unstaged\n');
    await rm(path.join(checkout, 'b.txt'));
    await writeFile(path.join(checkout, 'c.txt'), 'c\n');

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-working-state',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured).toMatchObject({
      basis: { kind: 'commit', objectIdentity: basisCommit },
      comparedState: {
        kind: 'effective-working-state',
        selector: 'effective-working-state',
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
        workingFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      manifest: { totalFiles: 3 },
      verification: { state: 'current' },
    });
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    const a = files.find(file => file.newSide?.path.display === 'a.txt');
    const b = files.find(file => file.oldSide?.path.display === 'b.txt');
    const c = files.find(file => file.newSide?.path.display === 'c.txt');
    expect(a).toMatchObject({
      status: 'modified',
      staging: { index: 'modified', workingTree: 'modified' },
      oldSide: { evidenceSource: 'commit' },
      newSide: { evidenceSource: 'working-tree' },
    });
    expect(b).toMatchObject({
      status: 'deleted',
      staging: { index: 'unchanged', workingTree: 'deleted' },
    });
    expect(b?.newSide).toBeUndefined();
    expect(c).toMatchObject({
      status: 'added',
      staging: { index: 'untracked', workingTree: 'untracked' },
      newSide: { evidenceSource: 'working-tree' },
    });
    expect(c?.oldSide).toBeUndefined();
    expect(await capturedText(opened.workspace, captured.evidenceIdentity, a!, 'new')).toBe('a-unstaged\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
    const inspection = await verifier.inspectReviewComparison({
      kind: 'revision-to-working-state',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
    });
    expect(inspection).toMatchObject({
      status: 'available',
      basis: { kind: 'commit', objectIdentity: basisCommit },
      comparedState: {
        kind: 'effective-working-state',
        entryCount: 4,
      },
      totalFiles: 3,
    });
    if (inspection.status !== 'available') {
      throw new Error('Inspection unavailable');
    }
    expect(inspection.comparisonResolutionIdentity).toBe(captured.comparisonResolutionIdentity);

    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${aOriginal},a.txt`);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${aStaged},a.txt`);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    await writeFile(path.join(checkout, 'c.txt'), 'c-moved\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await writeFile(path.join(checkout, 'c.txt'), 'c\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
  });

  it('captures index-to-working-tree comparisons with unmerged stages as unavailable evidence', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'f.txt'), 'base\n');
    await writeFile(path.join(checkout, 'g.txt'), 'g\n');
    await git(checkout, 'add', 'f.txt', 'g.txt');
    await git(checkout, 'commit', '-qm', 'merge base content');
    await git(checkout, 'checkout', '-q', '-b', 'side');
    await writeFile(path.join(checkout, 'f.txt'), 'side\n');
    await git(checkout, 'add', 'f.txt');
    await git(checkout, 'commit', '-qm', 'side change');
    await git(checkout, 'checkout', '-q', '-');
    await writeFile(path.join(checkout, 'f.txt'), 'main\n');
    await git(checkout, 'add', 'f.txt');
    await git(checkout, 'commit', '-qm', 'main change');
    await git(checkout, 'merge', 'side').catch(() => '');
    await writeFile(path.join(checkout, 'g.txt'), 'g-modified\n');
    await writeFile(path.join(checkout, 'untracked.txt'), 'untracked\n');

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: { kind: 'index-to-working-tree' },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured).toMatchObject({
      basis: {
        kind: 'index',
        selector: 'index',
        entryCount: 3,
        indexFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      comparedState: {
        kind: 'working-tree',
        selector: 'working-tree',
        workingFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      manifest: { totalFiles: 2 },
    });
    const files = await completeManifest(opened.workspace, captured.evidenceIdentity);
    const f = files.find(file => file.oldSide?.path.display === 'f.txt');
    const g = files.find(file => file.oldSide?.path.display === 'g.txt');
    expect(f).toMatchObject({
      status: 'modified',
      staging: { index: 'unmerged', workingTree: 'modified' },
      oldSide: {
        evidenceSource: 'index',
        kind: 'unknown',
        gitMode: '000000',
        contentAvailability: 'unavailable',
        contentLimitation: 'unmerged-index',
      },
      newSide: { evidenceSource: 'working-tree' },
    });
    expect(f?.oldSide?.objectIdentity).toBeUndefined();
    expect(f?.newSide?.contentIdentity).toBeDefined();
    expect(g).toMatchObject({
      status: 'modified',
      staging: { index: 'unchanged', workingTree: 'modified' },
    });
    expect(files.some(file => file.newSide?.path.display === 'untracked.txt')).toBe(false);
    expect(captured.verification.state).toBe('current');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    await writeFile(path.join(checkout, 'g.txt'), 'g-moved\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await writeFile(path.join(checkout, 'g.txt'), 'g-modified\n');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
    await git(checkout, 'add', 'f.txt');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('keeps dynamic ref witnesses for paired comparisons and detects same-tree movement', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'paired.txt'), 'paired\n');
    await git(checkout, 'add', 'paired.txt');
    await git(checkout, 'commit', '-qm', 'paired basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    const basisTree = (await git(checkout, 'rev-parse', 'HEAD^{tree}')).trim();
    await git(checkout, 'branch', 'paired-basis', basisCommit);

    const opened = await openWorkspace(checkout);
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const selection = {
      kind: 'revision-to-index',
      basis: {
        kind: 'local-ref',
        objectKind: 'commit',
        reference: 'refs/heads/paired-basis',
      },
    } as const;
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection,
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.comparisonDynamicInputs).toEqual([
      {
        kind: 'local-ref',
        role: 'basis',
        reference: 'refs/heads/paired-basis',
        objectFormat: 'sha1',
        referenceObjectIdentity: basisCommit,
        resolvedObjectKind: 'commit',
        resolvedObjectIdentity: basisCommit,
      },
    ]);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');

    const movedRef = (
      await git(checkout, 'commit-tree', basisTree, '-p', basisCommit, '-m', 'same tree movement')
    ).trim();
    await git(checkout, 'update-ref', 'refs/heads/paired-basis', movedRef);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
    await git(checkout, 'update-ref', 'refs/heads/paired-basis', basisCommit);
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('current');
    await git(checkout, 'update-ref', '-d', 'refs/heads/paired-basis');
    await expect(verifier.verifyReviewComparison(captured)).resolves.toBe('stale');
  });

  it('retries a mid-capture index movement and republishes coherent successor facts', async () => {
    const { checkout } = await createCheckout({ commit: true });
    await writeFile(path.join(checkout, 'race.txt'), 'basis\n');
    await git(checkout, 'add', 'race.txt');
    await git(checkout, 'commit', '-qm', 'race basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'race.txt'), 'moved\n');
    const movedIndexOid = (await git(checkout, 'hash-object', '-w', 'race.txt')).trim();

    const opened = await openWorkspace(checkout);
    const evidence = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
      afterInitialInspection: async attempt => {
        if (attempt !== 1) return;
        await git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${movedIndexOid},race.txt`);
      },
    });
    const captured = await evidence.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-index',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured') return;
    expect(captured.captureAttempts).toBe(2);
    const files = await completeManifest(evidence as unknown as Workspace, captured.evidenceIdentity);
    expect(files[0]?.newSide).toMatchObject({
      evidenceSource: 'index',
      objectIdentity: { value: movedIndexOid },
    });
    await expect(evidence.verifyReviewComparison(captured)).resolves.toBe('current');
  });

  it('rejects paired selections, unborn selectors, and tampered witnesses with closed diagnostics', async () => {
    const { checkout } = await createCheckout();
    const opened = await openWorkspace(checkout);
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-index',
          basis: {
            kind: 'local-ref',
            objectKind: 'commit',
            reference: 'HEAD',
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'local-ref-not-found',
    });
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-working-state',
          basis: {
            kind: 'local-ref',
            objectKind: 'commit',
            reference: 'HEAD',
          },
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'local-ref-not-found',
    });
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-index',
          basis: { kind: 'object', objectKind: 'commit', objectIdentity: 'xyz' },
        } as unknown as ReviewComparisonSelection,
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-index',
          basis: { kind: 'object', objectKind: 'commit', objectIdentity: 'a'.repeat(40) },
          compared: { kind: 'index' },
        } as unknown as ReviewComparisonSelection,
      }),
    ).rejects.toThrow(TypeError);
    await expect(
      opened.workspace.read({
        kind: 'workspace.review-comparison.capture',
        selection: {
          kind: 'revision-to-index',
        } as unknown as ReviewComparisonSelection,
      }),
    ).rejects.toThrow(TypeError);

    await writeFile(path.join(checkout, 'tamper.txt'), 'basis\n');
    await git(checkout, 'add', 'tamper.txt');
    await git(checkout, 'commit', '-qm', 'tamper basis');
    const basisCommit = (await git(checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(checkout, 'tamper.txt'), 'staged\n');
    await git(checkout, 'add', 'tamper.txt');
    const verifier = new WorkspaceEvidence({
      workspaceIdentity: opened.workspaceIdentity,
      canonicalCheckout: opened.canonicalCheckout,
    });
    const captured = await opened.workspace.read({
      kind: 'workspace.review-comparison.capture',
      selection: {
        kind: 'revision-to-index',
        basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisCommit },
      },
    });
    expect(captured.status).toBe('captured');
    if (captured.status !== 'captured' || captured.comparedState.kind !== 'index') {
      throw new Error('Tamper fixture capture unavailable');
    }
    const tampered = {
      ...captured,
      comparedState: {
        ...captured.comparedState,
        indexFingerprint:
          captured.comparedState.indexFingerprint.slice(0, 63) +
          (captured.comparedState.indexFingerprint.endsWith('0') ? '1' : '0'),
      },
    } as unknown as typeof captured;
    await expect(verifier.verifyReviewComparison(tampered)).rejects.toThrow(TypeError);
  });
});
