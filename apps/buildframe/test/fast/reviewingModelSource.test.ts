import { describe, expect, it } from 'vitest';

import type {
  ReviewDiffAvailableView,
  ReviewLiveDiffView,
  ReviewLiveFileContentView,
  ReviewStepChangesDiffView,
} from '@buildframe/workspace/projection';
import type { ReviewBasisIdentity, ReviewIdentity, ReviewSnapshotIdentity } from '@buildframe/workspace/reviewing';
import {
  ReviewingApplicationModel,
  historyStepKey,
  type ReviewLoadTarget,
  type ReviewSource,
  type ReviewViewBundle,
} from '../../src/reviewingModel.js';

const REVIEW = `rev_${'1'.repeat(64)}` as ReviewIdentity;
const OTHER_REVIEW = `rev_${'2'.repeat(64)}` as ReviewIdentity;
const SNAPSHOT = `rsn_${'3'.repeat(64)}` as ReviewSnapshotIdentity;
const OTHER_SNAPSHOT = `rsn_${'4'.repeat(64)}` as ReviewSnapshotIdentity;
const BASIS = `rbs_${'5'.repeat(64)}` as ReviewBasisIdentity;
const FILE = `fil_${'6'.repeat(64)}`;
const OTHER_FILE = `fil_${'7'.repeat(64)}`;
const PATH = Buffer.from('review.txt').toString('base64');
const live = (identity: string): ReviewSource => ({
  kind: 'live',
  liveChangesIdentity: identity,
  matchesLatestSnapshot: false,
});
const snapshot = (identity = SNAPSHOT): ReviewSource => ({
  kind: 'snapshot',
  reviewSnapshotIdentity: identity,
  isLatest: false,
});
type AvailableDiff = ReviewDiffAvailableView | Extract<ReviewLiveDiffView, { status: 'available' }>;

function bundle(source: ReviewSource, reviewIdentity = REVIEW, stateVersion = 1): ReviewViewBundle {
  const header: ReviewViewBundle['manifest']['header'] = {
    title: 'Review current changes',
    reviewIdentity,
    reviewSnapshotIdentity: source.kind === 'snapshot' ? source.reviewSnapshotIdentity : SNAPSHOT,
    latestReviewSnapshotIdentity: SNAPSHOT,
    retention: 'current',
    snapshotStatus: 'current',
    contextStatus: 'current',
  };
  const file: ReviewDiffAvailableView['file'] = {
    fileIdentity: FILE,
    status: 'modified',
    displayPath: 'review.txt',
    newSide: { path: 'review.txt', pathBytesBase64: PATH, kind: 'regular', byteLength: 8, content: 'available' },
  };
  const common = { projectionVersion: 1 as const, stateVersion };
  return {
    stateVersion,
    source,
    manifest: {
      ...common,
      kind: 'review.manifest',
      status: 'available',
      header,
      manifest: { totalFiles: 1, identity: 'manifest', offset: 0, files: [file], nextOffset: null },
      questions: { openDrafts: 0, total: 0, needingJudgment: 0, open: 0 },
      actions: [],
    },
    versions: {
      ...common,
      kind: 'review.versions',
      status: 'available',
      reviewIdentity,
      latestReviewSnapshotIdentity: SNAPSHOT,
      versions: { total: 0, offset: 0, items: [], nextOffset: null },
    },
    bases: {
      ...common,
      kind: 'review.bases',
      status: 'available',
      reviewIdentity,
      liveReviewBasisIdentity: BASIS,
      gitDiscovery: { status: 'available', truncated: false },
      bases: { total: 0, offset: 0, items: [], nextOffset: null },
    },
    messages: {
      ...common,
      kind: 'review.messages',
      status: 'available',
      reviewIdentity,
      messages: { total: 0, offset: 0, items: [], nextOffset: null },
    },
    questions: {
      ...common,
      kind: 'review.questions',
      status: 'available',
      header,
      list: { totalItems: 0, offset: 0, items: [], nextOffset: null },
      actions: [],
    },
    harnessInteraction: {
      kind: 'harness.review-interaction',
      stateVersion,
      reviewIdentity,
      totalInteractions: 0,
      offset: 0,
      nextOffset: null,
      handoffs: [],
      invocations: [],
      userPull: {
        action: '/neoflow:review',
        availability: { state: 'unavailable', reason: 'attachment-not-observed' },
        preparations: [],
      },
    },
  };
}

