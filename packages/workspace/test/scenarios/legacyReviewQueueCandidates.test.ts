import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { openAuthoritativeState, type OpenAuthoritativeStateRequest } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import {
  legacyReviewCandidateDecisionIdentity,
  legacyReviewCandidatePromotionIdentity,
  legacyReviewImportCommandRecordIdentity,
  legacyReviewImportIndexIdentity,
  legacyReviewQueueCandidateIdentity,
  legacyReviewSourceOccurrenceIdentity,
  type LegacyReviewQueueCandidateIdentity,
  type LegacyReviewSourceIdentity,
  type LegacyReviewSourceOccurrenceIdentity,
} from '../../src/legacyReviewImport/index.js';
import { reviewingRecordIdentity } from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import {
  bootstrapWorkspace,
  openRuntimeWorkspace,
  workspaceGitDirectory,
  type RuntimeWorkspaceInternalOptions,
} from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);
const GOLDEN_DIRECTORY = fileURLToPath(new URL('../fixtures/legacy-review-v1/', import.meta.url));
const roots = new Set<string>();
const owners = new Set<WorkspaceRuntimeOwner>();
const originalStateHome = process.env.XDG_STATE_HOME;

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
  readonly queueFile: string;
  readonly receiptFile: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function fixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neoflow-legacy-candidates-v1-'));
  roots.add(root);
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await fs.mkdir(checkout, { recursive: true });
  await fs.mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  const canonicalCheckout = await fs.realpath(checkout);
  const legacyHash = createHash('sha256').update(canonicalCheckout).digest('hex');
  process.env.XDG_STATE_HOME = state;
  return {
    root,
    checkout,
    state,
    queueFile: path.join(checkout, '.neoflow', 'review.json'),
    receiptFile: path.join(state, 'neoflow', 'workspaces', legacyHash, 'review-receipts.json'),
  };
}

async function install(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes, { mode: 0o640 });
  await fs.chmod(file, 0o640);
  const modified = new Date('2026-09-02T11:00:00.000Z');
  await fs.utimes(file, modified, modified);
}

async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
  const opened = await openWorkspaceRuntimeOwner({
    startPath: created.checkout,
  });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owners.add(opened.owner);
  return opened.owner;
}

async function openControlled(
  created: Fixture,
  testControl: NonNullable<OpenAuthoritativeStateRequest['testControl']> = {},
  internal: RuntimeWorkspaceInternalOptions = {},
): Promise<WorkspaceRuntimeOwner> {
  const bootstrapped = await bootstrapWorkspace({ startPath: created.checkout });
  if (bootstrapped.status !== 'ready') {
    throw new Error('Controlled Workspace bootstrap was rejected');
  }
  const identity = await bootstrapped.workspace.read({
    kind: 'workspace.identity',
  });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
    testControl,
  });
  const assembly = openRuntimeWorkspace(
    identity.workspaceIdentity,
    identity.canonicalCheckout,
    state,
    internal,
    workspaceGitDirectory(bootstrapped.workspace),
  );
  const owner: WorkspaceRuntimeOwner = {
    workspaceIdentity: identity.workspaceIdentity,
    workspace: assembly.workspace,
    harnessAdapters: assembly.harnessAdapters,
    async dispose(): Promise<void> {
      await state.close();
    },
  };
  owners.add(owner);
  return owner;
}

async function close(owner: WorkspaceRuntimeOwner): Promise<void> {
  owners.delete(owner);
  await owner.dispose();
}

async function importQueue(
  owner: WorkspaceRuntimeOwner,
  commandIdentity: string,
  expectedStateVersion = 0,
): Promise<{
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
}> {
  const sources = await owner.workspace.read({ kind: 'legacy-review.sources' });
  const source = sources.sources[0];
  if (source.observation.status !== 'detected') {
    throw new Error('Legacy queue was not detected');
  }
  const result = await owner.workspace.execute({
    kind: 'legacy-review.source.import',
    commandIdentity,
    expectedStateVersion,
    sourceIdentity: source.sourceIdentity,
    expectedDigest: source.observation.digest,
  });
  expect(result).toMatchObject({
    kind: 'legacy-review.source.imported',
    status: 'accepted',
    stateVersion: expectedStateVersion + 1,
  });
  if (result.kind !== 'legacy-review.source.imported') {
    throw new Error('Legacy queue was not imported');
  }
  return {
    sourceIdentity: source.sourceIdentity,
    sourceOccurrenceIdentity: result.sourceOccurrenceIdentity,
    digest: source.observation.digest,
  };
}

async function prepareCurrentReviewChange(created: Fixture): Promise<void> {
  await git(created.checkout, 'config', 'user.email', 'tests@neoflow.local');
  await git(created.checkout, 'config', 'user.name', 'BuildFrame Tests');
  const currentFile = path.join(created.checkout, 'src', 'current.ts');
  await fs.mkdir(path.dirname(currentFile), { recursive: true });
  await fs.writeFile(currentFile, 'export const value = 1;\n');
  await fs.writeFile(path.join(created.checkout, '.gitignore'), '.neoflow/\n');
  await git(created.checkout, 'add', 'src/current.ts', '.gitignore');
  await git(created.checkout, 'commit', '-qm', 'baseline');
  await fs.writeFile(currentFile, 'export const value = 2;\n');
}

async function startCurrentReviewTarget(
  owner: WorkspaceRuntimeOwner,
  commandIdentity: string,
  expectedStateVersion: number,
) {
  const started = await owner.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity,
    expectedStateVersion,
  });
  if (started.kind !== 'review.current-changes.started') {
    throw new Error('Current Review was not started');
  }
  const manifest = await owner.workspace.read({
    kind: 'review.manifest',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 8,
  });
  if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
    throw new Error('Current Review target was unavailable');
  }
  return { started, file: manifest.manifest.files[0] };
}

function completeWindow(text: string): {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly shownUtf8Bytes: number;
  readonly truncated: false;
} {
  const bytes = Buffer.byteLength(text);
  return {
    text,
    totalUtf8Bytes: bytes,
    shownUtf8Bytes: bytes,
    truncated: false,
  };
}

function completePage(text: string): {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly utf8Offset: 0;
  readonly shownUtf8Bytes: number;
  readonly complete: true;
} {
  const bytes = Buffer.byteLength(text);
  return {
    text,
    totalUtf8Bytes: bytes,
    utf8Offset: 0,
    shownUtf8Bytes: bytes,
    complete: true,
  };
}

async function stateDatabasePath(created: Fixture, workspaceIdentity: string): Promise<string> {
  const stateRoot = path.join(
    userStateDirectory(created.checkout),
    'workspaces',
    workspaceIdentity,
    'authoritative-state',
  );
  const generation = (await fs.readFile(path.join(stateRoot, 'CURRENT'), 'utf8')).trim();
  return path.join(stateRoot, generation);
}

function worstCaseQueue(): Buffer {
  const control = '\u0001';
  return Buffer.from(
    `${JSON.stringify({
      version: 2,
      annotations: Array.from({ length: 32 }, (_, index) => ({
        id: `${control.repeat(300)}-${index}`,
        kind: index === 31 ? 'change' : index % 2 === 0 ? 'question' : 'edit',
        file: `/src/${control.repeat(2_000)}-${index}`,
        anchor: index === 31 ? { side: 'file' } : { side: 'both', oldLine: index + 1, newLine: index + 2 },
        text: index === 31 ? 'without excerpt' : index === 0 ? `a${'🙂'.repeat(10_000)}` : control.repeat(10_000),
        ...(index === 31
          ? {}
          : {
              excerpt: index === 0 ? 'é'.repeat(20_000) : control.repeat(10_000),
            }),
      })),
    })}\n`,
  );
}

