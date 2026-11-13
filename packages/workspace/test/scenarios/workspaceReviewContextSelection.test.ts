import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { encodeBytesBase64 } from '../../src/bytesBase64.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import type { Workspace } from '../../src/index.js';
import type {
  ReviewContextRuleIdentity,
  ReviewContextSelectionChange,
  ReviewContextSelectionChanged,
  ReviewIdentity,
} from '@buildframe/workspace/reviewing';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
  return result.stdout.trim();
}

function encodedPath(value: string): string {
  return encodeBytesBase64(Buffer.from(value, 'utf8'));
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-review-context-selection-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(path.join(checkout, 'context', 'private'), { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, '.gitignore'), 'context/ignored.txt\n');
  await writeFile(path.join(checkout, 'review.txt'), 'before\n');
  await writeFile(path.join(checkout, 'context', 'open.txt'), 'open\n');
  await writeFile(path.join(checkout, 'context', 'private', 'allow.txt'), 'allow\n');
  await writeFile(path.join(checkout, 'context', 'private', 'block.txt'), 'block\n');
  await writeFile(path.join(checkout, 'context', 'ignored.txt'), 'ignored\n');
  await git(checkout, 'add', '.gitignore', 'review.txt', 'context/open.txt', 'context/private');
  await git(checkout, 'commit', '-qm', 'basis');
  await writeFile(path.join(checkout, 'review.txt'), 'after\n');
  return { root, checkout, state };
}

function requireStarted(result: Awaited<ReturnType<Workspace['execute']>>): {
  readonly reviewIdentity: ReviewIdentity;
  readonly stateVersion: number;
} {
  expect(result.kind).toBe('review.current-changes.started');
  if (result.kind !== 'review.current-changes.started') throw new Error('Review did not start');
  return result;
}

function requireSelectionChanged(result: Awaited<ReturnType<Workspace['execute']>>): ReviewContextSelectionChanged {
  expect(result.kind).toBe('review.context-selection.changed');
  if (result.kind !== 'review.context-selection.changed') {
    throw new Error(`Context selection did not change: ${result.kind}`);
  }
  return result;
}

async function changeSelection(
  workspace: Workspace,
  reviewIdentity: ReviewIdentity,
  commandIdentity: string,
  expectedStateVersion: number,
  expectedSelectionRevision: number,
  change: ReviewContextSelectionChange,
): Promise<ReviewContextSelectionChanged> {
  return requireSelectionChanged(
    await workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity,
      expectedStateVersion,
      reviewIdentity,
      expectedSelectionRevision,
      change,
    }),
  );
}

