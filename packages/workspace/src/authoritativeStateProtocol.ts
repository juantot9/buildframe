export type StateRecordClass = 'immutable' | 'revisioned';

export interface StateContentWrite {
  readonly role: string;
  readonly bytes: Uint8Array;
}

interface StateRecordWriteBase {
  readonly recordIdentity: string;
  readonly workflowIdentity: string;
  readonly kind: string;
  readonly schemaVersion: number;
  readonly payload: Uint8Array;
  readonly content: readonly StateContentWrite[];
}

export interface ImmutableStateRecordWrite extends StateRecordWriteBase {
  readonly recordClass: 'immutable';
}

export interface RevisionedStateRecordWrite extends StateRecordWriteBase {
  readonly recordClass: 'revisioned';
  /** Zero creates the draft; later writes compare against the current revision. */
  readonly expectedRevision: number;
}

export type StateRecordWrite = ImmutableStateRecordWrite | RevisionedStateRecordWrite;

export interface StateCommandResultEnvelope {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly payload: Uint8Array;
}

export interface StateCommitRequest {
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly records: readonly StateRecordWrite[];
  readonly result: StateCommandResultEnvelope;
}

export interface StateCommitAccepted {
  readonly status: 'committed' | 'duplicate';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly result: StateCommandResultEnvelope;
}

export interface StateVersionMismatch {
  readonly status: 'rejected';
  readonly reason: 'state-version-mismatch';
  readonly stateVersion: number;
}

export interface StateCommandIdentityConflict {
  readonly status: 'rejected';
  readonly reason: 'command-identity-conflict';
  readonly stateVersion: number;
}

export interface StateRecordConflict {
  readonly status: 'rejected';
  readonly reason: 'immutable-record-exists' | 'record-class-conflict' | 'record-metadata-conflict';
  readonly stateVersion: number;
  readonly recordIdentity: string;
}

export interface StateRevisionConflict {
  readonly status: 'rejected';
  readonly reason: 'revision-conflict';
  readonly stateVersion: number;
  readonly recordIdentity: string;
  readonly actualRevision: number;
}

export type StateCommitResult =
  | StateCommitAccepted
  | StateVersionMismatch
  | StateCommandIdentityConflict
  | StateRecordConflict
  | StateRevisionConflict;

export interface StateReadRequest {
  readonly recordIdentities: readonly string[];
  /** Exact content bytes are loaded only for an explicit request. */
  readonly includeContent: boolean;
}

export interface StateContentReference {
  readonly role: string;
  readonly digest: string;
  readonly bytes?: Uint8Array;
}

export interface StateRecord {
  readonly recordIdentity: string;
  readonly workflowIdentity: string;
  readonly kind: string;
  /** Record schemas evolve independently from the store format. */
  readonly schemaVersion: number;
  readonly recordClass: StateRecordClass;
  readonly revision: number;
  readonly payload: Uint8Array;
  readonly checksum: string;
  readonly content: readonly StateContentReference[];
}

export type StateQuarantineReason = 'record-envelope-invalid' | 'record-checksum-mismatch' | 'record-content-invalid';

/** Persistent recovery fact for one smallest retrievable record. */
export interface StateQuarantineReport {
  readonly recordIdentity: string;
  readonly workflowIdentity: string;
  readonly reason: StateQuarantineReason;
  readonly expectedChecksum: string;
  readonly observedChecksum: string;
}

export interface StateReadResult {
  readonly stateVersion: number;
  /** Entries correspond positionally to the requested record identities. */
  readonly records: readonly (StateRecord | undefined)[];
  /** Reports are returned only for requested records. */
  readonly quarantineReports: readonly StateQuarantineReport[];
}

export interface StateContentWindowRequest {
  readonly recordIdentity: string;
  readonly role: string;
  readonly offset: number;
  readonly length: number;
}

export interface StateContentWindowAvailable {
  readonly status: 'available';
  readonly recordIdentity: string;
  readonly role: string;
  readonly offset: number;
  readonly byteLength: number;
  readonly totalByteLength: number;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly complete: boolean;
}

export interface StateContentWindowUnavailable {
  readonly status: 'unavailable';
  readonly recordIdentity: string;
  readonly role: string;
  readonly reason: 'record-not-found' | 'role-not-found' | 'quarantined';
}

export type StateContentWindow = StateContentWindowAvailable | StateContentWindowUnavailable;

export interface StateContentReadRequest {
  /** Bounded exact-content windows; whole content never crosses this Interface implicitly. */
  readonly windows: readonly StateContentWindowRequest[];
}

export interface StateContentReadResult {
  readonly stateVersion: number;
  /** Entries correspond positionally to the requested windows. */
  readonly windows: readonly StateContentWindow[];
  readonly quarantineReports: readonly StateQuarantineReport[];
}

export type StateRecoverySummary =
  | {
      readonly status: 'available';
      readonly quarantinedRecordCount: number;
      readonly affectedWorkflowCount: number;
    }
  | {
      readonly status: 'unknown-newer-format';
    };

export interface StateStatus {
  readonly access: 'read-write' | 'read-only-newer';
  readonly storeFormatVersion: number;
  /** Unknown newer formats are not interpreted as a known State version. */
  readonly stateVersion?: number;
  readonly recovery: StateRecoverySummary;
}

export type StateMigrationCheckpoint =
  | 'candidate-created'
  | 'candidate-validated'
  | 'generation-installed'
  | 'current-prepared'
  | 'current-switched';

export type StateTestFailpoint =
  | 'after-first-record-write'
  | 'migration-candidate-corrupt'
  | 'migration-candidate-semantic-invalid'
  | StateMigrationCheckpoint;

export type StateWorkerRequest =
  | {
      readonly id: number;
      readonly kind: 'commit';
      readonly request: StateCommitRequest;
    }
  | {
      readonly id: number;
      readonly kind: 'read';
      readonly request: StateReadRequest;
    }
  | {
      readonly id: number;
      readonly kind: 'read-content';
      readonly request: StateContentReadRequest;
    }
  | {
      readonly id: number;
      readonly kind: 'status';
    }
  | {
      readonly id: number;
      readonly kind: 'close';
    };

export type AuthoritativeStateErrorCode =
  | 'writer-lease-unavailable'
  | 'state-invalid'
  | 'state-corrupt'
  | 'state-unavailable'
  | 'state-commit-failed'
  | 'state-migration-failed'
  | 'state-read-only-newer'
  | 'state-request-timeout'
  | 'state-closed';

export type StateWorkerResponse =
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'migration-checkpoint';
      readonly checkpoint: StateMigrationCheckpoint;
    }
  | {
      readonly kind: 'startup-failed';
      readonly code: AuthoritativeStateErrorCode;
    }
  | {
      readonly kind: 'result';
      readonly id: number;
      readonly value: StateCommitResult | StateReadResult | StateContentReadResult | StateStatus | undefined;
    }
  | {
      readonly kind: 'failed';
      readonly id: number;
      readonly code: AuthoritativeStateErrorCode;
    };

export interface StateWorkerData {
  readonly privateStateDirectory: string;
  readonly workspaceIdentity: string;
  readonly failpoint: StateTestFailpoint | undefined;
  readonly pauseAfterCommitCommandIdentity: string | undefined;
  readonly pauseAtMigrationCheckpoint: StateMigrationCheckpoint | undefined;
}