function diff(review: ReviewViewBundle, count = 64, offset = 0): AvailableDiff {
  const identity =
    review.source.kind === 'live' ? review.source.liveChangesIdentity : review.source.reviewSnapshotIdentity;
  const text = Buffer.from(identity);
  const common = {
    status: 'available' as const,
    projectionVersion: 1 as const,
    stateVersion: review.stateVersion,
    file: review.manifest.manifest.files[0]!,
    window: {
      totalRows: 256,
      offset,
      rows: Array.from({ length: count }, (_, index) => ({
        rowIdentity: `${identity}:${offset + index}`,
        kind: 'addition' as const,
        newLine: offset + index + 1,
        text: {
          encoding: 'utf8' as const,
          bytesBase64: text.toString('base64'),
          byteLength: text.length,
          totalByteLength: text.length,
          truncated: false,
        },
      })),
      nextOffset: offset + count < 256 ? offset + count : null,
    },
    actions: [],
  };
  return review.source.kind === 'live'
    ? {
        ...common,
        kind: 'review.live-diff',
        reviewIdentity: review.manifest.header.reviewIdentity,
        latestReviewSnapshotIdentity: SNAPSHOT,
        liveChangesIdentity: review.source.liveChangesIdentity,
        matchesLatestSnapshot: false,
      }
    : { ...common, kind: 'review.diff', header: review.manifest.header };
}

function target(review: ReviewViewBundle): ReviewLoadTarget {
  return {
    reviewIdentity: review.manifest.header.reviewIdentity,
    ...(review.source.kind === 'snapshot' ? { reviewSnapshotIdentity: review.source.reviewSnapshotIdentity } : {}),
    fileIdentity: FILE,
    manifestOffset: 0,
    diffOffset: 0,
    questionOffset: 0,
  };
}

function show(model: ReviewingApplicationModel, review: ReviewViewBundle, page = diff(review)): void {
  model.applyReview({ ...review, diff: page }, target(review));
}

function unchanged(review: ReviewViewBundle): ReviewViewBundle {
  if (review.source.kind !== 'live') throw new Error('Unchanged content needs Live Changes');
  return {
    ...review,
    manifest: {
      ...review.manifest,
      manifest: { ...review.manifest.manifest, totalFiles: 0, files: [] },
    },
    liveFiles: {
      kind: 'review.live-files',
      status: 'available',
      projectionVersion: 1,
      stateVersion: review.stateVersion,
      reviewIdentity: review.manifest.header.reviewIdentity,
      liveChangesIdentity: review.source.liveChangesIdentity,
      files: {
        total: 1,
        offset: 0,
        nextOffset: null,
        items: [{ fileIdentity: OTHER_FILE, path: { display: 'review.txt', bytesBase64: PATH }, status: 'unchanged' }],
      },
    },
  };
}

function content(review: ReviewViewBundle): Extract<ReviewLiveFileContentView, { status: 'available' }> {
  if (review.source.kind !== 'live') throw new Error('Content needs Live Changes');
  const identity = review.source.liveChangesIdentity;
  const bytes = Buffer.from(Array.from({ length: 8 }, (_, index) => `content:${identity}:${index}`).join('\n'));
  return {
    kind: 'review.live-file-content',
    status: 'available',
    projectionVersion: 1,
    stateVersion: review.stateVersion,
    reviewIdentity: review.manifest.header.reviewIdentity,
    liveChangesIdentity: review.source.liveChangesIdentity,
    path: { display: 'review.txt', bytesBase64: PATH },
    content: { encoding: 'utf8', bytesBase64: bytes.toString('base64'), byteLength: bytes.length, truncated: false },
  };
}

function allFilesModel(review: ReviewViewBundle): ReviewingApplicationModel {
  const model = new ReviewingApplicationModel();
  model.state.fileScope = 'all';
  model.applyReview(review, { ...target(review), fileIdentity: OTHER_FILE });
  return model;
}

