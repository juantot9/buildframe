import type { WorkspaceIdentity } from '@buildframe/workspace';
import { sha256 } from '@buildframe/workspace/sha256';
import type {
  DispatchDirectReviewInvocationDirective,
  HarnessAttachmentIdentity,
  HarnessEvidenceSink,
  HarnessInvocationIdentity,
  ReviewedHarnessAdapter,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import {
  connectorSessionLabel,
  openConnectorSession,
  type ConnectorScheduler,
  type ConnectorSession,
  type ConnectorTurn,
  type ConnectorTurnRelease,
} from '@buildframe/local-runtime/harness-adapter';

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

export type PiAdapterScheduler = ConnectorScheduler;

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
  /** Pi's own name for the session, when it has one. */
  readonly sessionName?: string | undefined;
  readonly sessionEpoch: string;
  readonly native: PiNativeHost;
  readonly scheduler?: PiAdapterScheduler;
  /** Defaults to workspace write; the owner narrows it to discussion only. */
  readonly authority?: PiDirectReviewAuthority;
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

/** The Question-only Review envelope; Review Messages go to Pi exactly as written. */
export function serializePiDirectReviewPrompt(
  directive: DispatchDirectReviewInvocationDirective,
  correlationIdentity: string,
  authority: PiDirectReviewAuthority = 'workspace-write',
): string {
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

const TERMINAL_OUTCOME: Readonly<Record<PiTerminalStopReason, 'ended-normally' | 'failed' | 'interrupted'>> = {
  stop: 'ended-normally',
  aborted: 'interrupted',
  length: 'failed',
  error: 'failed',
  toolUse: 'failed',
};

/**
 * One explicitly attached Pi session. Pi's events become facts for the
 * connector kit, which decides correlation. Pi-specific proof stays here: the
 * Send's own input is recognised before Pi starts it, and the settled run is
 * matched to the correlation marker written beside it.
 */
export class PiReviewedAdapter implements ReviewedHarnessAdapter {
  readonly session: ConnectorSession;
  readonly #native: PiNativeHost;
  readonly #authority: PiDirectReviewAuthority;
  #toolsBefore: readonly string[] = [];
  /** The Send whose own input Pi echoed, and the one whose start Pi prepared. */
  #inputSeen: string | undefined;
  #prepared: string | undefined;

  constructor(request: CreatePiReviewedAdapterRequest) {
    this.#authority = request.authority ?? 'workspace-write';
    this.#native = request.native;
    const authority = this.#authority;
    const native = request.native;
    this.session = openConnectorSession({
      manifest: createPiReviewedCapabilityManifest(request.hostVersion, authority),
      workspaceIdentity: request.workspaceIdentity,
      canonicalCheckout: request.canonicalCheckout,
      hostVersion: request.hostVersion,
      sessionIdentity: request.sessionIdentity,
      sessionEpoch: request.sessionEpoch,
      sessionLabel: connectorSessionLabel(request.sessionName, request.sessionIdentity.slice(-8)),
      naming: {
        attachmentSeed: 'pi-attachment-v1',
        attachmentEvidence: 'pi-attachment',
        namespace: 'pi',
        turnPrefix: 'pic',
      },
      maximumTextBytes: MAX_NATIVE_PROMPT_BYTES,
      ...(request.scheduler === undefined ? {} : { scheduler: request.scheduler }),
      host: {
        isIdle: () => native.isIdle(),
        render: (directive, dispatchId) => serializePiDirectReviewPrompt(directive, dispatchId, authority),
        prepare: () => this.#gate(),
        submit: turn => {
          native.appendCorrelationMarker(this.#marker(turn));
          native.sendUserMessage(turn.text);
          return 'taken';
        },
        interrupt: () => {
          try {
            native.abort();
          } catch {
            throw new Error('Pi abort request was unavailable');
          }
        },
        release: (_turn, how) => this.#release(how),
      },
    });
  }

  get manifest(): ReviewedHarnessAdapter['manifest'] {
    return this.session.manifest;
  }

  get attachment(): ReviewedHarnessAdapter['attachment'] {
    return this.session.attachment;
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    return this.session.connect(sink);
  }

  ownsInvocation(): boolean {
    return this.session.turn !== undefined;
  }

  /** Lets only the Send's own input through while it is in flight; other input waits. */
  onInput(event: {
    readonly text: string;
    readonly source: 'interactive' | 'rpc' | 'extension';
    readonly hasImages: boolean;
  }): { readonly action: 'continue' | 'handled' } {
    const turn = this.session.turn;
    if (turn === undefined) return { action: 'continue' };
    if (
      turn.phase !== 'started' &&
      this.#prepared !== turn.dispatchId &&
      event.source === 'extension' &&
      !event.hasImages &&
      event.text === turn.text
    ) {
      this.#inputSeen = turn.dispatchId;
      return { action: 'continue' };
    }
    return { action: 'handled' };
  }

  async beforeAgentStart(prompt: string | undefined, hasImages: boolean): Promise<void> {
    const turn = this.session.turn;
    if (turn === undefined || turn.phase === 'started') return;
    if (
      this.#prepared !== turn.dispatchId &&
      this.#inputSeen === turn.dispatchId &&
      !hasImages &&
      prompt === turn.text &&
      this.#gateIsExact()
    ) {
      this.#prepared = turn.dispatchId;
      return;
    }
    await this.session.observe({ type: 'turn-started', own: false });
  }

  async agentStarted(): Promise<void> {
    const turn = this.session.turn;
    if (turn?.phase === 'started') return;
    await this.session.observe({ type: 'turn-started', own: turn !== undefined && this.#prepared === turn.dispatchId });
  }

  onToolCall(toolName: string): { readonly block: true; readonly reason: string } | undefined {
    // Workspace write is bounded by the tools this session actually has; only
    // the enforced read-only authority narrows and blocks. Extensions and
    // operating-system effects stay outside both.
    if (this.#authority === 'workspace-write') return undefined;
    if (this.session.turn !== undefined && !READ_TOOL_NAMES.includes(toolName as (typeof READ_TOOL_NAMES)[number])) {
      return { block: true, reason: `BuildFrame discussion-only Review blocked non-read tool ${toolName}` };
    }
    return undefined;
  }

  async agentSettled(entries: readonly PiStoredEntry[]): Promise<void> {
    const turn = this.session.turn;
    if (turn?.phase !== 'started') {
      await this.session.observe({ type: 'turn-ended', outcome: 'unknown' });
      return;
    }
    const marker = this.#marker(turn);
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
      userText(users[0]?.message?.content) !== turn.text ||
      finalAssistant?.stopReason === undefined
    ) {
      await this.session.observe({ type: 'turn-ended', outcome: 'unknown' });
      return;
    }
    const outcome = TERMINAL_OUTCOME[finalAssistant.stopReason];
    const contract = turn.directive.capabilitySnapshot.capability.artifactResultContract;
    const answer =
      outcome === 'ended-normally' ? finalizedAssistantText(finalAssistant.content, contract.maximumBytes) : undefined;
    await this.session.observe({
      type: 'turn-ended',
      outcome,
      ...(answer === undefined ? {} : { answer: answer.body }),
    });
  }

  async runtimeConnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeConnected(runtimeGeneration);
  }

  async runtimeDisconnected(runtimeGeneration: string): Promise<void> {
    await this.session.runtimeDisconnected(runtimeGeneration);
  }

  async sessionEnding(): Promise<void> {
    await this.session.observe({ type: 'session-ending' });
  }

  #marker(turn: ConnectorTurn): PiCorrelationMarker {
    return {
      schema: 'neoflow.pi-correlation/1',
      attachmentIdentity: this.attachment.attachmentIdentity,
      invocationIdentity: turn.invocationIdentity,
      correlationIdentity: turn.dispatchId,
      disclosureSha256: turn.directive.disclosure.sha256,
    };
  }

  /** Arms the exact built-in read tools for a discussion-only Send; refuses rather than widen. */
  #gate(): boolean {
    this.#inputSeen = undefined;
    this.#prepared = undefined;
    if (this.#authority === 'workspace-write') return true;
    let before: string[] = [];
    try {
      before = [...this.#native.getActiveTools()];
      const selected = this.#selectReadTools();
      if (selected === undefined) return false;
      this.#native.setActiveTools(selected);
      if (!sameStrings(this.#native.getActiveTools(), selected)) {
        this.#native.setActiveTools(before);
        return false;
      }
    } catch {
      this.#restoreTools(before);
      return false;
    }
    this.#toolsBefore = before;
    return true;
  }

  #release(how: ConnectorTurnRelease): void {
    if (how === 'lost') {
      // A run whose correlation is lost must not keep going with narrowed tools.
      try {
        if (!this.#native.isIdle()) this.#native.abort();
      } catch {
        try {
          this.#native.abort();
        } catch {
          // The normalized outcome remains unresolved.
        }
      }
    }
    this.#restoreTools(this.#toolsBefore);
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

  #restoreTools(tools: readonly string[]): void {
    if (this.#authority === 'workspace-write') return;
    try {
      this.#native.setActiveTools(tools);
    } catch {
      // Leaving fewer tools active is safer than widening after an uncertain host failure.
    }
  }
}

export { CORRELATION_ENTRY_TYPE };
