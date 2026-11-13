import { WORKSPACE_INTERFACE_VERSION } from '@buildframe/workspace';
import type {
  WorkspaceAttention,
  WorkspaceCommand,
  WorkspaceViewRequest,
  WorkspaceViewScope,
} from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  HarnessAttachmentEstablishment,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAttachment,
} from '@buildframe/workspace/harness-interaction';

import {
  HARNESS_ADAPTER_PROTOCOL_VERSION,
  LOCAL_RUNTIME_PROTOCOL_VERSION,
  type LocalRuntimeClientRole,
  type RuntimeCodeIdentity,
} from './contracts.js';

export const MAX_FRAME_BYTES: number = 1024 * 1024;
export const MAX_PENDING_OUTPUT_BYTES: number = 2 * MAX_FRAME_BYTES;
export const MAX_PENDING_OPERATIONS: number = 64;
export const MAX_SUBSCRIPTIONS: number = 32;
export const BOOTSTRAP_TIMEOUT_MS: number = 5_000;

export const CLIENT_ROLES: readonly LocalRuntimeClientRole[] = Object.freeze([
  'tui',
  'cli',
  'harness-adapter',
  'editor-adapter',
]);

export interface BootstrapFrame {
  readonly type: 'bootstrap';
  readonly protocolVersion: number;
  readonly workspaceInterfaceVersion: number;
  readonly workspaceIdentity: string;
  readonly role: string;
  /** Present only for launcher-owned discovery and replacement. */
  readonly runtimeCodeIdentity?: RuntimeCodeIdentity;
  readonly runtimeCodeMismatch?: 'retire';
}

interface WorkspaceExecuteFrame {
  readonly type: 'workspace.operation';
  readonly requestId: string;
  readonly operation: 'execute';
  /** Opaque on the wire; the Workspace owner remains the runtime validator. */
  readonly payload: WorkspaceCommand;
}

interface WorkspaceReadFrame {
  readonly type: 'workspace.operation';
  readonly requestId: string;
  readonly operation: 'read';
  /** Opaque on the wire; the Workspace owner remains the runtime validator. */
  readonly payload: WorkspaceViewRequest;
}

export type WorkspaceOperationFrame = WorkspaceExecuteFrame | WorkspaceReadFrame;

export interface WorkspaceSubscribeFrame {
  readonly type: 'workspace.subscribe';
  readonly subscriptionId: string;
  /** Opaque on the wire; the Workspace owner remains the runtime validator. */
  readonly scope: WorkspaceViewScope;
}

export interface WorkspaceUnsubscribeFrame {
  readonly type: 'workspace.unsubscribe';
  readonly subscriptionId: string;
}

/** This client's latest attention; it needs no reply. */
export interface WorkspaceAttentionFrame {
  readonly type: 'workspace.attention';
  readonly attention: WorkspaceAttention;
}

export type ClientSessionFrame =
  | WorkspaceOperationFrame
  | WorkspaceSubscribeFrame
  | WorkspaceUnsubscribeFrame
  | WorkspaceAttentionFrame;

export interface HarnessAdapterEstablishFrame {
  readonly type: 'harness.adapter.establish';
  readonly adapterProtocolVersion: typeof HARNESS_ADAPTER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
}

export interface HarnessAdapterEvidenceFrame {
  readonly type: 'harness.adapter.evidence';
  readonly requestId: string;
  readonly evidence: NormalizedHarnessEvidence;
}

export interface HarnessAdapterDirectiveObservationFrame {
  readonly type: 'harness.adapter.directive-observation';
  readonly requestId: string;
  readonly observation: HarnessDirectiveObservation;
}

export type HarnessAdapterClientFrame =
  | HarnessAdapterEstablishFrame
  | HarnessAdapterEvidenceFrame
  | HarnessAdapterDirectiveObservationFrame;

export type BootstrapRejectionCode =
  | 'invalid-bootstrap'
  | 'protocol-incompatible'
  | 'workspace-interface-incompatible'
  | 'workspace-mismatch'
  | 'runtime-code-mismatch'
  | 'role-rejected';

export interface BootstrapAcceptedFrame {
  readonly type: 'bootstrap.accepted';
  readonly protocolVersion: typeof LOCAL_RUNTIME_PROTOCOL_VERSION;
  readonly workspaceInterfaceVersion: typeof WORKSPACE_INTERFACE_VERSION;
  readonly workspaceIdentity: string;
  readonly role: LocalRuntimeClientRole;
  readonly runtimeGeneration: string;
}

