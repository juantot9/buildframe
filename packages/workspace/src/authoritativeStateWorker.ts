import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

import type {
  AuthoritativeStateErrorCode,
  StateCommandResultEnvelope,
  StateCommitRequest,
  StateCommitResult,
  StateContentReadRequest,
  StateContentReadResult,
  StateContentReference,
  StateMigrationCheckpoint,
  StateQuarantineReason,
  StateQuarantineReport,
  StateReadRequest,
  StateReadResult,
  StateRecord,
  StateRecordWrite,
  StateStatus,
  StateWorkerData,
  StateWorkerRequest,
  StateWorkerResponse,
} from './authoritativeStateProtocol.js';

const STORE_FORMAT_VERSION = 2;
const LEGACY_STORE_FORMAT_VERSION = 1;
const CURRENT_FILE_NAME = 'CURRENT';
const LOCK_FILE_NAME = 'lock.sqlite';
const GENERATION_PATTERN =
  /^generation-[0-9]{1,8}(?:-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?\.sqlite$/u;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const IDENTITY_MAX_LENGTH = 512;
const KIND_MAX_LENGTH = 256;
const ROLE_MAX_LENGTH = 256;

class WorkerProblem extends Error {
  readonly code: AuthoritativeStateErrorCode;

  constructor(code: AuthoritativeStateErrorCode) {
    super(code);
    this.code = code;
  }
}

class CommitRejection extends Error {
  readonly result: StateCommitResult;

  constructor(result: StateCommitResult) {
    super(result.status === 'rejected' ? result.reason : 'commit-rejected');
    this.result = result;
  }
}

interface StoreMetadata {
  readonly formatVersion: number;
  readonly workspaceIdentity: string;
  readonly stateVersion: number;
  readonly generationNumber: number;
}

interface StoredRecordRow {
  readonly recordIdentity: string;
  readonly workflowIdentity: string;
  readonly kind: string;
  readonly schemaVersion: number;
  readonly recordClass: 'immutable' | 'revisioned';
  readonly revision: number;
  readonly payload: Uint8Array;
  readonly checksum: string;
}

interface DigestedContent {
  readonly role: string;
  readonly digest: string;
  readonly bytes: Uint8Array;
}

interface GenerationValidation {
  readonly metadata: StoreMetadata;
  readonly quarantineCandidates: readonly StateQuarantineReport[];
}

if (!parentPort) {
  throw new Error('Authoritative State must run on a worker thread');
}
const port = parentPort;
const data = workerData as StateWorkerData;

let lockDatabase: DatabaseSync | undefined;
let stateDatabase: DatabaseSync | undefined;
let stateAccess: StateStatus['access'] = 'read-write';
let openedFormatVersion = STORE_FORMAT_VERSION;

function send(message: StateWorkerResponse): void {
  port.postMessage(message);
}

function rowRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integerField(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (!Number.isSafeInteger(value)) throw new WorkerProblem('state-corrupt');
  return value as number;
}

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new WorkerProblem('state-corrupt');
  return value;
}

function bytesField(row: Record<string, unknown>, field: string): Uint8Array {
  const value = row[field];
  if (!(value instanceof Uint8Array)) throw new WorkerProblem('state-corrupt');
  return new Uint8Array(value);
}

function validText(value: string, maximumLength: number): boolean {
  return value.length > 0 && value.length <= maximumLength && value.trim() === value && !value.includes('\u0000');
}

function digestBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function checksumParts(domain: string, metadata: readonly unknown[], payload: Uint8Array): string {
  return createHash('sha256')
    .update(domain)
    .update('\u0000')
    .update(JSON.stringify(metadata))
    .update('\u0000')
    .update(payload)
    .digest('hex');
}

function recordChecksum(
  record: {
    readonly recordIdentity: string;
    readonly workflowIdentity: string;
    readonly kind: string;
    readonly schemaVersion: number;
    readonly recordClass: 'immutable' | 'revisioned';
    readonly revision: number;
    readonly payload: Uint8Array;
  },
  content: readonly Pick<DigestedContent, 'role' | 'digest'>[],
): string {
  return checksumParts(
    'neoflow-state-record-v1',
    [
      record.recordIdentity,
      record.workflowIdentity,
      record.kind,
      record.schemaVersion,
      record.recordClass,
      record.revision,
      content.map(reference => [reference.role, reference.digest]),
    ],
    record.payload,
  );
}

function resultChecksum(result: StateCommandResultEnvelope): string {
  return checksumParts('neoflow-state-command-result-v1', [result.kind, result.schemaVersion], result.payload);
}

