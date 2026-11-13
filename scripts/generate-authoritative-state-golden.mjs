import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Explicit reviewed fixture generator. Tests consume the checked-in bytes and
// never invoke this command while judging migration behavior.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'packages/workspace/test/fixtures/authoritative-state/format-1');
const generationName = 'generation-1.sqlite';
const generationFile = path.join(fixtureRoot, generationName);
const workspaceIdentity = 'wsp_11111111-1111-4111-8111-111111111111';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function checksumParts(domain, metadata, payload) {
  return createHash('sha256')
    .update(domain)
    .update('\u0000')
    .update(JSON.stringify(metadata))
    .update('\u0000')
    .update(payload)
    .digest('hex');
}

function resultChecksum(kind, schemaVersion, payload) {
  return checksumParts('neoflow-state-command-result-v1', [kind, schemaVersion], payload);
}

function recordChecksum(record, content) {
  return checksumParts(
    'neoflow-state-record-v1',
    [
      record.recordIdentity,
      record.workflowIdentity,
      record.kind,
      record.schemaVersion,
      record.recordClass,
      record.revision,
      content.map(item => [item.role, item.digest]),
    ],
    record.payload,
  );
}

rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
const database = new DatabaseSync(generationFile);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = FULL;
  PRAGMA fullfsync = ON;
  BEGIN IMMEDIATE;
  CREATE TABLE store_metadata (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    format_version INTEGER NOT NULL CHECK (format_version > 0),
    workspace_identity TEXT NOT NULL,
    state_version INTEGER NOT NULL CHECK (state_version >= 0)
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
  PRAGMA user_version = 1;
`);
database
  .prepare(
    `INSERT INTO store_metadata
    (singleton, format_version, workspace_identity, state_version)
   VALUES (1, 1, ?, 2)`,
  )
  .run(workspaceIdentity);

const records = [
  {
    recordIdentity: 'record-golden-stable',
    workflowIdentity: 'workflow-golden-stable',
    kind: 'review.snapshot',
    schemaVersion: 1,
    recordClass: 'immutable',
    revision: 1,
    payload: new Uint8Array([0x00, 0xff, 0x53, 0x31]),
    content: [
      {
        role: 'exact-source',
        bytes: new Uint8Array([0x00, 0x0a, 0x80, 0xff, 0x53]),
      },
    ],
  },
  {
    recordIdentity: 'record-golden-secondary',
    workflowIdentity: 'workflow-golden-secondary',
    kind: 'review.question-draft',
    schemaVersion: 2,
    recordClass: 'revisioned',
    revision: 3,
    payload: new TextEncoder().encode('golden schema-v2 draft'),
    content: [],
  },
];
const insertRecord = database.prepare(
  `INSERT INTO records
    (record_identity, workflow_identity, kind, schema_version,
     record_class, revision, payload, checksum)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertContent = database.prepare('INSERT OR IGNORE INTO content_objects (digest, bytes) VALUES (?, ?)');
const insertReference = database.prepare(
  `INSERT INTO record_content (record_identity, role, ordinal, digest)
   VALUES (?, ?, ?, ?)`,
);
for (const record of records) {
  const content = record.content.map(item => ({
    ...item,
    digest: sha256(item.bytes),
  }));
  insertRecord.run(
    record.recordIdentity,
    record.workflowIdentity,
    record.kind,
    record.schemaVersion,
    record.recordClass,
    record.revision,
    record.payload,
    recordChecksum(record, content),
  );
  content.forEach((item, ordinal) => {
    insertContent.run(item.digest, item.bytes);
    insertReference.run(record.recordIdentity, item.role, ordinal, item.digest);
  });
}

const insertCommand = database.prepare(
  `INSERT INTO command_ledger
    (command_identity, request_checksum, committed_state_version,
     result_kind, result_schema_version, result_payload, result_checksum)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
for (const [index, record] of records.entries()) {
  const stateVersion = index + 1;
  const resultKind = 'fixture.recorded';
  const resultPayload = new TextEncoder().encode(record.recordIdentity);
  insertCommand.run(
    `command-golden-${stateVersion}`,
    sha256(new TextEncoder().encode(`fixture-request-${stateVersion}`)),
    stateVersion,
    resultKind,
    1,
    resultPayload,
    resultChecksum(resultKind, 1, resultPayload),
  );
}
database.exec('COMMIT');
database.close();
chmodSync(generationFile, 0o600);
writeFileSync(path.join(fixtureRoot, 'CURRENT'), `${generationName}\n`, {
  mode: 0o600,
});

const generationSha256 = sha256(readFileSync(generationFile));
const manifest = {
  fixtureFormat: 1,
  storeFormatVersion: 1,
  workspaceIdentity,
  currentGeneration: generationName,
  generationSha256,
  stateVersion: 2,
  records: records.map(record => ({
    recordIdentity: record.recordIdentity,
    workflowIdentity: record.workflowIdentity,
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    recordClass: record.recordClass,
    revision: record.revision,
    payloadSha256: sha256(record.payload),
    contentSha256: record.content.map(item => sha256(item.bytes)),
  })),
};
writeFileSync(path.join(fixtureRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote ${path.relative(repoRoot, fixtureRoot)} (${generationSha256})`);
