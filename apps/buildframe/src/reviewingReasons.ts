import { connectCommandIn, connectInstruction } from './supportFacts.js';

/**
 * Plain sentences for Workspace rejection codes. Every user-facing refusal
 * reads from here, so the status line and the Message card say the same thing
 * and each sentence says what happened and what to do next.
 */

/** `agent` is the coding agent's display name, e.g. "Claude Code", or "The agent". */
export function reasonSentence(reason: string, agent: string = 'The agent'): string {
  const lowerAgent = agent === 'The agent' ? 'the agent' : agent;
  switch (reason) {
    // The agent session
    case 'attachment-not-found':
      return `No coding agent has connected to this repository yet. Run ${connectInstruction()} here, then send again.`;
    case 'attachment-not-live':
      return `${agent} isn’t connected right now. Run ${connectCommandIn(agent)} in this repository, then send again.`;
    case 'attachment-selection-required':
      return `More than one agent session is connected. Close the extra one, then send again.`;
    case 'attachment-identity-conflict':
      return `${agent}’s session changed while sending. Send again.`;
    case 'unsupported-host-version':
      return `This version of ${lowerAgent} isn’t supported by BuildFrame yet. Use a supported version, then send again.`;
    case 'capability-unsupported':
      return `${agent} can’t take Messages from BuildFrame in this session. Restart it with the BuildFrame plugin, then send again.`;
    case 'availability-blocked':
      return `${agent} is busy or disconnected. Wait until it’s idle, then send again.`;
    case 'availability-unknown':
      return `BuildFrame can’t tell whether ${lowerAgent} is ready. Check its window, then send again.`;
    case 'active-invocation-exists':
      return `${agent} is still working on another Message. Wait for it to finish, or press x on that Message to interrupt it.`;
    case 'unresolved-invocation-risk-not-acknowledged':
      return `An earlier Message’s outcome is unknown. Check it in ${lowerAgent}, then confirm to send.`;
    case 'checkout-mismatch':
      return `${agent} is running in a different folder. Start it in this repository, then send again.`;

    // Interrupting
    case 'invocation-not-found':
      return 'That Message has no turn to interrupt.';
    case 'invocation-not-interruptible':
      return 'The turn already ended; there was nothing to interrupt.';

    // The Message itself
    case 'inspection-changed':
      return 'The selected file changed, so the Message was not sent. Press F4 to target the current line.';
    case 'commitment-requirements-not-acknowledged':
      return 'What needs confirming changed. Press Enter to review it again.';
    case 'message-template-invalid':
      return 'Your Message template is invalid. Use {{message}} once, with {{location}}, or with {{source}} and {{origin}}; delete the template file to use the default.';
    case 'review-message-limit-reached':
      return 'This Review has reached its Message limit. Start a new Review to keep going.';
    case 'review-handoff-limit-reached':
      return 'This Review has reached its Message limit. Start a new Review to keep sending.';
    case 'harness-index-limit-reached':
      return `Too many earlier Messages in this repository have an unknown outcome. Run ${connectCommandIn(agent)} again to start fresh, then send.`;
    case 'message-file-not-found':
    case 'anchor-file-not-found':
      return 'That file is no longer there. Pick another file or line.';
    case 'message-file-unavailable':
    case 'anchor-content-unavailable':
    case 'message-source-unrenderable':
      return 'BuildFrame can’t read that file as text. Pick another file or line.';
    case 'message-line-not-found':
    case 'anchor-line-not-found':
    case 'anchor-side-not-present':
      return 'That line is no longer there. Pick another line.';
    case 'message-line-too-large':
    case 'anchor-line-too-large':
      return 'That line is too long to quote. Pick another line.';

    // The Review and its source
    case 'state-version-mismatch':
    case 'state-conflict':
      return 'Something changed while you were working. Try again.';
    case 'command-identity-conflict':
      return 'That action was already sent once. Check the result before trying again.';
    case 'snapshot-stale':
      return 'The code changed since this Review was saved. Open the current Review to send Messages.';
    case 'snapshot-unverified':
    case 'snapshot-context-disclosure-unavailable':
      return 'BuildFrame couldn’t check the current code. Wait a moment, then try again.';
    case 'review-not-found':
      return 'This Review is no longer available. Go back Home and open it again.';
    case 'review-not-active':
    case 'review-not-current':
      return 'This Review is read-only now. Open the current Review to continue.';
    case 'active-review-exists':
      return 'A Review is already open. Continue it from Home.';
    case 'review-limit-reached':
      return 'BuildFrame has reached its Review limit for this repository.';
    case 'review-basis-not-found':
      return 'That review point is no longer available. Choose another with t.';
    case 'review-predates-messages':
      return 'This Review was saved before Messages existed. Go Home (Esc) and start a new Review to send one.';
    case 'review-basis-limit-reached':
      return 'This Review has reached its review-point limit.';
    case 'comparison-not-found':
      return 'That commit comparison is no longer available locally.';
    case 'comparison-ambiguous':
      return 'That is a merge commit. Choose a parent with h/l first.';
    case 'comparison-changed':
      return 'That branch or ref moved. Choose the comparison again.';
    case 'continuation-generation-changed':
      return 'HEAD or your changes moved. Choose how to continue again.';
    case 'continuation-source-not-current':
      return 'That saved Review is no longer the current one.';
    case 'continuation-source-not-fixed':
      return 'Only a commit or range Review can continue this way.';
    default:
      return `BuildFrame couldn’t do that (${reason}). Try again; if it keeps happening, restart BuildFrame.`;
  }
}

