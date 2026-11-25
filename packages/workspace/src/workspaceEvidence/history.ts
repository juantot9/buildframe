import type { GitInspectionContext } from '../gitProcess.js';
import { runGit } from './inspection.js';

/**
 * How many commits were added on top of `from` to reach `to`; undefined when
 * `to` doesn't descend from `from` (a reset, checkout or rebase moved HEAD
 * elsewhere) or Git can't tell.
 */
export async function commitsOnTop(
  context: GitInspectionContext,
  from: string,
  to: string,
): Promise<number | undefined> {
  const ancestry = await runGit(context, ['merge-base', '--is-ancestor', from, to], {
    maxStdoutBytes: 1024,
    allowedExitCodes: [0, 1],
  });
  if (ancestry.exitCode !== 0) return undefined;
  const counted = await runGit(context, ['rev-list', '--count', `${from}..${to}`, '--'], { maxStdoutBytes: 1024 });
  const count = Number(counted.stdout.toString('utf8').trim());
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}
