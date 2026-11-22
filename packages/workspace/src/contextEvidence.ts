import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { decodeBytesBase64, encodeBytesBase64 } from './bytesBase64.js';
import { readLinkTarget as readSymlinkTarget } from './linkTarget.js';
import { outsideChild, outsideSelection, outsideUnder } from './outsidePaths.js';
import { sha256 } from './sha256.js';
import type { GitInspectionContext } from './gitProcess.js';
import { enumerateIndex, enumerateUntracked } from './workspaceEvidence/enumeration.js';
import { withGitInspection } from './workspaceEvidence/inspection.js';
import { validateRelativePath } from './workspaceEvidence/utils.js';
import {
  filterTrackedByPrefix,
  pathUnderPrefix,
  scopedIgnoredUntracked,
  scopedTrackedRecords,
  type IgnoredUntracked,
} from './contextScope.js';
import type {
  IndexEnumeration,
  IndexRecord,
  UntrackedEnumeration,
  WorkspaceEvidenceLimits,
} from './workspaceEvidence/index.js';

/** Context Source Eligibility is always explicit caller intent; nothing is ambient. */
export type ContextSourceSelection =
  | { readonly kind: 'workspace-file'; readonly pathBytesBase64: string }
  | { readonly kind: 'workspace-directory'; readonly pathBytesBase64: string }
  | { readonly kind: 'workspace-ignored'; readonly pathBytesBase64: string }
  | {
      readonly kind: 'outside-checkout';
      readonly form: 'file' | 'directory';
      readonly absolutePath: string;
    };

/** Explicit user or repository classification; its absence never claims safety. */
export type ContextSourceClassification = 'generated' | 'binary';

export interface ContextSourceManifestRequest {
  readonly kind: 'workspace.context.manifest';
  readonly selections: readonly (ContextSourceSelection & {
    readonly classification?: ContextSourceClassification;
  })[];
  readonly offset: number;
  readonly limit: number;
}

export type ContextSourceCandidateKind = 'regular' | 'symlink' | 'gitlink' | 'nested-repository' | 'special';

export type ContextSourceEligibility = 'tracked' | 'untracked' | 'ignored-explicit' | 'outside-checkout';

export type ContextSourceAvailability = 'available' | 'working-missing' | 'unavailable';

export type ContextSourceAbsenceReason =
  | 'skip-worktree'
  | 'missing-working-file'
  | 'index-unmerged'
  | 'gitlink'
  | 'nested-repository'
  | 'special-entry'
  | 'unreadable';

export interface ContextSourceCandidate {
  /** Selection indices whose explicit intent admits this occurrence, ascending. */
  readonly origins: readonly number[];
  /** Exact repository-relative path bytes; absent for outside-checkout candidates. */
  readonly pathBytesBase64?: string;
  /** Host absolute path for outside-checkout candidates. */
  readonly absolutePath?: string;
  readonly sourceKind: ContextSourceCandidateKind;
  readonly eligibility: ContextSourceEligibility;
  /** Git index mode for tracked candidates. */
  readonly gitMode?: string;
  /** Index blob identity for tracked candidates; untracked identity waits for capture. */
  readonly contentIdentity?: string;
  readonly size?: number;
  readonly availability: ContextSourceAvailability;
  readonly absenceReason?: ContextSourceAbsenceReason;
  readonly sensitive: boolean;
  readonly classification?: ContextSourceClassification;
}

export type ContextSourceIncompleteReason = 'candidate-limit' | 'traversal-failed' | 'inspection-failed';

export interface ContextSelectionSummary {
  readonly origin: number;
  readonly selection: ContextSourceSelection;
  readonly classification?: ContextSourceClassification;
}

export interface ContextSourceManifestView {
  readonly kind: 'workspace.context.manifest';
  readonly status: 'complete' | 'incomplete';
  readonly incompleteReason?: ContextSourceIncompleteReason;
  readonly selections: readonly ContextSelectionSummary[];
  readonly totalCandidates: number;
  readonly offset: number;
  readonly candidates: readonly ContextSourceCandidate[];
  readonly nextOffset: number | null;
  readonly limits: WorkspaceEvidenceLimits;
}

export const MAX_CONTEXT_SELECTIONS = 64;
const MAX_CONTEXT_ABSOLUTE_PATH_BYTES = 4096;
const GITLINK_MODE = '160000';
const SLASH = Buffer.from([0x2f]);

interface NormalizedContextSelection {
  readonly origin: number;
  readonly kind: 'file' | 'directory' | 'ignored' | 'outside-file' | 'outside-directory';
  readonly relative?: Buffer;
  readonly absolute?: Buffer;
  readonly classification?: ContextSourceClassification;
}

