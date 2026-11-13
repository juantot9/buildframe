import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect } from 'vitest';
import { openAuthoritativeState } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import type { Workspace } from '../../src/index.js';
import type { CurrentChangesReviewStarted, ReviewComparisonStarted } from '@buildframe/workspace/reviewing';
import {
  decodeReviewingPayload,
  parseReviewIndex,
  parseReviewSnapshot,
  reviewingRecordIdentity,
  type ReviewPassIdentity,
  type ReviewSnapshotIdentity,
} from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

export const execFileAsync = promisify(execFile);

export interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

export async function git(directory: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
  return result.stdout.trim();
}

export async function fixture(withChange = true): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-reviewing-direct-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, 'review.txt'), 'before\n');
  await git(checkout, 'add', 'review.txt');
  await git(checkout, 'commit', '-qm', 'basis');
  if (withChange) await writeFile(path.join(checkout, 'review.txt'), 'after\n');
  return { root, checkout, state };
}

export function requireStarted(result: Awaited<ReturnType<Workspace['execute']>>): CurrentChangesReviewStarted {
  expect(result.kind).toBe('review.current-changes.started');
  if (result.kind !== 'review.current-changes.started') {
    throw new Error(`Review did not start: ${result.kind}`);
  }
  return result;
}

export async function installHistoricalActiveReview(
  created: Fixture,
  workspaceIdentity: WorkspaceRuntimeOwner['workspaceIdentity'],
  started: CurrentChangesReviewStarted | ReviewComparisonStarted,
  withPass = false,
): Promise<{
  readonly stateVersion: number;
  readonly reviewPassIdentity: ReviewPassIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
}> {
  const state = await openAuthoritativeState({
    workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
  });
  try {
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const read = await state.read({
      recordIdentities: [indexIdentity, started.reviewSnapshotIdentity],
      includeContent: false,
    });
    const [indexRecord, snapshotRecord] = read.records;
    if (
      indexRecord === undefined ||
      indexRecord.recordClass !== 'revisioned' ||
      indexRecord.kind !== 'review.index' ||
      snapshotRecord === undefined ||
      snapshotRecord.recordClass !== 'immutable' ||
      snapshotRecord.kind !== 'review.snapshot'
    ) {
      throw new Error('Review fixture records are unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    const reviewPassIdentity = reviewingRecordIdentity(
      'rps',
      started.reviewIdentity,
      'historical-pass-fixture',
    ) as ReviewPassIdentity;
    const reviewSnapshotIdentity = withPass
      ? (reviewingRecordIdentity(
          'rsn',
          started.reviewIdentity,
          'historical-pass-snapshot-fixture',
        ) as ReviewSnapshotIdentity)
      : started.reviewSnapshotIdentity;
    const nextIndex = {
      ...index,
      reviews: index.reviews.map(entry =>
        entry.reviewIdentity === started.reviewIdentity
          ? {
              ...entry,
              status: 'active' as const,
              reviewSnapshotIdentities: [reviewSnapshotIdentity],
              reviewSnapshotIdentity,
              ...(withPass ? { reviewPassIdentity } : {}),
            }
          : entry,
      ),
    };
    const committed = await state.commit({
      commandIdentity: `install-${reviewPassIdentity}-${withPass ? 'pass' : 'active'}`,
      expectedStateVersion: read.stateVersion,
      records: [
        ...(withPass
          ? [
              {
                recordClass: 'immutable' as const,
                recordIdentity: reviewSnapshotIdentity,
                workflowIdentity: started.reviewIdentity,
                kind: 'review.snapshot',
                schemaVersion: 1,
                payload: new TextEncoder().encode(
                  JSON.stringify({
                    ...snapshot,
                    reviewPassIdentity,
                    reviewSnapshotIdentity,
                  }),
                ),
                content: [],
              },
            ]
          : []),
        {
          recordClass: 'revisioned',
          recordIdentity: indexIdentity,
          workflowIdentity: indexIdentity,
          kind: 'review.index',
          schemaVersion: 1,
          expectedRevision: indexRecord.revision,
          payload: new TextEncoder().encode(JSON.stringify(nextIndex)),
          content: [],
        },
      ],
      result: {
        kind: 'test.historical-review-installed',
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      },
    });
    if (!('result' in committed)) {
      throw new Error(`Historical Review fixture commit failed: ${committed.reason}`);
    }
    return {
      stateVersion: committed.stateVersion,
      reviewPassIdentity,
      reviewSnapshotIdentity,
    };
  } finally {
    await state.close();
  }
}

export const roots = new Set<string>();

export const owners = new Set<WorkspaceRuntimeOwner>();

export const originalStateHome = process.env.XDG_STATE_HOME;

export async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
  roots.add(created.root);
  process.env.XDG_STATE_HOME = created.state;
  const opened = await openWorkspaceRuntimeOwner({ startPath: created.checkout });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owners.add(opened.owner);
  return opened.owner;
}

export function installWorkspaceReviewingHygiene(): void {
  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });
}