export interface BootstrapRejectedFrame {
  readonly type: 'bootstrap.rejected';
  readonly code: BootstrapRejectionCode;
  readonly supportedProtocolVersion?: number;
  readonly receivedProtocolVersion?: number;
  readonly supportedWorkspaceInterfaceVersion?: number;
  readonly receivedWorkspaceInterfaceVersion?: number;
}

export interface WorkspaceResultFrame {
  readonly type: 'workspace.result';
  readonly requestId: string;
  readonly result: unknown;
}

export interface WorkspaceErrorFrame {
  readonly type: 'workspace.error';
  readonly requestId: string;
  readonly code: 'workspace-call-rejected';
}

export interface WorkspaceSubscribedFrame {
  readonly type: 'workspace.subscribed';
  readonly subscriptionId: string;
}

export interface WorkspaceSubscriptionErrorFrame {
  readonly type: 'workspace.subscription-error';
  readonly subscriptionId: string;
  readonly code: 'workspace-subscription-rejected';
}

export interface WorkspaceUnsubscribedFrame {
  readonly type: 'workspace.unsubscribed';
  readonly subscriptionId: string;
}

export interface WorkspaceUpdateFrame {
  readonly type: 'workspace.update';
  readonly subscriptionId: string;
  readonly sequence: number;
  readonly update: unknown;
}

export interface ProtocolErrorFrame {
  readonly type: 'protocol.error';
  readonly code:
    | 'malformed-frame'
    | 'frame-too-large'
    | 'unexpected-frame'
    | 'too-many-pending-operations'
    | 'too-many-subscriptions';
}

export type ServerSessionFrame =
  | WorkspaceResultFrame
  | WorkspaceErrorFrame
  | WorkspaceSubscribedFrame
  | WorkspaceSubscriptionErrorFrame
  | WorkspaceUnsubscribedFrame
  | WorkspaceUpdateFrame
  | ProtocolErrorFrame;

export interface HarnessAdapterEstablishedFrame {
  readonly type: 'harness.adapter.established';
  readonly adapterProtocolVersion: typeof HARNESS_ADAPTER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly result: HarnessAttachmentEstablishment;
}

export interface HarnessAdapterEvidenceAcknowledgementFrame {
  readonly type: 'harness.adapter.evidence-acknowledgement';
  readonly requestId: string;
  readonly acknowledgement: HarnessEvidenceAcknowledgement;
}

/** Another session in this checkout connected; this one is no longer connected. */
export interface HarnessAdapterReleasedFrame {
  readonly type: 'harness.adapter.released';
  readonly reason: 'replaced';
}

export interface HarnessAdapterDirectiveFrame {
  readonly type: 'harness.adapter.directive';
  readonly requestId: string;
  readonly directive: CommittedHarnessDirective;
}

export type HarnessAdapterServerFrame =
  | HarnessAdapterEstablishedFrame
  | HarnessAdapterEvidenceAcknowledgementFrame
  | HarnessAdapterDirectiveFrame
  | HarnessAdapterReleasedFrame
  | ProtocolErrorFrame;

const REQUEST_ID_PATTERN = /^(?:req|sub)_[a-z0-9]{1,48}$/u;
const HARNESS_REQUEST_ID_PATTERN = /^(?:hae|had|has)_[a-z0-9]{1,48}$/u;
const RUNTIME_GENERATION_PATTERN = /^rtg_[0-9a-f-]{36}$/u;
const RUNTIME_CODE_IDENTITY_PATTERN = /^rtc_[0-9a-f]{64}$/u;
const WORKSPACE_IDENTITY_PATTERN = /^wsp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowed.has(key));
}

function isSafeVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRequestIdentity(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function isWorkspaceIdentity(value: unknown): value is string {
  return typeof value === 'string' && WORKSPACE_IDENTITY_PATTERN.test(value);
}

export function isRuntimeGeneration(value: unknown): value is string {
  return typeof value === 'string' && RUNTIME_GENERATION_PATTERN.test(value);
}

export function isRuntimeCodeIdentity(value: unknown): value is RuntimeCodeIdentity {
  return typeof value === 'string' && RUNTIME_CODE_IDENTITY_PATTERN.test(value);
}

export function isClientRole(value: unknown): value is LocalRuntimeClientRole {
  return typeof value === 'string' && CLIENT_ROLES.includes(value as LocalRuntimeClientRole);
}

export function parseBootstrapFrame(value: unknown): BootstrapFrame | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !hasOnlyKeys(
      value,
      ['type', 'protocolVersion', 'workspaceInterfaceVersion', 'workspaceIdentity', 'role'],
      ['runtimeCodeIdentity', 'runtimeCodeMismatch'],
    ) ||
    value.type !== 'bootstrap' ||
    !isSafeVersion(value.protocolVersion) ||
    !isSafeVersion(value.workspaceInterfaceVersion) ||
    !isWorkspaceIdentity(value.workspaceIdentity) ||
    typeof value.role !== 'string' ||
    (value.runtimeCodeIdentity === undefined) !== (value.runtimeCodeMismatch === undefined) ||
    (value.runtimeCodeIdentity !== undefined &&
      (!isRuntimeCodeIdentity(value.runtimeCodeIdentity) || value.runtimeCodeMismatch !== 'retire'))
  ) {
    return undefined;
  }

  return value as unknown as BootstrapFrame;
}