function workingPath(checkout: string, relative: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${checkout}${path.sep}`, 'utf8'), relative]);
}

export function normalizeContextSourceSelections(
  value: ContextSourceManifestRequest['selections'],
): readonly NormalizedContextSelection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CONTEXT_SELECTIONS) {
    throw new TypeError('Context selections must be a non-empty bounded list');
  }
  const normalized: NormalizedContextSelection[] = [];
  for (const [origin, entry] of value.entries()) {
    const selection = entry as Record<string, unknown>;
    let classification: ContextSourceClassification | undefined;
    if (selection.classification !== undefined) {
      if (selection.classification !== 'generated' && selection.classification !== 'binary') {
        throw new TypeError('Context classification must be generated or binary');
      }
      classification = selection.classification;
    }
    if (selection.kind === 'outside-checkout') {
      if (selection.form !== 'file' && selection.form !== 'directory') {
        throw new TypeError('Outside-checkout selections declare file or directory form');
      }
      if (
        typeof selection.absolutePath !== 'string' ||
        path.isAbsolute(selection.absolutePath) === false ||
        selection.absolutePath.includes('\u0000')
      ) {
        throw new TypeError('Outside-checkout selections carry one absolute host path');
      }
      const absolute = outsideSelection(selection.absolutePath);
      if (absolute.byteLength === 0 || absolute.byteLength > MAX_CONTEXT_ABSOLUTE_PATH_BYTES) {
        throw new TypeError('Outside-checkout absolute paths are bounded');
      }
      normalized.push({
        origin,
        kind: selection.form === 'file' ? 'outside-file' : 'outside-directory',
        absolute,
        ...(classification === undefined ? {} : { classification }),
      });
      continue;
    }
    if (
      selection.kind !== 'workspace-file' &&
      selection.kind !== 'workspace-directory' &&
      selection.kind !== 'workspace-ignored'
    ) {
      throw new TypeError('Context selections use the closed selection union');
    }
    if (typeof selection.pathBytesBase64 !== 'string') {
      throw new TypeError('In-checkout selections carry exact path bytes');
    }
    let relative: Buffer;
    try {
      relative = decodeBytesBase64(selection.pathBytesBase64);
    } catch {
      throw new TypeError('In-checkout selections carry valid Base64 path bytes');
    }
    const relativeText = relative.toString('utf8');
    if (
      (selection.kind === 'workspace-file' && relative.byteLength === 0) ||
      relative.byteLength > 4096 ||
      relativeText.endsWith('/') ||
      relativeText === '.git' ||
      relativeText.startsWith('.git/')
    ) {
      throw new TypeError('In-checkout selections carry bounded non-Git-internals paths');
    }
    if (relative.byteLength > 0) validateRelativePath(relative);
    normalized.push({
      origin,
      kind:
        selection.kind === 'workspace-file'
          ? 'file'
          : selection.kind === 'workspace-directory'
            ? 'directory'
            : 'ignored',
      relative,
      ...(classification === undefined ? {} : { classification }),
    });
  }
  return normalized;
}

async function lstatOptional(absolute: Buffer): Promise<import('node:fs').Stats | undefined> {
  try {
    return await lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function isSpecialEntry(stat: import('node:fs').Stats): boolean {
  return stat.isFIFO() || stat.isSocket() || stat.isCharacterDevice() || stat.isBlockDevice();
}

interface Accumulator {
  readonly byPath: Map<string, ContextSourceCandidate>;
  incomplete: false | ContextSourceIncompleteReason;
}

function markIncomplete(accumulator: Accumulator, reason: ContextSourceIncompleteReason): void {
  if (accumulator.incomplete === false) accumulator.incomplete = reason;
}

function atCandidateLimit(accumulator: Accumulator, limits: WorkspaceEvidenceLimits): boolean {
  if (accumulator.byPath.size >= limits.maxContextCandidates) {
    markIncomplete(accumulator, 'candidate-limit');
    return true;
  }
  return false;
}

async function trackedWorkingCandidate(
  absolute: Buffer,
  record: IndexRecord,
  classification: ContextSourceClassification | undefined,
): Promise<ContextSourceCandidate> {
  if (record.mode === GITLINK_MODE) {
    return {
      origins: [],
      sourceKind: 'gitlink',
      eligibility: 'tracked',
      gitMode: record.mode,
      contentIdentity: record.oid,
      availability: 'unavailable',
      absenceReason: 'gitlink',
      sensitive: false,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  if (record.stage !== 0) {
    return {
      origins: [],
      sourceKind: 'regular',
      eligibility: 'tracked',
      gitMode: record.mode,
      availability: 'unavailable',
      absenceReason: 'index-unmerged',
      sensitive: false,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  const stat = await lstatOptional(absolute);
  if (stat === undefined) {
    return {
      origins: [],
      sourceKind: 'regular',
      eligibility: 'tracked',
      gitMode: record.mode,
      contentIdentity: record.oid,
      availability: 'working-missing',
      absenceReason: record.skipWorktree ? 'skip-worktree' : 'missing-working-file',
      sensitive: false,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  return {
    origins: [],
    sourceKind: stat.isDirectory()
      ? 'special'
      : stat.isSymbolicLink()
        ? 'symlink'
        : isSpecialEntry(stat)
          ? 'special'
          : 'regular',
    eligibility: 'tracked',
    gitMode: record.mode,
    contentIdentity: record.oid,
    ...(stat.isDirectory() || isSpecialEntry(stat)
      ? { availability: 'unavailable' as const, absenceReason: 'special-entry' as const }
      : { availability: 'available' as const, size: stat.size }),
    sensitive: false,
    ...(classification === undefined ? {} : { classification }),
  };
}

async function untrackedWorkingCandidate(
  absolute: Buffer,
  sensitivity: boolean,
  classification: ContextSourceClassification | undefined,
): Promise<ContextSourceCandidate> {
  const stat = await lstatOptional(absolute);
  if (stat === undefined) {
    return {
      origins: [],
      sourceKind: 'regular',
      eligibility: sensitivity ? 'ignored-explicit' : 'untracked',
      availability: 'unavailable',
      absenceReason: 'missing-working-file',
      sensitive: sensitivity,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  if (stat.isDirectory()) {
    return {
      origins: [],
      sourceKind: 'special',
      eligibility: sensitivity ? 'ignored-explicit' : 'untracked',
      availability: 'unavailable',
      absenceReason: 'unreadable',
      sensitive: sensitivity,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  return {
    origins: [],
    sourceKind: stat.isSymbolicLink() ? 'symlink' : isSpecialEntry(stat) ? 'special' : 'regular',
    eligibility: sensitivity ? 'ignored-explicit' : 'untracked',
    ...(isSpecialEntry(stat)
      ? { availability: 'unavailable' as const, absenceReason: 'special-entry' as const }
      : { availability: 'available' as const, size: stat.size }),
    sensitive: sensitivity,
    ...(classification === undefined ? {} : { classification }),
  };
}

async function inCheckoutCandidate(
  checkout: string,
  relative: Buffer,
  record: IndexRecord | undefined,
  isIgnoredUntracked: boolean,
  classification: ContextSourceClassification | undefined,
): Promise<ContextSourceCandidate> {
  const base =
    record === undefined
      ? await untrackedWorkingCandidate(workingPath(checkout, relative), isIgnoredUntracked, classification)
      : await trackedWorkingCandidate(workingPath(checkout, relative), record, classification);
  return {
    ...base,
    origins: [],
    pathBytesBase64: encodeBytesBase64(relative),
    eligibility: record === undefined ? (isIgnoredUntracked ? 'ignored-explicit' : 'untracked') : 'tracked',
    sensitive: record === undefined && isIgnoredUntracked,
  };
}

async function containsGitDirectory(absolute: Buffer): Promise<boolean> {
  try {
    const entries = await readDirentNames(absolute);
    return entries.some(entry => entry.name.toString('utf8') === '.git');
  } catch {
    return false;
  }
}

interface BufferDirent {
  readonly name: Buffer;
  readonly isDirectory: () => boolean;
}

async function readDirentNames(absolute: Buffer): Promise<readonly BufferDirent[]> {
  const entries = await readdir(absolute, { withFileTypes: true, encoding: 'buffer' });
  return entries as unknown as readonly BufferDirent[];
}

function sortedDirentNames(entries: readonly BufferDirent[]): readonly BufferDirent[] {
  return [...entries].sort((left, right) => Buffer.compare(left.name, right.name));
}

async function walkInCheckoutDirectory(
  checkout: string,
  relativePrefix: Buffer,
  absolutePrefix: Buffer,
  trackedByPath: ReadonlyMap<string, IndexRecord>,
  ignoredUntracked: IgnoredUntracked,
  ignoredSelection: boolean,
  classification: ContextSourceClassification | undefined,
  accumulator: Accumulator,
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  let entries;
  try {
    entries = await readDirentNames(absolutePrefix);
  } catch {
    markIncomplete(accumulator, 'traversal-failed');
    return;
  }
  for (const entry of sortedDirentNames(entries)) {
    if (atCandidateLimit(accumulator, limits)) return;
    const name = entry.name;
    if (name.toString('utf8') === '.git') continue;
    const relative = Buffer.concat(relativePrefix.byteLength === 0 ? [name] : [relativePrefix, SLASH, name]);
    const pathHex = relative.toString('hex');
    const absolute = Buffer.concat([absolutePrefix, SLASH, name]);
    const record = trackedByPath.get(pathHex);
    if (entry.isDirectory() && record?.mode !== GITLINK_MODE) {
      if (accumulator.byPath.has(pathHex)) continue;
      if (await containsGitDirectory(absolute)) {
        accumulator.byPath.set(pathHex, {
          origins: [],
          pathBytesBase64: encodeBytesBase64(relative),
          sourceKind: 'nested-repository',
          eligibility: 'untracked',
          availability: 'unavailable',
          absenceReason: 'nested-repository',
          sensitive: false,
          ...(classification === undefined ? {} : { classification }),
        });
        continue;
      }
      await walkInCheckoutDirectory(
        checkout,
        relative,
        absolute,
        trackedByPath,
        ignoredUntracked,
        ignoredSelection,
        classification,
        accumulator,
        limits,
      );
      continue;
    }
    if (accumulator.byPath.has(pathHex)) continue;
    const isIgnoredUntracked = record === undefined && ignoredUntracked.has(pathHex);
    if (record === undefined && !ignoredSelection && isIgnoredUntracked) continue;
    accumulator.byPath.set(
      pathHex,
      await inCheckoutCandidate(checkout, relative, record, isIgnoredUntracked, classification),
    );
  }
}

async function outsideCandidate(
  absolute: Buffer,
  classification: ContextSourceClassification | undefined,
): Promise<ContextSourceCandidate> {
  const stat = await lstatOptional(absolute);
  if (stat === undefined) {
    return {
      origins: [],
      absolutePath: absolute.toString('utf8'),
      sourceKind: 'regular',
      eligibility: 'outside-checkout',
      availability: 'unavailable',
      absenceReason: 'missing-working-file',
      sensitive: true,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  if (stat.isDirectory()) {
    return {
      origins: [],
      absolutePath: absolute.toString('utf8'),
      sourceKind: 'special',
      eligibility: 'outside-checkout',
      availability: 'unavailable',
      absenceReason: 'unreadable',
      sensitive: true,
      ...(classification === undefined ? {} : { classification }),
    };
  }
  return {
    origins: [],
    absolutePath: absolute.toString('utf8'),
    sourceKind: stat.isSymbolicLink() ? 'symlink' : isSpecialEntry(stat) ? 'special' : 'regular',
    eligibility: 'outside-checkout',
    ...(isSpecialEntry(stat)
      ? { availability: 'unavailable' as const, absenceReason: 'special-entry' as const }
      : { availability: 'available' as const, size: stat.size }),
    sensitive: true,
    ...(classification === undefined ? {} : { classification }),
  };
}

async function walkOutsideDirectory(
  absolutePrefix: Buffer,
  classification: ContextSourceClassification | undefined,
  accumulator: Accumulator,
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  let entries;
  try {
    entries = await readDirentNames(absolutePrefix);
  } catch {
    markIncomplete(accumulator, 'traversal-failed');
    return;
  }
  for (const entry of sortedDirentNames(entries)) {
    if (atCandidateLimit(accumulator, limits)) return;
    const name = entry.name;
    const absolute = outsideChild(absolutePrefix, name);
    const pathHex = absolute.toString('hex');
    if (accumulator.byPath.has(pathHex)) continue;
    if (entry.isDirectory()) {
      if (name.toString('utf8') === '.git' || (await containsGitDirectory(absolute))) {
        accumulator.byPath.set(pathHex, {
          origins: [],
          absolutePath: absolute.toString('utf8'),
          sourceKind: 'nested-repository',
          eligibility: 'outside-checkout',
          availability: 'unavailable',
          absenceReason: 'nested-repository',
          sensitive: true,
          ...(classification === undefined ? {} : { classification }),
        });
        continue;
      }
      await walkOutsideDirectory(absolute, classification, accumulator, limits);
      continue;
    }
    accumulator.byPath.set(pathHex, await outsideCandidate(absolute, classification));
  }
}

async function scopedContextEnumeration(
  context: GitInspectionContext,
  limits: WorkspaceEvidenceLimits,
): Promise<{
  readonly index: IndexEnumeration;
  readonly untrackedIgnored: UntrackedEnumeration;
}> {
  const index = await enumerateIndex(context, limits, limits.maxContextCandidates);
  const untrackedIgnored = await enumerateUntracked(context, limits, limits.maxContextCandidates, true);
  return { index, untrackedIgnored };
}

export async function readContextSourceManifest(
  checkout: string,
  gitDirectory: string,
  request: ContextSourceManifestRequest,
  limits: WorkspaceEvidenceLimits,
): Promise<ContextSourceManifestView> {
  const selections = normalizeContextSourceSelections(request.selections);
  if (!Number.isInteger(request.offset) || request.offset < 0) {
    throw new TypeError('Context manifest windows use a non-negative offset');
  }
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > limits.maxManifestWindowFiles) {
    throw new TypeError('Context manifest windows stay within the manifest window limit');
  }
  const resolved = await resolveContextCandidates(checkout, gitDirectory, selections, limits);
  const ordered = [...resolved.byPath.entries()].sort((left, right) =>
    Buffer.compare(Buffer.from(left[0], 'hex'), Buffer.from(right[0], 'hex')),
  );
  const candidates = ordered.map(([, candidate]) => candidate).slice(request.offset, request.offset + request.limit);
  return {
    kind: 'workspace.context.manifest',
    status: resolved.incomplete === false ? 'complete' : 'incomplete',
    ...(resolved.incomplete === false ? {} : { incompleteReason: resolved.incomplete }),
    selections: contextSelectionSummaries(selections),
    totalCandidates: resolved.byPath.size,
    offset: request.offset,
    candidates,
    nextOffset: request.offset + request.limit < resolved.byPath.size ? request.offset + request.limit : null,
    limits,
  };
}

function contextSelectionSummaries(
  selections: readonly NormalizedContextSelection[],
): readonly ContextSelectionSummary[] {
  const summaries: readonly ContextSelectionSummary[] = selections.map(selection => ({
    origin: selection.origin,
    selection:
      selection.kind === 'outside-file' || selection.kind === 'outside-directory'
        ? {
            kind: 'outside-checkout',
            form: selection.kind === 'outside-file' ? 'file' : 'directory',
            absolutePath: selection.absolute!.toString('utf8'),
          }
        : {
            kind:
              selection.kind === 'file'
                ? 'workspace-file'
                : selection.kind === 'directory'
                  ? 'workspace-directory'
                  : 'workspace-ignored',
            pathBytesBase64: encodeBytesBase64(selection.relative!),
          },
    ...(selection.classification === undefined ? {} : { classification: selection.classification }),
  }));
  return summaries;
}

async function resolveContextCandidates(
  checkout: string,
  gitDirectory: string,
  selections: readonly NormalizedContextSelection[],
  limits: WorkspaceEvidenceLimits,
): Promise<{
  readonly byPath: Map<string, ContextSourceCandidate>;
  readonly incomplete: false | ContextSourceIncompleteReason;
}> {
  const accumulator: Accumulator = { byPath: new Map(), incomplete: false };
  const inCheckoutPrefixes = selections
    .filter(selection => selection.kind !== 'outside-file' && selection.kind !== 'outside-directory')
    .map(selection => selection.relative!);
  let trackedByPath = new Map<string, IndexRecord>();
  let ignoredUntracked: IgnoredUntracked = new Set<string>();
  if (inCheckoutPrefixes.length > 0) {
    try {
      const enumeration = await withGitInspection(checkout, gitDirectory, async context =>
        scopedContextEnumeration(context, limits),
      );
      trackedByPath = scopedTrackedRecords(enumeration.index, inCheckoutPrefixes);
      ignoredUntracked = scopedIgnoredUntracked(enumeration.untrackedIgnored, inCheckoutPrefixes);
    } catch {
      markIncomplete(accumulator, 'inspection-failed');
    }
  }
  for (const selection of selections) {
    const classification = selection.classification;
    if (selection.kind === 'outside-file' || selection.kind === 'outside-directory') {
      if (atCandidateLimit(accumulator, limits)) continue;
      const pathHex = selection.absolute!.toString('hex');
      if (selection.kind === 'outside-file') {
        if (!accumulator.byPath.has(pathHex)) {
          accumulator.byPath.set(pathHex, await outsideCandidate(selection.absolute!, classification));
        }
        continue;
      }
      const stat = await lstatOptional(selection.absolute!);
      if (stat === undefined) {
        markIncomplete(accumulator, 'traversal-failed');
        continue;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        if (!accumulator.byPath.has(pathHex)) {
          accumulator.byPath.set(pathHex, await outsideCandidate(selection.absolute!, classification));
        }
        continue;
      }
      await walkOutsideDirectory(selection.absolute!, classification, accumulator, limits);
      continue;
    }
    const scoped = filterTrackedByPrefix(trackedByPath, selection.relative!);
    if (selection.kind === 'file') {
      const pathHex = selection.relative!.toString('hex');
      if (accumulator.byPath.has(pathHex)) continue;
      accumulator.byPath.set(
        pathHex,
        await inCheckoutCandidate(
          checkout,
          selection.relative!,
          scoped.get(pathHex),
          ignoredUntracked.has(pathHex),
          classification,
        ),
      );
      continue;
    }
    const stat = await lstatOptional(workingPath(checkout, selection.relative!));
    if (stat === undefined) continue;
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      const pathHex = selection.relative!.toString('hex');
      if (accumulator.byPath.has(pathHex)) continue;
      accumulator.byPath.set(
        pathHex,
        await inCheckoutCandidate(
          checkout,
          selection.relative!,
          scoped.get(pathHex),
          ignoredUntracked.has(pathHex),
          classification,
        ),
      );
      continue;
    }
    await walkInCheckoutDirectory(
      checkout,
      selection.relative!,
      workingPath(checkout, selection.relative!),
      scoped,
      ignoredUntracked,
      selection.kind === 'ignored',
      classification,
      accumulator,
      limits,
    );
    // Tracked members the walk cannot see (working files missing from disk) still belong.
    for (const [pathHex, record] of scoped) {
      if (accumulator.byPath.has(pathHex)) continue;
      if (record.mode === GITLINK_MODE) {
        accumulator.byPath.set(
          pathHex,
          await inCheckoutCandidate(checkout, Buffer.from(pathHex, 'hex'), record, false, classification),
        );
        continue;
      }
      accumulator.byPath.set(
        pathHex,
        await inCheckoutCandidate(checkout, Buffer.from(pathHex, 'hex'), record, false, classification),
      );
    }
  }
  // A candidate beneath a directory selection, or equal to a file one, carries its origin.
  for (const [pathHex, candidate] of accumulator.byPath) {
    const origins = new Set<number>(candidate.origins);
    const relative = Buffer.from(pathHex, 'hex');
    for (const selection of selections) {
      if (selection.kind === 'outside-file' || selection.kind === 'outside-directory') {
        if (selection.absolute!.equals(Buffer.from(candidate.absolutePath ?? '\u0000', 'utf8'))) {
          origins.add(selection.origin);
          continue;
        }
        const candidateAbsolute = Buffer.from(candidate.absolutePath ?? '', 'utf8');
        const selected = selection.absolute!;
        if (selection.kind === 'outside-directory' && outsideUnder(candidateAbsolute, selected)) {
          origins.add(selection.origin);
        }
        continue;
      }
      if (selection.kind === 'file') {
        if (relative.equals(selection.relative!)) origins.add(selection.origin);
        continue;
      }
      if (relative.equals(selection.relative!) || pathUnderPrefix(relative, selection.relative!)) {
        origins.add(selection.origin);
      }
    }
    const orderedOrigins = [...origins].sort((left, right) => left - right);
    if (orderedOrigins.length !== candidate.origins.length) {
      accumulator.byPath.set(pathHex, { ...candidate, origins: orderedOrigins });
    }
  }
  return { byPath: accumulator.byPath, incomplete: accumulator.incomplete };
}

/** Closed context capture intent: whole-source scope when the range is absent. */
export interface ContextSourceByteScope {
  readonly kind: 'bytes';
  readonly offset: number;
  readonly length: number;
}

export interface ContextSourceCaptureRequest {
  readonly kind: 'workspace.context.capture';
  readonly selections: readonly (ContextSourceSelection & {
    readonly classification?: ContextSourceClassification;
    readonly scope?: ContextSourceByteScope;
  })[];
}

export type ContextSourceCaptureStatus = 'captured' | 'unavailable' | 'over-limit' | 'excluded';

export type ContextSourceCaptureLimitation = ContextSourceAbsenceReason | 'file-limit' | 'aggregate-limit';

export interface ContextSourceCaptureItem {
  readonly origins: readonly number[];
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly sourceKind: ContextSourceCandidateKind;
  readonly eligibility: ContextSourceEligibility;
  readonly gitMode?: string;
  readonly sourceSize?: number;
  readonly sourceAvailability: ContextSourceAvailability;
  readonly sourceAbsenceReason?: ContextSourceAbsenceReason;
  readonly sensitive: boolean;
  readonly classification?: ContextSourceClassification;
  /** Tracked candidates keep their index blob identity as a source witness. */
  readonly sourceIdentity?: string;
  readonly status: ContextSourceCaptureStatus;
  /** Exact captured byte length for captured items; observed source size for over-limit items. */
  readonly byteLength?: number;
  /** SHA-256 of the exact captured bytes. */
  readonly contentDigest?: string;
  readonly reason?: ContextSourceCaptureLimitation;
}

/** Owner-supplied admission is pure policy; Workspace Evidence still owns capture. */
export type ContextSourceCaptureAdmission = (candidate: ContextSourceCandidate) => 'included' | 'excluded';

export interface ContextSourceCaptureReadyView {
  readonly kind: 'workspace.context.capture';
  readonly status: 'ready';
  readonly captureIdentity: string;
  readonly items: readonly ContextSourceCaptureItem[];
  readonly limits: WorkspaceEvidenceLimits;
}

export interface ContextSourceCaptureUnavailableView {
  readonly kind: 'workspace.context.capture';
  readonly status: 'unavailable';
  readonly reason: ContextSourceIncompleteReason | 'unstable-workspace';
  readonly limits: WorkspaceEvidenceLimits;
}

export type ContextSourceCaptureView = ContextSourceCaptureReadyView | ContextSourceCaptureUnavailableView;

export interface ContextSourceContentRequest {
  readonly kind: 'workspace.context.content';
  readonly captureIdentity: string;
  /** Exact repository-relative path bytes; absent for outside-checkout candidates. */
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  /** Present addresses one captured union segment; absent addresses a whole-source capture. */
  readonly scope?: ContextSourceByteScope;
  readonly offset: number;
  readonly length: number;
}

export interface ContextSourceContentAvailableView {
  readonly kind: 'workspace.context.content';
  readonly status: 'available';
  readonly captureIdentity: string;
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly offset: number;
  readonly byteLength: number;
  readonly totalByteLength: number;
  readonly bytesBase64: string;
}

export interface ContextSourceContentUnavailableView {
  readonly kind: 'workspace.context.content';
  readonly status: 'unavailable';
  readonly captureIdentity: string;
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly reason: 'capture-not-retained' | 'candidate-not-captured';
}

export type ContextSourceContentView = ContextSourceContentAvailableView | ContextSourceContentUnavailableView;

const CONTEXT_CAPTURE_ID_PATTERN = /^cctx_[0-9a-f-]{36}$/u;

export interface RetainedContextCapture {
  readonly view: ContextSourceCaptureView;
  readonly bytes: ReadonlyMap<string, Buffer>;
  /** Per-occurrence admission plan: whole source or the exact captured intervals. */
  readonly plans: ReadonlyMap<string, ContextOccurrencePlan>;
  readonly selections: readonly NormalizedContextSelection[];
  /** Settled candidate-fact fingerprints at capture time; verify compares against these. */
  readonly fingerprints: ReadonlyMap<string, string>;
}

export interface ContextOccurrencePlan {
  readonly whole: boolean;
  readonly intervals: readonly ContextSourceByteScope[];
}

function segmentKey(pathHex: string, scope: ContextSourceByteScope): string {
  return `${pathHex}#${scope.offset}#${scope.length}`;
}

