import type { Workspace, WorkspaceViewRequest } from '@buildframe/workspace';

/** The reads whose file list the Workspace may send in pieces that fit the runtime's message cap. */
const FILE_LIST_READS = new Set([
  'review.manifest',
  'review.live-manifest',
  'review.live-files',
  'review.step-changes',
]);

interface FileList {
  readonly items: readonly unknown[];
  readonly nextOffset: number | null;
}

// Views are read loosely here: the four reads keep their list in one of two shapes.
type ListView = Record<string, any>;

function listOf(view: ListView): FileList | undefined {
  if (view.status !== 'available') return undefined;
  if (view.kind === 'review.manifest' || view.kind === 'review.live-manifest') {
    return { items: view.manifest.files, nextOffset: view.manifest.nextOffset };
  }
  return { items: view.files.items, nextOffset: view.files.nextOffset };
}

function withList(view: ListView, items: readonly unknown[], nextOffset: number | null): ListView {
  return view.kind === 'review.manifest' || view.kind === 'review.live-manifest'
    ? { ...view, manifest: { ...view.manifest, files: items, nextOffset } }
    : { ...view, files: { ...view.files, items, nextOffset } };
}

/** A later piece belongs to the same list only while nothing it is read from has moved. */
function samePlace(first: ListView, piece: ListView): boolean {
  return (
    piece.stateVersion === first.stateVersion &&
    piece.liveChangesIdentity === first.liveChangesIdentity &&
    piece.manifest?.identity === first.manifest?.identity
  );
}

/**
 * The Workspace sends a long file list in pieces that each fit the background
 * process's message cap. This reads the rest of the pieces a request asked for
 * and joins them, so the Files pane still gets one list. If the list moves
 * between pieces, the join stops and the app pages on from what it has.
 */
export function joinFileListPieces(workspace: Workspace): Workspace {
  const read = async (request: WorkspaceViewRequest): Promise<unknown> => {
    const first = (await workspace.read(request)) as ListView;
    if (!FILE_LIST_READS.has(request.kind)) return first;
    const list = listOf(first);
    if (list === undefined) return first;
    const { offset, limit } = request as unknown as { readonly offset: number; readonly limit: number };
    const end = offset + limit;
    const items = [...list.items];
    let next = list.nextOffset;
    while (next !== null && next > offset && next < end) {
      const piece = (await workspace.read({
        ...request,
        offset: next,
        limit: end - next,
      } as WorkspaceViewRequest)) as ListView;
      const more = listOf(piece);
      if (more === undefined || !samePlace(first, piece)) break;
      items.push(...more.items);
      next = more.nextOffset;
    }
    return items.length === list.items.length ? first : withList(first, items, next);
  };
  return {
    execute: command => workspace.execute(command),
    read: read as Workspace['read'],
    subscribe: (scope, onUpdate) => workspace.subscribe(scope, onUpdate),
    setAttention: attention => workspace.setAttention(attention),
  };
}
