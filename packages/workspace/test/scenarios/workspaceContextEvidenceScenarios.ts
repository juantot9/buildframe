import type { Workspace } from '../../src/index.js';
import type {
  ContextSourceCandidate,
  ContextSourceManifestView,
  ContextSourceSelection,
} from '../../src/contextEvidence.js';

export async function manifest(
  workspace: Workspace,
  selections: readonly (ContextSourceSelection & { readonly classification?: 'generated' | 'binary' })[],
  offset = 0,
  limit = 64,
): Promise<ContextSourceManifestView> {
  return await workspace.read({ kind: 'workspace.context.manifest', selections, offset, limit });
}

export async function allCandidates(
  workspace: Workspace,
  selections: readonly (ContextSourceSelection & { readonly classification?: 'generated' | 'binary' })[],
): Promise<readonly ContextSourceCandidate[]> {
  const collected: ContextSourceCandidate[] = [];
  let offset = 0;
  while (true) {
    const view = await manifest(workspace, selections, offset);
    collected.push(...view.candidates);
    if (view.nextOffset === null) return collected;
    offset = view.nextOffset;
  }
}

export function candidateAt(candidates: readonly ContextSourceCandidate[], relative: string): ContextSourceCandidate {
  const found = candidates.find(
    candidate =>
      candidate.pathBytesBase64 !== undefined &&
      Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8') === relative,
  );
  if (found === undefined) throw new Error(`Missing context candidate: ${relative}`);
  return found;
}

export function pathsOf(candidates: readonly ContextSourceCandidate[]): readonly string[] {
  return candidates.map(candidate =>
    candidate.pathBytesBase64 === undefined
      ? (candidate.absolutePath ?? '')
      : Buffer.from(candidate.pathBytesBase64, 'base64').toString('utf8'),
  );
}