function normalizeContextScope(
  scope: ContextSourceByteScope | undefined,
  limits: WorkspaceEvidenceLimits,
): ContextSourceByteScope | undefined {
  if (scope === undefined) return undefined;
  if (
    scope.kind !== 'bytes' ||
    !Number.isInteger(scope.offset) ||
    scope.offset < 0 ||
    !Number.isInteger(scope.length) ||
    scope.length < 1 ||
    scope.length > limits.maxCapturedFileBytes
  ) {
    throw new TypeError('Context byte scopes carry a bounded half-open range');
  }
  return scope;
}

function candidateFactsFingerprint(candidate: ContextSourceCandidate): string {
  return JSON.stringify({
    origins: candidate.origins,
    pathBytesBase64: candidate.pathBytesBase64,
    absolutePath: candidate.absolutePath,
    sourceKind: candidate.sourceKind,
    eligibility: candidate.eligibility,
    gitMode: candidate.gitMode,
    contentIdentity: candidate.contentIdentity,
    size: candidate.size,
    availability: candidate.availability,
    absenceReason: candidate.absenceReason,
    sensitive: candidate.sensitive,
    classification: candidate.classification,
  });
}

async function readWholeFile(absolute: Buffer): Promise<Buffer | undefined> {
  try {
    return await readFile(absolute);
  } catch {
    return undefined;
  }
}