export function parseClientSessionFrame(value: unknown): ClientSessionFrame | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  if (value.type === 'workspace.operation') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'operation', 'payload']) ||
      !isRequestIdentity(value.requestId) ||
      !String(value.requestId).startsWith('req_') ||
      (value.operation !== 'execute' && value.operation !== 'read')
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceOperationFrame;
  }

  if (value.type === 'workspace.subscribe') {
    if (
      !hasOnlyKeys(value, ['type', 'subscriptionId', 'scope']) ||
      !isRequestIdentity(value.subscriptionId) ||
      !String(value.subscriptionId).startsWith('sub_')
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceSubscribeFrame;
  }

  if (value.type === 'workspace.unsubscribe') {
    if (
      !hasOnlyKeys(value, ['type', 'subscriptionId']) ||
      !isRequestIdentity(value.subscriptionId) ||
      !String(value.subscriptionId).startsWith('sub_')
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceUnsubscribeFrame;
  }

  if (value.type === 'workspace.attention') {
    if (
      !hasOnlyKeys(value, ['type', 'attention']) ||
      (value.attention !== 'foreground' && value.attention !== 'background')
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceAttentionFrame;
  }

  return undefined;
}

export function parseHarnessAdapterClientFrame(value: unknown): HarnessAdapterClientFrame | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  if (value.type === 'harness.adapter.establish') {
    if (
      !hasOnlyKeys(value, ['type', 'adapterProtocolVersion', 'requestId', 'manifest', 'attachment']) ||
      value.adapterProtocolVersion !== HARNESS_ADAPTER_PROTOCOL_VERSION ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('has_') ||
      !isRecord(value.manifest) ||
      !isRecord(value.attachment)
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterEstablishFrame;
  }

  if (value.type === 'harness.adapter.evidence') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'evidence']) ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('hae_') ||
      !isRecord(value.evidence) ||
      typeof value.evidence.kind !== 'string'
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterEvidenceFrame;
  }

  if (value.type === 'harness.adapter.directive-observation') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'observation']) ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('had_') ||
      !isRecord(value.observation) ||
      !['accepted-for-observation', 'proven-not-dispatched'].includes(String(value.observation.status))
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterDirectiveObservationFrame;
  }

  return undefined;
}

export function parseBootstrapAcceptedFrame(value: unknown): BootstrapAcceptedFrame | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'type',
      'protocolVersion',
      'workspaceInterfaceVersion',
      'workspaceIdentity',
      'role',
      'runtimeGeneration',
    ]) ||
    value.type !== 'bootstrap.accepted' ||
    value.protocolVersion !== LOCAL_RUNTIME_PROTOCOL_VERSION ||
    value.workspaceInterfaceVersion !== WORKSPACE_INTERFACE_VERSION ||
    !isWorkspaceIdentity(value.workspaceIdentity) ||
    !isClientRole(value.role) ||
    !isRuntimeGeneration(value.runtimeGeneration)
  ) {
    return undefined;
  }

  return value as unknown as BootstrapAcceptedFrame;
}

export function parseBootstrapRejectedFrame(value: unknown): BootstrapRejectedFrame | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['type', 'code'],
      [
        'supportedProtocolVersion',
        'receivedProtocolVersion',
        'supportedWorkspaceInterfaceVersion',
        'receivedWorkspaceInterfaceVersion',
      ],
    ) ||
    value.type !== 'bootstrap.rejected' ||
    ![
      'invalid-bootstrap',
      'protocol-incompatible',
      'workspace-interface-incompatible',
      'workspace-mismatch',
      'runtime-code-mismatch',
      'role-rejected',
    ].includes(String(value.code))
  ) {
    return undefined;
  }

  for (const key of [
    'supportedProtocolVersion',
    'receivedProtocolVersion',
    'supportedWorkspaceInterfaceVersion',
    'receivedWorkspaceInterfaceVersion',
  ]) {
    if (value[key] !== undefined && !isSafeVersion(value[key])) return undefined;
  }

  return value as unknown as BootstrapRejectedFrame;
}

