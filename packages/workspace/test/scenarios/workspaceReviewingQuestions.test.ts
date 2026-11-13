import { describe, expect, it } from 'vitest';
import {
  fixture,
  open,
  requireStarted,
  owners,
  installHistoricalActiveReview,
  installWorkspaceReviewingHygiene,
} from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

describe('direct retained Reviewing questions and completion', () => {
  it('revises one open Question Draft exactly and rejects stale or closed revisions', async () => {
    const created = await fixture();
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'draft-revision-start',
        expectedStateVersion: 0,
      }),
    );
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    const file = manifest.manifest.files[0];
    if (file === undefined) throw new Error('Changed file unavailable');
    const diff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: started.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (diff.status !== 'available') throw new Error('Diff unavailable');
    const oldRow = diff.window.rows.find(candidate => candidate.oldLine !== undefined);
    const newRow = diff.window.rows.find(candidate => candidate.newLine !== undefined);
    if (oldRow?.oldLine === undefined || newRow?.newLine === undefined) {
      throw new Error('Both Diff sides are required');
    }

    // Draft commands are a retained capability from the superseded pass
    // lifecycle, not a producer in today's natural-follow-up Application. Make
    // that historical active state explicit rather than changing product flow.
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historical = await installHistoricalActiveReview(created, workspaceIdentity, started);
    owner = await open(created);

    const createdDraft = await owner.workspace.execute({
      kind: 'review.question-draft.create',
      commandIdentity: 'draft-revision-create',
      expectedStateVersion: historical.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: file.fileIdentity,
        side: 'old',
        line: oldRow.oldLine,
      },
      body: 'Original exact Question?',
    });
    if (createdDraft.kind !== 'review.question-draft.created') {
      throw new Error(
        `Draft was not created: ${createdDraft.kind} ${'reason' in createdDraft ? createdDraft.reason : ''}`,
      );
    }
    const revisionCommand = {
      kind: 'review.question-draft.revise' as const,
      commandIdentity: 'draft-revision-update',
      expectedStateVersion: createdDraft.stateVersion,
      reviewIdentity: started.reviewIdentity,
      draftIdentity: createdDraft.draftIdentity,
      expectedDraftRevision: createdDraft.draftRevision,
      anchor: {
        kind: 'review.diff-line' as const,
        fileIdentity: file.fileIdentity,
        side: 'new' as const,
        line: newRow.newLine,
      },
      body: 'Revised exact Question with preserved whitespace?  ',
    };
    const revised = await owner.workspace.execute(revisionCommand);
    expect(revised).toMatchObject({
      kind: 'review.question-draft.revised',
      status: 'accepted',
      stateVersion: createdDraft.stateVersion + 1,
      reviewIdentity: started.reviewIdentity,
      draftIdentity: createdDraft.draftIdentity,
      draftRevision: createdDraft.draftRevision + 1,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: file.fileIdentity,
        side: 'new',
        line: newRow.newLine,
      },
    });

    const projected = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(projected).toMatchObject({
      status: 'available',
      stateVersion: createdDraft.stateVersion + 1,
      list: {
        items: [
          {
            kind: 'question-draft',
            itemIdentity: createdDraft.draftIdentity,
            revision: createdDraft.draftRevision + 1,
            target: { side: 'new', line: newRow.newLine },
          },
        ],
      },
    });
    const body = await owner.workspace.read({
      kind: 'review.question-body',
      reviewIdentity: started.reviewIdentity,
      itemIdentity: createdDraft.draftIdentity,
      offset: 0,
      length: 16 * 1024,
    });
    if (body.status !== 'available' || body.window === undefined) {
      throw new Error('Revised body unavailable');
    }
    expect(Buffer.from(body.window.bytesBase64, 'base64').toString('utf8')).toBe(revisionCommand.body);

    // A replay after owner restart is recalled before current-version or
    // current-revision checks and therefore cannot append another revision.
    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    expect(await owner.workspace.execute(revisionCommand)).toEqual(revised);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(createdDraft.stateVersion + 1);

    const staleRevision = await owner.workspace.execute({
      ...revisionCommand,
      commandIdentity: 'draft-revision-stale',
      expectedStateVersion: createdDraft.stateVersion + 1,
    });
    expect(staleRevision).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'draft-revision-mismatch',
      stateVersion: createdDraft.stateVersion + 1,
    });
    const committed = await owner.workspace.execute({
      kind: 'review.question-batch.commit',
      commandIdentity: 'draft-revision-close',
      expectedStateVersion: createdDraft.stateVersion + 1,
      reviewIdentity: started.reviewIdentity,
      draftIdentities: [createdDraft.draftIdentity],
    });
    if (committed.kind !== 'review.question-batch.committed') {
      throw new Error(`Draft was not committed: ${committed.kind}`);
    }
    expect(
      await owner.workspace.execute({
        ...revisionCommand,
        commandIdentity: 'draft-revision-closed',
        expectedStateVersion: committed.stateVersion,
        expectedDraftRevision: createdDraft.draftRevision + 1,
      }),
    ).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'draft-not-open',
      stateVersion: committed.stateVersion,
    });
  });

  it('completes a historical Review and advances the exact State version', async () => {
    const created = await fixture();
    let owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'historical-completion-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historical = await installHistoricalActiveReview(created, workspaceIdentity, started, true);
    owner = await open(created);

    const completed = await owner.workspace.execute({
      kind: 'review.complete',
      commandIdentity: 'historical-completion',
      expectedStateVersion: historical.stateVersion,
      reviewIdentity: started.reviewIdentity,
    });
    expect(completed).toMatchObject({
      kind: 'review.completed',
      status: 'accepted',
      stateVersion: historical.stateVersion + 1,
      reviewIdentity: started.reviewIdentity,
      reviewPassIdentity: historical.reviewPassIdentity,
      reviewSnapshotIdentity: historical.reviewSnapshotIdentity,
      mode: 'no-findings',
    });
    const after = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(after.stateVersion).toBe(historical.stateVersion + 1);
    expect(after.header.currentReviewIdentity).toBeUndefined();
    expect(after.reviews.items[0]).toMatchObject({
      reviewIdentity: started.reviewIdentity,
      historicalOutcome: 'completed',
    });
  });

  it('cancels a historical Review and advances the exact State version', async () => {
    const created = await fixture();
    let owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'historical-cancellation-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historical = await installHistoricalActiveReview(created, workspaceIdentity, started);
    owner = await open(created);

    const cancelled = await owner.workspace.execute({
      kind: 'review.cancel',
      commandIdentity: 'historical-cancellation',
      expectedStateVersion: historical.stateVersion,
      reviewIdentity: started.reviewIdentity,
    });
    expect(cancelled).toMatchObject({
      kind: 'review.cancelled',
      status: 'accepted',
      stateVersion: historical.stateVersion + 1,
      reviewIdentity: started.reviewIdentity,
      cancellationIdentity: expect.stringMatching(/^rcl_[0-9a-f]{64}$/u),
    });
    const after = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(after.stateVersion).toBe(historical.stateVersion + 1);
    expect(after.header.currentReviewIdentity).toBeUndefined();
    expect(after.reviews.items[0]).toMatchObject({
      reviewIdentity: started.reviewIdentity,
      historicalOutcome: 'cancelled',
    });
  });

  it('records and projects a human disposition for a historical Review Question', async () => {
    const created = await fixture();
    let owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'historical-disposition-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historical = await installHistoricalActiveReview(created, workspaceIdentity, started);
    owner = await open(created);

    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    const file = manifest.manifest.files[0];
    if (file === undefined) throw new Error('File missing');
    const diff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: started.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (diff.status !== 'available') throw new Error('Diff unavailable');
    const row = diff.window.rows.find(candidate => candidate.newLine !== undefined);
    if (row?.newLine === undefined) throw new Error('New-side row missing');

    const draft = await owner.workspace.execute({
      kind: 'review.question-draft.create',
      commandIdentity: 'historical-disposition-draft',
      expectedStateVersion: historical.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: file.fileIdentity,
        side: 'new',
        line: row.newLine,
      },
      body: 'Does this historical behavior remain correct?',
    });
    if (draft.kind !== 'review.question-draft.created') {
      throw new Error(`Draft was not created: ${draft.kind}`);
    }
    const batch = await owner.workspace.execute({
      kind: 'review.question-batch.commit',
      commandIdentity: 'historical-disposition-batch',
      expectedStateVersion: draft.stateVersion,
      reviewIdentity: started.reviewIdentity,
      draftIdentities: [draft.draftIdentity],
    });
    if (batch.kind !== 'review.question-batch.committed') {
      throw new Error(`Batch was not committed: ${batch.kind}`);
    }
    const questionIdentity = batch.questionIdentities[0];
    if (questionIdentity === undefined) throw new Error('Question missing');
    const disposition = await owner.workspace.execute({
      kind: 'review.question.disposition.set',
      commandIdentity: 'historical-disposition-answered',
      expectedStateVersion: batch.stateVersion,
      reviewIdentity: started.reviewIdentity,
      questionIdentity,
      disposition: 'answered',
    });
    expect(disposition).toMatchObject({
      kind: 'review.question.disposition-recorded',
      status: 'accepted',
      stateVersion: batch.stateVersion + 1,
      reviewIdentity: started.reviewIdentity,
      questionIdentity,
      disposition: 'answered',
    });
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions.stateVersion).toBe(batch.stateVersion + 1);
    expect(questions.status).toBe('available');
    if (questions.status !== 'available') throw new Error('Questions unavailable');
    expect(questions.list.items[0]).toMatchObject({
      kind: 'question',
      itemIdentity: questionIdentity,
      historicalDisposition: 'answered',
    });
  });
});
