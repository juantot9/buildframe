import type { WorkspaceIdentity } from '@buildframe/workspace';
import { sha256, sha256Parts } from '@buildframe/workspace/sha256';
import type {
  CommittedHarnessDirective,
  DispatchDirectReviewInvocationDirective,
  DispatchDirectReviewMessageInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  HarnessInvocationIdentity,
  NormalizedHarnessEvidence,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';

import { createPiReviewedCapabilityManifest, type PiDirectReviewAuthority } from './capability.js';

const READ_TOOL_NAMES = ['read', 'grep', 'find', 'ls'] as const;
const MAX_NATIVE_PROMPT_BYTES = 768 * 1024;
const CORRELATION_ENTRY_TYPE = 'neoflow.pi-direct-invocation/1';

type PiTerminalStopReason = 'stop' | 'length' | 'error' | 'aborted' | 'toolUse';

export interface PiNativeTool {
  readonly name: string;
  readonly source: string;
}

export interface PiStoredEntry {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
  readonly message?: {
    readonly role: string;
    readonly content?: unknown;
    readonly stopReason?: PiTerminalStopReason;
  };
}

export interface PiNativeHost {
  isIdle(): boolean;
  getActiveTools(): readonly string[];
  getAllTools(): readonly PiNativeTool[];
  setActiveTools(toolNames: readonly string[]): void;
  sendUserMessage(message: string): void;
  appendCorrelationMarker(data: PiCorrelationMarker): void;
  abort(): void;
}

export interface PiAdapterScheduler {
  set(delayMilliseconds: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

export interface PiCorrelationMarker {
  readonly schema: 'neoflow.pi-correlation/1';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly correlationIdentity: string;
  readonly disclosureSha256: string;
}

export interface CreatePiReviewedAdapterRequest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly hostVersion: string;
  readonly sessionIdentity: string;
  readonly sessionEpoch: string;
  readonly native: PiNativeHost;
  readonly scheduler?: PiAdapterScheduler;
  /** Defaults to workspace write; the owner narrows it to discussion only. */
  readonly authority?: PiDirectReviewAuthority;
}

interface ActiveInvocation {
  readonly directive: DispatchDirectReviewInvocationDirective | DispatchDirectReviewMessageInvocationDirective;
  readonly correlationIdentity: string;
  readonly prompt: string;
  readonly toolsBefore: readonly string[];
  phase: 'awaiting-preflight' | 'prepared' | 'started';
  inputObserved: boolean;
  startEvidenceApplied: boolean;
  timeoutHandle: unknown;
}

function exactIdentity(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}_${sha256Parts(parts)}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = sortedUnique(left);
  const normalizedRight = sortedUnique(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function defaultScheduler(): PiAdapterScheduler {
  return {
    set: (delayMilliseconds, callback) => {
      const timer = setTimeout(callback, delayMilliseconds);
      timer.unref();
      return timer;
    },
    clear: handle => clearTimeout(handle as NodeJS.Timeout),
  };
}

function userText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const text: string[] = [];
  for (const item of content) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('type' in item) ||
      item.type !== 'text' ||
      !('text' in item) ||
      typeof item.text !== 'string'
    ) {
      return undefined;
    }
    text.push(item.text);
  }
  return text.join('\n');
}

function finalizedAssistantText(
  content: unknown,
  maximumBytes: number,
): { readonly body: string; readonly byteLength: number; readonly sha256: string } | undefined {
  if (!Array.isArray(content)) return undefined;
  const textBlocks: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null || !('type' in block)) {
      return undefined;
    }
    if (block.type === 'text') {
      if (!('text' in block) || typeof block.text !== 'string') return undefined;
      textBlocks.push(block.text);
      continue;
    }
    if (block.type === 'thinking') {
      if (!('thinking' in block) || typeof block.thinking !== 'string') return undefined;
      continue;
    }
    if (block.type === 'toolCall') continue;
    return undefined;
  }
  const body = textBlocks.join('');
  const byteLength = Buffer.byteLength(body, 'utf8');
  if (body.length === 0 || byteLength > maximumBytes) return undefined;
  return { body, byteLength, sha256: sha256(body) };
}

