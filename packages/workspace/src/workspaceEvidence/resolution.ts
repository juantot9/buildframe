import { GitInspectionError, type GitInspectionContext } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import type {
  ReviewComparisonDynamicInput,
  ReviewComparisonSelection,
  ReviewComparisonUnavailableReason,
  ReviewRevisionEndpointSelection,
} from './contracts.js';
import { runGit } from './inspection.js';
import type {
  ResolvedCommit,
  ResolvedReviewComparison,
  ResolvedRevisionEndpoint,
  ResolvedTree,
} from './internalTypes.js';
import { normalizeReviewComparisonSelection } from './selection.js';
import { FULL_OBJECT_ID_PATTERN, objectFormat } from './utils.js';

export class ComparisonResolutionError extends Error {
  constructor(readonly reason: ReviewComparisonUnavailableReason) {
    super(reason);
    this.name = 'ComparisonResolutionError';
  }
}

export function comparisonUnavailableReason(
  error: unknown,
  selection: ReviewComparisonSelection,
): ReviewComparisonUnavailableReason {
  if (error instanceof ComparisonResolutionError) return error.reason;
  if (
    selection.scope !== undefined &&
    error instanceof GitInspectionError &&
    (error.reason === 'manifest-file-limit' || error.reason === 'git-output-limit')
  ) {
    return 'scope-limit-exceeded';
  }
  return 'inspection-failed';
}