afterEach(async () => {
  await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
  owners.clear();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  await Promise.all([...roots].map(root => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe('imported legacy queue candidates', () => {
  it('derives stable non-v1 candidates from every queue format after source deletion and restart', async () => {
    const cases = [
      {
        golden: 'queue-array-v1.json',
        format: 'queue-array-v1',
        expected: [
          {
            id: 'legacy-array-edit',
            kind: 'edit',
            file: 'src/value.ts',
            anchor: { side: 'new', newLine: 7 },
            text: 'Use the normalized value.',
            excerpt: '+const value = normalize(input);',
          },
        ],
      },
      {
        golden: 'queue-v1.json',
        format: 'queue-v1',
        expected: [
          {
            id: 'legacy-v1-question',
            kind: 'question',
            file: 'src/removed.ts',
            anchor: { side: 'old', oldLine: 11 },
            text: 'Why was this removed?',
            excerpt: '-const retired = true;',
          },
          {
            id: 'legacy-v1-general',
            kind: 'change',
            anchor: { side: 'file' },
            text: 'Keep the validation close to its caller.',
          },
        ],
      },
      {
        golden: 'queue-v2.json',
        format: 'queue-v2',
        expected: [
          {
            id: 'legacy-v2-question',
            kind: 'question',
            file: 'src/session.ts',
            anchor: { side: 'new', newLine: 23 },
            text: 'Should this reject an expired session?',
            excerpt: '+assertSession(current);',
          },
          {
            id: 'legacy-v2-file-edit',
            kind: 'edit',
            file: 'src/config.ts',
            anchor: { side: 'file' },
            text: 'Replace this file-level strategy explicitly.',
          },
        ],
      },
    ] as const;

    for (const [caseIndex, candidateCase] of cases.entries()) {
      const created = await fixture();
      const bytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, candidateCase.golden));
      await install(created.queueFile, bytes);
      const before = await fs.stat(created.queueFile, { bigint: true });
      const owner = await open(created);
      const imported = await importQueue(owner, `import-queue-candidate-format-${caseIndex}`);
      const list = await owner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 32,
      });
      expect(list).toMatchObject({
        kind: 'legacy-review.queue-candidates',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 1,
        sourceIdentity: imported.sourceIdentity,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        digest: imported.digest,
        legacySourceFormat: candidateCase.format,
        disclosure: {
          label: 'LEGACY QUEUE CANDIDATE',
          recordStatus: 'migration-candidate-not-v1-draft',
          authority: 'none',
          legacyValues: 'intent-path-lines-and-excerpt-are-hints-only',
          promotionRequires: 'explicit-intent-and-exact-anchor-on-verified-current-v1-snapshot',
        },
        totalCandidates: candidateCase.expected.length,
        candidateOffset: 0,
      });
      if (list.status !== 'available') {
        throw new Error('Legacy candidate list was unavailable');
      }
      expect(Object.isFrozen(list)).toBe(true);
      expect(list.candidates).toHaveLength(candidateCase.expected.length);
      for (const [candidateAbsolute, expected] of candidateCase.expected.entries()) {
        const summary = list.candidates[candidateAbsolute];
        expect(summary).toEqual({
          candidateIdentity: legacyReviewQueueCandidateIdentity(
            owner.workspaceIdentity,
            imported.sourceOccurrenceIdentity,
            expected.id,
          ),
          candidateAbsolute,
          migrationDecision: 'undecided',
          legacyAnnotationId: completeWindow(expected.id),
          legacyKind: expected.kind,
          ...('file' in expected ? { legacyFile: completeWindow(expected.file) } : {}),
          legacyAnchorHint: expected.anchor,
          legacyTextPreview: completeWindow(expected.text),
          ...('excerpt' in expected ? { legacyExcerptPreview: completeWindow(expected.excerpt) } : {}),
        });
      }
      const firstExpected = candidateCase.expected[0];
      const first = list.candidates[0];
      if (firstExpected === undefined || first === undefined) {
        throw new Error('Legacy candidate fixture was empty');
      }
      const detail = await owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: first.candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 16 * 1024,
      });
      expect(detail).toMatchObject({
        kind: 'legacy-review.queue-candidate',
        status: 'available',
        stateVersion: 1,
        sourceIdentity: imported.sourceIdentity,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        digest: imported.digest,
        legacySourceFormat: candidateCase.format,
        disclosure: list.disclosure,
        candidateIdentity: first.candidateIdentity,
        candidateAbsolute: 0,
        migrationDecision: 'undecided',
        legacyAnnotationId: completeWindow(firstExpected.id),
        legacyKind: firstExpected.kind,
        legacyAnchorHint: firstExpected.anchor,
        legacyText: completePage(firstExpected.text),
      });
      if (detail.status !== 'available') {
        throw new Error('Legacy candidate detail was unavailable');
      }
      for (const forbidden of [
        'reviewIdentity',
        'reviewSnapshotIdentity',
        'draftIdentity',
        'annotationIdentity',
        'anchor',
        'intent',
      ]) {
        expect(Object.hasOwn(detail, forbidden)).toBe(false);
      }
      if (caseIndex === 0) {
        await expect(
          (owner.workspace.execute as (command: unknown) => Promise<unknown>)({
            kind: 'legacy-review.queue-candidate.submit',
            commandIdentity: 'forbidden-legacy-candidate-submit',
            expectedStateVersion: 1,
            candidateIdentity: first.candidateIdentity,
          }),
        ).rejects.toThrow('Unknown Workspace command');
      }
      const after = await fs.stat(created.queueFile, { bigint: true });
      expect({
        mode: after.mode,
        size: after.size,
        mtimeNs: after.mtimeNs,
        ctimeNs: after.ctimeNs,
        bytes: await fs.readFile(created.queueFile),
      }).toEqual({
        mode: before.mode,
        size: before.size,
        mtimeNs: before.mtimeNs,
        ctimeNs: before.ctimeNs,
        bytes,
      });

      if (caseIndex === 1) {
        await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-array-v1.json')));
      } else {
        await fs.rm(created.queueFile);
      }
      await close(owner);
      const restarted = await open(created);
      const replay = await restarted.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 32,
      });
      expect(replay).toMatchObject({
        status: 'available',
        stateVersion: 1,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        digest: imported.digest,
        legacySourceFormat: candidateCase.format,
        totalCandidates: candidateCase.expected.length,
        candidateOffset: 0,
      });
      if (replay.status !== 'available') {
        throw new Error('Restarted legacy candidate list was unavailable');
      }
      expect(replay.candidates.map(({ candidateIdentity }) => candidateIdentity)).toEqual(
        list.candidates.map(({ candidateIdentity }) => candidateIdentity),
      );
      await expect(
        restarted.workspace.read({
          kind: 'legacy-review.queue-candidates',
          sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
          candidateOffset: candidateCase.expected.length,
          candidateLimit: 32,
        }),
      ).resolves.toMatchObject({
        status: 'available',
        stateVersion: 1,
        totalCandidates: candidateCase.expected.length,
        candidateOffset: candidateCase.expected.length,
        candidates: [],
      });
      await close(restarted);
    }
  });

  it('atomically records content-free candidate decisions and projects only their migration status', async () => {
    const created = await fixture();
    const bytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json'));
    await install(created.queueFile, bytes);
    const before = await fs.stat(created.queueFile, { bigint: true });
    const owner = await open(created);
    const imported = await importQueue(owner, 'import-queue-for-decisions');
    const initial = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (initial.status !== 'available' || initial.candidates[0] === undefined || initial.candidates[1] === undefined) {
      throw new Error('Decision candidates were unavailable');
    }
    const question = initial.candidates[0];
    const edit = initial.candidates[1];
    const deferredIdentity = legacyReviewCandidateDecisionIdentity(
      owner.workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      question.candidateIdentity,
      'deferred',
    );
    const deferred = await owner.workspace.execute({
      kind: 'legacy-review.queue-candidate.decision.set',
      commandIdentity: 'defer-imported-question-candidate',
      expectedStateVersion: 1,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: question.candidateIdentity,
      decision: 'deferred',
    });
    expect(deferred).toEqual({
      kind: 'legacy-review.queue-candidate.decision-recorded',
      status: 'accepted',
      commandIdentity: 'defer-imported-question-candidate',
      stateVersion: 2,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: imported.digest,
      candidateIdentity: question.candidateIdentity,
      candidateDecisionIdentity: deferredIdentity,
      decision: 'deferred',
      recording: 'recorded',
    });
    expect(Object.isFrozen(deferred)).toBe(true);
    const afterDefer = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    expect(afterDefer).toMatchObject({
      status: 'available',
      stateVersion: 2,
      candidates: [
        { candidateIdentity: question.candidateIdentity, migrationDecision: 'deferred' },
        { candidateIdentity: edit.candidateIdentity, migrationDecision: 'undecided' },
      ],
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: question.candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 16 * 1024,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 2,
      candidateIdentity: question.candidateIdentity,
      migrationDecision: 'deferred',
      legacyText: { text: 'Should this reject an expired session?' },
    });

    const dismissedIdentity = legacyReviewCandidateDecisionIdentity(
      owner.workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      edit.candidateIdentity,
      'dismissed',
    );
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'dismiss-imported-edit-candidate',
        expectedStateVersion: 2,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: edit.candidateIdentity,
        decision: 'dismissed',
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.queue-candidate.decision-recorded',
      status: 'accepted',
      commandIdentity: 'dismiss-imported-edit-candidate',
      stateVersion: 3,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: imported.digest,
      candidateIdentity: edit.candidateIdentity,
      candidateDecisionIdentity: dismissedIdentity,
      decision: 'dismissed',
      recording: 'recorded',
    });
    const workspaceIdentity = owner.workspaceIdentity;
    await close(owner);

    const after = await fs.stat(created.queueFile, { bigint: true });
    expect({
      bytes: await fs.readFile(created.queueFile),
      mode: after.mode,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    }).toEqual({
      bytes,
      mode: before.mode,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });

    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await state.read({
        recordIdentities: [
          deferredIdentity,
          dismissedIdentity,
          imported.sourceOccurrenceIdentity,
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity('defer-imported-question-candidate'),
          legacyReviewImportCommandRecordIdentity('dismiss-imported-edit-candidate'),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(3);
      for (const record of read.records.slice(0, 2)) {
        expect(record).toMatchObject({
          kind: 'legacy-review.candidate-decision',
          recordClass: 'immutable',
          workflowIdentity: legacyReviewImportIndexIdentity(workspaceIdentity),
          content: [],
        });
      }
      expect(JSON.parse(Buffer.from(read.records[0]?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        candidateDecisionIdentity: deferredIdentity,
        workspaceIdentity,
        sourceIdentity: imported.sourceIdentity,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        digest: imported.digest,
        candidateIdentity: question.candidateIdentity,
        decision: 'deferred',
        decisionCommandIdentity: 'defer-imported-question-candidate',
        decidedStateVersion: 2,
      });
      expect(JSON.parse(Buffer.from(read.records[1]?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        candidateDecisionIdentity: dismissedIdentity,
        workspaceIdentity,
        sourceIdentity: imported.sourceIdentity,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        digest: imported.digest,
        candidateIdentity: edit.candidateIdentity,
        decision: 'dismissed',
        decisionCommandIdentity: 'dismiss-imported-edit-candidate',
        decidedStateVersion: 3,
      });
      expect(Buffer.from(read.records[2]?.content[0]?.bytes ?? [])).toEqual(bytes);
      expect(JSON.parse(Buffer.from(read.records[3]?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [
          {
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            sourceIdentity: imported.sourceIdentity,
            sourceKind: 'queue',
            digest: imported.digest,
            decision: 'imported',
          },
        ],
        candidateDecisions: [
          {
            candidateDecisionIdentity: deferredIdentity,
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            candidateIdentity: question.candidateIdentity,
            decision: 'deferred',
          },
          {
            candidateDecisionIdentity: dismissedIdentity,
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            candidateIdentity: edit.candidateIdentity,
            decision: 'dismissed',
          },
        ],
      });
      for (const record of read.records.slice(4)) {
        expect(record).toMatchObject({
          kind: 'legacy-review.command',
          recordClass: 'immutable',
          content: [],
        });
      }
      const decisionBytes = read.records
        .slice(0, 2)
        .map(record => Buffer.from(record?.payload ?? []).toString('utf8'))
        .join('\n');
      for (const forbidden of [
        'legacy-v2-question',
        'legacy-v2-file-edit',
        'src/session.ts',
        'src/config.ts',
        'Should this reject an expired session?',
        '+assertSession(current);',
      ]) {
        expect(decisionBytes).not.toContain(forbidden);
      }
    } finally {
      await state.close();
    }
  });

  it('recalls, switches, scopes, and reconstructs exact candidate decisions without source access', async () => {
    const created = await fixture();
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    const owner = await open(created);
    const firstImport = await importQueue(owner, 'import-first-decision-source');
    const firstList = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: firstImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (
      firstList.status !== 'available' ||
      firstList.candidates[0] === undefined ||
      firstList.candidates[1] === undefined
    ) {
      throw new Error('First decision source had no candidates');
    }
    const candidate = firstList.candidates[0];
    const unaffected = firstList.candidates[1];
    const deferCommand = {
      kind: 'legacy-review.queue-candidate.decision.set' as const,
      commandIdentity: 'candidate-decision-recall',
      expectedStateVersion: 1,
      sourceOccurrenceIdentity: firstImport.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      decision: 'deferred' as const,
    };
    await fs.rm(created.queueFile);
    const firstDecision = await owner.workspace.execute(deferCommand);
    expect(firstDecision).toMatchObject({
      kind: 'legacy-review.queue-candidate.decision-recorded',
      status: 'accepted',
      stateVersion: 2,
      recording: 'recorded',
    });
    await expect(owner.workspace.execute(deferCommand)).resolves.toEqual(firstDecision);
    await expect(
      owner.workspace.execute({
        ...deferCommand,
        expectedStateVersion: 2,
        decision: 'dismissed',
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      commandIdentity: deferCommand.commandIdentity,
      stateVersion: 2,
      sourceOccurrenceIdentity: firstImport.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      reason: 'command-identity-conflict',
    });
    const sameDecision = await owner.workspace.execute({
      ...deferCommand,
      commandIdentity: 'candidate-same-decision-new-command',
      expectedStateVersion: 2,
    });
    expect(sameDecision).toMatchObject({
      status: 'accepted',
      stateVersion: 3,
      candidateDecisionIdentity:
        firstDecision.status === 'accepted' && firstDecision.kind === 'legacy-review.queue-candidate.decision-recorded'
          ? firstDecision.candidateDecisionIdentity
          : undefined,
      recording: 'already-recorded',
    });
    const dismissed = await owner.workspace.execute({
      ...deferCommand,
      commandIdentity: 'candidate-switch-to-dismissed',
      expectedStateVersion: 3,
      decision: 'dismissed',
    });
    expect(dismissed).toMatchObject({
      status: 'accepted',
      stateVersion: 4,
      decision: 'dismissed',
      recording: 'recorded',
    });
    await expect(
      owner.workspace.execute({
        ...deferCommand,
        commandIdentity: 'candidate-switch-back-to-deferred',
        expectedStateVersion: 4,
      }),
    ).resolves.toMatchObject({
      status: 'accepted',
      stateVersion: 5,
      decision: 'deferred',
      recording: 'already-recorded',
    });

    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const secondImport = await importQueue(owner, 'import-changed-candidate-source', 5);
    expect(secondImport.sourceOccurrenceIdentity).not.toBe(firstImport.sourceOccurrenceIdentity);
    const secondList = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (
      secondList.status !== 'available' ||
      secondList.candidates[0] === undefined ||
      secondList.candidates[1] === undefined
    ) {
      throw new Error('Changed decision source had no candidates');
    }
    expect(secondList.candidates.map(item => item.migrationDecision)).toEqual(['undecided', 'undecided']);
    expect(secondList.candidates[0].candidateIdentity).not.toBe(candidate.candidateIdentity);

    await fs.rm(created.queueFile);
    const concurrent = await Promise.all([
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'candidate-concurrent-a',
        expectedStateVersion: 6,
        sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
        candidateIdentity: secondList.candidates[0].candidateIdentity,
        decision: 'deferred',
      }),
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'candidate-concurrent-b',
        expectedStateVersion: 6,
        sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
        candidateIdentity: secondList.candidates[1].candidateIdentity,
        decision: 'dismissed',
      }),
    ]);
    expect(concurrent.filter(result => result.status === 'accepted')).toHaveLength(1);
    expect(concurrent.filter(result => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        stateVersion: 7,
        reason: 'state-version-mismatch',
      }),
    ]);
    await close(owner);

    const restarted = await open(created);
    const oldView = await restarted.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: firstImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    expect(oldView).toMatchObject({
      status: 'available',
      stateVersion: 7,
      candidates: [
        { candidateIdentity: candidate.candidateIdentity, migrationDecision: 'deferred' },
        { candidateIdentity: unaffected.candidateIdentity, migrationDecision: 'undecided' },
      ],
    });
    const newView = await restarted.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (newView.status !== 'available') {
      throw new Error('Restarted changed source was unavailable');
    }
    expect(newView.candidates.filter(item => item.migrationDecision !== 'undecided')).toHaveLength(1);
  });

  it('rejects candidate decisions for every non-candidate target and malformed command', async () => {
    const created = await fixture();
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    await install(created.receiptFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json')));
    const owner = await open(created);
    const sources = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const queue = sources.sources[0];
    const receipt = sources.sources[1];
    if (queue.observation.status !== 'detected' || receipt.observation.status !== 'detected') {
      throw new Error('Decision rejection sources were unavailable');
    }
    const unimportedOccurrence = legacyReviewSourceOccurrenceIdentity(
      owner.workspaceIdentity,
      queue.sourceIdentity,
      queue.observation.digest,
    );
    const absentCandidate = `lgc_${'d'.repeat(64)}` as LegacyReviewQueueCandidateIdentity;
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'defer-source-before-candidate-decision',
        expectedStateVersion: 0,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 1 });
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'reject-unimported-candidate-decision',
        expectedStateVersion: 1,
        sourceOccurrenceIdentity: unimportedOccurrence,
        candidateIdentity: absentCandidate,
        decision: 'deferred',
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      commandIdentity: 'reject-unimported-candidate-decision',
      stateVersion: 1,
      sourceOccurrenceIdentity: unimportedOccurrence,
      candidateIdentity: absentCandidate,
      reason: 'source-occurrence-not-imported',
    });

    const receiptImport = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'import-receipt-for-candidate-rejection',
      expectedStateVersion: 1,
      sourceIdentity: receipt.sourceIdentity,
      expectedDigest: receipt.observation.digest,
    });
    if (receiptImport.kind !== 'legacy-review.source.imported') {
      throw new Error('Receipt rejection source was not imported');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'reject-receipt-candidate-decision',
        expectedStateVersion: 2,
        sourceOccurrenceIdentity: receiptImport.sourceOccurrenceIdentity,
        candidateIdentity: absentCandidate,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 2,
      reason: 'candidate-source-unavailable',
    });

    const imported = await importQueue(owner, 'import-queue-after-source-decision', 2);
    const list = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Imported rejection candidate was unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'reject-absent-candidate-decision',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: absentCandidate,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 3,
      reason: 'candidate-not-found',
    });
    for (const malformed of [
      {
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'invalid-candidate-decision',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        decision: 'ignored',
      },
      {
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'caller-injected-candidate-content',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: list.candidates[0].candidateIdentity,
        decision: 'deferred',
        legacyText: 'caller-controlled',
      },
      {
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'invalid-candidate-occurrence',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: 'lso_invalid',
        candidateIdentity: list.candidates[0].candidateIdentity,
        decision: 'deferred',
      },
    ]) {
      await expect((owner.workspace.execute as (command: unknown) => Promise<unknown>)(malformed)).rejects.toThrow(
        'Invalid legacy Review candidate decision command',
      );
    }
    expect(
      (
        await owner.workspace.read({
          kind: 'legacy-review.queue-candidates',
          sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
          candidateOffset: 0,
          candidateLimit: 1,
        })
      ).stateVersion,
    ).toBe(3);
    await close(owner);

    for (const bytes of [Buffer.from('{malformed}\n'), Buffer.from('{"version":99,"annotations":[]}\n')]) {
      const diagnostic = await fixture();
      await install(diagnostic.queueFile, bytes);
      const diagnosticOwner = await open(diagnostic);
      const diagnosticImport = await importQueue(diagnosticOwner, `import-diagnostic-candidate-${bytes.byteLength}`);
      await expect(
        diagnosticOwner.workspace.execute({
          kind: 'legacy-review.queue-candidate.decision.set',
          commandIdentity: `reject-diagnostic-candidate-${bytes.byteLength}`,
          expectedStateVersion: 1,
          sourceOccurrenceIdentity: diagnosticImport.sourceOccurrenceIdentity,
          candidateIdentity: absentCandidate,
          decision: 'dismissed',
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        stateVersion: 1,
        reason: 'candidate-source-unavailable',
      });
      await close(diagnosticOwner);
    }
  });

  it('bounds candidate decisions and rejects conflicting, missing, or quarantined facts', async () => {
    const bounded = await fixture();
    await install(bounded.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    const boundedOwner = await openControlled(
      bounded,
      {},
      {
        legacyReviewImportMaximumOccurrences: 2,
      },
    );
    const boundedImport = await importQueue(boundedOwner, 'import-bounded-candidate-decisions');
    const boundedList = await boundedOwner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (
      boundedList.status !== 'available' ||
      boundedList.candidates[0] === undefined ||
      boundedList.candidates[1] === undefined
    ) {
      throw new Error('Bounded candidates were unavailable');
    }
    await expect(
      boundedOwner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'bounded-candidate-first',
        expectedStateVersion: 1,
        sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
        candidateIdentity: boundedList.candidates[0].candidateIdentity,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 2 });
    await expect(
      boundedOwner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'bounded-candidate-switch',
        expectedStateVersion: 2,
        sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
        candidateIdentity: boundedList.candidates[0].candidateIdentity,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 3 });
    await expect(
      boundedOwner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'bounded-candidate-second',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
        candidateIdentity: boundedList.candidates[1].candidateIdentity,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 3,
      reason: 'candidate-decision-limit',
    });
    await close(boundedOwner);

    const conflicted = await fixture();
    await install(conflicted.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    const conflictPreview = await open(conflicted);
    const conflictImport = await importQueue(conflictPreview, 'import-conflicting-candidate-source');
    const conflictList = await conflictPreview.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: conflictImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (conflictList.status !== 'available' || conflictList.candidates[0] === undefined) {
      throw new Error('Conflict candidate was unavailable');
    }
    const conflictCandidate = conflictList.candidates[0];
    const conflictIdentity = legacyReviewCandidateDecisionIdentity(
      conflictPreview.workspaceIdentity,
      conflictImport.sourceOccurrenceIdentity,
      conflictCandidate.candidateIdentity,
      'deferred',
    );
    const conflictWorkspaceIdentity = conflictPreview.workspaceIdentity;
    await close(conflictPreview);
    const conflictState = await openAuthoritativeState({
      workspaceIdentity: conflictWorkspaceIdentity,
      privateStateDirectory: userStateDirectory(conflicted.checkout),
    });
    try {
      await expect(
        conflictState.commit({
          commandIdentity: 'install-conflicting-candidate-decision',
          expectedStateVersion: 1,
          records: [
            {
              recordClass: 'immutable',
              recordIdentity: conflictIdentity,
              workflowIdentity: legacyReviewImportIndexIdentity(conflictWorkspaceIdentity),
              kind: 'test.conflicting-candidate-decision',
              schemaVersion: 1,
              payload: new Uint8Array([0]),
              content: [],
            },
          ],
          result: {
            kind: 'test.conflicting-candidate-decision-installed',
            schemaVersion: 1,
            payload: new Uint8Array([1]),
          },
        }),
      ).resolves.toMatchObject({ status: 'committed', stateVersion: 2 });
    } finally {
      await conflictState.close();
    }
    const conflictOwner = await open(conflicted);
    await expect(
      conflictOwner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'reject-conflicting-candidate-decision',
        expectedStateVersion: 2,
        sourceOccurrenceIdentity: conflictImport.sourceOccurrenceIdentity,
        candidateIdentity: conflictCandidate.candidateIdentity,
        decision: 'deferred',
      }),
    ).rejects.toThrow('legacy-review-import-state-invalid');
    await close(conflictOwner);

    for (const tamper of ['missing', 'quarantined'] as const) {
      const damaged = await fixture();
      await install(damaged.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
      const damageOwner = await open(damaged);
      const damageImport = await importQueue(damageOwner, `import-${tamper}-candidate-fact`);
      const damageList = await damageOwner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: damageImport.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      });
      if (damageList.status !== 'available' || damageList.candidates[0] === undefined) {
        throw new Error('Damage candidate was unavailable');
      }
      const damageCandidate = damageList.candidates[0];
      const decision = await damageOwner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: `record-${tamper}-candidate-fact`,
        expectedStateVersion: 1,
        sourceOccurrenceIdentity: damageImport.sourceOccurrenceIdentity,
        candidateIdentity: damageCandidate.candidateIdentity,
        decision: 'dismissed',
      });
      if (decision.kind !== 'legacy-review.queue-candidate.decision-recorded') {
        throw new Error('Damage decision was not recorded');
      }
      const damageWorkspaceIdentity = damageOwner.workspaceIdentity;
      await close(damageOwner);
      const database = new DatabaseSync(await stateDatabasePath(damaged, damageWorkspaceIdentity));
      if (tamper === 'missing') {
        database.prepare('DELETE FROM records WHERE record_identity = ?').run(decision.candidateDecisionIdentity);
      } else {
        database
          .prepare('UPDATE records SET payload = ? WHERE record_identity = ?')
          .run(new Uint8Array([0xff]), decision.candidateDecisionIdentity);
      }
      database.close();

      const damagedOwner = await open(damaged);
      await expect(
        damagedOwner.workspace.read({
          kind: 'legacy-review.queue-candidates',
          sourceOccurrenceIdentity: damageImport.sourceOccurrenceIdentity,
          candidateOffset: 0,
          candidateLimit: 1,
        }),
      ).rejects.toThrow('legacy-review-import-state-invalid');
      await expect(
        damagedOwner.workspace.execute({
          kind: 'legacy-review.queue-candidate.decision.set',
          commandIdentity: `switch-${tamper}-candidate-fact`,
          expectedStateVersion: 2,
          sourceOccurrenceIdentity: damageImport.sourceOccurrenceIdentity,
          candidateIdentity: damageCandidate.candidateIdentity,
          decision: 'deferred',
        }),
      ).rejects.toThrow('legacy-review-import-state-invalid');
      await close(damagedOwner);
    }
  });

  it('fails closed for unimported, wrong-kind, diagnostic, absent, and malformed inputs', async () => {
    const created = await fixture();
    const queueBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json'));
    const receiptBytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json'));
    await install(created.queueFile, queueBytes);
    await install(created.receiptFile, receiptBytes);
    const owner = await open(created);
    const sources = await owner.workspace.read({ kind: 'legacy-review.sources' });
    const queue = sources.sources[0];
    if (queue.observation.status !== 'detected') {
      throw new Error('Queue source was unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'dismiss-queue-without-candidates',
        expectedStateVersion: 0,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 1 });
    const deferredOccurrence = legacyReviewSourceOccurrenceIdentity(
      owner.workspaceIdentity,
      queue.sourceIdentity,
      queue.observation.digest,
    );
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: deferredOccurrence,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 1,
      reason: 'source-not-imported',
    });
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'defer-queue-without-candidates',
        expectedStateVersion: 1,
        sourceIdentity: queue.sourceIdentity,
        expectedDigest: queue.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 2 });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: deferredOccurrence,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 2,
      reason: 'source-not-imported',
    });

    const receiptSource = (
      await owner.workspace.read({
        kind: 'legacy-review.sources',
      })
    ).sources[1];
    if (receiptSource.observation.status !== 'detected') {
      throw new Error('Receipt source was unavailable');
    }
    const receiptImport = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'import-receipt-not-candidates',
      expectedStateVersion: 2,
      sourceIdentity: receiptSource.sourceIdentity,
      expectedDigest: receiptSource.observation.digest,
    });
    if (receiptImport.kind !== 'legacy-review.source.imported') {
      throw new Error('Receipt source was not imported');
    }
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: receiptImport.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 3,
      reason: 'source-kind-mismatch',
    });

    const importedQueue = await importQueue(owner, 'import-decided-queue', 3);
    const list = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: importedQueue.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Imported candidate was unavailable');
    }
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: importedQueue.sourceOccurrenceIdentity,
        candidateIdentity: `lgc_${'f'.repeat(64)}` as LegacyReviewQueueCandidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 1,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 4,
      reason: 'candidate-not-found',
    });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: importedQueue.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 33,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 4,
      reason: 'projection-limit',
    });
    await expect(
      (owner.workspace.read as (request: unknown) => Promise<unknown>)({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: importedQueue.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
        sourcePath: '/caller/controlled',
      }),
    ).rejects.toThrow('Invalid legacy queue candidates request');
    await close(owner);

    const malformed = await fixture();
    await install(malformed.queueFile, Buffer.from('{malformed}\n'));
    const malformedOwner = await open(malformed);
    const malformedImport = await importQueue(malformedOwner, 'import-malformed-queue-candidates');
    await expect(
      malformedOwner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: malformedImport.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 1,
      reason: 'source-unrecognized',
    });
    await expect(
      malformedOwner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: `lso_${'e'.repeat(64)}` as LegacyReviewSourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 1,
      reason: 'source-not-imported',
    });
    await close(malformedOwner);

    const unsupported = await fixture();
    await install(unsupported.queueFile, Buffer.from('{"version":99,"annotations":[]}\n'));
    const unsupportedOwner = await open(unsupported);
    const unsupportedImport = await importQueue(unsupportedOwner, 'import-unsupported-queue-candidates');
    await expect(
      unsupportedOwner.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: unsupportedImport.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      stateVersion: 1,
      reason: 'source-unrecognized',
    });
  });

  it('rolls candidate decisions back before commit and recalls unknown committed outcomes without source access', async () => {
    const created = await fixture();
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    const previewOwner = await open(created);
    const imported = await importQueue(previewOwner, 'import-candidate-for-faults');
    const list = await previewOwner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Fault candidate was unavailable');
    }
    const candidateIdentity = list.candidates[0].candidateIdentity;
    const workspaceIdentity = previewOwner.workspaceIdentity;
    const candidateDecisionIdentity = legacyReviewCandidateDecisionIdentity(
      workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      candidateIdentity,
      'dismissed',
    );
    await close(previewOwner);

    const beforeCommand = {
      kind: 'legacy-review.queue-candidate.decision.set' as const,
      commandIdentity: 'candidate-decision-before-commit-fault',
      expectedStateVersion: 1,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity,
      decision: 'dismissed' as const,
    };
    const beforeOwner = await openControlled(created, {
      failpoint: 'after-first-record-write',
    });
    await expect(beforeOwner.workspace.execute(beforeCommand)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    await close(beforeOwner);

    const afterRollback = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await afterRollback.read({
        recordIdentities: [
          candidateDecisionIdentity,
          legacyReviewImportIndexIdentity(workspaceIdentity),
          legacyReviewImportCommandRecordIdentity(beforeCommand.commandIdentity),
        ],
        includeContent: true,
      });
      expect(read.stateVersion).toBe(1);
      expect(read.records[0]).toBeUndefined();
      expect(JSON.parse(Buffer.from(read.records[1]?.payload ?? []).toString('utf8'))).toEqual({
        formatVersion: 1,
        occurrences: [
          {
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            sourceIdentity: imported.sourceIdentity,
            sourceKind: 'queue',
            digest: imported.digest,
            decision: 'imported',
          },
        ],
      });
      expect(read.records[2]).toBeUndefined();
    } finally {
      await afterRollback.close();
    }

    const afterCommand = {
      ...beforeCommand,
      commandIdentity: 'candidate-decision-after-commit-fault',
    };
    const unknownOwner = await openControlled(created, {
      pauseAfterCommitCommandIdentity: afterCommand.commandIdentity,
      requestTimeoutMilliseconds: 1_000,
    });
    await expect(unknownOwner.workspace.execute(afterCommand)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    owners.delete(unknownOwner);
    await unknownOwner.dispose().catch(() => undefined);
    await fs.rm(created.queueFile);

    const recovered = await open(created);
    await expect(recovered.workspace.execute(afterCommand)).resolves.toEqual({
      kind: 'legacy-review.queue-candidate.decision-recorded',
      status: 'accepted',
      commandIdentity: afterCommand.commandIdentity,
      stateVersion: 2,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      digest: imported.digest,
      candidateIdentity,
      candidateDecisionIdentity,
      decision: 'dismissed',
      recording: 'recorded',
    });
    await expect(
      recovered.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      stateVersion: 2,
      candidates: [{ candidateIdentity, migrationDecision: 'dismissed' }],
    });
  });

  it('pages scalar-safe UTF-8 and keeps maximum encoded candidate views below the frame bound', async () => {
    const created = await fixture();
    const bytes = worstCaseQueue();
    expect(bytes.byteLength).toBeLessThan(16 * 1024 * 1024);
    await install(created.queueFile, bytes);
    const owner = await open(created);
    const imported = await importQueue(owner, 'import-worst-case-candidates');
    const list = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    expect(list).toMatchObject({
      status: 'available',
      totalCandidates: 32,
      candidateOffset: 0,
    });
    if (list.status !== 'available') {
      throw new Error('Worst-case candidates were unavailable');
    }
    expect(list.candidates).toHaveLength(32);
    expect(list.candidates[0]?.legacyAnnotationId).toMatchObject({
      shownUtf8Bytes: 128,
      truncated: true,
    });
    expect(list.candidates[0]?.legacyTextPreview).toMatchObject({
      totalUtf8Bytes: 40_001,
      shownUtf8Bytes: 1_021,
      truncated: true,
    });
    expect(Buffer.byteLength(JSON.stringify(list)) + 2_048).toBeLessThan(1024 * 1024);

    const candidate = list.candidates[0];
    if (candidate === undefined) throw new Error('Worst candidate was absent');
    const firstPage = await owner.workspace.read({
      kind: 'legacy-review.queue-candidate',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      textUtf8Offset: 0,
      textUtf8Limit: 32 * 1024,
      excerptUtf8Offset: 0,
      excerptUtf8Limit: 16 * 1024,
    });
    expect(firstPage).toMatchObject({
      status: 'available',
      candidateAbsolute: 0,
      migrationDecision: 'undecided',
      legacyText: {
        totalUtf8Bytes: 40_001,
        utf8Offset: 0,
        shownUtf8Bytes: 32_765,
        complete: false,
      },
      legacyExcerpt: {
        totalUtf8Bytes: 40_000,
        utf8Offset: 0,
        shownUtf8Bytes: 16_384,
        complete: false,
      },
    });
    expect(Buffer.byteLength(JSON.stringify(firstPage)) + 2_048).toBeLessThan(1024 * 1024);
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        textUtf8Offset: 32_765,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 16_384,
        excerptUtf8Limit: 16 * 1024,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      legacyText: {
        utf8Offset: 32_765,
        shownUtf8Bytes: 7_236,
        complete: true,
      },
      legacyExcerpt: {
        utf8Offset: 16_384,
        shownUtf8Bytes: 16_384,
        complete: false,
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        textUtf8Offset: 2,
        textUtf8Limit: 1,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'text-offset-not-scalar-boundary',
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        textUtf8Offset: 40_002,
        textUtf8Limit: 1,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'text-offset-out-of-range',
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        textUtf8Offset: 40_001,
        textUtf8Limit: 1,
        excerptUtf8Offset: 40_000,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      legacyText: {
        text: '',
        utf8Offset: 40_001,
        shownUtf8Bytes: 0,
        complete: true,
      },
      legacyExcerpt: {
        text: '',
        utf8Offset: 40_000,
        shownUtf8Bytes: 0,
        complete: true,
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024 + 1,
        excerptUtf8Offset: 0,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'projection-limit',
    });

    const withoutExcerpt = list.candidates[31];
    if (withoutExcerpt === undefined) {
      throw new Error('Candidate without excerpt was absent');
    }
    await expect(
      owner.workspace.read({
        kind: 'legacy-review.queue-candidate',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: withoutExcerpt.candidateIdentity,
        textUtf8Offset: 0,
        textUtf8Limit: 32 * 1024,
        excerptUtf8Offset: 1,
        excerptUtf8Limit: 1,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'excerpt-not-present',
    });
  });

  it('promotes one exact legacy Question into a fresh current-Snapshot Draft atomically', async () => {
    const created = await fixture();
    await git(created.checkout, 'config', 'user.email', 'tests@neoflow.local');
    await git(created.checkout, 'config', 'user.name', 'BuildFrame Tests');
    const currentFile = path.join(created.checkout, 'src', 'current.ts');
    await fs.mkdir(path.dirname(currentFile), { recursive: true });
    await fs.writeFile(currentFile, 'export const value = 1;\n');
    await fs.writeFile(path.join(created.checkout, '.gitignore'), '.neoflow/\n');
    await git(created.checkout, 'add', 'src/current.ts', '.gitignore');
    await git(created.checkout, 'commit', '-qm', 'baseline');
    await fs.writeFile(currentFile, 'export const value = 2;\n');
    const bytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json'));
    await install(created.queueFile, bytes);

    let owner = await open(created);
    const imported = await importQueue(owner, 'promote-import');
    const candidates = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 2,
    });
    if (candidates.status !== 'available') {
      throw new Error('Promotion candidates were unavailable');
    }
    const candidate = candidates.candidates.find(item => item.legacyKind === 'question');
    if (candidate === undefined) throw new Error('Question candidate missing');
    const started = await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'promote-review-start',
      expectedStateVersion: 1,
    });
    if (started.kind !== 'review.current-changes.started') {
      throw new Error('Current Review was not started');
    }
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
      throw new Error('Promotion target manifest was unavailable');
    }
    const file = manifest.manifest.files[0];
    const command = {
      kind: 'review.legacy-question-candidate.promote' as const,
      commandIdentity: 'promote-exact-question',
      expectedStateVersion: 2,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      expectedSourceDigest: imported.digest,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
      intent: 'question' as const,
      anchor: {
        kind: 'review.whole-file' as const,
        fileIdentity: file.fileIdentity,
        side: 'new' as const,
      },
    };
    const promoted = await owner.workspace.execute(command);
    expect(promoted).toMatchObject({
      kind: 'review.legacy-question-candidate.promoted',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: 3,
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      draftRevision: 1,
      sourceIdentity: imported.sourceIdentity,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      sourceDigest: imported.digest,
      candidateIdentity: candidate.candidateIdentity,
      promotionIdentity: legacyReviewCandidatePromotionIdentity(
        owner.workspaceIdentity,
        imported.sourceOccurrenceIdentity,
        candidate.candidateIdentity,
      ),
      intent: 'question',
      anchor: {
        kind: 'review.whole-file',
        fileIdentity: file.fileIdentity,
        side: 'new',
      },
    });
    if (promoted.kind !== 'review.legacy-question-candidate.promoted') {
      throw new Error('Question candidate was not promoted');
    }
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions).toMatchObject({
      status: 'available',
      stateVersion: 3,
      list: {
        items: [
          {
            kind: 'question-draft',
            itemIdentity: promoted.draftIdentity,
            revision: 1,
          },
        ],
      },
    });
    const body = await owner.workspace.read({
      kind: 'review.question-body',
      reviewIdentity: started.reviewIdentity,
      itemIdentity: promoted.draftIdentity,
      offset: 0,
      length: 16 * 1024,
    });
    if (body.status !== 'available' || body.window === undefined) {
      throw new Error('Promoted Draft body was unavailable');
    }
    expect(Buffer.from(body.window.bytesBase64, 'base64').toString('utf8')).toBe('Why was this removed?');
    expect(body.window.complete).toBe(true);
    const promotedCandidates = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 2,
    });
    expect(promotedCandidates).toMatchObject({
      status: 'available',
      stateVersion: 3,
    });
    if (promotedCandidates.status !== 'available') {
      throw new Error('Promoted candidate list was unavailable');
    }
    expect(promotedCandidates.candidates[0]).toMatchObject({
      candidateIdentity: candidate.candidateIdentity,
      migrationDecision: 'promoted',
      promotion: {
        promotionIdentity: promoted.promotionIdentity,
        reviewIdentity: started.reviewIdentity,
        reviewSnapshotIdentity: started.reviewSnapshotIdentity,
        draftIdentity: promoted.draftIdentity,
        intent: 'question',
      },
    });

    await fs.rm(created.queueFile);
    await close(owner);
    owner = await open(created);
    await expect(owner.workspace.execute(command)).resolves.toEqual(promoted);
    await expect(
      owner.workspace.execute({
        ...command,
        expectedSourceDigest: 'f'.repeat(64),
      }),
    ).resolves.toMatchObject({
      kind: 'review.command.rejected',
      status: 'rejected',
      stateVersion: 3,
      reason: 'command-identity-conflict',
    });
    await expect(
      owner.workspace.execute({
        ...command,
        commandIdentity: 'promote-exact-question-again',
        expectedStateVersion: 3,
      }),
    ).resolves.toMatchObject({
      kind: 'review.command.rejected',
      status: 'rejected',
      stateVersion: 3,
      reason: 'legacy-candidate-already-promoted',
    });
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'dismiss-promoted-question',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'candidate-already-promoted',
      stateVersion: 3,
    });
  });

  it('rejects non-exact candidates, unsupported bodies, and every unsafe Review target without State writes', async () => {
    const created = await fixture();
    await prepareCurrentReviewChange(created);
    const oversized = 'x'.repeat(64 * 1024 + 1);
    const annotations = [
      { id: 'good', kind: 'question', anchor: { side: 'file' }, text: 'Exact candidate Question?' },
      { id: 'change', kind: 'change', anchor: { side: 'file' }, text: 'Request a change.' },
      { id: 'edit', kind: 'edit', anchor: { side: 'file' }, text: 'Replace this.' },
      { id: 'blank', kind: 'question', anchor: { side: 'file' }, text: ' \t\n ' },
      { id: 'nul', kind: 'question', anchor: { side: 'file' }, text: 'Question\u0000body' },
      { id: 'large', kind: 'question', anchor: { side: 'file' }, text: oversized },
    ] as const;
    await install(
      created.queueFile,
      Buffer.from(
        `${JSON.stringify({
          version: 2,
          annotations,
        })}\n`,
      ),
    );
    const owner = await open(created);
    const imported = await importQueue(owner, 'promotion-rejections-import');
    const list = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 32,
    });
    if (list.status !== 'available') throw new Error('Candidates unavailable');
    const byId = new Map(list.candidates.map(candidate => [candidate.legacyAnnotationId.text, candidate]));
    const good = byId.get('good');
    if (good === undefined) throw new Error('Exact candidate missing');
    const { started, file } = await startCurrentReviewTarget(owner, 'promotion-rejections-review', 1);
    const base = {
      kind: 'review.legacy-question-candidate.promote' as const,
      commandIdentity: 'promotion-rejection-base',
      expectedStateVersion: 2,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: good.candidateIdentity,
      expectedSourceDigest: imported.digest,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
      intent: 'question' as const,
      anchor: {
        kind: 'review.whole-file' as const,
        fileIdentity: file.fileIdentity,
        side: 'new' as const,
      },
    };
    const executeUnknown = async (command: unknown): Promise<unknown> =>
      await (owner.workspace.execute as (command: unknown) => Promise<unknown>)(command);
    await expect(executeUnknown({ ...base, exposedBody: 'forbidden' })).rejects.toThrow(
      'Invalid legacy Question candidate promotion command',
    );

    const fakeReviewIdentity = `rev_${'f'.repeat(64)}` as typeof started.reviewIdentity;
    const fakeSnapshotIdentity = `rsn_${'e'.repeat(64)}` as typeof started.reviewSnapshotIdentity;
    const fakeCandidateIdentity = `lgc_${'d'.repeat(64)}` as LegacyReviewQueueCandidateIdentity;
    const fakeOccurrenceIdentity = `lso_${'c'.repeat(64)}` as LegacyReviewSourceOccurrenceIdentity;
    const rejectionCases = [
      {
        command: { ...base, commandIdentity: 'promotion-stale-state', expectedStateVersion: 1 },
        reason: 'state-version-mismatch',
      },
      {
        command: { ...base, commandIdentity: 'promotion-review-missing', reviewIdentity: fakeReviewIdentity },
        reason: 'review-not-found',
      },
      {
        command: {
          ...base,
          commandIdentity: 'promotion-snapshot-mismatch',
          expectedReviewSnapshotIdentity: fakeSnapshotIdentity,
        },
        reason: 'review-snapshot-identity-mismatch',
      },
      {
        command: {
          ...base,
          commandIdentity: 'promotion-anchor-missing',
          anchor: {
            kind: 'review.whole-file' as const,
            fileIdentity: `fil_${'b'.repeat(64)}`,
            side: 'new' as const,
          },
        },
        reason: 'anchor-file-not-found',
      },
      {
        command: {
          ...base,
          commandIdentity: 'promotion-source-missing',
          sourceOccurrenceIdentity: fakeOccurrenceIdentity,
        },
        reason: 'legacy-source-occurrence-not-imported',
      },
      {
        command: {
          ...base,
          commandIdentity: 'promotion-digest-mismatch',
          expectedSourceDigest: '0'.repeat(64),
        },
        reason: 'legacy-candidate-source-digest-mismatch',
      },
      {
        command: {
          ...base,
          commandIdentity: 'promotion-candidate-missing',
          candidateIdentity: fakeCandidateIdentity,
        },
        reason: 'legacy-candidate-not-found',
      },
    ];
    for (const { command, reason } of rejectionCases) {
      await expect(owner.workspace.execute(command)).resolves.toMatchObject({
        kind: 'review.command.rejected',
        status: 'rejected',
        stateVersion: 2,
        reason,
      });
    }
    for (const id of ['change', 'edit']) {
      const candidate = byId.get(id);
      if (candidate === undefined) throw new Error(`${id} candidate missing`);
      await expect(
        owner.workspace.execute({
          ...base,
          commandIdentity: `promotion-unsupported-${id}`,
          candidateIdentity: candidate.candidateIdentity,
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        stateVersion: 2,
        reason: 'legacy-candidate-intent-unsupported',
      });
    }
    for (const id of ['blank', 'nul', 'large']) {
      const candidate = byId.get(id);
      if (candidate === undefined) throw new Error(`${id} candidate missing`);
      await expect(
        owner.workspace.execute({
          ...base,
          commandIdentity: `promotion-ineligible-${id}`,
          candidateIdentity: candidate.candidateIdentity,
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        stateVersion: 2,
        reason: 'legacy-candidate-body-ineligible',
      });
    }

    await fs.writeFile(path.join(created.checkout, 'src', 'current.ts'), 'export const value = 3;\n');
    await expect(
      owner.workspace.execute({
        ...base,
        commandIdentity: 'promotion-stale-snapshot',
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 2,
      reason: 'snapshot-stale',
    });
    await fs.writeFile(path.join(created.checkout, 'src', 'current.ts'), 'export const value = 2;\n');

    const gitDirectory = path.join(created.checkout, '.git');
    const unavailableGitDirectory = path.join(created.checkout, '.git-held');
    await fs.rename(gitDirectory, unavailableGitDirectory);
    try {
      await expect(
        owner.workspace.execute({
          ...base,
          commandIdentity: 'promotion-unverified-snapshot',
        }),
      ).resolves.toMatchObject({
        status: 'rejected',
        stateVersion: 2,
        reason: 'snapshot-unverified',
      });
    } finally {
      await fs.rename(unavailableGitDirectory, gitDirectory);
    }

    const successor = await startCurrentReviewTarget(owner, 'promotion-successor-review', 2);
    await expect(
      owner.workspace.execute({
        ...base,
        commandIdentity: 'promotion-non-current-review',
        expectedStateVersion: 3,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 3,
      reason: 'review-not-current',
    });
    expect(successor.started.reviewIdentity).not.toBe(started.reviewIdentity);

    const database = new DatabaseSync(await stateDatabasePath(created, owner.workspaceIdentity));
    const forbidden = database
      .prepare(
        "SELECT COUNT(*) AS count FROM records WHERE kind IN ('legacy-review.candidate-promotion', 'review.question-draft')",
      )
      .get() as { readonly count: number };
    database.close();
    expect(forbidden.count).toBe(0);
  });

  it('lets explicit promotion supersede a decision and preserves it through every migration-index writer', async () => {
    const created = await fixture();
    await prepareCurrentReviewChange(created);
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const owner = await open(created);
    const imported = await importQueue(owner, 'promotion-writers-import');
    const firstList = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 8,
    });
    if (firstList.status !== 'available' || firstList.candidates[0] === undefined) {
      throw new Error('First promotion candidate unavailable');
    }
    const candidate = firstList.candidates[0];
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'promotion-writers-defer',
        expectedStateVersion: 1,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 2 });
    const { started, file } = await startCurrentReviewTarget(owner, 'promotion-writers-review', 2);
    const promotionCommand = {
      kind: 'review.legacy-question-candidate.promote' as const,
      commandIdentity: 'promotion-writers-promote',
      expectedStateVersion: 3,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      expectedSourceDigest: imported.digest,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
      intent: 'question' as const,
      anchor: {
        kind: 'review.whole-file' as const,
        fileIdentity: file.fileIdentity,
        side: 'new' as const,
      },
    };
    const promoted = await owner.workspace.execute(promotionCommand);
    if (promoted.kind !== 'review.legacy-question-candidate.promoted') {
      throw new Error('Writer-preservation candidate was not promoted');
    }
    expect(promoted.stateVersion).toBe(4);

    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json')));
    const secondSources = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const secondSource = secondSources.sources[0];
    if (secondSource.observation.status !== 'detected') {
      throw new Error('Second queue occurrence unavailable');
    }
    const secondImport = await owner.workspace.execute({
      kind: 'legacy-review.source.import',
      commandIdentity: 'promotion-writers-second-import',
      expectedStateVersion: 4,
      sourceIdentity: secondSource.sourceIdentity,
      expectedDigest: secondSource.observation.digest,
    });
    if (secondImport.kind !== 'legacy-review.source.imported') {
      throw new Error('Second queue occurrence was not imported');
    }
    expect(secondImport.stateVersion).toBe(5);
    const secondList = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (secondList.status !== 'available' || secondList.candidates[0] === undefined) {
      throw new Error('Second queue candidate unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'promotion-writers-second-decision',
        expectedStateVersion: 5,
        sourceOccurrenceIdentity: secondImport.sourceOccurrenceIdentity,
        candidateIdentity: secondList.candidates[0].candidateIdentity,
        decision: 'dismissed',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 6 });

    await install(
      created.queueFile,
      Buffer.from(
        `${JSON.stringify({
          version: 2,
          annotations: [
            {
              id: 'third-occurrence',
              kind: 'question',
              anchor: { side: 'file' },
              text: 'Third exact occurrence?',
            },
          ],
        })}\n`,
      ),
    );
    const thirdSources = await owner.workspace.read({
      kind: 'legacy-review.sources',
    });
    const thirdSource = thirdSources.sources[0];
    if (thirdSource.observation.status !== 'detected') {
      throw new Error('Third queue occurrence unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.source.decision.set',
        commandIdentity: 'promotion-writers-source-decision',
        expectedStateVersion: 6,
        sourceIdentity: thirdSource.sourceIdentity,
        expectedDigest: thirdSource.observation.digest,
        decision: 'deferred',
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 7 });

    const oldCheckoutHash = '0'.repeat(64);
    const movedReceipt = path.join(created.state, 'neoflow', 'workspaces', oldCheckoutHash, 'review-receipts.json');
    await install(movedReceipt, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'receipts-v1.json')));
    const moved = await owner.workspace.read({
      kind: 'legacy-review.moved-receipt-sources',
      search: { kind: 'legacy-state-directory' },
      sourceOffset: 0,
      sourceLimit: 32,
    });
    const movedSource = moved.status === 'available' ? moved.sources[0] : undefined;
    if (movedSource === undefined || movedSource.observation.status !== 'detected') {
      throw new Error('Moved receipt writer source unavailable');
    }
    await expect(
      owner.workspace.execute({
        kind: 'legacy-review.moved-receipt-source.associate-and-import',
        commandIdentity: 'promotion-writers-moved-association',
        expectedStateVersion: 7,
        confirmedWorkspaceIdentity: owner.workspaceIdentity,
        sourceIdentity: movedSource.sourceIdentity,
        legacyCheckoutHash: movedSource.legacyCheckoutHash,
        expectedDigest: movedSource.observation.digest,
      }),
    ).resolves.toMatchObject({ status: 'accepted', stateVersion: 8 });

    const retained = await owner.workspace.read({
      kind: 'legacy-review.queue-candidate',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      textUtf8Offset: 0,
      textUtf8Limit: 32 * 1024,
      excerptUtf8Offset: 0,
      excerptUtf8Limit: 16 * 1024,
    });
    expect(retained).toMatchObject({
      status: 'available',
      stateVersion: 8,
      migrationDecision: 'promoted',
      promotion: {
        promotionIdentity: promoted.promotionIdentity,
        draftIdentity: promoted.draftIdentity,
      },
    });
    await expect(owner.workspace.execute(promotionCommand)).resolves.toEqual(promoted);

    const database = new DatabaseSync(await stateDatabasePath(created, owner.workspaceIdentity));
    const indexRecord = database
      .prepare('SELECT payload FROM records WHERE record_identity = ?')
      .get(legacyReviewImportIndexIdentity(owner.workspaceIdentity)) as {
      readonly payload: Uint8Array;
    };
    database.close();
    const index = JSON.parse(Buffer.from(indexRecord.payload).toString('utf8')) as {
      readonly candidatePromotions?: readonly unknown[];
    };
    expect(index.candidatePromotions).toHaveLength(1);
  });

  it('serializes concurrent promotion and enforces the aggregate promotion bound', async () => {
    const concurrent = await fixture();
    await prepareCurrentReviewChange(concurrent);
    await install(concurrent.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const concurrentOwner = await open(concurrent);
    const imported = await importQueue(concurrentOwner, 'promotion-concurrent-import');
    const list = await concurrentOwner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Concurrent candidate unavailable');
    }
    const candidate = list.candidates[0];
    const { started, file } = await startCurrentReviewTarget(concurrentOwner, 'promotion-concurrent-review', 1);
    const base = {
      kind: 'review.legacy-question-candidate.promote' as const,
      expectedStateVersion: 2,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      expectedSourceDigest: imported.digest,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
      intent: 'question' as const,
      anchor: {
        kind: 'review.whole-file' as const,
        fileIdentity: file.fileIdentity,
        side: 'new' as const,
      },
    };
    const results = await Promise.all([
      concurrentOwner.workspace.execute({
        ...base,
        commandIdentity: 'promotion-concurrent-a',
      }),
      concurrentOwner.workspace.execute({
        ...base,
        commandIdentity: 'promotion-concurrent-b',
      }),
    ]);
    const accepted = results.find(result => result.kind === 'review.legacy-question-candidate.promoted');
    const rejectedResult = results.find(result => result.kind === 'review.command.rejected');
    expect(accepted).toMatchObject({ status: 'accepted', stateVersion: 3 });
    expect(rejectedResult).toMatchObject({
      status: 'rejected',
      stateVersion: 3,
      reason: 'state-version-mismatch',
    });
    if (
      accepted?.kind !== 'review.legacy-question-candidate.promoted' ||
      rejectedResult?.kind !== 'review.command.rejected'
    ) {
      throw new Error('Concurrent promotion did not serialize');
    }
    const losingIdentity = rejectedResult.commandIdentity;
    await expect(
      concurrentOwner.workspace.execute({
        ...base,
        commandIdentity: losingIdentity,
        expectedStateVersion: 3,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 3,
      reason: 'legacy-candidate-already-promoted',
    });
    const questions = await concurrentOwner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (questions.status !== 'available') {
      throw new Error('Concurrent Review questions unavailable');
    }
    expect(questions.list.items).toHaveLength(1);
    expect(questions.list.items[0]).toMatchObject({
      itemIdentity: accepted.draftIdentity,
      revision: 1,
    });

    const bounded = await fixture();
    await prepareCurrentReviewChange(bounded);
    await install(bounded.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const boundedOwner = await openControlled(
      bounded,
      {},
      {
        legacyReviewImportMaximumOccurrences: 1,
      },
    );
    const boundedImport = await importQueue(boundedOwner, 'promotion-bounded-import');
    const boundedList = await boundedOwner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (boundedList.status !== 'available' || boundedList.candidates[0] === undefined) {
      throw new Error('Bounded candidate unavailable');
    }
    const boundedTarget = await startCurrentReviewTarget(boundedOwner, 'promotion-bounded-review', 1);
    await expect(
      boundedOwner.workspace.execute({
        kind: 'review.legacy-question-candidate.promote',
        commandIdentity: 'promotion-bounded-rejected',
        expectedStateVersion: 2,
        sourceOccurrenceIdentity: boundedImport.sourceOccurrenceIdentity,
        candidateIdentity: boundedList.candidates[0].candidateIdentity,
        expectedSourceDigest: boundedImport.digest,
        reviewIdentity: boundedTarget.started.reviewIdentity,
        expectedReviewSnapshotIdentity: boundedTarget.started.reviewSnapshotIdentity,
        intent: 'question',
        anchor: {
          kind: 'review.whole-file',
          fileIdentity: boundedTarget.file.fileIdentity,
          side: 'new',
        },
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      stateVersion: 2,
      reason: 'legacy-candidate-promotion-limit',
    });
    const boundedQuestions = await boundedOwner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: boundedTarget.started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (boundedQuestions.status !== 'available') {
      throw new Error('Bounded Review questions unavailable');
    }
    expect(boundedQuestions.list.items).toEqual([]);
  });

  it('rejects an unindexed conflicting promotion fact instead of inventing membership', async () => {
    const created = await fixture();
    await prepareCurrentReviewChange(created);
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const preview = await open(created);
    const imported = await importQueue(preview, 'promotion-conflict-import');
    const list = await preview.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Conflict candidate unavailable');
    }
    const candidate = list.candidates[0];
    const target = await startCurrentReviewTarget(preview, 'promotion-conflict-review', 1);
    const workspaceIdentity = preview.workspaceIdentity;
    await close(preview);

    const promotionIdentity = legacyReviewCandidatePromotionIdentity(
      workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      candidate.candidateIdentity,
    );
    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      await expect(
        state.commit({
          commandIdentity: 'install-conflicting-promotion-fact',
          expectedStateVersion: 2,
          records: [
            {
              recordClass: 'immutable',
              recordIdentity: promotionIdentity,
              workflowIdentity: legacyReviewImportIndexIdentity(workspaceIdentity),
              kind: 'test.conflicting-candidate-promotion',
              schemaVersion: 1,
              payload: new Uint8Array([0]),
              content: [],
            },
          ],
          result: {
            kind: 'test.conflicting-candidate-promotion-installed',
            schemaVersion: 1,
            payload: new Uint8Array([1]),
          },
        }),
      ).resolves.toMatchObject({ status: 'committed', stateVersion: 3 });
    } finally {
      await state.close();
    }

    const owner = await open(created);
    await expect(
      owner.workspace.execute({
        kind: 'review.legacy-question-candidate.promote',
        commandIdentity: 'promotion-conflict-rejected',
        expectedStateVersion: 3,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity: candidate.candidateIdentity,
        expectedSourceDigest: imported.digest,
        reviewIdentity: target.started.reviewIdentity,
        expectedReviewSnapshotIdentity: target.started.reviewSnapshotIdentity,
        intent: 'question',
        anchor: {
          kind: 'review.whole-file',
          fileIdentity: target.file.fileIdentity,
          side: 'new',
        },
      }),
    ).rejects.toThrow('legacy-review-import-state-invalid');
    const database = new DatabaseSync(await stateDatabasePath(created, workspaceIdentity));
    const drafts = database
      .prepare("SELECT COUNT(*) AS count FROM records WHERE kind = 'review.question-draft'")
      .get() as { readonly count: number };
    const indexRecord = database
      .prepare('SELECT payload FROM records WHERE record_identity = ?')
      .get(legacyReviewImportIndexIdentity(workspaceIdentity)) as {
      readonly payload: Uint8Array;
    };
    database.close();
    expect(drafts.count).toBe(0);
    expect(JSON.parse(Buffer.from(indexRecord.payload).toString('utf8'))).not.toHaveProperty('candidatePromotions');
  });

  it('rolls promotion back, recalls an unknown commit, and fails closed for damaged evidence', async () => {
    const created = await fixture();
    await prepareCurrentReviewChange(created);
    await install(created.queueFile, await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v1.json')));
    const previewOwner = await open(created);
    const imported = await importQueue(previewOwner, 'promotion-fault-import');
    const list = await previewOwner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Fault promotion candidate unavailable');
    }
    const candidate = list.candidates[0];
    const target = await startCurrentReviewTarget(previewOwner, 'promotion-fault-review', 1);
    const workspaceIdentity = previewOwner.workspaceIdentity;
    await close(previewOwner);

    const beforeCommand = {
      kind: 'review.legacy-question-candidate.promote' as const,
      commandIdentity: 'promotion-before-commit-fault',
      expectedStateVersion: 2,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      expectedSourceDigest: imported.digest,
      reviewIdentity: target.started.reviewIdentity,
      expectedReviewSnapshotIdentity: target.started.reviewSnapshotIdentity,
      intent: 'question' as const,
      anchor: {
        kind: 'review.whole-file' as const,
        fileIdentity: target.file.fileIdentity,
        side: 'new' as const,
      },
    };
    const beforePromotionIdentity = legacyReviewCandidatePromotionIdentity(
      workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      candidate.candidateIdentity,
    );
    const beforeDraftIdentity = reviewingRecordIdentity('qdr', beforeCommand.commandIdentity, 'question-draft');
    const beforeOwner = await openControlled(created, {
      failpoint: 'after-first-record-write',
    });
    await expect(beforeOwner.workspace.execute(beforeCommand)).rejects.toMatchObject({
      code: 'state-commit-failed',
    });
    await close(beforeOwner);

    const rollbackState = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const rollback = await rollbackState.read({
        recordIdentities: [
          beforeDraftIdentity,
          beforePromotionIdentity,
          reviewingRecordIdentity('rcm', beforeCommand.commandIdentity),
          legacyReviewImportIndexIdentity(workspaceIdentity),
          reviewingRecordIdentity('rvi', workspaceIdentity),
        ],
        includeContent: false,
      });
      expect(rollback.stateVersion).toBe(2);
      expect(rollback.records.slice(0, 3)).toEqual([undefined, undefined, undefined]);
      const migrationIndex = JSON.parse(Buffer.from(rollback.records[3]?.payload ?? []).toString('utf8')) as {
        readonly candidatePromotions?: unknown;
      };
      expect(migrationIndex.candidatePromotions).toBeUndefined();
      const reviewIndex = JSON.parse(Buffer.from(rollback.records[4]?.payload ?? []).toString('utf8')) as {
        readonly reviews: readonly { readonly draftIdentities: readonly string[] }[];
      };
      expect(reviewIndex.reviews[0]?.draftIdentities).toEqual([]);
    } finally {
      await rollbackState.close();
    }

    const afterCommand = {
      ...beforeCommand,
      commandIdentity: 'promotion-after-commit-fault',
    };
    const afterPromotionIdentity = legacyReviewCandidatePromotionIdentity(
      workspaceIdentity,
      imported.sourceOccurrenceIdentity,
      candidate.candidateIdentity,
    );
    const afterDraftIdentity = reviewingRecordIdentity('qdr', afterCommand.commandIdentity, 'question-draft');
    const unknownOwner = await openControlled(created, {
      pauseAfterCommitCommandIdentity: afterCommand.commandIdentity,
      requestTimeoutMilliseconds: 1_000,
    });
    await expect(unknownOwner.workspace.execute(afterCommand)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    owners.delete(unknownOwner);
    await unknownOwner.dispose().catch(() => undefined);
    await fs.rm(created.queueFile);

    const recovered = await open(created);
    const promoted = await recovered.workspace.execute(afterCommand);
    expect(promoted).toMatchObject({
      kind: 'review.legacy-question-candidate.promoted',
      status: 'accepted',
      stateVersion: 3,
      draftIdentity: afterDraftIdentity,
      promotionIdentity: afterPromotionIdentity,
    });
    if (promoted.kind !== 'review.legacy-question-candidate.promoted') {
      throw new Error('Unknown promotion was not recalled');
    }
    await close(recovered);

    const databasePath = await stateDatabasePath(created, workspaceIdentity);
    const pristineDatabase = path.join(created.root, 'promotion-pristine.sqlite');
    await fs.copyFile(databasePath, pristineDatabase);
    const damageCases = [
      {
        name: 'missing-promotion',
        mutate(database: DatabaseSync): void {
          database.prepare('DELETE FROM records WHERE record_identity = ?').run(promoted.promotionIdentity);
        },
        action: 'read' as const,
      },
      {
        name: 'missing-draft',
        mutate(database: DatabaseSync): void {
          database.prepare('DELETE FROM records WHERE record_identity = ?').run(promoted.draftIdentity);
        },
        action: 'replay' as const,
      },
      {
        name: 'quarantined-blob',
        mutate(database: DatabaseSync): void {
          database
            .prepare('UPDATE content_objects SET bytes = ? WHERE digest = ?')
            .run(new Uint8Array([0xde, 0xad]), imported.digest);
        },
        action: 'replay' as const,
      },
    ];
    for (const damage of damageCases) {
      await fs.copyFile(pristineDatabase, databasePath);
      const database = new DatabaseSync(databasePath);
      damage.mutate(database);
      database.close();
      const damaged = await open(created);
      if (damage.action === 'read') {
        await expect(
          damaged.workspace.read({
            kind: 'legacy-review.queue-candidate',
            sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
            candidateIdentity: candidate.candidateIdentity,
            textUtf8Offset: 0,
            textUtf8Limit: 32 * 1024,
            excerptUtf8Offset: 0,
            excerptUtf8Limit: 16 * 1024,
          }),
        ).rejects.toThrow('legacy-review-import-state-invalid');
      } else {
        await expect(damaged.workspace.execute(afterCommand)).rejects.toThrow(
          damage.name === 'missing-draft' ? 'reviewing-state-invalid' : 'legacy-review-import-state-invalid',
        );
      }
      await close(damaged);
    }
    await fs.copyFile(pristineDatabase, databasePath);
    const provenanceState = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await provenanceState.read({
        recordIdentities: [promoted.draftIdentity],
        includeContent: false,
      });
      const draftRecord = read.records[0];
      if (draftRecord === undefined || draftRecord.recordClass !== 'revisioned') {
        throw new Error('Promoted Draft record unavailable for provenance test');
      }
      const payload = JSON.parse(Buffer.from(draftRecord.payload).toString('utf8')) as Record<string, unknown>;
      delete payload.provenance;
      await expect(
        provenanceState.commit({
          commandIdentity: 'remove-promotion-draft-provenance',
          expectedStateVersion: 3,
          records: [
            {
              recordClass: 'revisioned',
              recordIdentity: draftRecord.recordIdentity,
              workflowIdentity: draftRecord.workflowIdentity,
              kind: draftRecord.kind,
              schemaVersion: draftRecord.schemaVersion,
              expectedRevision: draftRecord.revision,
              payload: Buffer.from(JSON.stringify(payload)),
              content: [],
            },
          ],
          result: {
            kind: 'test.promotion-provenance-removed',
            schemaVersion: 1,
            payload: new Uint8Array([1]),
          },
        }),
      ).resolves.toMatchObject({ status: 'committed', stateVersion: 4 });
    } finally {
      await provenanceState.close();
    }
    const missingProvenanceOwner = await open(created);
    await expect(missingProvenanceOwner.workspace.execute(afterCommand)).rejects.toThrow('reviewing-state-invalid');
    await close(missingProvenanceOwner);

    await fs.copyFile(pristineDatabase, databasePath);
    const indexState = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const read = await indexState.read({
        recordIdentities: [legacyReviewImportIndexIdentity(workspaceIdentity)],
        includeContent: false,
      });
      const indexRecord = read.records[0];
      if (indexRecord === undefined || indexRecord.recordClass !== 'revisioned') {
        throw new Error('Migration index unavailable for membership test');
      }
      const payload = JSON.parse(Buffer.from(indexRecord.payload).toString('utf8')) as Record<string, unknown>;
      delete payload.candidatePromotions;
      await expect(
        indexState.commit({
          commandIdentity: 'remove-promotion-index-membership',
          expectedStateVersion: 3,
          records: [
            {
              recordClass: 'revisioned',
              recordIdentity: indexRecord.recordIdentity,
              workflowIdentity: indexRecord.workflowIdentity,
              kind: indexRecord.kind,
              schemaVersion: indexRecord.schemaVersion,
              expectedRevision: indexRecord.revision,
              payload: Buffer.from(JSON.stringify(payload)),
              content: [],
            },
          ],
          result: {
            kind: 'test.promotion-membership-removed',
            schemaVersion: 1,
            payload: new Uint8Array([1]),
          },
        }),
      ).resolves.toMatchObject({ status: 'committed', stateVersion: 4 });
    } finally {
      await indexState.close();
    }
    const missingMembershipOwner = await open(created);
    await expect(missingMembershipOwner.workspace.execute(afterCommand)).rejects.toThrow(
      'legacy-review-import-state-invalid',
    );
    await close(missingMembershipOwner);

    await fs.copyFile(pristineDatabase, databasePath);
    const missingCommandDatabase = new DatabaseSync(databasePath);
    missingCommandDatabase
      .prepare('DELETE FROM records WHERE record_identity = ?')
      .run(reviewingRecordIdentity('rcm', afterCommand.commandIdentity));
    missingCommandDatabase.close();
    const missingCommandOwner = await open(created);
    await expect(missingCommandOwner.workspace.execute(afterCommand)).resolves.toMatchObject({
      kind: 'review.command.rejected',
      status: 'rejected',
      stateVersion: 3,
      reason: 'state-version-mismatch',
    });
  });

  it('never falls back to a valid current queue when imported BLOB content is quarantined', async () => {
    const created = await fixture();
    const bytes = await fs.readFile(path.join(GOLDEN_DIRECTORY, 'queue-v2.json'));
    await install(created.queueFile, bytes);
    const owner = await open(created);
    const imported = await importQueue(owner, 'import-queue-before-content-damage');
    const list = await owner.workspace.read({
      kind: 'legacy-review.queue-candidates',
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateOffset: 0,
      candidateLimit: 1,
    });
    if (list.status !== 'available' || list.candidates[0] === undefined) {
      throw new Error('Content-damage candidate was unavailable');
    }
    const candidateIdentity = list.candidates[0].candidateIdentity;
    const workspaceIdentity = owner.workspaceIdentity;
    await close(owner);

    const database = new DatabaseSync(await stateDatabasePath(created, workspaceIdentity));
    database
      .prepare('UPDATE content_objects SET bytes = ? WHERE digest = ?')
      .run(new Uint8Array([0xde, 0xad]), imported.digest);
    database.close();

    const recovered = await open(created);
    const current = await recovered.workspace.read({
      kind: 'legacy-review.sources',
    });
    expect(current.sources[0].observation).toMatchObject({
      status: 'detected',
      digest: imported.digest,
      migration: { status: 'imported' },
    });
    await expect(
      recovered.workspace.read({
        kind: 'legacy-review.queue-candidates',
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateOffset: 0,
        candidateLimit: 1,
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.queue-candidates',
      status: 'unavailable',
      projectionVersion: 1,
      stateVersion: 1,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      reason: 'content-unavailable',
    });
    await expect(
      recovered.workspace.execute({
        kind: 'legacy-review.queue-candidate.decision.set',
        commandIdentity: 'reject-quarantined-candidate-decision',
        expectedStateVersion: 1,
        sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
        candidateIdentity,
        decision: 'deferred',
      }),
    ).resolves.toEqual({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      commandIdentity: 'reject-quarantined-candidate-decision',
      stateVersion: 1,
      sourceOccurrenceIdentity: imported.sourceOccurrenceIdentity,
      candidateIdentity,
      reason: 'candidate-source-unavailable',
    });
    expect(await fs.readFile(created.queueFile)).toEqual(bytes);
  });
});