function markerMatches(value: unknown, expected: PiCorrelationMarker): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    value.schema === expected.schema &&
    'attachmentIdentity' in value &&
    value.attachmentIdentity === expected.attachmentIdentity &&
    'invocationIdentity' in value &&
    value.invocationIdentity === expected.invocationIdentity &&
    'correlationIdentity' in value &&
    value.correlationIdentity === expected.correlationIdentity &&
    'disclosureSha256' in value &&
    value.disclosureSha256 === expected.disclosureSha256
  );
}

export function serializePiDirectReviewPrompt(
  directive: DispatchDirectReviewInvocationDirective | DispatchDirectReviewMessageInvocationDirective,
  correlationIdentity: string,
  authority: PiDirectReviewAuthority = 'workspace-write',
): string {
  if (directive.kind === 'harness.direct-review-message.dispatch') {
    const material = directive.disclosure.outgoingMaterial;
    const bytes = Buffer.from(material.bytesBase64, 'base64');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (
      bytes.toString('base64') !== material.bytesBase64 ||
      bytes.byteLength !== material.byteLength ||
      [...text].length !== material.characterLength ||
      sha256(bytes) !== material.sha256 ||
      material.sha256 !== directive.disclosure.sha256
    ) {
      throw new TypeError('Invalid exact Review Message material');
    }
    return text;
  }
  const envelope = {
    schema: 'neoflow.pi-direct-question-review/1' as const,
    correlation: {
      correlationIdentity,
      invocationIdentity: directive.invocationIdentity,
      handoffIdentity: directive.handoffIdentity,
    },
    capability: directive.capabilitySnapshot.capability,
    disclosure: directive.disclosure,
  };
  return [
    authority === 'workspace-write'
      ? '# BuildFrame Workspace-write Review Handoff'
      : '# BuildFrame Question-only Review Handoff',
    '',
    ...(authority === 'workspace-write'
      ? [
          'This Review request may modify the workspace. Apply what is asked with the tools available in this session, then report exactly what changed.',
          'Use only the tools available to this session.',
        ]
      : [
          'This is discussion-only. Answer the disclosed Questions without modifying the workspace or running mutating tools.',
          'Use only the request-scoped read tools made available by the BuildFrame Pi Adapter.',
        ]),
    'Do not infer additional authority from the surrounding Pi session.',
    '',
    '<buildframe-direct-review>',
    JSON.stringify(envelope),
    '</buildframe-direct-review>',
  ].join('\n');
}

function bridgeEvidenceIdentity(
  runtimeGeneration: string,
  attachmentIdentity: HarnessAttachmentIdentity,
  occurrenceIdentity: string,
  invocationIdentity?: HarnessInvocationIdentity,
): string {
  return invocationIdentity === undefined
    ? `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:disconnected`
    : `local-runtime:${runtimeGeneration}:${attachmentIdentity}:${occurrenceIdentity}:${invocationIdentity}:correlation-lost`;
}

