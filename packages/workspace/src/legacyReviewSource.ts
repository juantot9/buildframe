import { constants, type BigIntStats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { readBounded, stillHolds } from './legacyReviewSourceRead.js';
import { deepFreeze, isRecord } from './recordCodec.js';
import { sha256 } from './sha256.js';

export const MAX_LEGACY_REVIEW_SOURCE_BYTES: number = 16 * 1024 * 1024;
export const MAX_LEGACY_REVIEW_SOURCE_ENTRIES: number = 4_096;
export const LEGACY_REVIEW_SOURCE_CAPTURE_ATTEMPTS: number = 3;

export type LegacyReviewSourceKind = 'queue' | 'receipts';
export type LegacyReviewSourceFormat = 'queue-array-v1' | 'queue-v1' | 'queue-v2' | 'receipts-v1';
export type LegacyReviewAnnotationKind = 'question' | 'change' | 'edit';
export type LegacyReviewAnchorSide = 'old' | 'new' | 'both' | 'file';

export interface LegacyReviewAnchor {
  readonly side: LegacyReviewAnchorSide;
  readonly oldLine?: number;
  readonly newLine?: number;
}

export interface LegacyReviewAnnotation {
  readonly id: string;
  readonly kind: LegacyReviewAnnotationKind;
  readonly file?: string;
  readonly anchor: LegacyReviewAnchor;
  readonly text: string;
  readonly excerpt?: string;
}

export type LegacyReviewHarnessOutcome =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'disconnected'
  | 'interrupted';
export type LegacyReviewQueueDisposition = 'pending' | 'pending_clear' | 'cleared' | 'retained';
export type LegacyReviewQueueDispositionReason =
  | 'harness_failed'
  | 'harness_cancelled'
  | 'harness_disconnected'
  | 'restart_interrupted'
  | 'workspace_changed'
  | 'persistence_failed';

export interface LegacyReviewReceiptHarness {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly sessionId: string;
  readonly model?: string;
  readonly workspace: string;
}

export interface LegacyReviewBatchReceipt {
  readonly id: string;
  readonly workspace: string;
  readonly annotations: readonly LegacyReviewAnnotation[];
  readonly harness: LegacyReviewReceiptHarness;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly harnessOutcome: LegacyReviewHarnessOutcome;
  readonly harnessCompletedAt?: string;
  readonly harnessError?: string;
  readonly queueDisposition: LegacyReviewQueueDisposition;
  readonly queueUpdatedAt?: string;
  readonly queueReason?: LegacyReviewQueueDispositionReason;
  readonly queueError?: string;
}

export interface LegacyReviewQueueValue {
  readonly annotations: readonly LegacyReviewAnnotation[];
}

export interface LegacyReviewReceiptsValue {
  readonly updatedAt: string;
  readonly batches: readonly LegacyReviewBatchReceipt[];
}

export type LegacyReviewRecognitionReason =
  | 'malformed-utf8'
  | 'malformed-json'
  | 'unsupported-newer-version'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'duplicate-identity'
  | 'entry-limit-exceeded';

export type LegacyReviewSourceRecognition =
  | {
      readonly status: 'recognized';
      readonly format: Extract<LegacyReviewSourceFormat, 'queue-array-v1' | 'queue-v1' | 'queue-v2'>;
      readonly value: LegacyReviewQueueValue;
    }
  | {
      readonly status: 'recognized';
      readonly format: 'receipts-v1';
      readonly value: LegacyReviewReceiptsValue;
    }
  | {
      readonly status: 'unrecognized';
      readonly reason: LegacyReviewRecognitionReason;
      readonly observedVersion?: number;
    };

export interface LegacyReviewSourceMetadata {
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly byteLength: number;
  readonly modifiedNanoseconds: string;
  readonly changedNanoseconds: string;
}

export interface LegacyReviewSourceRequest {
  readonly sourceKind: LegacyReviewSourceKind;
  /** This configured root may itself be an intentional alias. */
  readonly trustedRoot: string;
  /** Every descendant directory and the final file must be real, not symlinked. */
  readonly relativePath: readonly string[];
}

export type LegacyReviewSourceUnavailableReason =
  | 'missing'
  | 'unsafe-path'
  | 'not-regular-file'
  | 'unreadable'
  | 'source-too-large'
  | 'changed-during-read';

export interface LegacyReviewSourceUnavailable {
  readonly status: 'unavailable';
  readonly sourceKind: LegacyReviewSourceKind;
  readonly sourcePath: string;
  readonly reason: LegacyReviewSourceUnavailableReason;
}

export interface LegacyReviewSourceCaptured {
  readonly status: 'captured';
  readonly sourceKind: LegacyReviewSourceKind;
  readonly sourcePath: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly metadata: LegacyReviewSourceMetadata;
  /** Exact source bytes. Parsed values never substitute for this capture. */
  readonly bytes: Uint8Array;
  readonly recognition: LegacyReviewSourceRecognition;
}

export type LegacyReviewSourceResult = LegacyReviewSourceUnavailable | LegacyReviewSourceCaptured;

/** Package-private deterministic timing seam; never exported from the package. */
export interface LegacyReviewSourceTestControl {
  readonly afterHandleOpened?: (context: {
    readonly attempt: number;
    readonly sourcePath: string;
  }) => void | Promise<void>;
  readonly afterBytesRead?: (context: {
    readonly attempt: number;
    readonly sourcePath: string;
  }) => void | Promise<void>;
}

interface NodeError {
  readonly code?: unknown;
}

interface LocatedSource {
  readonly sourcePath: string;
  readonly directories: readonly BigIntStats[];
  readonly file: BigIntStats;
}

type AttemptOutcome = LegacyReviewSourceResult | 'retry';

class LegacyReviewValidationError extends Error {
  constructor(
    readonly reason: LegacyReviewRecognitionReason,
    readonly observedVersion?: number,
  ) {
    super(reason);
    this.name = 'LegacyReviewValidationError';
  }
}

const strictUtf8 = new TextDecoder('utf-8', {
  fatal: true,
  // Preserve a leading BOM so JSON.parse rejects it as the legacy reader did.
  ignoreBOM: true,
});

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as NodeError).code;
  return typeof code === 'string' ? code : undefined;
}