describe('Reviewing source-isolated windows', () => {
  it.each([
    ['Live Changes', live('before'), live('after'), REVIEW],
    ['Snapshots', snapshot(), snapshot(OTHER_SNAPSHOT), REVIEW],
    ['Reviews', live('same-live-identity'), live('same-live-identity'), OTHER_REVIEW],
  ] as const)('does not widen a fresh %s Diff with rows from another source', (_name, before, after, afterReview) => {
    const model = new ReviewingApplicationModel();
    const old = bundle(before);
    show(model, old);
    expect(model.extendDiff(diff(old, 64, 64))).toBe(true);
    const fresh = bundle(after, afterReview);
    const page = diff(fresh);
    show(model, fresh, page);
    expect(model.state.review?.diff).toEqual(page);
  });

  it('keeps wider windows and merges adjacent pages of the same exact source', () => {
    const model = new ReviewingApplicationModel();
    const review = bundle(live('same'));
    show(model, review);
    expect(model.extendDiff(diff(review, 64, 64))).toBe(true);
    show(model, review);
    expect(model.state.review?.diff?.status === 'available' && model.state.review.diff.window.rows).toHaveLength(128);
  });

  it.each([
    ['Live Changes', live('old-live'), live('new-live'), REVIEW],
    ['Snapshots', snapshot(), snapshot(OTHER_SNAPSHOT), REVIEW],
    ['live to Snapshot', live('old-live'), snapshot(), REVIEW],
    ['Snapshot to live', snapshot(), live('new-live'), REVIEW],
    ['Reviews', live('same-live'), live('same-live'), OTHER_REVIEW],
  ] as const)('refuses late pages from another source: %s', (_name, before, after, afterReview) => {
    const model = new ReviewingApplicationModel();
    const old = bundle(before);
    const current = bundle(after, afterReview);
    show(model, current);
    const shown = model.state.review?.diff;
    expect(model.extendDiff(diff(old, 64, 64))).toBe(false);
    expect(model.state.review?.diff).toBe(shown);
    model.applyReviewDiff(diff(old), target(old));
    expect(model.state.review?.diff).toBe(shown);
  });

  it.each([
    ['live', live('current'), live('old')],
    ['Snapshot', snapshot(), snapshot(OTHER_SNAPSHOT)],
  ] as const)('ignores late prefetches without evicting wider current %s rows', (_name, source, old) => {
    const model = new ReviewingApplicationModel();
    const current = bundle(source);
    show(model, current);
    expect(model.extendDiff(diff(current, 64, 64))).toBe(true);
    model.warmDiff(diff(bundle(old), 192));
    model.warmDiff(diff(bundle(source, OTHER_REVIEW), 192));
    model.warmDiff(diff(bundle(source, REVIEW, 0), 192));
    show(model, current);
    expect(model.state.review?.diff?.status === 'available' && model.state.review.diff.window.rows).toHaveLength(128);
  });

  it('only uses a prefetched file from the exact source when Files selection changes', () => {
    const twoFiles = (source: ReviewSource): ReviewViewBundle => {
      const review = bundle(source);
      const first = review.manifest.manifest.files[0]!;
      return {
        ...review,
        manifest: {
          ...review.manifest,
          manifest: {
            ...review.manifest.manifest,
            totalFiles: 2,
            files: [
              first,
              {
                ...first,
                fileIdentity: OTHER_FILE,
                displayPath: 'second.txt',
                newSide: {
                  ...first.newSide!,
                  path: 'second.txt',
                  pathBytesBase64: Buffer.from('second.txt').toString('base64'),
                },
              },
            ],
          },
        },
      };
    };
    const old = twoFiles(live('old'));
    const model = new ReviewingApplicationModel();
    show(model, old);
    const other = { ...diff(old), file: old.manifest.manifest.files[1]! };
    model.warmDiff(other);
    const current = twoFiles(live('current'));
    show(model, current);
    model.state.focus = 'files';
    const move = (name: 'up' | 'down') =>
      model.handleInput({ name, ctrl: false, alt: false, shift: false, super: false });
    expect(move('down')).toContainEqual(expect.objectContaining({ type: 'preview-file' }));
    const freshOther = { ...diff(current), file: current.manifest.manifest.files[1]! };
    model.warmDiff(freshOther);
    move('up');
    expect(move('down')).toEqual([]);
    expect(model.state.review?.diff).toEqual(freshOther);
  });

  it('does not join a past-step prefetch after the shown step changes or closes', () => {
    const review = bundle(snapshot());
    const model = new ReviewingApplicationModel();
    show(model, review);
    const shown = diff(review);
    if (shown.kind !== 'review.diff') throw new Error('Expected Snapshot Diff');
    const from = { kind: 'start' } as const;
    const to = { kind: 'now' } as const;
    const key = historyStepKey(from, to);
    model.state.shownStep = {
      from,
      to,
      key,
      label: 'past step',
      description: 'Recorded changes',
      files: [],
      diff: shown,
      diffNote: undefined,
      restore: {
        focus: 'diff',
        selectedFileIdentity: FILE,
        selectedDirectory: undefined,
        selectedRowIdentity: undefined,
      },
    };
    const page = diff(review, 64, 64);
    const read: Extract<ReviewStepChangesDiffView, { status: 'available' }> = {
      kind: 'review.step-changes-diff',
      status: 'available',
      projectionVersion: 1,
      stateVersion: review.stateVersion,
      reviewIdentity: REVIEW,
      from,
      to,
      file: { fileIdentity: FILE, path: { display: 'review.txt', bytesBase64: PATH }, change: 'modified' },
      window: page.window,
    };
    expect(model.stepChangeDiffPage({ ...read, from: { kind: 'now' } })).toBeUndefined();
    expect(model.extendDiff(page, 'different-step')).toBe(false);
    const sameStep = model.stepChangeDiffPage(read);
    expect(sameStep).toBeDefined();
    if (sameStep === undefined) throw new Error('Same-step page missing');
    expect(model.extendDiff(sameStep, key)).toBe(true);
    model.state.shownStep = undefined;
    expect(model.stepChangeDiffPage(read)).toBeUndefined();
    expect(model.extendDiff(page, key)).toBe(false);
  });

  it('reloads retained unchanged content when Live Changes move without a State commit', () => {
    const old = unchanged(bundle(live('old')));
    const model = allFilesModel(old);
    model.applyUnchangedFileContent(PATH, content(old));
    expect(model.state.unchangedContent?.view).toEqual(content(old));
    const fresh = unchanged(bundle(live('fresh')));
    const effects = model.applyReview(fresh, { ...target(fresh), fileIdentity: OTHER_FILE });
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'preview-file-content', liveChangesIdentity: 'fresh' }),
    );
    expect(model.state.unchangedContent).toBeUndefined();
    model.applyUnchangedFileContent(PATH, content(fresh));
    expect(model.state.unchangedContent?.view).toEqual(content(fresh));
  });

  it('keeps the selected unchanged-file line across repeated refreshes while new content is loading', () => {
    const old = unchanged(bundle(live('old')));
    const model = allFilesModel(old);
    model.applyUnchangedFileContent(PATH, content(old));
    model.unchangedContentLineTo(5);
    const fresh = unchanged(bundle(live('fresh')));
    for (let refresh = 0; refresh < 2; refresh += 1) {
      const effects = model.applyReview(fresh, { ...target(fresh), fileIdentity: OTHER_FILE });
      expect(model.state.unchangedContent).toBeUndefined();
      expect(effects).toContainEqual(
        expect.objectContaining({
          type: 'preview-file-content',
          liveChangesIdentity: 'fresh',
          anchorLine: 5,
        }),
      );
    }
    model.applyUnchangedFileContent(PATH, content(fresh));
    expect(model.state.unchangedContentLine).toBe(5);
  });

  it('does not reuse old unchanged content or accept late content warmups for another source or Review', () => {
    const old = unchanged(bundle(live('old')));
    const model = allFilesModel(old);
    model.applyUnchangedFileContent(PATH, content(old));
    model.state.unchangedContent = undefined;
    const current = unchanged(bundle(live('current')));
    model.applyReview(current, { ...target(current), fileIdentity: OTHER_FILE });
    model.warmContent(content(old));
    model.warmContent(content(unchanged(bundle(live('current'), OTHER_REVIEW))));
    const effects = model.applyReview(current, { ...target(current), fileIdentity: OTHER_FILE });
    expect(effects).toContainEqual(
      expect.objectContaining({ type: 'preview-file-content', liveChangesIdentity: 'current' }),
    );
    expect(model.state.unchangedContent).toBeUndefined();
    model.warmContent(content(current));
    const cachedEffects = model.applyReview(current, { ...target(current), fileIdentity: OTHER_FILE });
    expect(cachedEffects.some(effect => effect.type === 'preview-file-content')).toBe(false);
    expect(model.state.unchangedContent).toMatchObject({ view: content(current) });
  });
});