export function parseServerSessionFrame(value: unknown): ServerSessionFrame | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  if (value.type === 'workspace.result') {
    if (!hasOnlyKeys(value, ['type', 'requestId', 'result']) || !isRequestIdentity(value.requestId)) {
      return undefined;
    }
    return value as unknown as WorkspaceResultFrame;
  }

  if (value.type === 'workspace.error') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'code']) ||
      !isRequestIdentity(value.requestId) ||
      value.code !== 'workspace-call-rejected'
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceErrorFrame;
  }

  if (value.type === 'workspace.subscribed') {
    if (!hasOnlyKeys(value, ['type', 'subscriptionId']) || !isRequestIdentity(value.subscriptionId)) {
      return undefined;
    }
    return value as unknown as WorkspaceSubscribedFrame;
  }

  if (value.type === 'workspace.unsubscribed') {
    if (!hasOnlyKeys(value, ['type', 'subscriptionId']) || !isRequestIdentity(value.subscriptionId)) {
      return undefined;
    }
    return value as unknown as WorkspaceUnsubscribedFrame;
  }

  if (value.type === 'workspace.subscription-error') {
    if (
      !hasOnlyKeys(value, ['type', 'subscriptionId', 'code']) ||
      !isRequestIdentity(value.subscriptionId) ||
      value.code !== 'workspace-subscription-rejected'
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceSubscriptionErrorFrame;
  }

  if (value.type === 'workspace.update') {
    if (
      !hasOnlyKeys(value, ['type', 'subscriptionId', 'sequence', 'update']) ||
      !isRequestIdentity(value.subscriptionId) ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) < 1
    ) {
      return undefined;
    }
    return value as unknown as WorkspaceUpdateFrame;
  }

  if (value.type === 'protocol.error') {
    if (
      !hasOnlyKeys(value, ['type', 'code']) ||
      ![
        'malformed-frame',
        'frame-too-large',
        'unexpected-frame',
        'too-many-pending-operations',
        'too-many-subscriptions',
      ].includes(String(value.code))
    ) {
      return undefined;
    }
    return value as unknown as ProtocolErrorFrame;
  }

  return undefined;
}

export function parseHarnessAdapterServerFrame(value: unknown): HarnessAdapterServerFrame | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;

  if (value.type === 'harness.adapter.established') {
    if (
      !hasOnlyKeys(value, ['type', 'adapterProtocolVersion', 'requestId', 'result']) ||
      value.adapterProtocolVersion !== HARNESS_ADAPTER_PROTOCOL_VERSION ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('has_') ||
      !isRecord(value.result) ||
      !['established', 'refused'].includes(String(value.result.status))
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterEstablishedFrame;
  }

  if (value.type === 'harness.adapter.evidence-acknowledgement') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'acknowledgement']) ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('hae_') ||
      !isRecord(value.acknowledgement) ||
      !['applied', 'refused'].includes(String(value.acknowledgement.status))
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterEvidenceAcknowledgementFrame;
  }

  if (value.type === 'harness.adapter.released') {
    if (!hasOnlyKeys(value, ['type', 'reason']) || value.reason !== 'replaced') return undefined;
    return value as unknown as HarnessAdapterReleasedFrame;
  }

  if (value.type === 'harness.adapter.directive') {
    if (
      !hasOnlyKeys(value, ['type', 'requestId', 'directive']) ||
      typeof value.requestId !== 'string' ||
      !HARNESS_REQUEST_ID_PATTERN.test(value.requestId) ||
      !value.requestId.startsWith('had_') ||
      !isRecord(value.directive) ||
      ![
        'harness.direct-review.dispatch',
        'harness.direct-review-message.dispatch',
        'harness.direct-invocation.interrupt',
      ].includes(String(value.directive.kind)) ||
      value.directive.contractVersion !== 1
    ) {
      return undefined;
    }
    return value as unknown as HarnessAdapterDirectiveFrame;
  }

  if (value.type === 'protocol.error') {
    return parseServerSessionFrame(value) as ProtocolErrorFrame | undefined;
  }

  return undefined;
}

export function harnessBridgeEvidenceIdentity(
  runtimeGeneration: string,
  attachmentIdentity: string,
  occurrenceIdentity: string,
  invocationIdentity?: string,
): string {
  return invocationIdentity === undefined
    ? `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:disconnected`
    : `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:${invocationIdentity}:correlation-lost`;
}

export function bootstrapAcceptedFrame(
  workspaceIdentity: string,
  role: LocalRuntimeClientRole,
  runtimeGeneration: string,
): BootstrapAcceptedFrame {
  return {
    type: 'bootstrap.accepted',
    protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
    workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
    workspaceIdentity,
    role,
    runtimeGeneration,
  };
}
