import { describe, expect, it } from 'vitest';

import { reviewFileTreeNodes, type ReviewingFileItem } from '../../src/reviewingFileList.js';
import { foldersAbove, foldersToLoad, unloadedFolders, type LiveFolders } from '../../src/reviewingLiveFolders.js';

const b64 = (text: string) => Buffer.from(text).toString('base64');
const path = (display: string) => ({ bytesBase64: b64(display), display });
const file = (displayPath: string, status: ReviewingFileItem['status'] = 'unchanged'): ReviewingFileItem => ({
  fileIdentity: `f:${displayPath}`,
  displayPath,
  pathBytesBase64: b64(displayPath),
  status,
});

describe('All files, a folder at a time', () => {
  it('loads the top and every folder on the way to a change, the file asked for, and those loaded before', () => {
    expect(foldersAbove(b64('src/lib/a.ts'))).toEqual(['', b64('src'), b64('src/lib')]);
    expect(foldersAbove(b64('README.md'))).toEqual(['']);
    const before: LiveFolders = {
      liveChangesIdentity: 'lch_x',
      loaded: new Map([
        ['docs/', { summary: { path: path('docs'), files: 1, changedFiles: 0 }, folders: [], files: [] }],
      ]),
    };
    expect(new Set(foldersToLoad([b64('src/lib/a.ts')], b64('test/b.ts'), before))).toEqual(
      new Set(['', b64('src'), b64('src/lib'), b64('test'), b64('docs')]),
    );
  });

  it('draws each folder not loaded yet as a closed row, with its changed count', () => {
    const folders: LiveFolders = {
      liveChangesIdentity: 'lch_x',
      loaded: new Map([
        [
          '',
          {
            summary: { path: path(''), files: 13, changedFiles: 1 },
            folders: [
              { path: path('src'), files: 2, changedFiles: 1 },
              { path: path('docs'), files: 10, changedFiles: 0 },
            ],
            files: [],
          },
        ],
        ['src/', { summary: { path: path('src'), files: 2, changedFiles: 1 }, folders: [], files: [] }],
      ]),
    };
    const unloaded = unloadedFolders(folders);
    expect(unloaded).toEqual([{ directory: 'docs/', pathBytesBase64: b64('docs'), files: 10, changedFiles: 0 }]);

    const files = [file('src/a.ts', 'modified'), file('src/b.ts'), file('README.md')];
    const rows = (collapsed: readonly string[]) =>
      reviewFileTreeNodes(files, collapsed, unloaded).map(node =>
        node.kind === 'file'
          ? node.file.displayPath
          : `${node.collapsed ? '▸' : '▾'} ${node.directory}${node.unloaded === undefined ? '' : ' (not loaded)'} ${node.changedFiles}`,
      );
    expect(rows([])).toEqual(['▾ src/ 1', 'src/a.ts', 'src/b.ts', 'README.md', '▸ docs/ (not loaded) 0']);
    // Closed by hand, a loaded folder keeps its count, so the row can say where the changes are.
    expect(rows(['src/'])).toEqual(['▸ src/ 1', 'README.md', '▸ docs/ (not loaded) 0']);
  });
});
