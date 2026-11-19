import { constants as fsConstants, type Stats } from 'node:fs';
import { access, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export type GitExecutableResolutionFailure =
  | 'git-missing'
  | 'git-not-file'
  | 'git-not-executable'
  | 'git-resolution-changed'
  | 'git-resolution-failed';

export class GitExecutableResolutionError extends Error {
  readonly reason: GitExecutableResolutionFailure;

  constructor(reason: GitExecutableResolutionFailure, options: { readonly cause?: unknown } = {}) {
    super(reason, { cause: options.cause });
    this.name = 'GitExecutableResolutionError';
    this.reason = reason;
  }
}

export type GitExecutableResolver = () => Promise<string>;

/**
 * What Git is called in a `PATH` directory, and whether its mode bits must
 * show execute permission. Windows has no execute bits (every file reads as
 * `666`) and Git for Windows installs `git.exe`. A `git.cmd` or `git.bat`
 * would run through `cmd.exe`, so it is never a candidate.
 */
interface GitCandidateRule {
  readonly fileName: string;
  readonly checksExecuteBits: boolean;
}

function gitCandidateRule(platform: NodeJS.Platform): GitCandidateRule {
  return platform === 'win32'
    ? { fileName: 'git.exe', checksExecuteBits: false }
    : { fileName: 'git', checksExecuteBits: true };
}

interface ResolvedGitExecutable {
  readonly executable: string;
  readonly searchPath: string;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

async function selectGitExecutable(
  searchPath: string | undefined,
  rule: GitCandidateRule,
): Promise<ResolvedGitExecutable> {
  if (searchPath === undefined) {
    throw new GitExecutableResolutionError('git-missing');
  }

  let firstInvalidCandidate: GitExecutableResolutionError | undefined;
  for (const directory of searchPath.split(path.delimiter)) {
    const candidate = path.resolve(directory || '.', rule.fileName);
    let resolvedCandidate: string;
    try {
      resolvedCandidate = await realpath(candidate);
    } catch (cause) {
      if (isErrno(cause, 'ENOENT') || isErrno(cause, 'ENOTDIR')) continue;
      firstInvalidCandidate ??= new GitExecutableResolutionError('git-resolution-failed', { cause });
      continue;
    }

    let candidateStatus: Stats;
    try {
      candidateStatus = await stat(resolvedCandidate);
    } catch (cause) {
      throw new GitExecutableResolutionError('git-resolution-changed', {
        cause,
      });
    }
    if (!candidateStatus.isFile()) {
      firstInvalidCandidate ??= new GitExecutableResolutionError('git-not-file');
      continue;
    }
    if (rule.checksExecuteBits && (candidateStatus.mode & 0o111) === 0) {
      firstInvalidCandidate ??= new GitExecutableResolutionError('git-not-executable');
      continue;
    }

    try {
      await access(resolvedCandidate, fsConstants.X_OK);
    } catch (cause) {
      if (isErrno(cause, 'EACCES') || isErrno(cause, 'EPERM')) {
        firstInvalidCandidate ??= new GitExecutableResolutionError('git-not-executable', { cause });
        continue;
      }
      if (isErrno(cause, 'ENOENT') || isErrno(cause, 'ENOTDIR')) {
        throw new GitExecutableResolutionError('git-resolution-changed', {
          cause,
        });
      }
      throw new GitExecutableResolutionError('git-resolution-failed', {
        cause,
      });
    }

    let confirmedCandidate: string;
    try {
      confirmedCandidate = await realpath(candidate);
    } catch (cause) {
      throw new GitExecutableResolutionError('git-resolution-changed', {
        cause,
      });
    }
    if (confirmedCandidate !== resolvedCandidate) {
      throw new GitExecutableResolutionError('git-resolution-changed');
    }

    return {
      executable: resolvedCandidate,
      searchPath,
    };
  }

  throw firstInvalidCandidate ?? new GitExecutableResolutionError('git-missing');
}

export function createGitExecutableResolver(
  readSearchPath: () => string | undefined = () => process.env.PATH,
  platform: NodeJS.Platform = process.platform,
): GitExecutableResolver {
  const rule = gitCandidateRule(platform);
  let selected: Promise<ResolvedGitExecutable> | undefined;
  return async (): Promise<string> => {
    const searchPath = readSearchPath();
    selected ??= selectGitExecutable(searchPath, rule);
    const resolution = await selected;
    if (searchPath !== resolution.searchPath || readSearchPath() !== resolution.searchPath) {
      throw new GitExecutableResolutionError('git-resolution-changed');
    }
    return resolution.executable;
  };
}

export const resolveGitExecutable: GitExecutableResolver = createGitExecutableResolver();