async function resolveCommit(context: GitInspectionContext, selector: string): Promise<ResolvedCommit | undefined> {
  const result = await runGit(context, ['rev-parse', '--verify', '--quiet', `${selector}^{commit}`], {
    maxStdoutBytes: 1024,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) return undefined;
  const objectIdentity = result.stdout.toString('ascii').trim();
  if (!/^[0-9a-f]{40,64}$/u.test(objectIdentity)) {
    throw new GitInspectionError('invalid-commit-object');
  }
  const metadata = await runGit(context, ['show', '-s', '--format=%H%x00%P%x00%s', objectIdentity, '--'], {
    maxStdoutBytes: 64 * 1024,
  });
  const first = metadata.stdout.indexOf(0);
  const second = first < 0 ? -1 : metadata.stdout.indexOf(0, first + 1);
  if (first < 0 || second < 0) {
    throw new GitInspectionError('invalid-commit-metadata');
  }
  const reported = metadata.stdout.subarray(0, first).toString('ascii');
  const parentText = metadata.stdout.subarray(first + 1, second).toString('ascii');
  if (reported !== objectIdentity) {
    throw new GitInspectionError('invalid-commit-metadata');
  }
  const parents = parentText.length === 0 ? [] : parentText.split(' ');
  if (parents.some(parent => !/^[0-9a-f]{40,64}$/u.test(parent))) {
    throw new GitInspectionError('invalid-commit-metadata');
  }
  const subject = metadata.stdout
    .subarray(second + 1)
    .toString('utf8')
    .replace(/[\r\n]+$/gu, '');
  return { kind: 'commit', selector, objectIdentity, parents, subject };
}

async function resolveTree(context: GitInspectionContext, selector: string): Promise<ResolvedTree | undefined> {
  const result = await runGit(context, ['rev-parse', '--verify', '--quiet', `${selector}^{tree}`], {
    maxStdoutBytes: 1024,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) return undefined;
  const objectIdentity = result.stdout.toString('ascii').trim();
  if (!FULL_OBJECT_ID_PATTERN.test(objectIdentity)) {
    throw new GitInspectionError('invalid-tree-object');
  }
  return { kind: 'tree', selector, objectIdentity };
}

export async function commitTreeIdentity(context: GitInspectionContext, commitIdentity: string): Promise<string> {
  const result = await runGit(context, ['rev-parse', '--verify', '--quiet', `${commitIdentity}^{tree}`], {
    maxStdoutBytes: 1024,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) {
    throw new ComparisonResolutionError('revision-not-found');
  }
  const objectIdentity = result.stdout.toString('ascii').trim();
  if (!FULL_OBJECT_ID_PATTERN.test(objectIdentity)) {
    throw new GitInspectionError('invalid-tree-object');
  }
  return objectIdentity;
}

async function resolveDirectReferenceIdentity(
  context: GitInspectionContext,
  reference: string,
): Promise<string | undefined> {
  const result =
    reference === 'HEAD'
      ? await runGit(context, ['rev-parse', '--verify', '--quiet', 'HEAD'], {
          maxStdoutBytes: 1024,
          allowedExitCodes: [0, 1, 128],
        })
      : await runGit(context, ['show-ref', '--verify', '--hash', reference], {
          maxStdoutBytes: 1024,
          allowedExitCodes: [0, 1, 2, 128],
        });
  if (result.exitCode !== 0) return undefined;
  const identity = result.stdout.toString('ascii').trim();
  if (!FULL_OBJECT_ID_PATTERN.test(identity)) {
    throw new GitInspectionError('invalid-reference-object');
  }
  return identity;
}

async function resolveRevisionEndpoint(
  context: GitInspectionContext,
  selection: ReviewRevisionEndpointSelection,
  role: ReviewComparisonDynamicInput['role'],
  format: 'sha1' | 'sha256' | 'unknown',
): Promise<{
  readonly endpoint: ResolvedRevisionEndpoint;
  readonly dynamicInput?: ReviewComparisonDynamicInput;
}> {
  if (selection.kind === 'object') {
    const endpoint =
      selection.objectKind === 'commit'
        ? await resolveCommit(context, selection.objectIdentity)
        : await resolveTree(context, selection.objectIdentity);
    if (endpoint === undefined || endpoint.objectIdentity !== selection.objectIdentity) {
      throw new ComparisonResolutionError('revision-not-found');
    }
    return { endpoint };
  }

  const referenceObjectIdentity = await resolveDirectReferenceIdentity(context, selection.reference);
  if (referenceObjectIdentity === undefined) {
    throw new ComparisonResolutionError('local-ref-not-found');
  }
  const endpoint =
    selection.objectKind === 'commit'
      ? await resolveCommit(context, selection.reference)
      : await resolveTree(context, selection.reference);
  if (endpoint === undefined) {
    throw new ComparisonResolutionError('revision-not-found');
  }
  return {
    endpoint,
    dynamicInput: deepFreeze({
      kind: 'local-ref',
      role,
      reference: selection.reference,
      objectFormat: format,
      referenceObjectIdentity,
      resolvedObjectKind: endpoint.kind,
      resolvedObjectIdentity: endpoint.objectIdentity,
    }),
  };
}

async function uniqueMergeBase(
  context: GitInspectionContext,
  selectedCommitIdentity: string,
  comparedCommitIdentity: string,
): Promise<string> {
  const result = await runGit(context, ['merge-base', '--all', selectedCommitIdentity, comparedCommitIdentity], {
    maxStdoutBytes: 4096,
    allowedExitCodes: [0, 1],
  });
  if (result.exitCode !== 0 || result.stdout.byteLength === 0) {
    throw new ComparisonResolutionError('merge-base-not-found');
  }
  const identities = result.stdout.toString('ascii').trimEnd().split('\n');
  if (identities.length === 0 || identities.some(identity => !FULL_OBJECT_ID_PATTERN.test(identity))) {
    throw new GitInspectionError('invalid-merge-base');
  }
  if (identities.length !== 1) {
    throw new ComparisonResolutionError('merge-base-ambiguous');
  }
  return identities[0] as string;
}

export async function resolveReviewComparison(
  context: GitInspectionContext,
  value: ReviewComparisonSelection,
): Promise<ResolvedReviewComparison> {
  const selection = normalizeReviewComparisonSelection(value);
  const formatResult = await runGit(context, ['rev-parse', '--show-object-format'], {
    maxStdoutBytes: 1024,
  });
  const format = objectFormat(formatResult.stdout.toString('ascii').trim());

  if (selection.kind === 'revision-to-index' || selection.kind === 'revision-to-working-state') {
    const basis = await resolveRevisionEndpoint(context, selection.basis, 'basis', format);
    return {
      selection,
      workingComparison: { kind: selection.kind, basis: basis.endpoint },
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: basis.dynamicInput === undefined ? [] : [basis.dynamicInput],
      exactResolution: true,
    };
  }

  if (selection.kind === 'index-to-working-tree') {
    return {
      selection,
      workingComparison: { kind: 'index-to-working-tree' },
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: [],
      exactResolution: true,
    };
  }

  if (selection.kind === 'revision-pair') {
    const basis = await resolveRevisionEndpoint(context, selection.basis, 'basis', format);
    const compared = await resolveRevisionEndpoint(context, selection.compared, 'compared', format);
    return {
      selection,
      basis: basis.endpoint,
      compared: compared.endpoint,
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: [
        ...(basis.dynamicInput === undefined ? [] : [basis.dynamicInput]),
        ...(compared.dynamicInput === undefined ? [] : [compared.dynamicInput]),
      ],
      exactResolution: true,
    };
  }

  if (selection.kind === 'local-ref-merge-base') {
    const selected = await resolveRevisionEndpoint(
      context,
      {
        kind: 'local-ref',
        objectKind: 'commit',
        reference: selection.selectedReference,
      },
      'merge-base-reference',
      format,
    );
    const compared = await resolveRevisionEndpoint(
      context,
      {
        kind: 'object',
        objectKind: 'commit',
        objectIdentity: selection.comparedCommitIdentity,
      },
      'compared',
      format,
    );
    const mergeBaseIdentity = await uniqueMergeBase(
      context,
      selected.endpoint.objectIdentity,
      compared.endpoint.objectIdentity,
    );
    const basis = await resolveCommit(context, mergeBaseIdentity);
    if (basis === undefined || basis.objectIdentity !== mergeBaseIdentity) {
      throw new ComparisonResolutionError('revision-not-found');
    }
    return {
      selection,
      basis,
      compared: compared.endpoint,
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: selected.dynamicInput === undefined ? [] : [selected.dynamicInput],
      exactResolution: true,
    };
  }

  if (selection.kind === 'head-ancestry') {
    const compared = await resolveCommit(context, 'HEAD');
    if (compared === undefined) {
      throw new ComparisonResolutionError('revision-not-found');
    }
    const basis = await resolveCommit(context, `HEAD~${selection.commitCount}`);
    if (basis === undefined) {
      throw new ComparisonResolutionError('ancestry-not-found');
    }
    return {
      selection,
      basis,
      compared,
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: [],
      exactResolution: false,
    };
  }

  if (selection.kind === 'commit-to-head') {
    const [basis, compared] = await Promise.all([
      resolveCommit(context, selection.revision),
      resolveCommit(context, 'HEAD'),
    ]);
    if (basis === undefined || compared === undefined) {
      throw new ComparisonResolutionError('revision-not-found');
    }
    return {
      selection: {
        kind: 'commit-to-head',
        revision: basis.objectIdentity,
        ...(selection.scope === undefined ? {} : { scope: selection.scope }),
      },
      basis,
      compared,
      objectFormat: format,
      rootComparison: false,
      comparisonDynamicInputs: [],
      exactResolution: false,
    };
  }

  const comparedSelector = selection.kind === 'last-commit' ? 'HEAD' : selection.revision;
  const compared = await resolveCommit(context, comparedSelector);
  if (compared === undefined) {
    throw new ComparisonResolutionError('revision-not-found');
  }
  let parentIdentity: string | undefined;
  if (selection.kind === 'commit' && selection.parentRevision !== undefined) {
    const requestedParent = await resolveCommit(context, selection.parentRevision);
    if (requestedParent === undefined || !compared.parents.includes(requestedParent.objectIdentity)) {
      throw new ComparisonResolutionError('revision-not-found');
    }
    parentIdentity = requestedParent.objectIdentity;
  } else {
    if (compared.parents.length > 1) {
      throw new ComparisonResolutionError('merge-parent-ambiguous');
    }
    parentIdentity = compared.parents[0];
  }
  const basis = parentIdentity === undefined ? null : await resolveCommit(context, parentIdentity);
  if (parentIdentity !== undefined && basis === undefined) {
    throw new ComparisonResolutionError('revision-not-found');
  }
  const resolvedBasis = basis ?? null;
  return {
    selection:
      selection.kind === 'commit'
        ? {
            kind: 'commit',
            revision: compared.objectIdentity,
            ...(resolvedBasis === null ? {} : { parentRevision: resolvedBasis.objectIdentity }),
            ...(selection.scope === undefined ? {} : { scope: selection.scope }),
          }
        : selection,
    basis: resolvedBasis,
    compared,
    objectFormat: format,
    rootComparison: resolvedBasis === null,
    comparisonDynamicInputs: [],
    exactResolution: false,
  };
}

function selectedDynamicReferences(selection: ReviewComparisonSelection): readonly {
  readonly role: ReviewComparisonDynamicInput['role'];
  readonly reference: string;
}[] {
  if (
    selection.kind === 'revision-pair' ||
    selection.kind === 'revision-to-index' ||
    selection.kind === 'revision-to-working-state'
  ) {
    return [
      ...(selection.basis.kind === 'local-ref'
        ? [{ role: 'basis' as const, reference: selection.basis.reference }]
        : []),
      ...(selection.kind === 'revision-pair' && selection.compared.kind === 'local-ref'
        ? [{ role: 'compared' as const, reference: selection.compared.reference }]
        : []),
    ];
  }
  if (selection.kind === 'local-ref-merge-base') {
    return [
      {
        role: 'merge-base-reference',
        reference: selection.selectedReference,
      },
    ];
  }
  return [];
}

export async function inspectDynamicReferenceIdentities(
  context: GitInspectionContext,
  selection: ReviewComparisonSelection,
): Promise<
  readonly {
    readonly role: ReviewComparisonDynamicInput['role'];
    readonly reference: string;
    readonly referenceObjectIdentity: string | undefined;
  }[]
> {
  const inspected = [];
  for (const selected of selectedDynamicReferences(selection)) {
    inspected.push({
      ...selected,
      referenceObjectIdentity: await resolveDirectReferenceIdentity(context, selected.reference),
    });
  }
  return inspected;
}