describe('Review-owned Workflow Context Selection', () => {
  const roots = new Set<string>();
  const owners = new Set<WorkspaceRuntimeOwner>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    const opened = await openWorkspaceRuntimeOwner({ startPath: created.checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
    owners.add(opened.owner);
    return opened.owner;
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('treats an absent selection record as exact empty context without rewriting the Snapshot', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-empty-context-review',
        expectedStateVersion: 0,
      }),
    );

    const beforeVersions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    const selection = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });

    expect(selection).toMatchObject({
      kind: 'review.context-selection',
      status: 'available',
      stateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      selectionRevision: 0,
      rules: [],
      sourceGroups: [],
      defaultIgnoredUntracked: 'excluded',
      manifest: {
        status: 'complete',
        totalCandidates: 0,
        offset: 0,
        candidates: [],
        nextOffset: null,
      },
    });
    expect(selection.status === 'available' && selection.selectionIdentity).toMatch(/^rcs_[0-9a-f]{64}$/u);
    expect(Object.isFrozen(selection)).toBe(true);

    const afterVersions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterVersions).toEqual(beforeVersions);
    expect(afterVersions.stateVersion).toBe(started.stateVersion);
    await expect(
      owner.workspace.read({
        kind: 'review.context-selection',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 65,
      }),
    ).rejects.toThrow('Invalid bounded Review context selection window');
  });

  it('applies stable prefix exclusions, direct overrides, default ignored exclusion, and lossless source order', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-precedence-review',
        expectedStateVersion: 0,
      }),
    );

    const directory = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'include-context-directory',
      started.stateVersion,
      0,
      {
        action: 'include',
        source: {
          kind: 'workspace',
          form: 'directory',
          inclusion: 'ordinary',
          pathBytesBase64: encodedPath('context'),
        },
      },
    );
    const privateExclusion = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'exclude-private-directory',
      directory.stateVersion,
      directory.selectionRevision,
      {
        action: 'exclude',
        target: {
          kind: 'workspace',
          form: 'directory',
          pathBytesBase64: encodedPath('context/private'),
        },
      },
    );
    const direct = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'include-private-allow-directly',
      privateExclusion.stateVersion,
      privateExclusion.selectionRevision,
      {
        action: 'include',
        source: {
          kind: 'workspace',
          form: 'file',
          inclusion: 'ordinary',
          pathBytesBase64: encodedPath('context/private/allow.txt'),
        },
        scope: { kind: 'bytes', offset: 1, length: 3 },
        classification: 'generated',
      },
    );
    const ignored = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'include-ignored-directly',
      direct.stateVersion,
      direct.selectionRevision,
      {
        action: 'include',
        source: {
          kind: 'workspace',
          form: 'file',
          inclusion: 'ignored-explicit',
          pathBytesBase64: encodedPath('context/ignored.txt'),
        },
      },
    );

    const view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.status).toBe('available');
    if (view.status !== 'available') throw new Error('Context selection unavailable');
    expect(view).toMatchObject({
      stateVersion: ignored.stateVersion,
      selectionRevision: 4,
      sourceGroups: [
        { origin: 0, ruleIdentity: directory.ruleIdentity },
        { origin: 1, ruleIdentity: direct.ruleIdentity },
        { origin: 2, ruleIdentity: ignored.ruleIdentity },
      ],
      manifest: { status: 'complete', totalCandidates: 4, nextOffset: null },
    });
    expect(view.rules.map(rule => rule.ruleIdentity)).toEqual([
      directory.ruleIdentity,
      privateExclusion.ruleIdentity,
      direct.ruleIdentity,
      ignored.ruleIdentity,
    ]);
    expect(view.rules[2]).toMatchObject({
      action: 'include',
      scope: { kind: 'bytes', offset: 1, length: 3 },
      classification: 'generated',
    });

    const candidates = new Map(
      view.manifest.candidates.map(candidate => [
        candidate.pathBytesBase64 === undefined
          ? candidate.absolutePath
          : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8'),
        candidate,
      ]),
    );
    expect(candidates.get('context/open.txt')).toMatchObject({
      decision: {
        status: 'included',
        decidingRuleIdentity: directory.ruleIdentity,
        inclusionRuleIdentities: [directory.ruleIdentity],
      },
      sensitive: false,
    });
    expect(candidates.get('context/private/block.txt')).toMatchObject({
      decision: {
        status: 'excluded',
        decidingRuleIdentity: privateExclusion.ruleIdentity,
        inclusionRuleIdentities: [directory.ruleIdentity],
      },
    });
    expect(candidates.get('context/private/allow.txt')).toMatchObject({
      origins: [0, 1],
      decision: {
        status: 'included',
        decidingRuleIdentity: direct.ruleIdentity,
        inclusionRuleIdentities: [directory.ruleIdentity, direct.ruleIdentity],
      },
    });
    expect(candidates.get('context/ignored.txt')).toMatchObject({
      eligibility: 'ignored-explicit',
      sensitive: true,
      decision: {
        status: 'included',
        decidingRuleIdentity: ignored.ruleIdentity,
        inclusionRuleIdentities: [directory.ruleIdentity, ignored.ruleIdentity],
      },
    });

    await writeFile(path.join(created.checkout, 'context', 'private', 'future.txt'), 'future\n');
    const afterFutureDescendant = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterFutureDescendant.stateVersion).toBe(ignored.stateVersion);
    expect(
      afterFutureDescendant.status === 'available'
        ? afterFutureDescendant.manifest.candidates.find(candidate =>
            candidate.pathBytesBase64 === undefined
              ? false
              : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8') === 'context/private/future.txt',
          )?.decision
        : undefined,
    ).toMatchObject({ status: 'excluded', decidingRuleIdentity: privateExclusion.ruleIdentity });
  });

  it('replaces equal-target contradictions, retains distinct ranges, and recalls exact commands', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-replacement-review',
        expectedStateVersion: 0,
      }),
    );
    const versionsAtStart = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    const source = {
      kind: 'workspace' as const,
      form: 'file' as const,
      inclusion: 'ordinary' as const,
      pathBytesBase64: encodedPath('context/open.txt'),
    };
    const firstCommand = {
      kind: 'review.context-selection.change' as const,
      commandIdentity: 'first-open-range',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedSelectionRevision: 0,
      change: {
        action: 'include' as const,
        source,
        scope: { kind: 'bytes' as const, offset: 0, length: 2 },
      },
    };
    const first = requireSelectionChanged(await owner.workspace.execute(firstCommand));
    const recalled = requireSelectionChanged(await owner.workspace.execute(firstCommand));
    expect(recalled).toEqual(first);
    const conflict = await owner.workspace.execute({
      ...firstCommand,
      expectedStateVersion: first.stateVersion,
      expectedSelectionRevision: first.selectionRevision,
      change: {
        ...firstCommand.change,
        scope: { kind: 'bytes', offset: 1, length: 2 },
      },
    });
    expect(conflict).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'command-identity-conflict',
      stateVersion: first.stateVersion,
    });
    const versionsAfterFirstRule = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versionsAfterFirstRule.stateVersion).toBe(first.stateVersion);
    expect(versionsAfterFirstRule.status).toBe('available');
    expect(versionsAtStart.status).toBe('available');
    if (versionsAfterFirstRule.status !== 'available' || versionsAtStart.status !== 'available') {
      throw new Error('Review versions unavailable');
    }
    expect(versionsAfterFirstRule.versions.items).toEqual(versionsAtStart.versions.items);

    const second = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'second-open-range',
      first.stateVersion,
      first.selectionRevision,
      {
        action: 'include',
        source,
        scope: { kind: 'bytes', offset: 3, length: 2 },
      },
    );
    const duplicateReplacement = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'replace-first-open-range',
      second.stateVersion,
      second.selectionRevision,
      {
        action: 'include',
        source,
        scope: { kind: 'bytes', offset: 0, length: 2 },
        classification: 'binary',
      },
    );
    let view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.status).toBe('available');
    if (view.status !== 'available') throw new Error('Context selection unavailable');
    expect(view.rules.map(rule => rule.ruleIdentity)).toEqual([second.ruleIdentity, duplicateReplacement.ruleIdentity]);
    expect(view.rules[1]).toMatchObject({
      scope: { kind: 'bytes', offset: 0, length: 2 },
      classification: 'binary',
    });
    expect(view.manifest.candidates[0]).toMatchObject({
      origins: [0, 1],
      decision: {
        status: 'included',
        decidingRuleIdentity: duplicateReplacement.ruleIdentity,
        inclusionRuleIdentities: [second.ruleIdentity, duplicateReplacement.ruleIdentity],
      },
    });

    const excluded = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'exclude-open-file',
      duplicateReplacement.stateVersion,
      duplicateReplacement.selectionRevision,
      {
        action: 'exclude',
        target: { kind: 'workspace', form: 'file', pathBytesBase64: encodedPath('context/open.txt') },
      },
    );
    view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.status).toBe('available');
    if (view.status !== 'available') throw new Error('Context selection unavailable');
    expect(view.rules).toEqual([expect.objectContaining({ action: 'exclude', ruleIdentity: excluded.ruleIdentity })]);
    expect(view.sourceGroups).toEqual([]);
    expect(view.manifest.totalCandidates).toBe(0);

    const removed = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'remove-open-exclusion',
      excluded.stateVersion,
      excluded.selectionRevision,
      { action: 'remove', ruleIdentity: excluded.ruleIdentity },
    );
    expect(removed).toMatchObject({ action: 'removed', ruleIdentity: excluded.ruleIdentity, selectionRevision: 5 });
  });

  it('keeps exclusions stable across recreation, evaluates renames independently, and reconstructs after restart', async () => {
    const created = await fixture();
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-recreation-review',
        expectedStateVersion: 0,
      }),
    );
    const included = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'include-recreation-directory',
      started.stateVersion,
      0,
      {
        action: 'include',
        source: {
          kind: 'workspace',
          form: 'directory',
          inclusion: 'ordinary',
          pathBytesBase64: encodedPath('context'),
        },
      },
    );
    const excluded = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'exclude-recreated-file',
      included.stateVersion,
      included.selectionRevision,
      {
        action: 'exclude',
        target: {
          kind: 'workspace',
          form: 'file',
          pathBytesBase64: encodedPath('context/private/block.txt'),
        },
      },
    );

    await writeFile(path.join(created.checkout, 'context', 'private', 'block.txt'), 'recreated bytes\n');
    let view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.stateVersion).toBe(excluded.stateVersion);
    expect(
      view.status === 'available'
        ? view.manifest.candidates.find(candidate =>
            candidate.pathBytesBase64 === undefined
              ? false
              : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8') === 'context/private/block.txt',
          )?.decision.status
        : undefined,
    ).toBe('excluded');

    await rename(
      path.join(created.checkout, 'context', 'private', 'block.txt'),
      path.join(created.checkout, 'context', 'private', 'renamed.txt'),
    );
    view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.stateVersion).toBe(excluded.stateVersion);
    expect(
      view.status === 'available'
        ? view.manifest.candidates.find(candidate =>
            candidate.pathBytesBase64 === undefined
              ? false
              : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8') === 'context/private/renamed.txt',
          )?.decision.status
        : undefined,
    ).toBe('included');

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const reconstructed = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(reconstructed).toMatchObject({
      status: 'available',
      stateVersion: excluded.stateVersion,
      selectionRevision: excluded.selectionRevision,
      rules: [
        { ruleIdentity: included.ruleIdentity, action: 'include' },
        { ruleIdentity: excluded.ruleIdentity, action: 'exclude' },
      ],
    });
  });

  it('rejects stale selection revisions, missing removals, previous-Review edits, and excess rules without State movement', async () => {
    const created = await fixture();
    const owner = await open(created);
    const firstReview = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-rejection-review',
        expectedStateVersion: 0,
      }),
    );
    const firstRule = await changeSelection(
      owner.workspace,
      firstReview.reviewIdentity,
      'first-rejection-rule',
      firstReview.stateVersion,
      0,
      {
        action: 'exclude',
        target: { kind: 'workspace', form: 'file', pathBytesBase64: encodedPath('missing-0.txt') },
      },
    );

    const stale = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'stale-selection-revision',
      expectedStateVersion: firstRule.stateVersion,
      reviewIdentity: firstReview.reviewIdentity,
      expectedSelectionRevision: 0,
      change: {
        action: 'exclude',
        target: { kind: 'workspace', form: 'file', pathBytesBase64: encodedPath('stale.txt') },
      },
    });
    expect(stale).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-selection-revision-mismatch',
      stateVersion: firstRule.stateVersion,
    });
    const missing = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'missing-rule-removal',
      expectedStateVersion: firstRule.stateVersion,
      reviewIdentity: firstReview.reviewIdentity,
      expectedSelectionRevision: firstRule.selectionRevision,
      change: {
        action: 'remove',
        ruleIdentity: `rcr_${'0'.repeat(64)}` as ReviewContextRuleIdentity,
      },
    });
    expect(missing).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-rule-not-found',
      stateVersion: firstRule.stateVersion,
    });

    let stateVersion = firstRule.stateVersion;
    let selectionRevision = firstRule.selectionRevision;
    for (let index = 1; index < 64; index += 1) {
      const accepted = await changeSelection(
        owner.workspace,
        firstReview.reviewIdentity,
        `bounded-rule-${index}`,
        stateVersion,
        selectionRevision,
        {
          action: 'exclude',
          target: {
            kind: 'workspace',
            form: 'file',
            pathBytesBase64: encodedPath(`missing-${index}.txt`),
          },
        },
      );
      stateVersion = accepted.stateVersion;
      selectionRevision = accepted.selectionRevision;
    }
    const overLimit = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'bounded-rule-overflow',
      expectedStateVersion: stateVersion,
      reviewIdentity: firstReview.reviewIdentity,
      expectedSelectionRevision: selectionRevision,
      change: {
        action: 'exclude',
        target: { kind: 'workspace', form: 'file', pathBytesBase64: encodedPath('missing-overflow.txt') },
      },
    });
    expect(overLimit).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-rule-limit-reached',
      stateVersion,
    });

    const secondReview = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-second-rejection-review',
        expectedStateVersion: stateVersion,
      }),
    );
    const previousEdit = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'edit-previous-review-context',
      expectedStateVersion: secondReview.stateVersion,
      reviewIdentity: firstReview.reviewIdentity,
      expectedSelectionRevision: selectionRevision,
      change: { action: 'remove', ruleIdentity: firstRule.ruleIdentity },
    });
    expect(previousEdit).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'review-not-current',
      stateVersion: secondReview.stateVersion,
    });
    const previousView = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: firstReview.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(previousView).toMatchObject({
      status: 'available',
      selectionRevision,
      rules: { length: 64 },
    });
  });

  it('keeps incomplete live expansion explicit without mutating curation intent', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-incomplete-selection-review',
        expectedStateVersion: 0,
      }),
    );
    const selected = await changeSelection(
      owner.workspace,
      started.reviewIdentity,
      'include-missing-outside-directory',
      started.stateVersion,
      0,
      {
        action: 'include',
        source: {
          kind: 'outside-checkout',
          form: 'directory',
          absolutePath: path.join(created.root, 'missing-outside'),
        },
      },
    );
    const view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view).toMatchObject({
      status: 'available',
      stateVersion: selected.stateVersion,
      selectionRevision: selected.selectionRevision,
      manifest: {
        status: 'incomplete',
        incompleteReason: 'traversal-failed',
        totalCandidates: 0,
        candidates: [],
      },
    });
  });
});
