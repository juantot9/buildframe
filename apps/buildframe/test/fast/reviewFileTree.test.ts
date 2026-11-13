import { describe, expect, it } from 'vitest';

import { reviewFileTreeNodes, type ReviewingFileItem } from '../../src/reviewingModel.js';

function file(displayPath: string, status: ReviewingFileItem['status']): ReviewingFileItem {
  return {
    fileIdentity: `fil_${displayPath}`,
    displayPath,
    pathBytesBase64: Buffer.from(displayPath).toString('base64'),
    status,
    ...(status === 'unchanged' ? {} : { diffFileIdentity: `dif_${displayPath}` }),
  };
}

function labels(nodes: ReturnType<typeof reviewFileTreeNodes>): readonly string[] {
  return nodes.map(node => (node.kind === 'directory' ? node.directory : node.file.displayPath));
}

describe('Files tree assembly', () => {
  it('merges a directory that the All window splits across changed and unchanged groups', () => {
    const nodes = reviewFileTreeNodes(
      [
        file('review.txt', 'modified'),
        file('src/two.txt', 'modified'),
        file('docs/readme.md', 'unchanged'),
        file('src/one.txt', 'unchanged'),
      ],
      [],
    );

    expect(labels(nodes)).toEqual(['review.txt', 'src/', 'src/two.txt', 'src/one.txt', 'docs/', 'docs/readme.md']);
  });

  it('keeps depth, first-flat ordinals, and collapse exact in the assembled tree', () => {
    const files = [file('src/nested/one.txt', 'unchanged'), file('src/two.txt', 'modified')];
    const expanded = reviewFileTreeNodes(files, []);
    expect(labels(expanded)).toEqual(['src/', 'src/two.txt', 'src/nested/', 'src/nested/one.txt']);
    expect(expanded[2]).toMatchObject({ kind: 'directory', directory: 'src/nested/', depth: 1, flat: 0 });
    expect(expanded[1]).toMatchObject({ kind: 'file', flat: 1, depth: 1 });

    const collapsed = reviewFileTreeNodes(files, ['src/']);
    expect(labels(collapsed)).toEqual(['src/']);
    expect(collapsed[0]).toMatchObject({ kind: 'directory', collapsed: true, depth: 0, flat: 0 });
  });
});