function commandRequestChecksum(request: StateCommitRequest): string {
  const canonical = [
    request.commandIdentity,
    request.expectedStateVersion,
    request.records.map(record => [
      record.recordIdentity,
      record.workflowIdentity,
      record.kind,
      record.schemaVersion,
      record.recordClass,
      record.recordClass === 'revisioned' ? record.expectedRevision : null,
      Buffer.from(record.payload).toString('base64'),
      record.content.map(content => [content.role, Buffer.from(content.bytes).toString('base64')]),
    ]),
    request.result.kind,
    request.result.schemaVersion,
  ];
  return checksumParts('neoflow-state-command-request-v1', canonical, request.result.payload);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function fsyncPath(target: string): void {
  const descriptor = openSync(target, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeBytesDurably(target: string, bytes: Uint8Array): void {
  const descriptor = openSync(target, 'wx', 0o600);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function configureWritableDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = FULL;
    PRAGMA fullfsync = ON;
    PRAGMA busy_timeout = 0;
  `);
}

function configureReadOnlyDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 0;
  `);
}

function createSchema(database: DatabaseSync, workspaceIdentity: string, generationNumber: number): void {
  configureWritableDatabase(database);
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE store_metadata (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      format_version INTEGER NOT NULL CHECK (format_version > 0),
      workspace_identity TEXT NOT NULL,
      state_version INTEGER NOT NULL CHECK (state_version >= 0),
      generation_number INTEGER NOT NULL CHECK (generation_number > 0)
    ) STRICT;
    CREATE TABLE command_ledger (
      command_identity TEXT PRIMARY KEY,
      request_checksum TEXT NOT NULL,
      committed_state_version INTEGER NOT NULL CHECK (committed_state_version > 0),
      result_kind TEXT NOT NULL,
      result_schema_version INTEGER NOT NULL CHECK (result_schema_version > 0),
      result_payload BLOB NOT NULL,
      result_checksum TEXT NOT NULL
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE records (
      record_identity TEXT PRIMARY KEY,
      workflow_identity TEXT NOT NULL,
      kind TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version > 0),
      record_class TEXT NOT NULL CHECK (record_class IN ('immutable', 'revisioned')),
      revision INTEGER NOT NULL CHECK (revision > 0),
      payload BLOB NOT NULL,
      checksum TEXT NOT NULL
    ) STRICT, WITHOUT ROWID;
    CREATE INDEX records_by_workflow_kind
      ON records (workflow_identity, kind, record_identity);
    CREATE TABLE content_objects (
      digest TEXT PRIMARY KEY,
      bytes BLOB NOT NULL
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE record_content (
      record_identity TEXT NOT NULL REFERENCES records(record_identity),
      role TEXT NOT NULL,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      digest TEXT NOT NULL REFERENCES content_objects(digest),
      PRIMARY KEY (record_identity, role),
      UNIQUE (record_identity, ordinal)
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE quarantine_reports (
      record_identity TEXT PRIMARY KEY REFERENCES records(record_identity),
      workflow_identity TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (
        reason IN (
          'record-envelope-invalid',
          'record-checksum-mismatch',
          'record-content-invalid'
        )
      ),
      expected_checksum TEXT NOT NULL,
      observed_checksum TEXT NOT NULL
    ) STRICT, WITHOUT ROWID;
    PRAGMA user_version = ${STORE_FORMAT_VERSION};
  `);
  database
    .prepare(
      `INSERT INTO store_metadata
      (singleton, format_version, workspace_identity, state_version,
       generation_number)
     VALUES (1, ?, ?, 0, ?)`,
    )
    .run(STORE_FORMAT_VERSION, workspaceIdentity, generationNumber);
  database.exec('COMMIT');
}

function generationName(generationNumber: number): string {
  return `generation-${String(generationNumber).padStart(4, '0')}-${randomUUID()}.sqlite`;
}

function currentFilePath(stateRoot: string): string {
  return path.join(stateRoot, CURRENT_FILE_NAME);
}

function readCurrent(stateRoot: string): string {
  let value: string;
  try {
    value = readFileSync(currentFilePath(stateRoot), 'utf8');
  } catch {
    throw new WorkerProblem('state-invalid');
  }
  if (!value.endsWith('\n') || value.indexOf('\n') !== value.length - 1) {
    throw new WorkerProblem('state-invalid');
  }
  const selected = value.slice(0, -1);
  if (!GENERATION_PATTERN.test(selected)) {
    throw new WorkerProblem('state-invalid');
  }
  return selected;
}

function migrationCheckpoint(checkpoint: StateMigrationCheckpoint): void {
  if (data.failpoint === checkpoint) {
    throw new WorkerProblem('state-migration-failed');
  }
  if (data.pauseAtMigrationCheckpoint === checkpoint) {
    send({ kind: 'migration-checkpoint', checkpoint });
    const wait = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(wait, 0, 0);
  }
}

function prepareCurrent(stateRoot: string, selected: string): string {
  const temporaryFile = path.join(stateRoot, `.${CURRENT_FILE_NAME}.${randomUUID()}.tmp`);
  writeBytesDurably(temporaryFile, Buffer.from(`${selected}\n`, 'utf8'));
  chmodSync(temporaryFile, 0o600);
  return temporaryFile;
}

function installCurrent(stateRoot: string, selected: string, withMigrationCheckpoints: boolean): void {
  const temporaryFile = prepareCurrent(stateRoot, selected);
  if (withMigrationCheckpoints) migrationCheckpoint('current-prepared');
  renameSync(temporaryFile, currentFilePath(stateRoot));
  chmodSync(currentFilePath(stateRoot), 0o600);
  if (withMigrationCheckpoints) migrationCheckpoint('current-switched');
  fsyncPath(stateRoot);
}

function createInitialGeneration(stateRoot: string, workspaceIdentity: string): string {
  const selected = generationName(1);
  const finalFile = path.join(stateRoot, selected);
  const candidateFile = path.join(stateRoot, `.candidate-${randomUUID()}.sqlite`);
  let candidate: DatabaseSync | undefined;
  try {
    candidate = new DatabaseSync(candidateFile, {
      enableForeignKeyConstraints: true,
      timeout: 0,
    });
    createSchema(candidate, workspaceIdentity, 1);
    candidate.close();
    candidate = undefined;
    chmodSync(candidateFile, 0o600);
    fsyncPath(candidateFile);
    renameSync(candidateFile, finalFile);
    fsyncPath(stateRoot);
    installCurrent(stateRoot, selected, false);
    return selected;
  } catch (error) {
    try {
      if (candidate?.isTransaction) candidate.exec('ROLLBACK');
    } catch {
      // The original initialization failure remains authoritative.
    }
    try {
      candidate?.close();
    } catch {
      // The original initialization failure remains authoritative.
    }
    rmSync(candidateFile, { force: true });
    throw error;
  }
}

function databaseFormatVersion(database: DatabaseSync): number {
  const row = rowRecord(database.prepare('PRAGMA user_version').get());
  if (!row) throw new WorkerProblem('state-corrupt');
  const value = Object.values(row)[0];
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new WorkerProblem('state-invalid');
  }
  return value as number;
}

function readStoreMetadata(database: DatabaseSync, formatVersion: number): StoreMetadata {
  const query =
    formatVersion === LEGACY_STORE_FORMAT_VERSION
      ? `SELECT format_version, workspace_identity, state_version
         FROM store_metadata WHERE singleton = 1`
      : `SELECT format_version, workspace_identity, state_version,
                generation_number
         FROM store_metadata WHERE singleton = 1`;
  const row = rowRecord(database.prepare(query).get());
  if (!row) throw new WorkerProblem('state-invalid');
  const generationNumber = formatVersion === LEGACY_STORE_FORMAT_VERSION ? 1 : integerField(row, 'generation_number');
  return {
    formatVersion: integerField(row, 'format_version'),
    workspaceIdentity: stringField(row, 'workspace_identity'),
    stateVersion: integerField(row, 'state_version'),
    generationNumber,
  };
}

function checkContainer(database: DatabaseSync, complete: boolean): void {
  const rows = database.prepare(complete ? 'PRAGMA integrity_check' : 'PRAGMA quick_check').all();
  if (rows.length !== 1 || Object.values(rowRecord(rows[0]) ?? {})[0] !== 'ok') {
    throw new WorkerProblem('state-corrupt');
  }
}

function validateCommandLedger(database: DatabaseSync, stateVersion: number): void {
  const rows = database
    .prepare(
      `SELECT command_identity, request_checksum, committed_state_version,
            result_kind, result_schema_version, result_payload,
            result_checksum
     FROM command_ledger`,
    )
    .all();
  for (const value of rows) {
    const row = rowRecord(value);
    if (!row) throw new WorkerProblem('state-corrupt');
    const commandIdentity = stringField(row, 'command_identity');
    const requestChecksum = stringField(row, 'request_checksum');
    const committedStateVersion = integerField(row, 'committed_state_version');
    const result: StateCommandResultEnvelope = {
      kind: stringField(row, 'result_kind'),
      schemaVersion: integerField(row, 'result_schema_version'),
      payload: bytesField(row, 'result_payload'),
    };
    const storedResultChecksum = stringField(row, 'result_checksum');
    if (
      !validText(commandIdentity, IDENTITY_MAX_LENGTH) ||
      !SHA256_PATTERN.test(requestChecksum) ||
      committedStateVersion < 1 ||
      committedStateVersion > stateVersion ||
      !validText(result.kind, KIND_MAX_LENGTH) ||
      result.schemaVersion < 1 ||
      !SHA256_PATTERN.test(storedResultChecksum) ||
      storedResultChecksum !== resultChecksum(result)
    ) {
      throw new WorkerProblem('state-corrupt');
    }
  }
}

function readRawStoredRecord(database: DatabaseSync, recordIdentity: string): StoredRecordRow | undefined {
  const row = rowRecord(
    database
      .prepare(
        `SELECT record_identity, workflow_identity, kind, schema_version,
              record_class, revision, payload, checksum
       FROM records WHERE record_identity = ?`,
      )
      .get(recordIdentity),
  );
  if (!row) return undefined;
  const recordClass = stringField(row, 'record_class');
  if (recordClass !== 'immutable' && recordClass !== 'revisioned') {
    throw new WorkerProblem('state-corrupt');
  }
  return {
    recordIdentity: stringField(row, 'record_identity'),
    workflowIdentity: stringField(row, 'workflow_identity'),
    kind: stringField(row, 'kind'),
    schemaVersion: integerField(row, 'schema_version'),
    recordClass,
    revision: integerField(row, 'revision'),
    payload: bytesField(row, 'payload'),
    checksum: stringField(row, 'checksum'),
  };
}

function recordContentForValidation(
  database: DatabaseSync,
  recordIdentity: string,
  validateExactBytes: boolean,
): {
  readonly references: readonly DigestedContent[];
  readonly invalidObservedChecksum?: string;
} {
  const rows = database
    .prepare(
      `SELECT role, ordinal, digest FROM record_content
     WHERE record_identity = ? ORDER BY ordinal`,
    )
    .all(recordIdentity);
  const references: DigestedContent[] = [];
  let invalidObservedChecksum: string | undefined;
  rows.forEach((value, expectedOrdinal) => {
    const row = rowRecord(value);
    if (!row) throw new WorkerProblem('state-corrupt');
    const role = stringField(row, 'role');
    const ordinal = integerField(row, 'ordinal');
    const digest = stringField(row, 'digest');
    if (!validText(role, ROLE_MAX_LENGTH) || ordinal !== expectedOrdinal || !SHA256_PATTERN.test(digest)) {
      throw new WorkerProblem('state-corrupt');
    }
    if (!validateExactBytes) {
      const contentRow = database.prepare('SELECT 1 AS present FROM content_objects WHERE digest = ?').get(digest);
      if (!contentRow) invalidObservedChecksum ??= 'missing';
      references.push({ role, digest, bytes: new Uint8Array() });
      return;
    }
    const contentRow = rowRecord(database.prepare('SELECT bytes FROM content_objects WHERE digest = ?').get(digest));
    if (!contentRow) {
      invalidObservedChecksum ??= 'missing';
      references.push({ role, digest, bytes: new Uint8Array() });
      return;
    }
    const bytes = bytesField(contentRow, 'bytes');
    const observed = digestBytes(bytes);
    if (observed !== digest) invalidObservedChecksum ??= observed;
    references.push({ role, digest, bytes });
  });
  return {
    references,
    ...(invalidObservedChecksum ? { invalidObservedChecksum } : {}),
  };
}

function quarantineCandidate(
  record: StoredRecordRow,
  reason: StateQuarantineReason,
  observedChecksum: string,
): StateQuarantineReport {
  return {
    recordIdentity: record.recordIdentity,
    workflowIdentity: record.workflowIdentity,
    reason,
    expectedChecksum: record.checksum,
    observedChecksum,
  };
}

function scanRecordQuarantineCandidates(
  database: DatabaseSync,
  recordIdentity: string | undefined,
  validateExactContent: boolean,
): readonly StateQuarantineReport[] {
  const identityRows = recordIdentity
    ? database.prepare('SELECT record_identity FROM records WHERE record_identity = ?').all(recordIdentity)
    : database.prepare('SELECT record_identity FROM records ORDER BY record_identity').all();
  const candidates: StateQuarantineReport[] = [];
  for (const value of identityRows) {
    const row = rowRecord(value);
    if (!row) throw new WorkerProblem('state-corrupt');
    const recordIdentity = stringField(row, 'record_identity');
    if (!validText(recordIdentity, IDENTITY_MAX_LENGTH)) {
      throw new WorkerProblem('state-corrupt');
    }
    const record = readRawStoredRecord(database, recordIdentity);
    if (!record) throw new WorkerProblem('state-corrupt');
    if (
      !validText(record.workflowIdentity, IDENTITY_MAX_LENGTH) ||
      !validText(record.kind, KIND_MAX_LENGTH) ||
      record.schemaVersion < 1 ||
      record.revision < 1
    ) {
      candidates.push(quarantineCandidate(record, 'record-envelope-invalid', digestBytes(record.payload)));
      continue;
    }
    const content = recordContentForValidation(database, recordIdentity, validateExactContent);
    if (content.invalidObservedChecksum) {
      candidates.push(quarantineCandidate(record, 'record-content-invalid', content.invalidObservedChecksum));
      continue;
    }
    const observedChecksum = recordChecksum(record, content.references);
    if (!SHA256_PATTERN.test(record.checksum) || observedChecksum !== record.checksum) {
      candidates.push(quarantineCandidate(record, 'record-checksum-mismatch', observedChecksum));
    }
  }

  if (!recordIdentity) {
    const orphan = database
      .prepare(
        `SELECT rc.record_identity
       FROM record_content rc
       LEFT JOIN records r ON r.record_identity = rc.record_identity
       WHERE r.record_identity IS NULL LIMIT 1`,
      )
      .get();
    if (orphan !== undefined) throw new WorkerProblem('state-corrupt');
  }
  return candidates;
}

function readAllQuarantineReports(database: DatabaseSync): readonly StateQuarantineReport[] {
  const rows = database
    .prepare(
      `SELECT record_identity, workflow_identity, reason,
            expected_checksum, observed_checksum
     FROM quarantine_reports ORDER BY record_identity`,
    )
    .all();
  return rows.map(value => {
    const row = rowRecord(value);
    if (!row) throw new WorkerProblem('state-corrupt');
    const reason = stringField(row, 'reason');
    if (
      reason !== 'record-envelope-invalid' &&
      reason !== 'record-checksum-mismatch' &&
      reason !== 'record-content-invalid'
    ) {
      throw new WorkerProblem('state-corrupt');
    }
    return {
      recordIdentity: stringField(row, 'record_identity'),
      workflowIdentity: stringField(row, 'workflow_identity'),
      reason,
      expectedChecksum: stringField(row, 'expected_checksum'),
      observedChecksum: stringField(row, 'observed_checksum'),
    };
  });
}

function appendQuarantineReports(database: DatabaseSync, reports: readonly StateQuarantineReport[]): void {
  if (reports.length === 0) return;
  database.exec('BEGIN IMMEDIATE');
  try {
    const insert = database.prepare(
      `INSERT OR IGNORE INTO quarantine_reports
        (record_identity, workflow_identity, reason,
         expected_checksum, observed_checksum)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const report of reports) {
      insert.run(
        report.recordIdentity,
        report.workflowIdentity,
        report.reason,
        report.expectedChecksum,
        report.observedChecksum,
      );
    }
    database.exec('COMMIT');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    throw error;
  }
}

function validateGeneration(
  database: DatabaseSync,
  workspaceIdentity: string,
  formatVersion: number,
  appendDetectedQuarantine: boolean,
  complete: boolean,
): GenerationValidation {
  checkContainer(database, complete);
  if (formatVersion !== LEGACY_STORE_FORMAT_VERSION && formatVersion !== STORE_FORMAT_VERSION) {
    throw new WorkerProblem('state-invalid');
  }
  if (databaseFormatVersion(database) !== formatVersion) {
    throw new WorkerProblem('state-invalid');
  }
  const metadata = readStoreMetadata(database, formatVersion);
  if (
    metadata.formatVersion !== formatVersion ||
    metadata.workspaceIdentity !== workspaceIdentity ||
    metadata.stateVersion < 0 ||
    metadata.generationNumber < 1
  ) {
    throw new WorkerProblem('state-invalid');
  }
  const candidates = complete ? scanRecordQuarantineCandidates(database, undefined, true) : [];
  if (complete) validateCommandLedger(database, metadata.stateVersion);
  if (formatVersion === STORE_FORMAT_VERSION) {
    if (complete) {
      if (appendDetectedQuarantine) {
        appendQuarantineReports(database, candidates);
      }
      const reports = readAllQuarantineReports(database);
      const reportByRecord = new Map(reports.map(report => [report.recordIdentity, report]));
      for (const candidate of candidates) {
        if (!reportByRecord.has(candidate.recordIdentity)) {
          throw new WorkerProblem('state-corrupt');
        }
      }
      for (const report of reports) {
        const record = readRawStoredRecord(database, report.recordIdentity);
        if (
          !record ||
          record.workflowIdentity !== report.workflowIdentity ||
          !validText(report.recordIdentity, IDENTITY_MAX_LENGTH) ||
          !validText(report.workflowIdentity, IDENTITY_MAX_LENGTH)
        ) {
          throw new WorkerProblem('state-corrupt');
        }
      }
    } else {
      const invalidReport = database
        .prepare(
          `SELECT q.record_identity
         FROM quarantine_reports q
         LEFT JOIN records r ON r.record_identity = q.record_identity
         WHERE r.record_identity IS NULL
            OR r.workflow_identity <> q.workflow_identity
         LIMIT 1`,
        )
        .get();
      if (invalidReport !== undefined) {
        throw new WorkerProblem('state-corrupt');
      }
    }
  }
  return { metadata, quarantineCandidates: candidates };
}

function inspectFormat(generationFile: string): number {
  const database = new DatabaseSync(generationFile, {
    readOnly: true,
    enableForeignKeyConstraints: true,
    timeout: 0,
  });
  try {
    configureReadOnlyDatabase(database);
    return databaseFormatVersion(database);
  } finally {
    database.close();
  }
}

function preserveFailedGeneration(stateRoot: string, selected: string, reason: string): void {
  const source = path.join(stateRoot, selected);
  try {
    const digest = digestBytes(readFileSync(source));
    const quarantineRoot = path.join(stateRoot, 'quarantine', 'generations');
    mkdirSync(quarantineRoot, { recursive: true, mode: 0o700 });
    chmodSync(path.join(stateRoot, 'quarantine'), 0o700);
    chmodSync(quarantineRoot, 0o700);
    const stem = `${selected}.${digest}`;
    const preserved = path.join(quarantineRoot, `${stem}.sqlite`);
    if (!existsSync(preserved)) {
      const temporary = path.join(quarantineRoot, `.${stem}.${randomUUID()}.tmp`);
      copyFileSync(source, temporary);
      chmodSync(temporary, 0o600);
      fsyncPath(temporary);
      try {
        renameSync(temporary, preserved);
      } catch (error) {
        rmSync(temporary, { force: true });
        if (!existsSync(preserved)) throw error;
      }
    }
    chmodSync(preserved, 0o600);
    if (digestBytes(readFileSync(preserved)) !== digest) {
      throw new Error('Preserved generation digest mismatch');
    }
    const report = path.join(quarantineRoot, `${stem}.json`);
    if (!existsSync(report)) {
      const bytes = Buffer.from(
        `${JSON.stringify(
          {
            version: 1,
            generation: selected,
            sha256: digest,
            reason,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      const temporary = `${report}.${randomUUID()}.tmp`;
      writeBytesDurably(temporary, bytes);
      renameSync(temporary, report);
    }
    chmodSync(report, 0o600);
    fsyncPath(quarantineRoot);
  } catch {
    throw new WorkerProblem('state-unavailable');
  }
}

function isBusyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('locked') || message.includes('busy');
}

function acquireWriterLease(stateRoot: string): void {
  const lockFile = path.join(stateRoot, LOCK_FILE_NAME);
  lockDatabase = new DatabaseSync(lockFile, {
    enableForeignKeyConstraints: true,
    timeout: 0,
  });
  chmodSync(lockFile, 0o600);
  try {
    lockDatabase.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA synchronous = FULL;
      PRAGMA fullfsync = ON;
      PRAGMA busy_timeout = 0;
      BEGIN EXCLUSIVE;
    `);
  } catch (error) {
    lockDatabase.close();
    lockDatabase = undefined;
    if (isBusyError(error)) {
      throw new WorkerProblem('writer-lease-unavailable');
    }
    throw error;
  }
}

function copyLegacyGeneration(
  source: DatabaseSync,
  target: DatabaseSync,
  sourceValidation: GenerationValidation,
): void {
  target.exec('BEGIN IMMEDIATE');
  try {
    const copyRows = (selectSql: string, insertSql: string, fields: readonly string[]): void => {
      const insert = target.prepare(insertSql);
      for (const value of source.prepare(selectSql).all()) {
        const row = rowRecord(value);
        if (!row) throw new WorkerProblem('state-corrupt');
        insert.run(...fields.map(field => row[field] as SQLInputValue));
      }
    };

    copyRows(
      `SELECT command_identity, request_checksum, committed_state_version,
              result_kind, result_schema_version, result_payload,
              result_checksum
       FROM command_ledger ORDER BY command_identity`,
      `INSERT INTO command_ledger
        (command_identity, request_checksum, committed_state_version,
         result_kind, result_schema_version, result_payload, result_checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'command_identity',
        'request_checksum',
        'committed_state_version',
        'result_kind',
        'result_schema_version',
        'result_payload',
        'result_checksum',
      ],
    );
    copyRows(
      `SELECT record_identity, workflow_identity, kind, schema_version,
              record_class, revision, payload, checksum
       FROM records ORDER BY record_identity`,
      `INSERT INTO records
        (record_identity, workflow_identity, kind, schema_version,
         record_class, revision, payload, checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'record_identity',
        'workflow_identity',
        'kind',
        'schema_version',
        'record_class',
        'revision',
        'payload',
        'checksum',
      ],
    );
    copyRows(
      'SELECT digest, bytes FROM content_objects ORDER BY digest',
      'INSERT INTO content_objects (digest, bytes) VALUES (?, ?)',
      ['digest', 'bytes'],
    );
    copyRows(
      `SELECT record_identity, role, ordinal, digest
       FROM record_content ORDER BY record_identity, ordinal`,
      `INSERT INTO record_content
        (record_identity, role, ordinal, digest)
       VALUES (?, ?, ?, ?)`,
      ['record_identity', 'role', 'ordinal', 'digest'],
    );

    const insertReport = target.prepare(
      `INSERT INTO quarantine_reports
        (record_identity, workflow_identity, reason,
         expected_checksum, observed_checksum)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const report of sourceValidation.quarantineCandidates) {
      insertReport.run(
        report.recordIdentity,
        report.workflowIdentity,
        report.reason,
        report.expectedChecksum,
        report.observedChecksum,
      );
    }
    target
      .prepare(`UPDATE store_metadata SET state_version = ? WHERE singleton = 1`)
      .run(sourceValidation.metadata.stateVersion);
    target.exec('COMMIT');
  } catch (error) {
    if (target.isTransaction) target.exec('ROLLBACK');
    throw error;
  }
}

function migrateGeneration(
  stateRoot: string,
  selected: string,
  workspaceIdentity: string,
  sourceFormat: number,
): string {
  if (sourceFormat !== LEGACY_STORE_FORMAT_VERSION) {
    throw new WorkerProblem('state-invalid');
  }
  const sourceFile = path.join(stateRoot, selected);
  const source = new DatabaseSync(sourceFile, {
    readOnly: true,
    enableForeignKeyConstraints: true,
    timeout: 0,
  });
  let sourceValidation: GenerationValidation;
  try {
    configureReadOnlyDatabase(source);
    sourceValidation = validateGeneration(source, workspaceIdentity, sourceFormat, false, true);
  } catch (error) {
    source.close();
    preserveFailedGeneration(stateRoot, selected, 'source-generation-validation-failed');
    if (error instanceof WorkerProblem) throw error;
    throw new WorkerProblem('state-corrupt');
  }

  const nextGeneration = sourceValidation.metadata.generationNumber + 1;
  const finalName = generationName(nextGeneration);
  const finalFile = path.join(stateRoot, finalName);
  const candidateFile = path.join(stateRoot, `.candidate-${nextGeneration}-${randomUUID()}.sqlite`);
  let candidate: DatabaseSync | undefined;
  try {
    candidate = new DatabaseSync(candidateFile, {
      enableForeignKeyConstraints: true,
      timeout: 0,
    });
    createSchema(candidate, workspaceIdentity, nextGeneration);
    copyLegacyGeneration(source, candidate, sourceValidation);
    source.close();

    if (data.failpoint === 'migration-candidate-corrupt') {
      candidate
        .prepare(
          `UPDATE records SET payload = ?
         WHERE record_identity = (SELECT record_identity FROM records LIMIT 1)`,
        )
        .run(new Uint8Array([0x63, 0x6f, 0x72, 0x72, 0x75, 0x70, 0x74]));
    }
    if (data.failpoint === 'migration-candidate-semantic-invalid') {
      candidate.prepare(`UPDATE store_metadata SET state_version = 0 WHERE singleton = 1`).run();
    }
    candidate.close();
    candidate = undefined;
    chmodSync(candidateFile, 0o600);
    fsyncPath(candidateFile);
    migrationCheckpoint('candidate-created');

    const validation = new DatabaseSync(candidateFile, {
      enableForeignKeyConstraints: true,
      timeout: 0,
    });
    try {
      configureWritableDatabase(validation);
      validateGeneration(validation, workspaceIdentity, STORE_FORMAT_VERSION, false, true);
    } finally {
      validation.close();
    }
    fsyncPath(candidateFile);
    migrationCheckpoint('candidate-validated');

    renameSync(candidateFile, finalFile);
    chmodSync(finalFile, 0o600);
    migrationCheckpoint('generation-installed');
    fsyncPath(stateRoot);
    installCurrent(stateRoot, finalName, true);
    return finalName;
  } catch (error) {
    try {
      if (candidate?.isTransaction) candidate.exec('ROLLBACK');
    } catch {
      // The original migration failure remains authoritative.
    }
    try {
      candidate?.close();
    } catch {
      // The original migration failure remains authoritative.
    }
    try {
      source.close();
    } catch {
      // The original migration failure remains authoritative.
    }
    if (error instanceof WorkerProblem && (error.code === 'state-invalid' || error.code === 'state-corrupt')) {
      throw new WorkerProblem('state-migration-failed');
    }
    if (error instanceof WorkerProblem) throw error;
    throw new WorkerProblem('state-migration-failed');
  }
}

function openWritableGeneration(stateRoot: string, selected: string, workspaceIdentity: string): DatabaseSync {
  const generationFile = path.join(stateRoot, selected);
  const database = new DatabaseSync(generationFile, {
    enableForeignKeyConstraints: true,
    timeout: 0,
  });
  try {
    configureWritableDatabase(database);
    validateGeneration(database, workspaceIdentity, STORE_FORMAT_VERSION, true, false);
    return database;
  } catch (error) {
    database.close();
    preserveFailedGeneration(stateRoot, selected, 'authoritative-generation-validation-failed');
    if (error instanceof WorkerProblem) throw error;
    throw new WorkerProblem('state-corrupt');
  }
}

function openUnknownNewerGeneration(generationFile: string, formatVersion: number): void {
  stateDatabase = new DatabaseSync(generationFile, {
    readOnly: true,
    enableForeignKeyConstraints: true,
    timeout: 0,
  });
  configureReadOnlyDatabase(stateDatabase);
  stateAccess = 'read-only-newer';
  openedFormatVersion = formatVersion;
}

function ensurePrivateDirectories(): string {
  const workspaceRoot = path.join(data.privateStateDirectory, 'workspaces', data.workspaceIdentity);
  const stateRoot = path.join(workspaceRoot, 'authoritative-state');
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  chmodSync(data.privateStateDirectory, 0o700);
  chmodSync(path.join(data.privateStateDirectory, 'workspaces'), 0o700);
  chmodSync(workspaceRoot, 0o700);
  chmodSync(stateRoot, 0o700);
  return stateRoot;
}

function authoritativeGenerationEntries(stateRoot: string): readonly string[] {
  return readdirSync(stateRoot)
    .filter(entry => GENERATION_PATTERN.test(entry))
    .sort();
}

/**
 * First creation renames the empty generation into place before writing
 * CURRENT. A crash between the two leaves exactly that generation: still empty,
 * first, and owned by this workspace. Anything else stays refused.
 */
function isInterruptedInitialGeneration(stateRoot: string, name: string): boolean {
  if (!name.startsWith('generation-0001-')) return false;
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path.join(stateRoot, name), {
      readOnly: true,
      enableForeignKeyConstraints: true,
      timeout: 0,
    });
    configureReadOnlyDatabase(database);
    checkContainer(database, true);
    if (databaseFormatVersion(database) !== STORE_FORMAT_VERSION) return false;
    const metadata = readStoreMetadata(database, STORE_FORMAT_VERSION);
    const records = rowRecord(database.prepare('SELECT COUNT(*) AS count FROM records').get());
    const commands = rowRecord(database.prepare('SELECT COUNT(*) AS count FROM command_ledger').get());
    return (
      metadata.formatVersion === STORE_FORMAT_VERSION &&
      metadata.workspaceIdentity === data.workspaceIdentity &&
      metadata.stateVersion === 0 &&
      metadata.generationNumber === 1 &&
      records?.count === 0 &&
      commands?.count === 0
    );
  } catch {
    return false;
  } finally {
    database?.close();
  }
}

function startDatabases(): void {
  if (!WORKSPACE_ID_PATTERN.test(data.workspaceIdentity)) {
    throw new WorkerProblem('state-invalid');
  }
  const stateRoot = ensurePrivateDirectories();
  const current = currentFilePath(stateRoot);

  if (!existsSync(current)) {
    const generations = authoritativeGenerationEntries(stateRoot);
    acquireWriterLease(stateRoot);
    if (existsSync(current)) {
      // Another prior owner cannot remain while this lease is held, but an
      // interrupted initializer may already have installed CURRENT.
    } else if (generations.length === 0) {
      createInitialGeneration(stateRoot, data.workspaceIdentity);
    } else if (generations.length === 1 && generations[0] === 'generation-1.sqlite') {
      const legacyFile = path.join(stateRoot, generations[0]);
      let format: number;
      try {
        format = inspectFormat(legacyFile);
      } catch {
        preserveFailedGeneration(stateRoot, generations[0], 'unselected-legacy-generation-unreadable');
        throw new WorkerProblem('state-corrupt');
      }
      if (format !== LEGACY_STORE_FORMAT_VERSION) {
        throw new WorkerProblem('state-invalid');
      }
      installCurrent(stateRoot, generations[0], false);
    } else if (generations.length === 1 && isInterruptedInitialGeneration(stateRoot, generations[0]!)) {
      installCurrent(stateRoot, generations[0]!, false);
    } else {
      throw new WorkerProblem('state-invalid');
    }
  }

  let selected = readCurrent(stateRoot);
  let generationFile = path.join(stateRoot, selected);
  if (!existsSync(generationFile)) throw new WorkerProblem('state-invalid');
  let formatVersion: number;
  try {
    formatVersion = inspectFormat(generationFile);
  } catch {
    preserveFailedGeneration(stateRoot, selected, 'authoritative-generation-container-unreadable');
    throw new WorkerProblem('state-corrupt');
  }

  if (formatVersion > STORE_FORMAT_VERSION) {
    if (lockDatabase) {
      if (lockDatabase.isTransaction) lockDatabase.exec('ROLLBACK');
      lockDatabase.close();
      lockDatabase = undefined;
    }
    openUnknownNewerGeneration(generationFile, formatVersion);
    return;
  }
  if (formatVersion < LEGACY_STORE_FORMAT_VERSION) {
    throw new WorkerProblem('state-invalid');
  }

  if (!lockDatabase) acquireWriterLease(stateRoot);
  selected = readCurrent(stateRoot);
  generationFile = path.join(stateRoot, selected);
  if (!existsSync(generationFile)) throw new WorkerProblem('state-invalid');
  try {
    formatVersion = inspectFormat(generationFile);
  } catch {
    preserveFailedGeneration(stateRoot, selected, 'authoritative-generation-container-unreadable');
    throw new WorkerProblem('state-corrupt');
  }
  if (formatVersion > STORE_FORMAT_VERSION) {
    throw new WorkerProblem('state-read-only-newer');
  }
  if (formatVersion === LEGACY_STORE_FORMAT_VERSION) {
    selected = migrateGeneration(stateRoot, selected, data.workspaceIdentity, formatVersion);
  }
  stateDatabase = openWritableGeneration(stateRoot, selected, data.workspaceIdentity);
  stateAccess = 'read-write';
  openedFormatVersion = STORE_FORMAT_VERSION;
}

function closeDatabases(): void {
  if (stateDatabase) {
    try {
      stateDatabase.close();
    } finally {
      stateDatabase = undefined;
    }
  }
  if (lockDatabase) {
    try {
      if (lockDatabase.isTransaction) lockDatabase.exec('ROLLBACK');
    } finally {
      lockDatabase.close();
      lockDatabase = undefined;
    }
  }
}

function requireWritableDatabase(): DatabaseSync {
  if (stateAccess === 'read-only-newer') {
    throw new WorkerProblem('state-read-only-newer');
  }
  if (!stateDatabase) throw new WorkerProblem('state-closed');
  return stateDatabase;
}

function currentStateVersion(database: DatabaseSync): number {
  return readStoreMetadata(database, STORE_FORMAT_VERSION).stateVersion;
}

function readStoredCommand(
  database: DatabaseSync,
  commandIdentity: string,
):
  | {
      readonly requestChecksum: string;
      readonly stateVersion: number;
      readonly result: StateCommandResultEnvelope;
    }
  | undefined {
  const row = rowRecord(
    database
      .prepare(
        `SELECT request_checksum, committed_state_version, result_kind,
              result_schema_version, result_payload, result_checksum
       FROM command_ledger WHERE command_identity = ?`,
      )
      .get(commandIdentity),
  );
  if (!row) return undefined;

  const result = {
    kind: stringField(row, 'result_kind'),
    schemaVersion: integerField(row, 'result_schema_version'),
    payload: bytesField(row, 'result_payload'),
  };
  const storedChecksum = stringField(row, 'result_checksum');
  if (!SHA256_PATTERN.test(storedChecksum) || storedChecksum !== resultChecksum(result)) {
    throw new WorkerProblem('state-corrupt');
  }
  return {
    requestChecksum: stringField(row, 'request_checksum'),
    stateVersion: integerField(row, 'committed_state_version'),
    result,
  };
}

function digestContent(record: StateRecordWrite): readonly DigestedContent[] {
  return record.content.map(content => ({
    role: content.role,
    digest: digestBytes(content.bytes),
    bytes: content.bytes,
  }));
}

function storeContent(database: DatabaseSync, content: readonly DigestedContent[]): void {
  const insert = database.prepare('INSERT OR IGNORE INTO content_objects (digest, bytes) VALUES (?, ?)');
  const select = database.prepare('SELECT bytes FROM content_objects WHERE digest = ?');
  for (const object of content) {
    insert.run(object.digest, object.bytes);
    const row = rowRecord(select.get(object.digest));
    if (!row || !bytesEqual(bytesField(row, 'bytes'), object.bytes)) {
      throw new WorkerProblem('state-corrupt');
    }
  }
}

function replaceContentReferences(
  database: DatabaseSync,
  recordIdentity: string,
  content: readonly DigestedContent[],
): void {
  database.prepare('DELETE FROM record_content WHERE record_identity = ?').run(recordIdentity);
  const insert = database.prepare(
    `INSERT INTO record_content (record_identity, role, ordinal, digest)
     VALUES (?, ?, ?, ?)`,
  );
  content.forEach((object, ordinal) => {
    insert.run(recordIdentity, object.role, ordinal, object.digest);
  });
}

function rejectRecord(
  reason: 'immutable-record-exists' | 'record-class-conflict' | 'record-metadata-conflict',
  stateVersion: number,
  recordIdentity: string,
): never {
  throw new CommitRejection({
    status: 'rejected',
    reason,
    stateVersion,
    recordIdentity,
  });
}

function writeRecord(database: DatabaseSync, record: StateRecordWrite, stateVersion: number): void {
  const existing = readRawStoredRecord(database, record.recordIdentity);
  const content = digestContent(record);
  storeContent(database, content);

  if (record.recordClass === 'immutable') {
    if (existing) {
      rejectRecord(
        existing.recordClass === 'immutable' ? 'immutable-record-exists' : 'record-class-conflict',
        stateVersion,
        record.recordIdentity,
      );
    }
    const revision = 1;
    const checksum = recordChecksum({ ...record, revision }, content);
    database
      .prepare(
        `INSERT INTO records
        (record_identity, workflow_identity, kind, schema_version,
         record_class, revision, payload, checksum)
       VALUES (?, ?, ?, ?, 'immutable', ?, ?, ?)`,
      )
      .run(
        record.recordIdentity,
        record.workflowIdentity,
        record.kind,
        record.schemaVersion,
        revision,
        record.payload,
        checksum,
      );
    replaceContentReferences(database, record.recordIdentity, content);
    return;
  }

  if (!existing) {
    if (record.expectedRevision !== 0) {
      throw new CommitRejection({
        status: 'rejected',
        reason: 'revision-conflict',
        stateVersion,
        recordIdentity: record.recordIdentity,
        actualRevision: 0,
      });
    }
    const revision = 1;
    const checksum = recordChecksum({ ...record, revision }, content);
    database
      .prepare(
        `INSERT INTO records
        (record_identity, workflow_identity, kind, schema_version,
         record_class, revision, payload, checksum)
       VALUES (?, ?, ?, ?, 'revisioned', ?, ?, ?)`,
      )
      .run(
        record.recordIdentity,
        record.workflowIdentity,
        record.kind,
        record.schemaVersion,
        revision,
        record.payload,
        checksum,
      );
    replaceContentReferences(database, record.recordIdentity, content);
    return;
  }

  if (existing.recordClass !== 'revisioned') {
    rejectRecord('record-class-conflict', stateVersion, record.recordIdentity);
  }
  if (
    existing.workflowIdentity !== record.workflowIdentity ||
    existing.kind !== record.kind ||
    existing.schemaVersion !== record.schemaVersion
  ) {
    rejectRecord('record-metadata-conflict', stateVersion, record.recordIdentity);
  }
  if (existing.revision !== record.expectedRevision) {
    throw new CommitRejection({
      status: 'rejected',
      reason: 'revision-conflict',
      stateVersion,
      recordIdentity: record.recordIdentity,
      actualRevision: existing.revision,
    });
  }

  const revision = existing.revision + 1;
  const checksum = recordChecksum({ ...record, revision }, content);
  database
    .prepare(
      `UPDATE records SET revision = ?, payload = ?, checksum = ?
     WHERE record_identity = ?`,
    )
    .run(revision, record.payload, checksum, record.recordIdentity);
  replaceContentReferences(database, record.recordIdentity, content);
}

function commit(request: StateCommitRequest): StateCommitResult {
  const database = requireWritableDatabase();
  const requestChecksum = commandRequestChecksum(request);
  const currentVersion = currentStateVersion(database);
  const priorCommand = readStoredCommand(database, request.commandIdentity);
  if (priorCommand) {
    if (priorCommand.requestChecksum !== requestChecksum) {
      return {
        status: 'rejected',
        reason: 'command-identity-conflict',
        stateVersion: currentVersion,
      };
    }
    return {
      status: 'duplicate',
      commandIdentity: request.commandIdentity,
      stateVersion: priorCommand.stateVersion,
      result: priorCommand.result,
    };
  }
  if (request.expectedStateVersion !== currentVersion) {
    return {
      status: 'rejected',
      reason: 'state-version-mismatch',
      stateVersion: currentVersion,
    };
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    request.records.forEach((record, index) => {
      writeRecord(database, record, currentVersion);
      if (index === 0 && data.failpoint === 'after-first-record-write') {
        throw new WorkerProblem('state-commit-failed');
      }
    });

    const nextVersion = currentVersion + 1;
    if (!Number.isSafeInteger(nextVersion)) {
      throw new WorkerProblem('state-invalid');
    }
    database.prepare('UPDATE store_metadata SET state_version = ? WHERE singleton = 1').run(nextVersion);
    const checksum = resultChecksum(request.result);
    database
      .prepare(
        `INSERT INTO command_ledger
        (command_identity, request_checksum, committed_state_version,
         result_kind, result_schema_version, result_payload, result_checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        request.commandIdentity,
        requestChecksum,
        nextVersion,
        request.result.kind,
        request.result.schemaVersion,
        request.result.payload,
        checksum,
      );
    database.exec('COMMIT');
    return {
      status: 'committed',
      commandIdentity: request.commandIdentity,
      stateVersion: nextVersion,
      result: {
        kind: request.result.kind,
        schemaVersion: request.result.schemaVersion,
        payload: new Uint8Array(request.result.payload),
      },
    };
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    if (error instanceof CommitRejection) return error.result;
    throw error;
  }
}

function readContentReferences(
  database: DatabaseSync,
  recordIdentity: string,
  includeContent: boolean,
): readonly StateContentReference[] {
  const rows = database
    .prepare(
      `SELECT role, digest FROM record_content
     WHERE record_identity = ? ORDER BY ordinal`,
    )
    .all(recordIdentity);
  return rows.map(value => {
    const row = rowRecord(value);
    if (!row) throw new WorkerProblem('state-corrupt');
    const role = stringField(row, 'role');
    const digest = stringField(row, 'digest');
    if (!SHA256_PATTERN.test(digest)) {
      throw new WorkerProblem('state-corrupt');
    }
    if (!includeContent) return { role, digest };

    const contentRow = rowRecord(database.prepare('SELECT bytes FROM content_objects WHERE digest = ?').get(digest));
    if (!contentRow) throw new WorkerProblem('state-corrupt');
    const bytes = bytesField(contentRow, 'bytes');
    if (digestBytes(bytes) !== digest) {
      throw new WorkerProblem('state-corrupt');
    }
    return { role, digest, bytes };
  });
}

function readRecord(database: DatabaseSync, recordIdentity: string, includeContent: boolean): StateRecord | undefined {
  const stored = readRawStoredRecord(database, recordIdentity);
  if (!stored) return undefined;
  const content = readContentReferences(database, recordIdentity, includeContent);
  const expectedChecksum = recordChecksum(stored, content);
  if (!SHA256_PATTERN.test(stored.checksum) || stored.checksum !== expectedChecksum) {
    throw new WorkerProblem('state-corrupt');
  }
  return { ...stored, content };
}

function quarantineReportForRecord(database: DatabaseSync, recordIdentity: string): StateQuarantineReport | undefined {
  const row = rowRecord(
    database
      .prepare(
        `SELECT record_identity, workflow_identity, reason,
              expected_checksum, observed_checksum
       FROM quarantine_reports WHERE record_identity = ?`,
      )
      .get(recordIdentity),
  );
  if (!row) return undefined;
  const reason = stringField(row, 'reason');
  if (
    reason !== 'record-envelope-invalid' &&
    reason !== 'record-checksum-mismatch' &&
    reason !== 'record-content-invalid'
  ) {
    throw new WorkerProblem('state-corrupt');
  }
  return {
    recordIdentity: stringField(row, 'record_identity'),
    workflowIdentity: stringField(row, 'workflow_identity'),
    reason,
    expectedChecksum: stringField(row, 'expected_checksum'),
    observedChecksum: stringField(row, 'observed_checksum'),
  };
}

function read(request: StateReadRequest): StateReadResult {
  const database = requireWritableDatabase();
  const stateVersion = currentStateVersion(database);
  const records: (StateRecord | undefined)[] = [];
  for (const recordIdentity of request.recordIdentities) {
    appendQuarantineReports(database, scanRecordQuarantineCandidates(database, recordIdentity, request.includeContent));
    if (quarantineReportForRecord(database, recordIdentity)) {
      records.push(undefined);
      continue;
    }
    try {
      records.push(readRecord(database, recordIdentity, request.includeContent));
    } catch (error) {
      if (!(error instanceof WorkerProblem) || error.code !== 'state-corrupt') {
        throw error;
      }
      appendQuarantineReports(database, scanRecordQuarantineCandidates(database, recordIdentity, true));
      if (!quarantineReportForRecord(database, recordIdentity)) throw error;
      records.push(undefined);
    }
  }
  const quarantineReports: StateQuarantineReport[] = [];
  const reported = new Set<string>();
  for (const recordIdentity of request.recordIdentities) {
    if (reported.has(recordIdentity)) continue;
    const report = quarantineReportForRecord(database, recordIdentity);
    if (report) {
      quarantineReports.push(report);
      reported.add(recordIdentity);
    }
  }
  return { stateVersion, records, quarantineReports };
}

function readContent(request: StateContentReadRequest): StateContentReadResult {
  const database = requireWritableDatabase();
  const stateVersion = currentStateVersion(database);
  const records = new Map<string, StateRecord | undefined>();
  const bytesByDigest = new Map<string, Uint8Array>();

  for (const recordIdentity of new Set(request.windows.map(window => window.recordIdentity))) {
    appendQuarantineReports(database, scanRecordQuarantineCandidates(database, recordIdentity, true));
    if (quarantineReportForRecord(database, recordIdentity)) {
      records.set(recordIdentity, undefined);
      continue;
    }
    records.set(recordIdentity, readRecord(database, recordIdentity, false));
  }

  const windows = request.windows.map(window => {
    const report = quarantineReportForRecord(database, window.recordIdentity);
    if (report) {
      return {
        status: 'unavailable' as const,
        recordIdentity: window.recordIdentity,
        role: window.role,
        reason: 'quarantined' as const,
      };
    }
    const record = records.get(window.recordIdentity);
    if (record === undefined) {
      return {
        status: 'unavailable' as const,
        recordIdentity: window.recordIdentity,
        role: window.role,
        reason: 'record-not-found' as const,
      };
    }
    const reference = record.content.find(candidate => candidate.role === window.role);
    if (reference === undefined) {
      return {
        status: 'unavailable' as const,
        recordIdentity: window.recordIdentity,
        role: window.role,
        reason: 'role-not-found' as const,
      };
    }

    let exact = bytesByDigest.get(reference.digest);
    if (exact === undefined) {
      const row = rowRecord(
        database.prepare('SELECT bytes FROM content_objects WHERE digest = ?').get(reference.digest),
      );
      if (!row) throw new WorkerProblem('state-corrupt');
      exact = bytesField(row, 'bytes');
      if (digestBytes(exact) !== reference.digest) {
        appendQuarantineReports(database, scanRecordQuarantineCandidates(database, window.recordIdentity, true));
        if (quarantineReportForRecord(database, window.recordIdentity)) {
          return {
            status: 'unavailable' as const,
            recordIdentity: window.recordIdentity,
            role: window.role,
            reason: 'quarantined' as const,
          };
        }
        throw new WorkerProblem('state-corrupt');
      }
      bytesByDigest.set(reference.digest, exact);
    }

    const offset = Math.min(window.offset, exact.byteLength);
    const bytes = exact.slice(offset, offset + window.length);
    return {
      status: 'available' as const,
      recordIdentity: window.recordIdentity,
      role: window.role,
      offset: window.offset,
      byteLength: bytes.byteLength,
      totalByteLength: exact.byteLength,
      bytes,
      digest: reference.digest,
      complete: window.offset + bytes.byteLength >= exact.byteLength,
    };
  });

  const quarantineReports: StateContentReadResult['quarantineReports'][number][] = [];
  const reported = new Set<string>();
  for (const window of request.windows) {
    if (reported.has(window.recordIdentity)) continue;
    const report = quarantineReportForRecord(database, window.recordIdentity);
    if (report) {
      quarantineReports.push(report);
      reported.add(window.recordIdentity);
    }
  }
  return { stateVersion, windows, quarantineReports };
}

function status(): StateStatus {
  if (!stateDatabase) throw new WorkerProblem('state-closed');
  if (stateAccess === 'read-only-newer') {
    return {
      access: stateAccess,
      storeFormatVersion: openedFormatVersion,
      recovery: {
        status: 'unknown-newer-format',
      },
    };
  }
  const metadata = readStoreMetadata(stateDatabase, STORE_FORMAT_VERSION);
  const row = rowRecord(
    stateDatabase
      .prepare(
        `SELECT COUNT(*) AS record_count,
              COUNT(DISTINCT workflow_identity) AS workflow_count
       FROM quarantine_reports`,
      )
      .get(),
  );
  if (!row) throw new WorkerProblem('state-corrupt');
  return {
    access: stateAccess,
    storeFormatVersion: openedFormatVersion,
    stateVersion: metadata.stateVersion,
    recovery: {
      status: 'available',
      quarantinedRecordCount: integerField(row, 'record_count'),
      affectedWorkflowCount: integerField(row, 'workflow_count'),
    },
  };
}

function errorCode(error: unknown): AuthoritativeStateErrorCode {
  if (error instanceof WorkerProblem) return error.code;
  return 'state-unavailable';
}

function handleRequest(message: StateWorkerRequest): void {
  try {
    if (message.kind === 'commit') {
      const value = commit(message.request);
      if (data.pauseAfterCommitCommandIdentity === message.request.commandIdentity) {
        // Contract-only fault seam: the Durable Commit exists, but the owner
        // receives no acknowledgement and must treat the outcome as unknown.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
      send({ kind: 'result', id: message.id, value });
      return;
    }
    if (message.kind === 'read') {
      send({ kind: 'result', id: message.id, value: read(message.request) });
      return;
    }
    if (message.kind === 'read-content') {
      send({
        kind: 'result',
        id: message.id,
        value: readContent(message.request),
      });
      return;
    }
    if (message.kind === 'status') {
      send({ kind: 'result', id: message.id, value: status() });
      return;
    }

    closeDatabases();
    send({ kind: 'result', id: message.id, value: undefined });
    port.close();
  } catch (error) {
    send({ kind: 'failed', id: message.id, code: errorCode(error) });
  }
}

try {
  startDatabases();
  send({ kind: 'ready' });
  port.on('message', (message: StateWorkerRequest) => handleRequest(message));
} catch (error) {
  try {
    closeDatabases();
  } catch {
    // Startup is already failed and no authority is reported as ready.
  }
  send({ kind: 'startup-failed', code: errorCode(error) });
  port.close();
}
