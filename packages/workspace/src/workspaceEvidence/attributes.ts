import type { GitInspectionContext, GitProcessResult } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import type { WorkspaceEvidenceLimits } from './contracts.js';
import { runGit } from './inspection.js';
import type { AttributeSource, FileDraft, SideDraft } from './internalTypes.js';
import { LINE_ENDING_ATTRIBUTES, lineEndingRule, readAutoCrlf, type AutoCrlf } from './lineEndings.js';
import { pathListCanonical, splitBuffer } from './utils.js';

function attributeSourceKey(source: AttributeSource): string {
  return `${source.kind}\0${source.selector ?? ''}`;
}

export async function decorateAttributes(
  context: GitInspectionContext,
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  const grouped = new Map<string, { readonly source: AttributeSource; readonly sides: SideDraft[] }>();
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      if (side?.attributeSource === undefined) continue;
      const key = attributeSourceKey(side.attributeSource);
      const group = grouped.get(key) ?? {
        source: side.attributeSource,
        sides: [],
      };
      group.sides.push(side);
      grouped.set(key, group);
    }
  }

  const attributes = ['linguist-generated', 'generated', 'filter'] as const;
  // Line endings matter only where Git reads a working-tree file.
  let autoCrlf: AutoCrlf | undefined;
  for (const { source, sides } of grouped.values()) {
    const working = source.kind === 'working-tree';
    if (working) autoCrlf ??= await readAutoCrlf(context);
    const uniquePaths = new Map<string, Buffer>();
    for (const side of sides) {
      uniquePaths.set(side.pathBytes.toString('hex'), side.pathBytes);
    }
    const paths = [...uniquePaths.values()].sort((left, right) => Buffer.compare(left, right));
    if (paths.length === 0) continue;
    const markWorkingAttributesUnavailable = (): void => {
      for (const side of sides) {
        if (side.evidenceSource === 'working-tree') {
          // Failure to prove that no filter applies cannot become a raw-byte
          // identity claim. The side still retains independently read bytes.
          side.filterDriver = '<attribute-inspection-unavailable>';
        }
      }
    };
    let result: GitProcessResult;
    try {
      result = await runGit(
        context,
        [
          'check-attr',
          '-z',
          ...(source.kind === 'object'
            ? [`--source=${source.selector ?? ''}`]
            : source.kind === 'index'
              ? ['--cached']
              : []),
          '--stdin',
          ...attributes,
          ...(working ? LINE_ENDING_ATTRIBUTES : []),
        ],
        {
          maxStdoutBytes: limits.maxManifestBytes,
          stdin: pathListCanonical(paths),
        },
      );
    } catch {
      // Generated classification is derived disclosure. Working identity is
      // conservative because filter absence could not be established.
      markWorkingAttributesUnavailable();
      continue;
    }
    const records = splitBuffer(
      result.stdout.subarray(0, result.stdout.at(-1) === 0 ? result.stdout.byteLength - 1 : result.stdout.byteLength),
      0,
    );
    if (records.length % 3 !== 0) {
      markWorkingAttributesUnavailable();
      continue;
    }
    const byPath = new Map<string, Map<string, string>>();
    for (let index = 0; index < records.length; index += 3) {
      const rawPath = records[index];
      const attribute = records[index + 1]?.toString('ascii');
      const value = records[index + 2]?.toString('utf8');
      if (rawPath === undefined || attribute === undefined || value === undefined) {
        continue;
      }
      const values = byPath.get(rawPath.toString('hex')) ?? new Map<string, string>();
      values.set(attribute, value);
      byPath.set(rawPath.toString('hex'), values);
    }
    for (const side of sides) {
      const values = byPath.get(side.pathBytes.toString('hex'));
      if (values === undefined) continue;
      const generatedAttribute = (['linguist-generated', 'generated'] as const).find(name =>
        ['set', 'true'].includes(values.get(name) ?? ''),
      );
      if (generatedAttribute !== undefined) {
        side.generated = deepFreeze({
          classification: 'generated',
          source: 'git-attribute',
          attribute: generatedAttribute,
        });
      }
      const filter = values.get('filter');
      if (
        side.evidenceSource === 'working-tree' &&
        filter !== undefined &&
        !['unspecified', 'unset', 'false'].includes(filter)
      ) {
        side.filterDriver = filter;
      }
      const rule = working && autoCrlf !== undefined ? lineEndingRule(values, autoCrlf) : undefined;
      if (rule !== undefined && side.evidenceSource === 'working-tree') side.lineEndingRule = rule;
    }
  }
}
