import type { CurrentChangedFile, CurrentRepositoryFile } from '../workspaceEvidence/index.js';
import type { ReviewLiveFileItem } from './liveFileContracts.js';
import { ProjectionRecordsInvalid } from './internalTypes.js';
import { projectedFile } from './views.js';

/**
 * Every repository file with the live changes laid over it, in the order the
 * Files pane lists them: changed files first, then the rest, each by path bytes.
 */
export function layLiveChanges(
  repositoryFiles: readonly CurrentRepositoryFile[],
  changedFiles: readonly CurrentChangedFile[],
): ReviewLiveFileItem[] {
  const byPath = new Map<string, ReviewLiveFileItem>();
  for (const file of repositoryFiles) {
    byPath.set(file.path.bytesBase64, {
      fileIdentity: file.fileIdentity,
      path: file.path,
      status: 'unchanged',
    });
  }
  for (const captured of changedFiles) {
    const selected = captured.newSide ?? captured.oldSide;
    if (selected === undefined) throw new ProjectionRecordsInvalid();
    const changedFile = projectedFile(captured);
    byPath.set(selected.path.bytesBase64, {
      fileIdentity: captured.fileIdentity,
      path: selected.path,
      status: captured.status,
      changedFile,
    });
  }
  return [...byPath.values()].sort((left, right) => {
    const changedOrder = Number(right.status !== 'unchanged') - Number(left.status !== 'unchanged');
    if (changedOrder !== 0) return changedOrder;
    return Buffer.compare(Buffer.from(left.path.bytesBase64, 'base64'), Buffer.from(right.path.bytesBase64, 'base64'));
  });
}

const laid = new WeakMap<
  readonly CurrentRepositoryFile[],
  { readonly changedFiles: readonly CurrentChangedFile[]; readonly files: readonly ReviewLiveFileItem[] }
>();

/**
 * `layLiveChanges`, kept for as long as both lists stay the same, so every read
 * of one working-tree state shares one list (and its folder index).
 */
export function layLiveChangesOnce(
  repositoryFiles: readonly CurrentRepositoryFile[],
  changedFiles: readonly CurrentChangedFile[],
): readonly ReviewLiveFileItem[] {
  const cached = laid.get(repositoryFiles);
  if (cached?.changedFiles === changedFiles) return cached.files;
  const files = layLiveChanges(repositoryFiles, changedFiles);
  laid.set(repositoryFiles, { changedFiles, files });
  return files;
}