async function readByteRange(absolute: Buffer, offset: number, length: number): Promise<Buffer | undefined> {
  const handle = await open(absolute, 'r').catch(() => undefined);
  if (handle === undefined) return undefined;
  try {
    const buffer = Buffer.alloc(length);
    const read = await handle.read(buffer, 0, length, offset);
    return buffer.subarray(0, read.bytesRead);
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

function contextCaptureItem(
  candidate: ContextSourceCandidate,
  result:
    | { readonly status: 'captured'; readonly byteLength: number; readonly digest: string }
    | { readonly status: 'over-limit'; readonly reason: 'file-limit' | 'aggregate-limit'; readonly byteLength?: number }
    | { readonly status: 'unavailable'; readonly reason: ContextSourceCaptureLimitation }
    | { readonly status: 'excluded' },
): ContextSourceCaptureItem {
  const base = {
    origins: candidate.origins,
    sourceKind: candidate.sourceKind,
    eligibility: candidate.eligibility,
    ...(candidate.gitMode === undefined ? {} : { gitMode: candidate.gitMode }),
    ...(candidate.size === undefined ? {} : { sourceSize: candidate.size }),
    sourceAvailability: candidate.availability,
    ...(candidate.absenceReason === undefined ? {} : { sourceAbsenceReason: candidate.absenceReason }),
    sensitive: candidate.sensitive,
    status: result.status,
  };
  const located =
    candidate.pathBytesBase64 === undefined
      ? { ...base, absolutePath: candidate.absolutePath! }
      : { ...base, pathBytesBase64: candidate.pathBytesBase64 };
  const classified =
    candidate.classification === undefined ? located : { ...located, classification: candidate.classification };
  const sourced =
    candidate.contentIdentity === undefined ? classified : { ...classified, sourceIdentity: candidate.contentIdentity };
  if (result.status === 'captured') {
    return { ...sourced, byteLength: result.byteLength, contentDigest: result.digest };
  }
  if (result.status === 'over-limit') {
    return result.byteLength === undefined
      ? { ...sourced, reason: result.reason }
      : { ...sourced, byteLength: result.byteLength, reason: result.reason };
  }
  return result.status === 'excluded' ? sourced : { ...sourced, reason: result.reason };
}

async function capturedContextBytesStillMatch(
  checkout: string,
  candidates: ReadonlyMap<string, ContextSourceCandidate>,
  plans: ReadonlyMap<string, ContextOccurrencePlan>,
  bytes: ReadonlyMap<string, Buffer>,
): Promise<boolean> {
  for (const [pathHex, plan] of plans) {
    const candidate = candidates.get(pathHex);
    if (candidate === undefined) return false;
    const absolute =
      candidate.pathBytesBase64 === undefined
        ? Buffer.from(candidate.absolutePath ?? '', 'utf8')
        : workingPath(checkout, Buffer.from(candidate.pathBytesBase64, 'base64'));
    if (plan.whole) {
      const expected = bytes.get(pathHex);
      if (expected === undefined) continue;
      const current =
        candidate.sourceKind === 'symlink' ? await readSymlinkTarget(absolute) : await readWholeFile(absolute);
      if (current === undefined || !current.equals(expected)) return false;
      continue;
    }
    for (const interval of plan.intervals) {
      const expected = bytes.get(segmentKey(pathHex, interval));
      if (expected === undefined) continue;
      const current =
        candidate.sourceKind === 'symlink'
          ? (await readSymlinkTarget(absolute))?.subarray(interval.offset, interval.offset + interval.length)
          : await readByteRange(absolute, interval.offset, interval.length);
      if (current === undefined || !current.equals(expected)) return false;
    }
  }
  return true;
}

/**
 * Expands one closed context capture request into exact immutable bytes per candidate,
 * re-deriving manifest facts and admitted bytes before publishing. Optional admission
 * policy comes from the semantic owner and cannot broaden source reads.
 */
export async function readContextSourceCapture(
  checkout: string,
  gitDirectory: string,
  request: ContextSourceCaptureRequest,
  limits: WorkspaceEvidenceLimits,
  afterContent?: (attempt: number) => void | Promise<void>,
  admission?: ContextSourceCaptureAdmission,
): Promise<RetainedContextCapture> {
  const selections = normalizeContextSourceSelections(request.selections).map((selection, index) => ({
    ...selection,
    scope: normalizeContextScope(
      (request.selections[index] as { readonly scope?: ContextSourceByteScope } | undefined)?.scope,
      limits,
    ),
  }));
  let previousFingerprints: Map<string, string> | undefined;
  for (let attempt = 1; attempt <= limits.maxCaptureAttempts; attempt += 1) {
    let resolved;
    try {
      resolved = await resolveContextCandidates(checkout, gitDirectory, selections, limits);
    } catch {
      return {
        view: { kind: 'workspace.context.capture', status: 'unavailable', reason: 'inspection-failed', limits },
        bytes: new Map(),
        plans: new Map(),
        selections: [],
        fingerprints: new Map(),
      };
    }
    if (resolved.incomplete !== false) {
      return {
        view: { kind: 'workspace.context.capture', status: 'unavailable', reason: resolved.incomplete, limits },
        bytes: new Map(),
        plans: new Map(),
        selections: [],
        fingerprints: new Map(),
      };
    }
    const fingerprints = new Map<string, string>();
    for (const [pathHex, candidate] of resolved.byPath) {
      fingerprints.set(pathHex, candidateFactsFingerprint(candidate));
    }
    if (
      previousFingerprints !== undefined &&
      (previousFingerprints.size !== fingerprints.size ||
        [...previousFingerprints].some(([pathHex, fingerprint]) => fingerprints.get(pathHex) !== fingerprint))
    ) {
      previousFingerprints = fingerprints;
      continue;
    }
    previousFingerprints = fingerprints;
    const bytes = new Map<string, Buffer>();
    const plans = new Map<string, ContextOccurrencePlan>();
    const items: ContextSourceCaptureItem[] = [];
    let admitted = 0;
    let aggregateExceeded = false;
    for (const [pathHex, candidate] of [...resolved.byPath.entries()].sort((left, right) =>
      Buffer.compare(Buffer.from(left[0], 'hex'), Buffer.from(right[0], 'hex')),
    )) {
      if (admission?.(candidate) === 'excluded') {
        items.push(contextCaptureItem(candidate, { status: 'excluded' }));
        continue;
      }
      // Every admitting selection contributes its scope; whole source subsumes ranges.
      const scopes: (ContextSourceByteScope | undefined)[] = candidate.origins.map(origin => selections[origin]?.scope);
      const whole = scopes.some(scope => scope === undefined);
      const intervals = whole
        ? []
        : mergeIntervals(
            [...new Map(scopes.map(scope => [`${scope!.offset}#${scope!.length}`, scope!])).values()].map(
              scope => scope!,
            ),
          );
      plans.set(pathHex, whole ? { whole: true, intervals: [] } : { whole: false, intervals });
      if (candidate.availability !== 'available' || candidate.sourceKind === 'special') {
        items.push(
          contextCaptureItem(candidate, { status: 'unavailable', reason: candidate.absenceReason ?? 'unreadable' }),
        );
        continue;
      }
      const absolute =
        candidate.pathBytesBase64 === undefined
          ? Buffer.from(candidate.absolutePath ?? '', 'utf8')
          : workingPath(checkout, Buffer.from(candidate.pathBytesBase64, 'base64'));
      const capturePlan: { readonly whole: boolean; readonly intervals: readonly ContextSourceByteScope[] } = whole
        ? { whole: true, intervals: [] }
        : { whole: false, intervals };
      let capturedBytes: Buffer[] = [];
      let overLimit: { readonly byteLength?: number } | undefined;
      if (capturePlan.whole) {
        if (candidate.sourceKind === 'symlink') {
          const target = await readSymlinkTarget(absolute);
          if (target === undefined) overLimit = {};
          else capturedBytes = [target];
        } else {
          const stat = await lstatOptional(absolute);
          if (stat === undefined || stat.size > limits.maxCapturedFileBytes) {
            overLimit = stat === undefined ? {} : { byteLength: stat.size };
          } else {
            const read = await readWholeFile(absolute);
            if (read === undefined) overLimit = {};
            else if (read.byteLength > limits.maxCapturedFileBytes) overLimit = { byteLength: read.byteLength };
            else capturedBytes = [read];
          }
        }
      } else {
        for (const interval of capturePlan.intervals) {
          let segment: Buffer | undefined;
          if (candidate.sourceKind === 'symlink') {
            const target = await readSymlinkTarget(absolute);
            segment =
              target === undefined ? undefined : target.subarray(interval.offset, interval.offset + interval.length);
          } else {
            segment = await readByteRange(absolute, interval.offset, interval.length);
          }
          if (segment === undefined) {
            overLimit = {};
            break;
          }
          capturedBytes.push(segment);
        }
      }
      if (overLimit !== undefined) {
        if (overLimit.byteLength !== undefined) {
          items.push(
            contextCaptureItem(candidate, {
              status: 'over-limit',
              reason: 'file-limit',
              byteLength: overLimit.byteLength,
            }),
          );
        } else {
          const still = await lstatOptional(absolute);
          items.push(
            contextCaptureItem(candidate, {
              status: 'unavailable',
              reason: still === undefined ? 'missing-working-file' : 'unreadable',
            }),
          );
        }
        continue;
      }
      if (aggregateExceeded) {
        items.push(
          contextCaptureItem(candidate, {
            status: 'over-limit',
            reason: 'aggregate-limit',
            ...(candidate.size === undefined ? {} : { byteLength: candidate.size }),
          }),
        );
        continue;
      }
      const totalBytes = capturedBytes.reduce((total, segment) => total + segment.byteLength, 0);
      if (admitted + totalBytes > limits.maxCapturedContentBytes) {
        aggregateExceeded = true;
        items.push(
          contextCaptureItem(candidate, {
            status: 'over-limit',
            reason: 'aggregate-limit',
            ...(candidate.size === undefined ? { byteLength: totalBytes } : { byteLength: candidate.size }),
          }),
        );
        continue;
      }
      admitted += totalBytes;
      if (capturePlan.whole) {
        bytes.set(pathHex, capturedBytes[0] ?? Buffer.alloc(0));
      } else {
        capturePlan.intervals.forEach((interval, index) => {
          bytes.set(segmentKey(pathHex, interval), capturedBytes[index] ?? Buffer.alloc(0));
        });
      }
      items.push(
        contextCaptureItem(candidate, {
          status: 'captured',
          byteLength: totalBytes,
          digest: sha256(Buffer.concat(capturedBytes)),
        }),
      );
    }
    await afterContent?.(attempt);
    const rederived = await resolveContextCandidates(checkout, gitDirectory, selections, limits);
    if (rederived.incomplete !== false) {
      return {
        view: { kind: 'workspace.context.capture', status: 'unavailable', reason: rederived.incomplete, limits },
        bytes: new Map(),
        plans: new Map(),
        selections: [],
        fingerprints: new Map(),
      };
    }
    const rederivedFingerprints = new Map<string, string>();
    for (const [pathHex, candidate] of rederived.byPath) {
      rederivedFingerprints.set(pathHex, candidateFactsFingerprint(candidate));
    }
    const stableFacts =
      rederivedFingerprints.size === fingerprints.size &&
      [...rederivedFingerprints].every(([pathHex, fingerprint]) => fingerprints.get(pathHex) === fingerprint);
    const stableBytes = stableFacts && (await capturedContextBytesStillMatch(checkout, rederived.byPath, plans, bytes));
    if (stableBytes) {
      const identity = `cctx_${randomUUID()}`;
      return {
        view: {
          kind: 'workspace.context.capture',
          status: 'ready',
          captureIdentity: identity,
          items,
          limits,
        },
        bytes,
        plans,
        selections,
        fingerprints,
      };
    }
  }
  return {
    view: { kind: 'workspace.context.capture', status: 'unavailable', reason: 'unstable-workspace', limits },
    bytes: new Map(),
    plans: new Map(),
    selections: [],
    fingerprints: new Map(),
  };
}

export function readContextSourceContentWindow(
  retained: ReadonlyMap<string, RetainedContextCapture>,
  request: ContextSourceContentRequest,
  limits: WorkspaceEvidenceLimits,
): ContextSourceContentView {
  if (!CONTEXT_CAPTURE_ID_PATTERN.test(request.captureIdentity)) {
    throw new TypeError('Invalid context capture identity');
  }
  if ((request.pathBytesBase64 === undefined) === (request.absolutePath === undefined)) {
    throw new TypeError('Context content windows name exactly one candidate path');
  }
  if (!Number.isInteger(request.offset) || request.offset < 0) {
    throw new TypeError('Context content windows use a non-negative offset');
  }
  if (!Number.isInteger(request.length) || request.length < 1 || request.length > limits.maxContentWindowBytes) {
    throw new TypeError('Context content windows stay within the content window limit');
  }
  const located =
    request.pathBytesBase64 === undefined
      ? { absolutePath: request.absolutePath! }
      : { pathBytesBase64: request.pathBytesBase64 };
  const unavailable = (reason: 'capture-not-retained' | 'candidate-not-captured'): ContextSourceContentView => ({
    kind: 'workspace.context.content',
    status: 'unavailable',
    captureIdentity: request.captureIdentity,
    ...located,
    reason,
  });
  const capture = retained.get(request.captureIdentity);
  if (capture === undefined) return unavailable('capture-not-retained');
  const pathHex =
    request.pathBytesBase64 === undefined
      ? Buffer.from(request.absolutePath ?? '', 'utf8').toString('hex')
      : Buffer.from(request.pathBytesBase64, 'base64').toString('hex');
  const scope = normalizeContextScope(request.scope, limits);
  const key = scope === undefined ? pathHex : segmentKey(pathHex, scope);
  let bytes = capture.bytes.get(key);
  if (bytes === undefined && scope !== undefined) {
    const plan = capture.plans.get(pathHex);
    const containing = plan?.intervals.find(
      interval => scope.offset >= interval.offset && scope.offset + scope.length <= interval.offset + interval.length,
    );
    const containingBytes = containing === undefined ? undefined : capture.bytes.get(segmentKey(pathHex, containing));
    if (containing !== undefined && containingBytes !== undefined) {
      const relative = scope.offset - containing.offset;
      bytes = containingBytes.subarray(relative, relative + scope.length);
    }
  }
  if (bytes === undefined) return unavailable('candidate-not-captured');
  const slice = bytes.subarray(request.offset, request.offset + request.length);
  return {
    kind: 'workspace.context.content',
    status: 'available',
    captureIdentity: request.captureIdentity,
    ...located,
    offset: request.offset,
    byteLength: slice.byteLength,
    totalByteLength: bytes.byteLength,
    bytesBase64: encodeBytesBase64(slice),
  };
}

export interface ContextSourceResolutionRequest {
  readonly kind: 'workspace.context.resolution';
  readonly captureIdentity: string;
}

export interface ContextSourceOccurrence {
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly origins: readonly number[];
  readonly scope:
    | { readonly kind: 'whole' }
    | { readonly kind: 'bytes'; readonly intervals: readonly ContextSourceByteScope[] };
  /** Total exact bytes captured for this occurrence across its segments. */
  readonly byteLength: number;
}

export interface ContextSourceGroup {
  readonly origin: number;
  readonly selection: ContextSourceSelection;
  /** Occurrence paths admitted by this group in stable lossless path-byte order. */
  readonly occurrencePaths: readonly string[];
}

/** A live saved source and an immutable unsaved Editor occurrence stay deliberately distinct. */
export interface ContextSourceOccurrenceConflict {
  readonly kind: 'saved-versus-unsaved';
  readonly nominalSource:
    | { readonly kind: 'workspace'; readonly pathBytesBase64: string }
    | { readonly kind: 'outside-checkout'; readonly absolutePath: string };
  readonly liveOccurrence: {
    readonly kind: 'context-locator';
    readonly origins: readonly number[];
  };
  readonly immutableOccurrence: {
    readonly kind: 'editor-context-contribution';
    readonly occurrenceIdentity: string;
    readonly ruleIdentity: string;
    readonly sourceGroupOrder: number;
    readonly scope: { readonly kind: 'whole' } | ContextSourceByteScope;
  };
  readonly resolution: 'keep-distinct';
}

export interface ContextSourceResolutionView {
  readonly kind: 'workspace.context.resolution';
  readonly captureIdentity: string;
  readonly groups: readonly ContextSourceGroup[];
  readonly occurrences: readonly ContextSourceOccurrence[];
  /** P20 has no declared immutable occurrences; Reviewing composes these in P21. */
  readonly conflicts: readonly ContextSourceOccurrenceConflict[];
}

function mergeIntervals(intervals: readonly ContextSourceByteScope[]): readonly ContextSourceByteScope[] {
  const sorted = [...intervals].sort((left, right) => left.offset - right.offset || left.length - right.length);
  const merged: ContextSourceByteScope[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && interval.offset <= last.offset + last.length) {
      const end = Math.max(last.offset + last.length, interval.offset + interval.length);
      merged[merged.length - 1] = { kind: 'bytes', offset: last.offset, length: end - last.offset };
      continue;
    }
    merged.push({ kind: 'bytes', offset: interval.offset, length: interval.length });
  }
  return merged;
}

export function readContextSourceResolution(
  retained: ReadonlyMap<string, RetainedContextCapture>,
  request: ContextSourceResolutionRequest,
): ContextSourceResolutionView {
  if (!CONTEXT_CAPTURE_ID_PATTERN.test(request.captureIdentity)) {
    throw new TypeError('Invalid context capture identity');
  }
  const capture = retained.get(request.captureIdentity);
  if (capture === undefined || capture.view.status !== 'ready') {
    throw new TypeError('Context resolution requires one retained ready capture');
  }
  const capturedItems = capture.view.items.filter(item => item.status === 'captured');
  const occurrences: ContextSourceOccurrence[] = capturedItems
    .map((item): ContextSourceOccurrence => {
      const keyHex =
        item.pathBytesBase64 === undefined
          ? Buffer.from(item.absolutePath ?? '', 'utf8').toString('hex')
          : Buffer.from(item.pathBytesBase64, 'base64').toString('hex');
      const plan = capture.plans.get(keyHex);
      const scope: ContextSourceOccurrence['scope'] =
        plan === undefined || plan.whole
          ? { kind: 'whole' }
          : { kind: 'bytes', intervals: mergeIntervals(plan.intervals) };
      const byteLength =
        plan === undefined || plan.whole
          ? (capture.bytes.get(keyHex)?.byteLength ?? 0)
          : plan.intervals.reduce(
              (total, interval) => total + (capture.bytes.get(segmentKey(keyHex, interval))?.byteLength ?? 0),
              0,
            );
      return {
        ...(item.pathBytesBase64 === undefined
          ? { absolutePath: item.absolutePath! }
          : { pathBytesBase64: item.pathBytesBase64 }),
        origins: item.origins,
        scope,
        byteLength,
      };
    })
    .sort((left, right) => {
      const leftKey = left.pathBytesBase64 ?? left.absolutePath ?? '';
      const rightKey = right.pathBytesBase64 ?? right.absolutePath ?? '';
      return Buffer.compare(Buffer.from(leftKey, 'utf8'), Buffer.from(rightKey, 'utf8'));
    });
  const groups: ContextSourceGroup[] = capture.selections.map(selection => ({
    origin: selection.origin,
    selection: contextSelectionSummaries([selection])[0]!.selection,
    occurrencePaths: capturedItems
      .filter(item => item.origins.includes(selection.origin))
      .map(item =>
        item.pathBytesBase64 === undefined
          ? (item.absolutePath ?? '')
          : Buffer.from(item.pathBytesBase64, 'base64').toString('utf8'),
      )
      .sort((left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))),
  }));
  return {
    kind: 'workspace.context.resolution',
    captureIdentity: request.captureIdentity,
    groups,
    occurrences,
    conflicts: [],
  };
}

