import type { Workspace, WorkspaceCommand, WorkspaceCommandResult } from '@buildframe/workspace';

import { runtimeErrorSentence } from './reviewingReasons.js';

const RUNTIME_SESSION_ERROR_CODES = new Set([
  'runtime-disconnected',
  'workspace-call-rejected',
  'runtime-protocol-failure',
]);

/** A sentence for a failed Workspace call; runtime codes get their own wording. */
export function semanticError(error: unknown): string {
  const code = error instanceof Error ? (error as Error & { readonly code?: unknown }).code : undefined;
  if (typeof code === 'string' && RUNTIME_SESSION_ERROR_CODES.has(code)) return runtimeErrorSentence(code);
  const detail = error instanceof Error && error.message.trim().length > 0 ? ` (${error.message.trim()})` : '';
  return `Try again; if it keeps happening, restart BuildFrame${detail}.`;
}

export type CommandOutcome =
  | { readonly status: 'answered'; readonly result: WorkspaceCommandResult }
  /** Contact was lost and no recorded result was found: the outcome is unknown. */
  | { readonly status: 'lost'; readonly sentence: string }
  /** The shell stopped while the command was in flight. */
  | { readonly status: 'stopped' };

/**
 * Runs one command. When contact is lost before the answer arrives, the
 * command may still have committed, so its recorded result is read back;
 * only when none is found is the outcome reported as lost, never guessed.
 */
export async function executeCommand(
  workspace: Workspace,
  command: WorkspaceCommand,
  stopped: () => boolean,
): Promise<CommandOutcome> {
  try {
    const result = await workspace.execute(command);
    return stopped() ? { status: 'stopped' } : { status: 'answered', result };
  } catch (error) {
    if (stopped()) return { status: 'stopped' };
    const recovered = await recoverCommandResult(workspace, command).catch(() => undefined);
    if (recovered !== undefined) return { status: 'answered', result: recovered };
    return { status: 'lost', sentence: `Lost contact before BuildFrame answered. ${semanticError(error)}` };
  }
}

async function recoverCommandResult(
  workspace: Workspace,
  command: WorkspaceCommand,
): Promise<WorkspaceCommandResult | undefined> {
  // Harness Interaction records its own command results.
  const view =
    command.kind.startsWith('harness.') ||
    command.kind === 'review.question.ask' ||
    command.kind === 'review.message.commit'
      ? await workspace.read({ kind: 'harness.command-result', commandIdentity: command.commandIdentity })
      : await workspace.read({ kind: 'review.command-result', commandIdentity: command.commandIdentity });
  return view.status === 'available' ? view.result : undefined;
}