function validateRequest(request: LegacyReviewSourceRequest): readonly string[] {
  if (request.sourceKind !== 'queue' && request.sourceKind !== 'receipts') {
    throw new TypeError('Legacy Review source kind is invalid');
  }
  if (
    typeof request.trustedRoot !== 'string' ||
    request.trustedRoot.length === 0 ||
    Buffer.byteLength(request.trustedRoot) > 4_096 ||
    request.trustedRoot.includes('\u0000')
  ) {
    throw new TypeError('Legacy Review trusted root is invalid');
  }
  if (!Array.isArray(request.relativePath) || request.relativePath.length < 1 || request.relativePath.length > 32) {
    throw new TypeError('Legacy Review relative path is invalid');
  }
  return request.relativePath.map(segment => {
    if (
      typeof segment !== 'string' ||
      segment.length === 0 ||
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\u0000') ||
      Buffer.byteLength(segment) > 255
    ) {
      throw new TypeError('Legacy Review relative path is invalid');
    }
    return segment;
  });
}

function unavailable(
  request: LegacyReviewSourceRequest,
  sourcePath: string,
  reason: LegacyReviewSourceUnavailableReason,
): LegacyReviewSourceUnavailable {
  return Object.freeze({
    status: 'unavailable',
    sourceKind: request.sourceKind,
    sourcePath,
    reason,
  });
}

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameDirectories(left: readonly BigIntStats[], right: readonly BigIntStats[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const candidate = right[index];
      return candidate !== undefined && sameStat(entry, candidate);
    })
  );
}

async function locateSource(
  request: LegacyReviewSourceRequest,
  canonicalRoot: string,
  relativePath: readonly string[],
): Promise<LocatedSource | LegacyReviewSourceUnavailable> {
  const sourcePath = path.join(canonicalRoot, ...relativePath);
  const directorySegments = relativePath.slice(0, -1);
  const directories: BigIntStats[] = [];
  let directory = canonicalRoot;
  for (const segment of ['', ...directorySegments]) {
    if (segment.length > 0) directory = path.join(directory, segment);
    let information: BigIntStats;
    try {
      information = await fs.lstat(directory, { bigint: true });
    } catch (error) {
      const code = errorCode(error);
      return unavailable(
        request,
        sourcePath,
        code === 'ENOENT' ? 'missing' : code === 'ELOOP' || code === 'ENOTDIR' ? 'unsafe-path' : 'unreadable',
      );
    }
    if (information.isSymbolicLink() || !information.isDirectory()) {
      return unavailable(request, sourcePath, 'unsafe-path');
    }
    directories.push(information);
  }

  let file: BigIntStats;
  try {
    file = await fs.lstat(sourcePath, { bigint: true });
  } catch (error) {
    const code = errorCode(error);
    return unavailable(
      request,
      sourcePath,
      code === 'ENOENT' ? 'missing' : code === 'ELOOP' || code === 'ENOTDIR' ? 'unsafe-path' : 'unreadable',
    );
  }
  if (file.isSymbolicLink()) {
    return unavailable(request, sourcePath, 'unsafe-path');
  }
  if (!file.isFile()) {
    return unavailable(request, sourcePath, 'not-regular-file');
  }
  if (file.size > BigInt(MAX_LEGACY_REVIEW_SOURCE_BYTES)) {
    return unavailable(request, sourcePath, 'source-too-large');
  }
  return { sourcePath, directories, file };
}