export interface ContextSelectionVerifyRequest {
  readonly kind: 'workspace.context.verify';
  readonly captureIdentity: string;
}

export type ContextItemCurrency = 'current' | 'changed' | 'missing' | 'unavailable' | 'over-limit' | 'added';

export interface ContextItemVerdict {
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly origins: readonly number[];
  readonly currency: ContextItemCurrency;
  /** Current source size for missing/over-limit/changed verdicts when observable. */
  readonly byteLength?: number;
  readonly reason?: ContextSourceCaptureLimitation;
}

export interface ContextSelectionVerifyView {
  readonly kind: 'workspace.context.verify';
  readonly captureIdentity: string;
  readonly status: 'settled' | 'unstable' | 'unverifiable';
  readonly reason?: ContextSourceIncompleteReason | 'unstable-workspace';
  readonly verdicts: readonly ContextItemVerdict[];
}

/**
 * Revalidates one retained capture coherently: two consecutive equal manifest
 * derivations publish per-item currency verdicts; anything less stays explicit.
 */
export async function readContextSourceVerify(
  retained: ReadonlyMap<string, RetainedContextCapture>,
  checkout: string,
  gitDirectory: string,
  request: ContextSelectionVerifyRequest,
  limits: WorkspaceEvidenceLimits,
): Promise<ContextSelectionVerifyView> {
  if (!CONTEXT_CAPTURE_ID_PATTERN.test(request.captureIdentity)) {
    throw new TypeError('Invalid context capture identity');
  }
  const capture = retained.get(request.captureIdentity);
  if (capture === undefined || capture.view.status !== 'ready') {
    throw new TypeError('Context verification requires one retained ready capture');
  }
  let previousFingerprints: Map<string, string> | undefined;
  let settled:
    | {
        readonly byPath: Map<string, ContextSourceCandidate>;
        readonly incomplete: false | ContextSourceIncompleteReason;
      }
    | undefined;
  for (let attempt = 1; attempt <= limits.maxCaptureAttempts; attempt += 1) {
    const current = await resolveContextCandidates(checkout, gitDirectory, capture.selections, limits);
    if (current.incomplete !== false) {
      return {
        kind: 'workspace.context.verify',
        captureIdentity: request.captureIdentity,
        status: 'unverifiable',
        reason: current.incomplete,
        verdicts: [],
      };
    }
    const fingerprints = new Map<string, string>();
    for (const [pathHex, candidate] of current.byPath) {
      fingerprints.set(pathHex, candidateFactsFingerprint(candidate));
    }
    if (
      previousFingerprints !== undefined &&
      previousFingerprints.size === fingerprints.size &&
      [...previousFingerprints].every(([pathHex, fingerprint]) => fingerprints.get(pathHex) === fingerprint)
    ) {
      settled = current;
      break;
    }
    previousFingerprints = fingerprints;
  }
  if (settled === undefined) {
    return {
      kind: 'workspace.context.verify',
      captureIdentity: request.captureIdentity,
      status: 'unstable',
      reason: 'unstable-workspace',
      verdicts: [],
    };
  }
  const verdicts: ContextItemVerdict[] = [];
  for (const item of capture.view.items) {
    const keyHex =
      item.pathBytesBase64 === undefined
        ? Buffer.from(item.absolutePath ?? '', 'utf8').toString('hex')
        : Buffer.from(item.pathBytesBase64, 'base64').toString('hex');
    const current = settled.byPath.get(keyHex);
    const located =
      item.pathBytesBase64 === undefined
        ? { absolutePath: item.absolutePath! }
        : { pathBytesBase64: item.pathBytesBase64 };
    const base = { ...located, origins: item.origins };
    if (item.status === 'excluded') {
      verdicts.push({ ...base, currency: 'current' });
      continue;
    }
    if (current === undefined) {
      verdicts.push({ ...base, currency: 'missing' });
      continue;
    }
    if (current.availability === 'working-missing') {
      verdicts.push({ ...base, currency: 'missing' });
      continue;
    }
    if (current.availability === 'unavailable') {
      verdicts.push({
        ...base,
        currency: 'unavailable',
        reason: current.absenceReason ?? 'unreadable',
      });
      continue;
    }
    const plan = capture.plans.get(keyHex);
    if (
      (plan === undefined || plan.whole) &&
      current.size !== undefined &&
      current.size > limits.maxCapturedFileBytes
    ) {
      verdicts.push({ ...base, currency: 'over-limit', byteLength: current.size });
      continue;
    }
    if (item.status === 'unavailable' || item.status === 'over-limit') {
      verdicts.push({
        ...base,
        currency: 'changed',
        ...(current.size === undefined ? {} : { byteLength: current.size }),
      });
      continue;
    }
    const absolute =
      current.pathBytesBase64 === undefined
        ? Buffer.from(current.absolutePath ?? '', 'utf8')
        : workingPath(checkout, Buffer.from(current.pathBytesBase64, 'base64'));
    const reads: Buffer[] = [];
    if (plan === undefined || plan.whole) {
      const read = current.sourceKind === 'symlink' ? await readSymlinkTarget(absolute) : await readWholeFile(absolute);
      if (read !== undefined) reads.push(read);
    } else {
      for (const interval of plan.intervals) {
        const read =
          current.sourceKind === 'symlink'
            ? (await readSymlinkTarget(absolute))?.subarray(interval.offset, interval.offset + interval.length)
            : await readByteRange(absolute, interval.offset, interval.length);
        if (read === undefined) break;
        reads.push(read);
      }
    }
    if (reads.length !== (plan === undefined || plan.whole ? 1 : plan.intervals.length)) {
      verdicts.push({ ...base, currency: 'unavailable', reason: 'unreadable' });
      continue;
    }
    const itemDigest = item.contentDigest;
    if (itemDigest !== undefined && sha256(Buffer.concat(reads)) === itemDigest) {
      verdicts.push({ ...base, currency: 'current' });
      continue;
    }
    verdicts.push({
      ...base,
      currency: 'changed',
      ...(current.size === undefined ? {} : { byteLength: current.size }),
    });
  }
  return {
    kind: 'workspace.context.verify',
    captureIdentity: request.captureIdentity,
    status: 'settled',
    verdicts,
  };
}

