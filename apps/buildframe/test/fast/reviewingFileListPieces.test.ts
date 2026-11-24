import type { Workspace } from '@buildframe/workspace';
import { describe, expect, it } from 'vitest';

import { joinFileListPieces } from '../../src/reviewingFileListPieces.js';

/** A Workspace whose live file list comes in pieces of `piece` files, like a byte-bounded read. */
function piecedWorkspace(total: number, piece: number, moveAfter?: number) {
  const reads: { readonly offset: number; readonly limit: number }[] = [];
  const workspace = {
    read: async (request: { readonly kind: string; readonly offset: number; readonly limit: number }) => {
      reads.push({ offset: request.offset, limit: request.limit });
      const end = Math.min(total, request.offset + Math.min(request.limit, piece));
      const moved = moveAfter !== undefined && reads.length > moveAfter;
      return {
        kind: 'review.live-files',
        status: 'available',
        stateVersion: moved ? 2 : 1,
        liveChangesIdentity: 'lch_one',
        files: {
          total,
          offset: request.offset,
          items: Array.from({ length: end - request.offset }, (_, index) => ({
            fileIdentity: `f${request.offset + index}`,
          })),
          nextOffset: end < total ? end : null,
        },
      };
    },
  } as unknown as Workspace;
  return { workspace, reads };
}

const request = {
  kind: 'review.live-files',
  reviewIdentity: 'rev_x',
  liveChangesIdentity: 'lch_one',
  offset: 0,
  limit: 10_000,
} as const;

describe('a file list sent in pieces reaches Reviewing as one list', () => {
  it('reads on until the requested window is whole', async () => {
    const { workspace, reads } = piecedWorkspace(2_500, 1_000);
    const view = (await joinFileListPieces(workspace).read(request as never)) as any;
    expect(view.files.items).toHaveLength(2_500);
    expect(view.files.items.at(-1)).toEqual({ fileIdentity: 'f2499' });
    expect(view.files.nextOffset).toBeNull();
    expect(reads).toEqual([
      { offset: 0, limit: 10_000 },
      { offset: 1_000, limit: 9_000 },
      { offset: 2_000, limit: 8_000 },
    ]);
  });

  it('stops joining when the list moves between pieces, keeping where to read next', async () => {
    const { workspace } = piecedWorkspace(2_500, 1_000, 1);
    const view = (await joinFileListPieces(workspace).read(request as never)) as any;
    expect(view.files.items).toHaveLength(1_000);
    expect(view.files.nextOffset).toBe(1_000);
  });

  it('never reads past the window the caller asked for', async () => {
    const { workspace, reads } = piecedWorkspace(2_500, 1_000);
    const view = (await joinFileListPieces(workspace).read({ ...request, limit: 1_500 } as never)) as any;
    expect(view.files.items).toHaveLength(1_500);
    expect(view.files.nextOffset).toBe(1_500);
    expect(reads).toHaveLength(2);
  });
});