export class PiReviewedAdapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedHarnessAdapter['manifest'];
  readonly attachment: ReviewedHarnessAttachment;
  readonly #native: PiNativeHost;
  readonly #scheduler: PiAdapterScheduler;
  readonly #sessionEpoch: string;
  readonly #authority: PiDirectReviewAuthority;
  readonly #pendingEvidence = new Map<string, NormalizedHarnessEvidence>();
  #sink: HarnessEvidenceSink | undefined;
  #active: ActiveInvocation | undefined;
  #availabilitySequence = 0;
  #bridgeLossSequence = 0;
  #flushing = false;

  constructor(request: CreatePiReviewedAdapterRequest) {
    this.#authority = request.authority ?? 'workspace-write';
    this.manifest = createPiReviewedCapabilityManifest(request.hostVersion, this.#authority);
    this.#native = request.native;
    this.#scheduler = request.scheduler ?? defaultScheduler();
    this.#sessionEpoch = request.sessionEpoch;
    const attachmentIdentity = exactIdentity(
      'att',
      'pi-attachment-v1',
      request.workspaceIdentity,
      request.hostVersion,
      request.sessionIdentity,
      request.sessionEpoch,
    ) as HarnessAttachmentIdentity;
    const attachment: ReviewedHarnessAttachment = {
      evidenceIdentity: `pi-attachment:${sha256Parts([attachmentIdentity, request.sessionEpoch])}`,
      attachmentIdentity,
      workspaceIdentity: request.workspaceIdentity,
      hostVersion: request.hostVersion,
      destination: {
        harnessLabel: this.manifest.adapterDisplayName,
        sessionLabel: `Pi session ${request.sessionIdentity.slice(0, 12)}`,
        repositoryLabel: request.canonicalCheckout.split('/').filter(Boolean).at(-1) ?? 'workspace',
        canonicalCheckout: request.canonicalCheckout,
      },
      availability: request.native.isIdle() ? { status: 'available' } : { status: 'blocked', reason: 'busy' },
    };
    this.attachment = Object.freeze(attachment);
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.#sink = sink;
    return Object.freeze({
      perform: async (directive: CommittedHarnessDirective) => await this.#perform(directive),
    });
  }

  ownsInvocation(): boolean {
    return this.#active !== undefined;
  }

  onInput(event: {
    readonly text: string;
    readonly source: 'interactive' | 'rpc' | 'extension';
    readonly hasImages: boolean;
  }): { readonly action: 'continue' | 'handled' } {
    const active = this.#active;
    if (active === undefined) return { action: 'continue' };
    if (
      active.phase === 'awaiting-preflight' &&
      event.source === 'extension' &&
      !event.hasImages &&
      event.text === active.prompt
    ) {
      active.inputObserved = true;
      return { action: 'continue' };
    }
    return { action: 'handled' };
  }

  async beforeAgentStart(prompt: string | undefined, hasImages: boolean): Promise<void> {
    const active = this.#active;
    if (active === undefined || active.phase === 'started') return;
    if (
      active.phase === 'awaiting-preflight' &&
      active.inputObserved &&
      !hasImages &&
      prompt === active.prompt &&
      this.#gateIsExact()
    ) {
      active.phase = 'prepared';
      return;
    }
    await this.#loseCorrelation(active, 'correlation-lost');
  }

  async agentStarted(): Promise<void> {
    const active = this.#active;
    if (active === undefined) {
      await this.#emitAvailability({ status: 'blocked', reason: 'busy' }, 'native-busy');
      return;
    }
    if (active.phase === 'started') return;
    if (active.phase !== 'prepared') {
      await this.#loseCorrelation(active, 'correlation-lost');
      return;
    }
    this.#scheduler.clear(active.timeoutHandle);
    active.phase = 'started';
    const evidence: NormalizedHarnessEvidence = {
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: this.#evidenceIdentity(active, 'start'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
    };
    const acknowledgement = await this.#emit(evidence);
    active.startEvidenceApplied = acknowledgement?.status === 'applied';
  }

  onToolCall(toolName: string): { readonly block: true; readonly reason: string } | undefined {
    // Workspace write is bounded by the tools this session actually has; only
    // the enforced read-only authority narrows and blocks. Extensions and
    // operating-system effects stay outside both.
    if (this.#authority === 'workspace-write') return undefined;
    if (this.#active !== undefined && !READ_TOOL_NAMES.includes(toolName as (typeof READ_TOOL_NAMES)[number])) {
      return {
        block: true,
        reason: `BuildFrame discussion-only Review blocked non-read tool ${toolName}`,
      };
    }
    return undefined;
  }

  async agentSettled(entries: readonly PiStoredEntry[]): Promise<void> {
    const active = this.#active;
    if (active === undefined) {
      await this.#emitAvailability({ status: 'available' }, 'native-idle');
      return;
    }
    if (active.phase !== 'started' || !active.startEvidenceApplied) {
      await this.#loseCorrelation(active, 'terminal-evidence-lost');
      return;
    }

    const marker: PiCorrelationMarker = {
      schema: 'neoflow.pi-correlation/1',
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      correlationIdentity: active.correlationIdentity,
      disclosureSha256: active.directive.disclosure.sha256,
    };
    const markerIndex = entries.findIndex(
      entry =>
        entry.type === 'custom' && entry.customType === CORRELATION_ENTRY_TYPE && markerMatches(entry.data, marker),
    );
    const afterMarker = markerIndex < 0 ? [] : entries.slice(markerIndex + 1);
    const users = afterMarker.filter(entry => entry.type === 'message' && entry.message?.role === 'user');
    const assistants = afterMarker.filter(entry => entry.type === 'message' && entry.message?.role === 'assistant');
    const finalAssistant = assistants.at(-1)?.message;
    if (
      users.length !== 1 ||
      userText(users[0]?.message?.content) !== active.prompt ||
      finalAssistant?.stopReason === undefined
    ) {
      await this.#loseCorrelation(active, 'terminal-evidence-lost');
      return;
    }

    const outcome =
      finalAssistant.stopReason === 'stop'
        ? 'ended-normally'
        : finalAssistant.stopReason === 'aborted'
          ? 'interrupted'
          : 'failed';
    const resultContract = active.directive.capabilitySnapshot.capability.artifactResultContract;
    const finalText =
      outcome === 'ended-normally'
        ? finalizedAssistantText(finalAssistant.content, resultContract.maximumBytes)
        : undefined;
    const evidence: NormalizedHarnessEvidence = {
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: this.#evidenceIdentity(active, 'terminal'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      outcome,
      ...(finalText === undefined
        ? {}
        : {
            result: {
              contractVersion: 1,
              contractIdentity: resultContract.contractIdentity,
              source: resultContract.source,
              ...finalText,
            },
          }),
      ...(outcome === 'ended-normally'
        ? {}
        : {
            reason: outcome === 'interrupted' ? ('interruption-observed' as const) : ('harness-failed' as const),
          }),
    };
    await this.#emit(evidence);
    this.#finishActive(active);
    await this.#emitAvailability({ status: 'available' }, 'native-idle');
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.#flushEvidence();
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: this.#availabilityIdentity(`runtime-connected:${runtimeGeneration}`),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability: this.#native.isIdle() ? { status: 'available' } : { status: 'blocked', reason: 'busy' },
    });
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    this.#bridgeLossSequence += 1;
    const occurrenceIdentity = `client-${this.#bridgeLossSequence.toString(36)}`;
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: bridgeEvidenceIdentity(
        runtimeGeneration,
        this.attachment.attachmentIdentity,
        occurrenceIdentity,
      ),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    const active = this.#active;
    if (active === undefined) return;
    if (!this.#native.isIdle()) {
      try {
        this.#native.abort();
      } catch {
        // Correlation is already being conservatively resolved as unknown.
      }
    }
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: bridgeEvidenceIdentity(
        runtimeGeneration,
        this.attachment.attachmentIdentity,
        occurrenceIdentity,
        active.directive.invocationIdentity,
      ),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason: 'attachment-lost',
    });
    this.#finishActive(active);
  }

  async sessionEnding(): Promise<void> {
    await this.#emitAvailability({ status: 'blocked', reason: 'host-unavailable' }, 'session-ending');
    const active = this.#active;
    if (active === undefined) return;
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: this.#evidenceIdentity(active, 'session-replaced'),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason: 'attachment-lost',
    });
    this.#finishActive(active);
  }

  async #perform(directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> {
    if (directive.attachmentIdentity !== this.attachment.attachmentIdentity) {
      throw new TypeError('Pi Adapter received another Attachment occurrence');
    }
    if (directive.kind === 'harness.direct-invocation.interrupt') {
      const active = this.#active;
      if (active === undefined || active.directive.invocationIdentity !== directive.invocationIdentity) {
        throw new Error('Pi Adapter lost the Invocation interruption correlation');
      }
      try {
        this.#native.abort();
      } catch {
        throw new Error('Pi abort request was unavailable');
      }
      return { status: 'accepted-for-observation' };
    }

    const rejection = (reason: 'harness-rejected' | 'host-unavailable' | 'capability-withdrawn') => ({
      status: 'proven-not-dispatched' as const,
      evidenceIdentity: `pi-dispatch:${sha256Parts([
        this.attachment.attachmentIdentity,
        directive.invocationIdentity,
        reason,
      ])}`,
      reason,
    });
    if (!this.manifest.reviewedHostVersions.includes(this.attachment.hostVersion)) {
      return rejection('capability-withdrawn');
    }
    if (this.#active !== undefined) return rejection('harness-rejected');

    let toolsBefore: string[] = [];
    try {
      if (!this.#native.isIdle()) return rejection('harness-rejected');
      if (this.#authority === 'discussion-only') {
        toolsBefore = [...this.#native.getActiveTools()];
        const selected = this.#selectReadTools();
        if (selected === undefined) return rejection('capability-withdrawn');
        this.#native.setActiveTools(selected);
        if (!sameStrings(this.#native.getActiveTools(), selected)) {
          this.#native.setActiveTools(toolsBefore);
          return rejection('capability-withdrawn');
        }
      }
    } catch {
      try {
        this.#native.setActiveTools(toolsBefore);
      } catch {
        // A failed gate is a refusal; no native request is sent.
      }
      return rejection('capability-withdrawn');
    }

    const correlationIdentity = `pic_${sha256Parts([
      this.attachment.attachmentIdentity,
      directive.invocationIdentity,
      this.#sessionEpoch,
    ])}`;
    let prompt: string;
    try {
      prompt = serializePiDirectReviewPrompt(directive, correlationIdentity, this.#authority);
    } catch {
      this.#restoreTools(toolsBefore);
      return rejection('capability-withdrawn');
    }
    if (Buffer.byteLength(prompt, 'utf8') > MAX_NATIVE_PROMPT_BYTES) {
      this.#restoreTools(toolsBefore);
      return rejection('capability-withdrawn');
    }
    const marker: PiCorrelationMarker = {
      schema: 'neoflow.pi-correlation/1',
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      correlationIdentity,
      disclosureSha256: directive.disclosure.sha256,
    };
    let active!: ActiveInvocation;
    try {
      this.#native.appendCorrelationMarker(marker);
      active = {
        directive,
        correlationIdentity,
        prompt,
        toolsBefore,
        phase: 'awaiting-preflight',
        inputObserved: false,
        startEvidenceApplied: false,
        timeoutHandle: undefined,
      };
      active.timeoutHandle = this.#scheduler.set(directive.capabilitySnapshot.capability.noStartTimeoutMs, () => {
        // A scheduler callback has no Promise observer. Contain every
        // unexpected rejection at creation rather than leaking it into Pi.
        void this.#noStartTimeout(active).catch(() => undefined);
      });
      this.#active = active;
      this.#native.sendUserMessage(prompt);
    } catch {
      if (this.#active === active) this.#active = undefined;
      if (active?.timeoutHandle !== undefined) {
        this.#scheduler.clear(active.timeoutHandle);
      }
      this.#restoreTools(toolsBefore);
      return rejection('harness-rejected');
    }
    return { status: 'accepted-for-observation' };
  }

  #selectReadTools(): readonly string[] | undefined {
    const tools = this.#native.getAllTools();
    const selected: string[] = [];
    for (const name of READ_TOOL_NAMES) {
      const matches = tools.filter(tool => tool.name === name);
      if (matches.length !== 1 || matches[0]?.source !== 'builtin') {
        return undefined;
      }
      selected.push(name);
    }
    return selected;
  }

  #gateIsExact(): boolean {
    // Workspace write narrows nothing; the session's own tools are the boundary.
    if (this.#authority === 'workspace-write') return true;
    const selected = this.#selectReadTools();
    return selected !== undefined && sameStrings(this.#native.getActiveTools(), selected);
  }

  async #noStartTimeout(expected: ActiveInvocation): Promise<void> {
    if (this.#active !== expected || expected.phase === 'started') return;
    let hostIsIdle: boolean;
    try {
      hostIsIdle = this.#native.isIdle();
    } catch {
      await this.#containNoStartHostFailure(expected);
      return;
    }
    if (hostIsIdle) {
      await this.#emit({
        kind: 'harness.invocation.rejected',
        evidenceIdentity: this.#evidenceIdentity(expected, 'no-start'),
        attachmentIdentity: this.attachment.attachmentIdentity,
        invocationIdentity: expected.directive.invocationIdentity,
        reason: 'harness-rejected',
      });
      this.#finishActive(expected);
      return;
    }
    await this.#loseCorrelation(expected, 'correlation-lost');
  }

  async #containNoStartHostFailure(active: ActiveInvocation): Promise<void> {
    if (this.#active !== active) return;
    try {
      // Host state is unknowable. Abort best-effort so a possibly running
      // constrained request cannot continue after its tools are restored.
      this.#native.abort();
    } catch {
      // Correlation loss remains truthful even when native interruption fails.
    }
    try {
      await this.#emit({
        kind: 'harness.invocation.correlation-lost',
        evidenceIdentity: this.#evidenceIdentity(active, 'correlation-lost'),
        attachmentIdentity: this.attachment.attachmentIdentity,
        invocationIdentity: active.directive.invocationIdentity,
        reason: 'correlation-lost',
      });
    } finally {
      this.#finishActive(active);
    }
  }

  async #loseCorrelation(
    active: ActiveInvocation,
    reason: 'correlation-lost' | 'terminal-evidence-lost',
  ): Promise<void> {
    if (this.#active !== active) return;
    if (!this.#native.isIdle()) {
      try {
        this.#native.abort();
      } catch {
        // The normalized outcome remains unresolved.
      }
    }
    await this.#emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: this.#evidenceIdentity(active, reason),
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: active.directive.invocationIdentity,
      reason,
    });
    this.#finishActive(active);
  }

  #finishActive(active: ActiveInvocation): void {
    if (this.#active !== active) return;
    this.#scheduler.clear(active.timeoutHandle);
    this.#active = undefined;
    this.#restoreTools(active.toolsBefore);
  }

  #restoreTools(tools: readonly string[]): void {
    if (this.#authority === 'workspace-write') return;
    try {
      this.#native.setActiveTools(tools);
    } catch {
      // Leaving fewer tools active is safer than widening after an uncertain host failure.
    }
  }

  #evidenceIdentity(active: ActiveInvocation, phase: string): string {
    return `pi-evidence:${sha256Parts([
      this.attachment.attachmentIdentity,
      active.directive.invocationIdentity,
      active.correlationIdentity,
      phase,
    ])}`;
  }

  async #emitAvailability(availability: ReviewedHarnessAttachment['availability'], phase: string): Promise<void> {
    await this.#emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: this.#availabilityIdentity(phase),
      attachmentIdentity: this.attachment.attachmentIdentity,
      availability,
    });
  }

  #availabilityIdentity(phase: string): string {
    this.#availabilitySequence += 1;
    return `pi-availability:${sha256Parts([
      this.attachment.attachmentIdentity,
      this.#sessionEpoch,
      phase,
      this.#availabilitySequence.toString(36),
    ])}`;
  }

  async #emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement | undefined> {
    const sink = this.#sink;
    if (sink === undefined) {
      this.#queueEvidence(evidence);
      return undefined;
    }
    let acknowledgement: HarnessEvidenceAcknowledgement | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        acknowledgement = await sink.accept(evidence);
      } catch {
        this.#queueEvidence(evidence);
        return undefined;
      }
      if (acknowledgement.status !== 'refused' || acknowledgement.reason !== 'state-version-changed') {
        break;
      }
    }
    if (
      acknowledgement?.status === 'refused' &&
      (acknowledgement.reason === 'state-version-changed' || acknowledgement.reason === 'state-unavailable')
    ) {
      this.#queueEvidence(evidence);
    } else if (acknowledgement?.status === 'applied') {
      this.#pendingEvidence.delete(evidence.evidenceIdentity);
    }
    return acknowledgement;
  }

  #queueEvidence(evidence: NormalizedHarnessEvidence): void {
    if (evidence.kind === 'harness.availability.observed') {
      for (const [identity, pending] of this.#pendingEvidence) {
        if (pending.kind === 'harness.availability.observed') {
          this.#pendingEvidence.delete(identity);
        }
      }
    }
    if (this.#pendingEvidence.size >= 128) {
      const removable = [...this.#pendingEvidence].find(
        ([, pending]) => pending.kind === 'harness.availability.observed',
      );
      if (removable !== undefined) this.#pendingEvidence.delete(removable[0]);
      else if (evidence.kind === 'harness.availability.observed') return;
    }
    this.#pendingEvidence.set(evidence.evidenceIdentity, evidence);
  }

  async #flushEvidence(): Promise<void> {
    if (this.#flushing || this.#sink === undefined) return;
    this.#flushing = true;
    try {
      for (const evidence of [...this.#pendingEvidence.values()]) {
        if (this.#sink === undefined) return;
        let acknowledgement: HarnessEvidenceAcknowledgement;
        try {
          acknowledgement = await this.#sink.accept(evidence);
        } catch {
          return;
        }
        if (acknowledgement.status === 'applied') {
          this.#pendingEvidence.delete(evidence.evidenceIdentity);
        } else if (
          acknowledgement.reason !== 'state-version-changed' &&
          acknowledgement.reason !== 'state-unavailable'
        ) {
          this.#pendingEvidence.delete(evidence.evidenceIdentity);
        } else {
          return;
        }
      }
    } finally {
      this.#flushing = false;
    }
  }
}

export { CORRELATION_ENTRY_TYPE };