/** One persisted locator occurrence's exact witness, supplied by the Snapshot basis owner. */
export interface ContextRevalidateOccurrence {
  readonly pathBytesBase64?: string;
  readonly absolutePath?: string;
  readonly status: ContextSourceCaptureStatus;
  readonly whole: boolean;
  readonly intervals: readonly ContextSourceByteScope[];
  /** Captured occurrences carry the digest of their concatenated planned segments. */
  readonly contentDigest?: string;
  /** Exact identity witnesses: movement of any of them is byte-independent. */
  readonly sourceKind?: ContextSourceCandidateKind;
  readonly gitMode?: string;
  readonly sourceSize?: number;
}

export interface ContextSelectionRevalidateRequest {
  readonly kind: 'workspace.context.revalidate';
  /** Complete locator intent: membership is enumerated from these, not from the witnesses. */
  readonly selections: readonly (ContextSourceSelection & {
    readonly classification?: ContextSourceClassification;
  })[];
  readonly occurrences: readonly ContextRevalidateOccurrence[];
}

export interface ContextSelectionRevalidateView {
  readonly kind: 'workspace.context.revalidate';
  readonly status: 'settled' | 'unstable' | 'unverifiable';
  readonly reason?: ContextSourceIncompleteReason | 'unstable-workspace';
  readonly verdicts: readonly ContextItemVerdict[];
}