function sourceMetadata(information: BigIntStats): LegacyReviewSourceMetadata {
  return Object.freeze({
    device: information.dev.toString(),
    inode: information.ino.toString(),
    mode: Number(information.mode),
    byteLength: Number(information.size),
    modifiedNanoseconds: information.mtimeNs.toString(),
    changedNanoseconds: information.ctimeNs.toString(),
  });
}

function annotationKind(value: unknown): value is LegacyReviewAnnotationKind {
  return value === 'question' || value === 'change' || value === 'edit';
}

function anchorSide(value: unknown): value is LegacyReviewAnchorSide {
  return value === 'old' || value === 'new' || value === 'both' || value === 'file';
}

function positiveLine(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return value;
}

function annotationFields(value: unknown): Omit<LegacyReviewAnnotation, 'anchor'> {
  if (!isRecord(value)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (!annotationKind(value.kind) || typeof value.text !== 'string') {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (value.file !== undefined && (typeof value.file !== 'string' || value.file.length === 0)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (value.excerpt !== undefined && typeof value.excerpt !== 'string') {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return {
    id: value.id,
    kind: value.kind,
    ...(typeof value.file === 'string' ? { file: value.file } : {}),
    text: value.text,
    ...(typeof value.excerpt === 'string' ? { excerpt: value.excerpt } : {}),
  };
}

function versionTwoAnchor(value: unknown): LegacyReviewAnchor {
  if (!isRecord(value) || !anchorSide(value.side)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const oldLine = positiveLine(value.oldLine);
  const newLine = positiveLine(value.newLine);
  if (value.side === 'file') {
    if (oldLine !== undefined || newLine !== undefined) {
      throw new LegacyReviewValidationError('invalid-structure');
    }
    return { side: 'file' };
  }
  if (value.side === 'old') {
    if (oldLine === undefined || newLine !== undefined) {
      throw new LegacyReviewValidationError('invalid-structure');
    }
    return { side: 'old', oldLine };
  }
  if (value.side === 'new') {
    if (newLine === undefined || oldLine !== undefined) {
      throw new LegacyReviewValidationError('invalid-structure');
    }
    return { side: 'new', newLine };
  }
  if (oldLine === undefined && newLine === undefined) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return {
    side: 'both',
    ...(oldLine === undefined ? {} : { oldLine }),
    ...(newLine === undefined ? {} : { newLine }),
  };
}

function versionOneAnchor(
  value: Record<string, unknown>,
  fields: Omit<LegacyReviewAnnotation, 'anchor'>,
): LegacyReviewAnchor {
  const line = positiveLine(value.line);
  if (line === undefined) return { side: 'file' };
  const excerpt = fields.excerpt ?? '';
  if (excerpt.startsWith('-') && !excerpt.startsWith('--- ')) {
    return { side: 'old', oldLine: line };
  }
  if (excerpt.startsWith('+') && !excerpt.startsWith('+++ ')) {
    return { side: 'new', newLine: line };
  }
  return { side: 'both', newLine: line };
}

function parseAnnotation(value: unknown, version: 1 | 2): LegacyReviewAnnotation {
  const fields = annotationFields(value);
  const anchor =
    version === 1
      ? versionOneAnchor(value as Record<string, unknown>, fields)
      : versionTwoAnchor((value as Record<string, unknown>).anchor);
  return { ...fields, anchor };
}

function parseAnnotations(values: unknown[], version: 1 | 2): readonly LegacyReviewAnnotation[] {
  if (values.length > MAX_LEGACY_REVIEW_SOURCE_ENTRIES) {
    throw new LegacyReviewValidationError('entry-limit-exceeded');
  }
  const annotations = values.map(value => parseAnnotation(value, version));
  const identities = new Set<string>();
  for (const annotation of annotations) {
    if (identities.has(annotation.id)) {
      throw new LegacyReviewValidationError('duplicate-identity');
    }
    identities.add(annotation.id);
  }
  return annotations;
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return value;
}

function requiredTimestamp(value: unknown): string {
  const timestamp = requiredString(value);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return timestamp;
}

function requiredWorkspace(value: unknown): string {
  const workspace = requiredString(value);
  if (!path.isAbsolute(workspace)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  return workspace;
}

function harnessOutcome(value: unknown): LegacyReviewHarnessOutcome {
  if (
    value === 'pending' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'disconnected' ||
    value === 'interrupted'
  ) {
    return value;
  }
  throw new LegacyReviewValidationError('invalid-structure');
}

function queueDisposition(value: unknown): LegacyReviewQueueDisposition {
  if (value === 'pending' || value === 'pending_clear' || value === 'cleared' || value === 'retained') {
    return value;
  }
  throw new LegacyReviewValidationError('invalid-structure');
}

function queueReason(value: unknown): LegacyReviewQueueDispositionReason {
  if (
    value === 'harness_failed' ||
    value === 'harness_cancelled' ||
    value === 'harness_disconnected' ||
    value === 'restart_interrupted' ||
    value === 'workspace_changed' ||
    value === 'persistence_failed'
  ) {
    return value;
  }
  throw new LegacyReviewValidationError('invalid-structure');
}

function parseReceiptHarness(value: unknown): LegacyReviewReceiptHarness {
  const harness = requiredRecord(value);
  return {
    id: requiredString(harness.id),
    name: requiredString(harness.name),
    ...(harness.version === undefined ? {} : { version: requiredString(harness.version) }),
    sessionId: requiredString(harness.sessionId),
    ...(harness.model === undefined ? {} : { model: requiredString(harness.model) }),
    workspace: requiredWorkspace(harness.workspace),
  };
}

function validateReceiptState(receipt: LegacyReviewBatchReceipt): void {
  if (receipt.workspace !== receipt.harness.workspace) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const created = Date.parse(receipt.createdAt);
  const updated = Date.parse(receipt.updatedAt);
  if (updated < created) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (receipt.harnessOutcome === 'pending') {
    if (
      receipt.queueDisposition !== 'pending' ||
      receipt.harnessCompletedAt !== undefined ||
      receipt.harnessError !== undefined ||
      receipt.queueUpdatedAt !== undefined ||
      receipt.queueReason !== undefined ||
      receipt.queueError !== undefined
    ) {
      throw new LegacyReviewValidationError('invalid-structure');
    }
    return;
  }
  if (receipt.harnessCompletedAt === undefined) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const completed = Date.parse(receipt.harnessCompletedAt);
  if (completed < created || completed > updated) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (receipt.harnessOutcome === 'succeeded') {
    if (receipt.harnessError !== undefined || receipt.queueDisposition === 'pending') {
      throw new LegacyReviewValidationError('invalid-structure');
    }
  } else if (receipt.queueDisposition !== 'retained') {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (receipt.queueUpdatedAt === undefined) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const queueUpdated = Date.parse(receipt.queueUpdatedAt);
  if (queueUpdated < completed || queueUpdated > updated) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (receipt.queueDisposition === 'pending_clear' || receipt.queueDisposition === 'cleared') {
    if (
      receipt.harnessOutcome !== 'succeeded' ||
      receipt.queueReason !== undefined ||
      receipt.queueError !== undefined
    ) {
      throw new LegacyReviewValidationError('invalid-structure');
    }
    return;
  }
  if (receipt.queueReason === undefined) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const expected: Partial<Record<LegacyReviewHarnessOutcome, LegacyReviewQueueDispositionReason>> = {
    failed: 'harness_failed',
    cancelled: 'harness_cancelled',
    disconnected: 'harness_disconnected',
    interrupted: 'restart_interrupted',
  };
  if (expected[receipt.harnessOutcome] !== undefined && receipt.queueReason !== expected[receipt.harnessOutcome]) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  if (
    receipt.harnessOutcome === 'succeeded' &&
    receipt.queueReason !== 'workspace_changed' &&
    receipt.queueReason !== 'persistence_failed' &&
    receipt.queueReason !== 'restart_interrupted'
  ) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
}

function parseReceipt(value: unknown): LegacyReviewBatchReceipt {
  const batch = requiredRecord(value);
  if (!Array.isArray(batch.annotations) || batch.annotations.length === 0) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const annotations = parseAnnotations(batch.annotations, 2);
  const receipt: LegacyReviewBatchReceipt = {
    id: requiredString(batch.id),
    workspace: requiredWorkspace(batch.workspace),
    annotations,
    harness: parseReceiptHarness(batch.harness),
    createdAt: requiredTimestamp(batch.createdAt),
    updatedAt: requiredTimestamp(batch.updatedAt),
    harnessOutcome: harnessOutcome(batch.harnessOutcome),
    ...(batch.harnessCompletedAt === undefined
      ? {}
      : { harnessCompletedAt: requiredTimestamp(batch.harnessCompletedAt) }),
    ...(batch.harnessError === undefined ? {} : { harnessError: requiredString(batch.harnessError) }),
    queueDisposition: queueDisposition(batch.queueDisposition),
    ...(batch.queueUpdatedAt === undefined ? {} : { queueUpdatedAt: requiredTimestamp(batch.queueUpdatedAt) }),
    ...(batch.queueReason === undefined ? {} : { queueReason: queueReason(batch.queueReason) }),
    ...(batch.queueError === undefined ? {} : { queueError: requiredString(batch.queueError) }),
  };
  validateReceiptState(receipt);
  return receipt;
}

function queueVersion(value: unknown): 1 | 2 {
  if (value === 1 || value === 2) return value;
  if (typeof value === 'number' && Number.isFinite(value) && value > 2) {
    throw new LegacyReviewValidationError('unsupported-newer-version', value);
  }
  throw new LegacyReviewValidationError('unsupported-version');
}

function recognizeQueue(
  value: unknown,
): Extract<LegacyReviewSourceRecognition, { readonly format: 'queue-array-v1' | 'queue-v1' | 'queue-v2' }> {
  if (Array.isArray(value)) {
    return {
      status: 'recognized',
      format: 'queue-array-v1',
      value: { annotations: parseAnnotations(value, 1) },
    };
  }
  const document = requiredRecord(value);
  if (!Array.isArray(document.annotations)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const version = queueVersion(document.version);
  return {
    status: 'recognized',
    format: version === 1 ? 'queue-v1' : 'queue-v2',
    value: { annotations: parseAnnotations(document.annotations, version) },
  };
}

function recognizeReceipts(value: unknown): Extract<LegacyReviewSourceRecognition, { readonly format: 'receipts-v1' }> {
  const document = requiredRecord(value);
  if (document.version !== 1) {
    if (typeof document.version === 'number' && Number.isFinite(document.version) && document.version > 1) {
      throw new LegacyReviewValidationError('unsupported-newer-version', document.version);
    }
    throw new LegacyReviewValidationError('unsupported-version');
  }
  if (!Array.isArray(document.batches)) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  let aggregateEntries = document.batches.length;
  for (const candidate of document.batches) {
    if (isRecord(candidate) && Array.isArray(candidate.annotations)) {
      aggregateEntries += candidate.annotations.length;
      if (aggregateEntries > MAX_LEGACY_REVIEW_SOURCE_ENTRIES) {
        throw new LegacyReviewValidationError('entry-limit-exceeded');
      }
    }
  }
  if (aggregateEntries > MAX_LEGACY_REVIEW_SOURCE_ENTRIES) {
    throw new LegacyReviewValidationError('entry-limit-exceeded');
  }
  const updatedAt = requiredTimestamp(document.updatedAt);
  const batches = document.batches.map(parseReceipt);
  if (batches.some(batch => Date.parse(batch.updatedAt) > Date.parse(updatedAt))) {
    throw new LegacyReviewValidationError('invalid-structure');
  }
  const identities = new Set<string>();
  for (const batch of batches) {
    if (identities.has(batch.id)) {
      throw new LegacyReviewValidationError('duplicate-identity');
    }
    identities.add(batch.id);
  }
  return {
    status: 'recognized',
    format: 'receipts-v1',
    value: { updatedAt, batches },
  };
}

/** Package-private parser for exact captured or durably retained source bytes. */
export function recognizeLegacyReviewSourceBytes(
  sourceKind: LegacyReviewSourceKind,
  bytes: Uint8Array,
): LegacyReviewSourceRecognition {
  if (
    (sourceKind !== 'queue' && sourceKind !== 'receipts') ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > MAX_LEGACY_REVIEW_SOURCE_BYTES
  ) {
    throw new TypeError('Legacy Review recognition input is invalid');
  }
  let text: string;
  try {
    text = strictUtf8.decode(bytes);
  } catch {
    return Object.freeze({ status: 'unrecognized', reason: 'malformed-utf8' });
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return Object.freeze({ status: 'unrecognized', reason: 'malformed-json' });
  }
  try {
    return deepFreeze(sourceKind === 'queue' ? recognizeQueue(value) : recognizeReceipts(value));
  } catch (error) {
    if (!(error instanceof LegacyReviewValidationError)) throw error;
    return Object.freeze({
      status: 'unrecognized',
      reason: error.reason,
      ...(error.observedVersion === undefined ? {} : { observedVersion: error.observedVersion }),
    });
  }
}

/**
 * Capture one exact legacy Review source without writing it or following an
 * application-owned symlink. Durable import and Workspace association are
 * deliberately outside this internal Interface.
 */
export async function captureLegacyReviewSource(
  request: LegacyReviewSourceRequest,
  testControl: LegacyReviewSourceTestControl = {},
): Promise<LegacyReviewSourceResult> {
  const relativePath = validateRequest(request);
  const requestedPath = path.join(path.resolve(request.trustedRoot), ...relativePath);
  let canonicalRoot: string;
  try {
    canonicalRoot = await fs.realpath(path.resolve(request.trustedRoot));
  } catch (error) {
    return unavailable(request, requestedPath, errorCode(error) === 'ENOENT' ? 'missing' : 'unreadable');
  }

  for (let attempt = 1; attempt <= LEGACY_REVIEW_SOURCE_CAPTURE_ATTEMPTS; attempt += 1) {
    const located = await locateSource(request, canonicalRoot, relativePath);
    if ('status' in located) return located;

    let handle: fs.FileHandle | undefined;
    let outcome: AttemptOutcome = 'retry';
    try {
      handle = await fs.open(located.sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile()) {
        outcome = unavailable(request, located.sourcePath, 'not-regular-file');
      } else if (!sameStat(located.file, opened)) {
        outcome = 'retry';
      } else {
        await testControl.afterHandleOpened?.({
          attempt,
          sourcePath: located.sourcePath,
        });
        const bytes = await readBounded(handle, MAX_LEGACY_REVIEW_SOURCE_BYTES);
        if (bytes === undefined) {
          outcome = unavailable(request, located.sourcePath, 'source-too-large');
        } else {
          await testControl.afterBytesRead?.({
            attempt,
            sourcePath: located.sourcePath,
          });
          const completed = await handle.stat({ bigint: true });
          const finalLocation = await locateSource(request, canonicalRoot, relativePath);
          if ('status' in finalLocation) {
            outcome = finalLocation.reason === 'source-too-large' ? finalLocation : 'retry';
          } else if (
            !sameStat(opened, completed) ||
            !sameStat(completed, finalLocation.file) ||
            !sameDirectories(located.directories, finalLocation.directories) ||
            completed.size !== BigInt(bytes.byteLength) ||
            !(await stillHolds(handle, bytes))
          ) {
            outcome = 'retry';
          } else {
            outcome = deepFreeze({
              status: 'captured',
              sourceKind: request.sourceKind,
              sourcePath: located.sourcePath,
              byteLength: bytes.byteLength,
              digest: sha256(bytes),
              metadata: sourceMetadata(completed),
              bytes,
              recognition: recognizeLegacyReviewSourceBytes(request.sourceKind, bytes),
            });
          }
        }
      }
    } catch (error) {
      const code = errorCode(error);
      if (code === 'ENOENT') outcome = 'retry';
      else if (code === 'ELOOP' || code === 'ENOTDIR') {
        outcome = unavailable(request, located.sourcePath, 'unsafe-path');
      } else {
        outcome = unavailable(request, located.sourcePath, 'unreadable');
      }
    } finally {
      if (handle !== undefined) {
        try {
          await handle.close();
        } catch {
          outcome = unavailable(request, located.sourcePath, 'unreadable');
        }
      }
    }
    if (outcome !== 'retry') return outcome;
  }

  return unavailable(request, path.join(canonicalRoot, ...relativePath), 'changed-during-read');
}
