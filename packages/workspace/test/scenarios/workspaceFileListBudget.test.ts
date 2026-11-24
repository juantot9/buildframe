import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, installWorkspaceProjectionHygiene, open, started } from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

/** The local runtime's message cap (`MAX_FRAME_BYTES`); every read must fit one message. */
const RUNTIME_MESSAGE_CAP = 1024 * 1024;
const NEW_FILES = 2_500;

describe('file-list reads fit the runtime message cap', () => {
  it('sends a list too long for one message in pieces, and the pieces hold every file', async () => {
    const created = await fixture();
    // 200-character paths make each entry large, so 2,500 new files need several pieces.
    const folder = path.join(created.checkout, `deep-${'x'.repeat(150)}`);
    await mkdir(folder, { recursive: true });
    await Promise.all(
      Array.from({ length: NEW_FILES }, (_, index) =>
        writeFile(path.join(folder, `file-${String(index).padStart(5, '0')}-${'y'.repeat(30)}.ts`), `${index}\n`),
      ),
    );
    const owner = await open(created.checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'file-list-budget',
        expectedStateVersion: 0,
      }),
    );
    const live = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 1,
    });
    if (live.status !== 'available') throw new Error('Live changes are not available');
    const total = NEW_FILES + 1;

    const readAll = async (read: (offset: number) => Promise<unknown>, list: (view: any) => any) => {
      const seen: string[] = [];
      let offset: number | null = 0;
      let pieces = 0;
      while (offset !== null) {
        const view = await read(offset);
        expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(RUNTIME_MESSAGE_CAP);
        const current = list(view);
        const entries: readonly { readonly fileIdentity: string }[] = current.files ?? current.items;
        seen.push(...entries.map(entry => entry.fileIdentity));
        offset = current.nextOffset;
        pieces += 1;
      }
      return { seen, pieces };
    };

    const window = { reviewIdentity: review.reviewIdentity, limit: 10_000 } as const;
    const lists = [
      await readAll(
        offset => owner.workspace.read({ kind: 'review.manifest', ...window, offset }),
        view => view.manifest,
      ),
      await readAll(
        offset => owner.workspace.read({ kind: 'review.live-manifest', ...window, offset }),
        view => view.manifest,
      ),
      await readAll(
        offset =>
          owner.workspace.read({
            kind: 'review.live-files',
            ...window,
            liveChangesIdentity: live.liveChangesIdentity,
            offset,
          }),
        view => view.files,
      ),
    ];
    for (const { seen, pieces } of lists) {
      expect(pieces).toBeGreaterThan(1);
      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
    }

    // One folder of them, read in windows of at most 1,000 rows.
    const folderRows = await readAll(
      offset =>
        owner.workspace.read({
          kind: 'review.live-folder',
          reviewIdentity: review.reviewIdentity,
          liveChangesIdentity: live.liveChangesIdentity,
          pathBytesBase64: Buffer.from(path.basename(folder)).toString('base64'),
          offset,
          limit: 1_000,
        }),
      view => ({ items: view.entries.items.map((entry: any) => entry.file), nextOffset: view.entries.nextOffset }),
    );
    expect(folderRows.pieces).toBeGreaterThan(3);
    expect(new Set(folderRows.seen).size).toBe(NEW_FILES);

    // Read with others, a folder too large for one read is left to be paged on its own.
    const together = await owner.workspace.read({
      kind: 'review.live-folders',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      pathsBytesBase64: ['', Buffer.from(path.basename(folder)).toString('base64')],
    });
    expect(Buffer.byteLength(JSON.stringify(together))).toBeLessThan(RUNTIME_MESSAGE_CAP);
    expect(together).toMatchObject({
      remaining: [],
      tooLarge: [Buffer.from(path.basename(folder)).toString('base64')],
    });
  }, 120_000);
});