/**
 * Revalidates persisted locator witnesses against one complete live membership
 * derivation: two consecutive equal derivations publish per-occurrence verdicts
 * plus `added` verdicts for newly admitted candidates; anything less stays explicit.
 */
export async function readContextSourceRevalidate(
  checkout: string,
  gitDirectory: string,
  request: ContextSelectionRevalidateRequest,
  limits: WorkspaceEvidenceLimits,
  admission: ContextSourceCaptureAdmission,
): Promise<ContextSelectionRevalidateView> {
  const selections = normalizeContextSourceSelections(request.selections);
  if (request.occurrences.length > MAX_CONTEXT_SELECTIONS * limits.maxContextCandidates) {
    throw new TypeError('Revalidate witnesses exceed the bounded occurrence budget');
  }
  let previousFingerprints: Map<string, string> | undefined;
  let settled:
    | {
        readonly byPath: Map<string, ContextSourceCandidate>;
        readonly incomplete: false | ContextSourceIncompleteReason;
      }
    | undefined;
  for (let attempt = 1; attempt <= limits.maxCaptureAttempts; attempt += 1) {
    const current = await resolveContextCandidates(checkout, gitDirectory, selections, limits);
    if (current.incomplete !== false) {
      return {
        kind: 'workspace.context.revalidate',
        status: 'unverifiable',
        reason: current.incomplete,
        verdicts: [],
      };
    }
    const fingerprints = new Map<string, string>();
    for (const [pathHex, candidate] of current.byPath) {
      fingerprints.set(pathHex, candidateFactsFingerprint(candidate));
    }
    if (
      previousFingerprints !== undefined &&
      previousFingerprints.size === fingerprints.size &&
      [...previousFingerprints].every(([pathHex, fingerprint]) => fingerprints.get(pathHex) === fingerprint)
    ) {
      settled = current;
      break;
    }
    previousFingerprints = fingerprints;
  }
  if (settled === undefined) {
    return {
      kind: 'workspace.context.revalidate',
      status: 'unstable',
      reason: 'unstable-workspace',
      verdicts: [],
    };
  }
  const verdicts: ContextItemVerdict[] = [];
  const witnessed = new Set<string>();
  for (const occurrence of request.occurrences) {
    const keyHex =
      occurrence.pathBytesBase64 === undefined
        ? Buffer.from(occurrence.absolutePath ?? '', 'utf8').toString('hex')
        : Buffer.from(occurrence.pathBytesBase64, 'base64').toString('hex');
    witnessed.add(keyHex);
    const current = settled.byPath.get(keyHex);
    const located =
      occurrence.pathBytesBase64 === undefined
        ? { absolutePath: occurrence.absolutePath! }
        : { pathBytesBase64: occurrence.pathBytesBase64 };
    const base = { ...located, origins: [] as readonly number[] };
    if (occurrence.status === 'excluded') {
      // Excluded movement is irrelevant by definition; the verdict stays observable.
      verdicts.push({ ...base, origins: current?.origins ?? [], currency: 'current' });
      continue;
    }
    if (current === undefined || current.availability === 'working-missing') {
      verdicts.push({ ...base, origins: current?.origins ?? [], currency: 'missing' });
      continue;
    }
    if (current.availability === 'unavailable') {
      verdicts.push({
        ...base,
        origins: current.origins,
        currency: 'unavailable',
        reason: current.absenceReason ?? 'unreadable',
      });
      continue;
    }
    if (occurrence.whole && current.size !== undefined && current.size > limits.maxCapturedFileBytes) {
      verdicts.push({ ...base, origins: current.origins, currency: 'over-limit', byteLength: current.size });
      continue;
    }
    if (occurrence.status === 'unavailable' || occurrence.status === 'over-limit') {
      verdicts.push({
        ...base,
        origins: current.origins,
        currency: 'changed',
        ...(current.size === undefined ? {} : { byteLength: current.size }),
      });
      continue;
    }
    if (
      (occurrence.sourceKind !== undefined && current.sourceKind !== occurrence.sourceKind) ||
      (occurrence.gitMode !== undefined && current.gitMode !== occurrence.gitMode) ||
      (occurrence.sourceSize !== undefined && current.size !== occurrence.sourceSize)
    ) {
      verdicts.push({
        ...base,
        origins: current.origins,
        currency: 'changed',
        ...(current.size === undefined ? {} : { byteLength: current.size }),
      });
      continue;
    }
    const absolute =
      current.pathBytesBase64 === undefined
        ? Buffer.from(current.absolutePath ?? '', 'utf8')
        : workingPath(checkout, Buffer.from(current.pathBytesBase64, 'base64'));
    const reads: Buffer[] = [];
    if (occurrence.whole) {
      const read = current.sourceKind === 'symlink' ? await readSymlinkTarget(absolute) : await readWholeFile(absolute);
      if (read !== undefined) reads.push(read);
    } else {
      for (const interval of occurrence.intervals) {
        const read =
          current.sourceKind === 'symlink'
            ? (await readSymlinkTarget(absolute))?.subarray(interval.offset, interval.offset + interval.length)
            : await readByteRange(absolute, interval.offset, interval.length);
        if (read === undefined) break;
        reads.push(read);
      }
    }
    if (reads.length !== (occurrence.whole ? 1 : occurrence.intervals.length)) {
      verdicts.push({ ...base, origins: current.origins, currency: 'unavailable', reason: 'unreadable' });
      continue;
    }
    if (occurrence.contentDigest !== undefined && sha256(Buffer.concat(reads)) === occurrence.contentDigest) {
      verdicts.push({ ...base, origins: current.origins, currency: 'current' });
      continue;
    }
    verdicts.push({
      ...base,
      origins: current.origins,
      currency: 'changed',
      ...(current.size === undefined ? {} : { byteLength: current.size }),
    });
  }
  for (const [pathHex, candidate] of settled.byPath) {
    if (witnessed.has(pathHex) || admission(candidate) !== 'included') continue;
    verdicts.push({
      ...(candidate.pathBytesBase64 === undefined
        ? { absolutePath: candidate.absolutePath! }
        : { pathBytesBase64: candidate.pathBytesBase64 }),
      origins: candidate.origins,
      currency: 'added',
      ...(candidate.size === undefined ? {} : { byteLength: candidate.size }),
    });
  }
  return {
    kind: 'workspace.context.revalidate',
    status: 'settled',
    verdicts,
  };
}