/** One line for a startup refusal: what is wrong and what to do; the code stays at the end for bug reports. */
export function startupFailureSentence(diagnostic: { readonly code: string; readonly reason?: unknown }): string {
  const reason = typeof diagnostic.reason === 'string' ? diagnostic.reason : undefined;
  const detail = `(${diagnostic.code}${reason === undefined ? '' : `: ${reason}`})`;
  const sentence = (() => {
    switch (diagnostic.code) {
      case 'not-git-worktree':
        return 'This folder isn’t inside a Git repository. Run BuildFrame from a project folder.';
      case 'bare-git-repository':
        return 'This is a bare Git repository. Run BuildFrame from a working copy.';
      case 'path-unavailable':
        return 'BuildFrame can’t open that folder. Check the path and try again.';
      case 'unsupported-platform':
        return 'BuildFrame doesn’t support this operating system yet.';
      case 'git-inspection-failed':
        return reason === 'git-unavailable'
          ? 'Git isn’t installed or isn’t on your PATH. Install Git and try again.'
          : 'BuildFrame couldn’t read this Git repository. Check that `git status` works here.';
      case 'workspace-registry-busy':
        return 'Another BuildFrame is starting for this repository. Wait a moment and try again.';
      case 'workspace-marker-invalid':
      case 'workspace-marker-missing':
      case 'workspace-registry-invalid':
      case 'workspace-identity-collision':
        return 'BuildFrame’s saved data for this repository is damaged or doesn’t match it.';
      case 'workspace-authority-unavailable':
        return 'BuildFrame couldn’t open its saved data for this repository. Check its folder permissions.';
      case 'runtime-unavailable':
        return reason === 'insecure-runtime'
          ? 'BuildFrame’s runtime folder has unsafe permissions. Fix them and try again.'
          : 'BuildFrame’s background process didn’t answer. Try again.';
      case 'runtime-start-rejected':
        return 'BuildFrame’s background process failed to start. Try again.';
      case 'runtime-protocol-incompatible':
      case 'workspace-interface-incompatible':
      case 'runtime-code-mismatch':
        return 'An older BuildFrame background process is still running. Close other BuildFrame windows and try again.';
      default:
        return 'Something went wrong; try again.';
    }
  })();
  return `${sentence} ${detail}`;
}
