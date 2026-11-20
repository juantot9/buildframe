import { describe, expect, it } from 'vitest';
import { buildReviewDiff } from '../../src/reviewing/diff.js';
import type { CapturedSnapshotFile } from '../../src/reviewing/internalTypes.js';
import { gitSeesBinary } from '../../src/reviewing/lineEndingComparison.js';
import type { CurrentChangeSide, EvidenceLineEndingConversion } from '../../src/workspaceEvidence/contracts.js';
import { lineEndingRule } from '../../src/workspaceEvidence/lineEndings.js';

const attributes = (values: Record<string, string>): ReadonlyMap<string, string> => new Map(Object.entries(values));

describe('which working-tree files Git converts from CRLF to LF', () => {
  it.each([
    [{ text: 'set' }, 'false', 'text'],
    [{ text: 'unset' }, 'true', undefined],
    [{ text: 'auto' }, 'false', 'auto'],
    [{ text: 'auto', eol: 'crlf' }, 'false', 'auto'],
    [{ eol: 'crlf' }, 'false', 'text'],
    [{ eol: 'lf' }, 'false', 'text'],
    [{ text: 'unset', eol: 'crlf' }, 'false', undefined],
    [{ crlf: 'set' }, 'false', 'text'],
    [{ crlf: 'input' }, 'false', 'text'],
    [{ crlf: 'unset' }, 'true', undefined],
    [{ text: 'set', crlf: 'unset' }, 'false', 'text'],
    [{}, 'false', undefined],
    [{}, 'true', 'auto'],
    [{}, 'input', 'auto'],
    [{ text: 'unspecified', eol: 'unspecified' }, 'true', 'auto'],
  ] as const)('%o with core.autocrlf=%s → %s', (values, autoCrlf, expected) => {
    expect(lineEndingRule(attributes(values), autoCrlf)).toBe(expected);
  });
});

describe("Git's binary check for text=auto", () => {
  const bytes = (text: string): Uint8Array => Buffer.from(text, 'latin1');
  it.each([
    ['one\r\ntwo\r\n', false],
    ['tab\tand\x1bescape\r\n', false],
    ['lone\rcr\r\n', true],
    ['nul\0byte\r\n', true],
    [`${'x'.repeat(128)}\x01\x02`, true],
    [`${'x'.repeat(256)}\x01\r\n`, false],
    ['ends with dos eof\r\n\x1a', false],
  ])('%j → %s', (text, binary) => {
    expect(gitSeesBinary(bytes(text))).toBe(binary);
  });
});

describe('Diff lines compare the way Git compares them', () => {
  const side = (
    content: string,
    evidenceSource: CurrentChangeSide['evidenceSource'],
    lineEndingConversion?: EvidenceLineEndingConversion,
  ): CurrentChangeSide =>
    ({
      evidenceSource,
      classification: 'text',
      contentAvailability: 'captured',
      contentIdentity: { algorithm: 'sha256', value: `${evidenceSource}:${content}` },
      ...(lineEndingConversion === undefined ? {} : { lineEndingConversion }),
    }) as unknown as CurrentChangeSide;
  const changed = (oldSide: CurrentChangeSide, oldText: string, newSide: CurrentChangeSide, newText: string) => {
    const captured = {
      file: { fileIdentity: 'fil_lines', status: 'modified', oldSide, newSide },
      oldContent: Buffer.from(oldText),
      newContent: Buffer.from(newText),
    } as unknown as CapturedSnapshotFile;
    const rows = buildReviewDiff('rsn_lines', captured).rows;
    return {
      removed: rows.filter(row => row.kind === 'deletion').length,
      added: rows.filter(row => row.kind === 'addition').length,
      context: rows.filter(row => row.kind === 'context').map(row => row.content.byteLength),
    };
  };
  const lf = 'one\ntwo\nthree\n';
  const crlf = 'one\r\ntwo\r\nthree\r\n';
  const editedCrlf = 'one\r\nTWO\r\nthree\r\n';

  it('ignores the CR before LF on a converted side, and rows keep its exact bytes', () => {
    for (const rule of ['text', 'auto'] as const) {
      expect(changed(side(lf, 'head'), lf, side(editedCrlf, 'working-tree', rule), editedCrlf)).toEqual({
        removed: 1,
        added: 1,
        context: [4, 6],
      });
    }
  });

  it('compares raw bytes where Git converts nothing', () => {
    expect(changed(side(lf, 'head'), lf, side(crlf, 'working-tree'), crlf)).toMatchObject({ removed: 3, added: 3 });
  });

  it('keeps CRs under auto when the compared version has one, and when Git sees binary', () => {
    expect(changed(side(crlf, 'head'), crlf, side(editedCrlf, 'working-tree', 'auto'), editedCrlf)).toMatchObject({
      removed: 1,
      added: 1,
    });
    const binaryish = 'one\r\ntwo\rx\r\nthree\r\n';
    expect(changed(side(lf, 'head'), lf, side(binaryish, 'working-tree', 'auto'), binaryish)).toMatchObject({
      removed: 3,
      added: 3,
    });
  });

  it('compares two converted working states between History steps', () => {
    expect(
      changed(side(crlf, 'working-tree', 'text'), crlf, side(editedCrlf, 'working-tree', 'text'), editedCrlf),
    ).toMatchObject({ removed: 1, added: 1 });
    expect(
      changed(side(crlf, 'working-tree', 'auto'), crlf, side(editedCrlf, 'working-tree', 'auto'), editedCrlf),
    ).toMatchObject({ removed: 1, added: 1 });
  });

  it('never ignores a CR that ends the file without an LF', () => {
    expect(changed(side('one', 'head'), 'one', side('one\r', 'working-tree', 'text'), 'one\r')).toMatchObject({
      removed: 1,
      added: 1,
    });
  });
});
