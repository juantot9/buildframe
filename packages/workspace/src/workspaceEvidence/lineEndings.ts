import type { GitInspectionContext } from '../gitProcess.js';
import { runGit } from './inspection.js';
import type { EvidenceLineEndingConversion } from './sideFacts.js';

/** The attributes Git reads to decide whether it converts a file's line endings. */
export const LINE_ENDING_ATTRIBUTES = ['text', 'crlf', 'eol'] as const;

export type AutoCrlf = 'true' | 'input' | 'false';

/**
 * The effective `core.autocrlf`, as Git itself resolves it for this checkout:
 * the operator's system and global files (Git for Windows sets it in its
 * system file) under the checkout's own value. Undefined when Git cannot say,
 * so nothing is normalized on a guess.
 */
export async function readAutoCrlf(context: GitInspectionContext): Promise<AutoCrlf | undefined> {
  try {
    const result = await runGit(context, ['config', '--get', 'core.autocrlf'], {
      maxStdoutBytes: 256,
      allowedExitCodes: [0, 1],
    });
    if (result.exitCode === 1) return 'false';
    const value = result.stdout.toString('utf8').trim().toLowerCase();
    if (value === 'input') return 'input';
    if (['true', 'yes', 'on', '1'].includes(value)) return 'true';
    if (['false', 'no', 'off', '0', ''].includes(value)) return 'false';
    return undefined;
  } catch {
    return undefined;
  }
}

type CrlfAction = 'text' | 'auto' | 'binary' | undefined;

/** One `text` or legacy `crlf` attribute value, as `git check-attr` prints it. */
function crlfAction(value: string | undefined): CrlfAction {
  if (value === 'set' || value === 'input') return 'text';
  if (value === 'unset') return 'binary';
  if (value === 'auto') return 'auto';
  return undefined;
}

/**
 * Whether Git turns CRLF into LF when it reads a working-tree file with these
 * attributes, following `convert_attrs` in Git's convert.c: `text` (else the
 * legacy `crlf`) decides; an `eol` makes a file text unless it is binary or
 * `auto`; with neither, `core.autocrlf` true or input means `auto`.
 */
export function lineEndingRule(
  values: ReadonlyMap<string, string>,
  autoCrlf: AutoCrlf,
): EvidenceLineEndingConversion | undefined {
  const action = crlfAction(values.get('text')) ?? crlfAction(values.get('crlf'));
  if (action === 'binary') return undefined;
  const eol = values.get('eol');
  if (eol === 'lf' || eol === 'crlf') return action === 'auto' ? 'auto' : 'text';
  if (action !== undefined) return action;
  return autoCrlf === 'false' ? undefined : 'auto';
}
