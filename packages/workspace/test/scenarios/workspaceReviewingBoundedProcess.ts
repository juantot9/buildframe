import { openWorkspaceRuntimeOwner } from '../../src/runtime.js';

const checkout = process.argv[2];
if (checkout === undefined) throw new Error('Expected a checkout path');

const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
if (opened.status !== 'ready') throw new Error(JSON.stringify(opened));
const owner = opened.owner;

try {
  const started = await owner.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'bounded-oversized-diff-start',
    expectedStateVersion: 0,
  });
  if (started.kind !== 'review.current-changes.started') {
    throw new Error(JSON.stringify(started));
  }

  const manifest = await owner.workspace.read({
    kind: 'review.manifest',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
    throw new Error(JSON.stringify(manifest));
  }

  const diff = await owner.workspace.read({
    kind: 'review.diff',
    reviewIdentity: started.reviewIdentity,
    fileIdentity: manifest.manifest.files[0].fileIdentity,
    offset: 0,
    limit: 64,
  });

  process.stdout.write(
    JSON.stringify({
      started: {
        kind: started.kind,
        status: started.status,
        stateVersion: started.stateVersion,
      },
      diff: {
        kind: diff.kind,
        status: diff.status,
        stateVersion: diff.stateVersion,
        ...('reason' in diff ? { reason: diff.reason } : {}),
      },
    }),
  );
} finally {
  await owner.dispose();
}
