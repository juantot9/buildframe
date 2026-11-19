import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveGitExecutable } from './gitExecutable.js';

export {
  createGitExecutableResolver,
  GitExecutableResolutionError,
  resolveGitExecutable,
  type GitExecutableResolutionFailure,
  type GitExecutableResolver,
} from './gitExecutable.js';

const MAXIMUM_STDERR_BYTES = 64 * 1024;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

export const DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS = 30_000;

export class GitInspectionError extends Error {
  readonly reason: string;
  readonly stderr: Buffer;

  constructor(
    reason: string,
    options: {
      readonly cause?: unknown;
      readonly stderr?: Buffer;
    } = {},
  ) {
    super(reason, { cause: options.cause });
    this.name = 'GitInspectionError';
    this.reason = reason;
    this.stderr = Buffer.from(options.stderr ?? []);
  }
}

export interface GitProcessResult {
  readonly stdout: Buffer;
  readonly exitCode: number;
}

export interface GitProcessOptions {
  readonly executable: string;
  readonly checkout: string;
  readonly arguments: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly maxStdoutBytes: number;
  readonly timeoutMilliseconds: number;
  readonly stdin?: Buffer;
  readonly allowedExitCodes?: readonly number[];
}

export async function runGitProcess(options: GitProcessOptions): Promise<GitProcessResult> {
  if (!Number.isSafeInteger(options.maxStdoutBytes) || options.maxStdoutBytes < 1) {
    throw new TypeError('Invalid Git stdout limit');
  }
  if (!Number.isSafeInteger(options.timeoutMilliseconds) || options.timeoutMilliseconds < 1) {
    throw new TypeError('Invalid Git process timeout');
  }

  return await new Promise<GitProcessResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(options.executable, [...options.arguments], {
        cwd: options.checkout,
        env: options.environment,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (cause) {
      reject(new GitInspectionError('git-unavailable', { cause }));
      return;
    }

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let spawned = false;
    let termination: 'output-limit' | 'stdin-failed' | 'timeout' | undefined;
    let terminationCause: unknown;

    const deadline = setTimeout(() => {
      if (settled || termination !== undefined) return;
      termination = 'timeout';
      child.kill('SIGKILL');
    }, options.timeoutMilliseconds);

    const clearDeadline = (): void => {
      clearTimeout(deadline);
    };
    const capturedStderr = (): Buffer => Buffer.concat(stderr, stderrBytes);
    const rejectOnce = (reason: string, cause?: unknown): void => {
      if (settled) return;
      settled = true;
      clearDeadline();
      reject(
        new GitInspectionError(reason, {
          ...(cause === undefined ? {} : { cause }),
          stderr: capturedStderr(),
        }),
      );
    };
    const resolveOnce = (result: GitProcessResult): void => {
      if (settled) return;
      settled = true;
      clearDeadline();
      resolve(result);
    };
    const terminate = (reason: Exclude<typeof termination, undefined>, cause?: unknown): void => {
      if (settled || termination !== undefined) return;
      termination = reason;
      terminationCause = cause;
      child.kill('SIGKILL');
    };

    child.once('spawn', () => {
      spawned = true;
    });
    child.once('error', cause => {
      if (!spawned) {
        rejectOnce('git-unavailable', cause);
        return;
      }
      terminate('stdin-failed', cause);
    });
    child.once('exit', clearDeadline);
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > options.maxStdoutBytes) {
        terminate('output-limit');
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const remaining = MAXIMUM_STDERR_BYTES - stderrBytes;
      if (remaining <= 0) return;
      const retained = Buffer.from(chunk.subarray(0, remaining));
      stderr.push(retained);
      stderrBytes += retained.byteLength;
    });
    child.stdin.once('error', cause => {
      terminate('stdin-failed', cause);
    });
    child.once('close', code => {
      if (termination === 'output-limit') {
        rejectOnce('git-output-limit', terminationCause);
        return;
      }
      if (termination === 'timeout') {
        rejectOnce('git-timeout', terminationCause);
        return;
      }
      if (termination === 'stdin-failed') {
        rejectOnce('git-inspection-failed', terminationCause);
        return;
      }
      const exitCode = code ?? -1;
      const allowed = options.allowedExitCodes ?? [0];
      if (!allowed.includes(exitCode)) {
        rejectOnce('git-inspection-failed');
        return;
      }
      resolveOnce({
        stdout: Buffer.concat(stdout, stdoutBytes),
        exitCode,
      });
    });

    if (options.stdin === undefined) child.stdin.end();
    else child.stdin.end(options.stdin);
  });
}

interface CheckoutConfigEntry {
  readonly key: string;
  readonly value: string | null;
}

// These are repository-format and worktree/index interpretation settings,
// not a list of "dangerous" command keys. Everything executable, every
// include, and every unknown core/extensions/index setting is rejected or
// omitted; production Git never reads the checkout's config bytes.
interface StructuralConfiguration {
  repositoryFormatVersion: 0 | 1;
  worktreeConfig: boolean;
  hashFormat: 'sha1' | 'sha256' | null;
  compatibilityHashFormat: 'sha1' | 'sha256' | null;
  referenceStorageFormat: 'files' | 'reftable' | null;
  fileMode: boolean | null;
  ignoreCase: boolean | null;
  precomposeUnicode: boolean | null;
  symbolicLinks: boolean | null;
  trustCtime: boolean | null;
  checkStat: 'default' | 'minimal' | null;
  autoCrlf: boolean | 'input' | null;
  endOfLine: 'lf' | 'crlf' | 'native' | null;
  safeCrlf: boolean | 'warn' | null;
  logAllReferenceUpdates: boolean | null;
  sparseCheckout: boolean | null;
  sparseCheckoutCone: boolean | null;
}

export interface GitInspectionContext {
  readonly executable: string;
  readonly checkout: string;
  /** Package-private provenance for bounded object-adjacent evidence. */
  readonly gitDirectory: string;
  readonly commonDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
  dispose(): Promise<void>;
}

function strippedGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('GIT_')) environment[name] = value;
  }
  environment.LC_ALL = 'C';
  environment.LANG = 'C';
  return environment;
}

function configurationInputEnvironment(): NodeJS.ProcessEnv {
  // `git config --file --no-includes` is intentionally run with no repository
  // variables and no operator files. It parses one snapshotted local source as
  // data; it cannot resolve checkout includes or enter repository setup.
  const environment = strippedGitEnvironment();
  environment.GIT_CONFIG_NOSYSTEM = '1';
  environment.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null';
  environment.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return environment;
}

function splitBuffer(value: Buffer, separator: number): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (start <= value.byteLength) {
    const index = value.indexOf(separator, start);
    if (index < 0) {
      parts.push(value.subarray(start));
      break;
    }
    parts.push(value.subarray(start, index));
    start = index + 1;
  }
  return parts;
}

async function inspectCheckoutConfiguration(
  executable: string,
  checkout: string,
  configurationFile: string,
): Promise<readonly CheckoutConfigEntry[]> {
  try {
    await lstat(configurationFile);
  } catch (cause) {
    if (isErrno(cause, 'ENOENT')) return [];
    throw new GitInspectionError('invalid-checkout-config', { cause });
  }

  const result = await runGitProcess({
    executable,
    checkout,
    arguments: ['config', '--file', configurationFile, '--no-includes', '--null', '--list'],
    environment: configurationInputEnvironment(),
    maxStdoutBytes: 1024 * 1024 + 1,
    timeoutMilliseconds: DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  });
  const records = splitBuffer(result.stdout, 0);
  if (records.at(-1)?.byteLength !== 0) {
    throw new GitInspectionError('invalid-checkout-config');
  }
  records.pop();
  if (records.length > 4096) {
    throw new GitInspectionError('checkout-config-limit');
  }
  const entries: CheckoutConfigEntry[] = [];
  for (const record of records) {
    if (record.byteLength === 0) {
      throw new GitInspectionError('invalid-checkout-config');
    }
    const separator = record.indexOf(0x0a);
    const key = (separator < 0 ? record : record.subarray(0, separator)).toString('utf8');
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\..+)?$/iu.test(key)) {
      throw new GitInspectionError('invalid-checkout-config');
    }
    entries.push({
      key: key.toLowerCase(),
      value: separator < 0 ? null : record.subarray(separator + 1).toString('utf8'),
    });
  }
  return entries;
}

function normalizedConfigValue(value: string | null): string | null {
  return value?.trim().toLowerCase() ?? null;
}

function gitBoolean(value: string | null): boolean {
  if (value === null) return true;
  const normalized = normalizedConfigValue(value) as string;
  if (['true', 'yes', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'off', '', '0'].includes(normalized)) return false;
  if (/^-?[0-9]+$/u.test(normalized)) return Number(normalized) !== 0;
  throw new GitInspectionError('unsupported-checkout-config');
}

function autoCrlf(value: string | null): boolean | 'input' {
  if (normalizedConfigValue(value) === 'input') return 'input';
  return gitBoolean(value);
}

function safeCrlf(value: string | null): boolean | 'warn' {
  if (normalizedConfigValue(value) === 'warn') return 'warn';
  return gitBoolean(value);
}

/**
 * Checkout-local `core.*` keys that cannot change what an inspection reports.
 * They are dropped with every other non-structural key, so admitting them only
 * stops BuildFrame refusing common repositories: husky writes `core.hooksPath`,
 * and many people set an editor or pager per repository. Keys that change how
 * files are read, ignored or converted stay refused.
 */
const INSPECTION_IRRELEVANT_CORE_KEYS: ReadonlySet<string> = new Set([
  'core.hookspath',
  'core.editor',
  'core.pager',
  'core.askpass',
  'core.sshcommand',
  'core.gitproxy',
  'core.whitespace',
  'core.commentchar',
  'core.commentstring',
  'core.abbrev',
  'core.notesref',
  'core.warnambiguousrefs',
  'core.sharedrepository',
  'core.createobject',
  'core.compression',
  'core.loosecompression',
  'core.bigfilethreshold',
  'core.deltabasecachelimit',
  'core.packedgitlimit',
  'core.packedgitwindowsize',
  'core.preloadindex',
  'core.untrackedcache',
  'core.multipackindex',
  'core.commitgraph',
  'core.fsync',
  'core.fsyncmethod',
  'core.fsyncobjectfiles',
]);

function structuralConfiguration(
  entries: readonly CheckoutConfigEntry[],
  allowConfiguredWorkTree: boolean,
): StructuralConfiguration {
  const structural: StructuralConfiguration = {
    repositoryFormatVersion: 0,
    worktreeConfig: false,
    hashFormat: null,
    compatibilityHashFormat: null,
    referenceStorageFormat: null,
    fileMode: null,
    ignoreCase: null,
    precomposeUnicode: null,
    symbolicLinks: null,
    trustCtime: null,
    checkStat: null,
    autoCrlf: null,
    endOfLine: null,
    safeCrlf: null,
    logAllReferenceUpdates: null,
    sparseCheckout: null,
    sparseCheckoutCone: null,
  };

  for (const entry of entries) {
    if (
      entry.key === 'include.path' ||
      entry.key.startsWith('includeif.') ||
      entry.key === 'core.fsmonitor' ||
      entry.key.startsWith('filter.') ||
      entry.key.startsWith('diff.') ||
      entry.key.startsWith('alias.')
    ) {
      throw new GitInspectionError('untrusted-checkout-config');
    }

    switch (entry.key) {
      case 'core.repositoryformatversion': {
        if (entry.value === null || !/^[0-9]+$/u.test(entry.value) || Number(entry.value) > 1) {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.repositoryFormatVersion = Number(entry.value) === 1 ? 1 : 0;
        break;
      }
      case 'extensions.objectformat': {
        if (entry.value !== 'sha1' && entry.value !== 'sha256') {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.hashFormat = entry.value;
        break;
      }
      case 'extensions.compatobjectformat': {
        if (entry.value !== 'sha1' && entry.value !== 'sha256') {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.compatibilityHashFormat = entry.value;
        break;
      }
      case 'extensions.refstorage': {
        if (entry.value !== 'files' && entry.value !== 'reftable') {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.referenceStorageFormat = entry.value;
        break;
      }
      case 'extensions.worktreeconfig': {
        structural.worktreeConfig = gitBoolean(entry.value);
        break;
      }
      case 'core.filemode': {
        structural.fileMode = gitBoolean(entry.value);
        break;
      }
      case 'core.ignorecase': {
        structural.ignoreCase = gitBoolean(entry.value);
        break;
      }
      case 'core.precomposeunicode': {
        structural.precomposeUnicode = gitBoolean(entry.value);
        break;
      }
      case 'core.symlinks': {
        structural.symbolicLinks = gitBoolean(entry.value);
        break;
      }
      case 'core.trustctime': {
        structural.trustCtime = gitBoolean(entry.value);
        break;
      }
      case 'core.checkstat': {
        const value = normalizedConfigValue(entry.value);
        if (value !== 'default' && value !== 'minimal') {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.checkStat = value;
        break;
      }
      case 'core.autocrlf': {
        structural.autoCrlf = autoCrlf(entry.value);
        break;
      }
      case 'core.eol': {
        const value = normalizedConfigValue(entry.value);
        if (value !== 'lf' && value !== 'crlf' && value !== 'native') {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        structural.endOfLine = value;
        break;
      }
      case 'core.safecrlf': {
        structural.safeCrlf = safeCrlf(entry.value);
        break;
      }
      case 'core.logallrefupdates': {
        structural.logAllReferenceUpdates = gitBoolean(entry.value);
        break;
      }
      case 'core.sparsecheckout': {
        structural.sparseCheckout = gitBoolean(entry.value);
        break;
      }
      case 'core.sparsecheckoutcone': {
        structural.sparseCheckoutCone = gitBoolean(entry.value);
        break;
      }
      case 'extensions.partialclone': {
        throw new GitInspectionError('unsupported-checkout-config');
      }
      case 'core.bare': {
        if (gitBoolean(entry.value)) {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        break;
      }
      case 'core.worktree': {
        // A conventional absorbed submodule records this path. Nested
        // inspection supplies its own canonical GIT_WORK_TREE and never trusts
        // or replays the configured value.
        if (!allowConfiguredWorkTree) {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        break;
      }
      case 'core.quotepath':
      case 'core.splitindex':
      case 'core.untrackedcache':
      case 'core.fsmonitorhookversion':
      case 'index.sparse':
      case 'index.skiphash':
      case 'index.version':
      case 'index.threads':
      case 'index.recordendofindexentries':
      case 'index.recordoffsettable':
      case 'index.recorduntrackeddirectories':
      case 'index.skipuntracked': {
        break;
      }
      default: {
        // Settings that only steer editors, hooks, transport or packing never
        // reach the shadow config, so Git reports the same either way.
        if (INSPECTION_IRRELEVANT_CORE_KEYS.has(entry.key)) break;
        if (entry.key.startsWith('core.') || entry.key.startsWith('extensions.') || entry.key.startsWith('index.')) {
          throw new GitInspectionError('unsupported-checkout-config');
        }
        break;
      }
    }
  }

  if (structural.hashFormat !== null && structural.repositoryFormatVersion !== 1) {
    throw new GitInspectionError('unsupported-checkout-config');
  }
  if (structural.compatibilityHashFormat !== null && structural.repositoryFormatVersion !== 1) {
    throw new GitInspectionError('unsupported-checkout-config');
  }
  if (structural.referenceStorageFormat !== null && structural.repositoryFormatVersion !== 1) {
    throw new GitInspectionError('unsupported-checkout-config');
  }
  return structural;
}

function applySparseWorktreeConfiguration(
  structural: StructuralConfiguration,
  entries: readonly CheckoutConfigEntry[],
): void {
  for (const entry of entries) {
    switch (entry.key) {
      case 'core.sparsecheckout': {
        structural.sparseCheckout = gitBoolean(entry.value);
        break;
      }
      case 'core.sparsecheckoutcone': {
        structural.sparseCheckoutCone = gitBoolean(entry.value);
        break;
      }
      case 'index.sparse': {
        gitBoolean(entry.value);
        break;
      }
      default: {
        // A worktree-specific file is checkout-controlled input. Sparse
        // interpretation is the sole admitted projection; nothing executable,
        // included, or unknown is replayed into production Git.
        throw new GitInspectionError('unsupported-checkout-config');
      }
    }
  }
}

async function symlinkRequired(target: string, destination: string, kind: 'file' | 'dir'): Promise<void> {
  try {
    await symlink(target, destination, kind);
  } catch (cause) {
    throw new GitInspectionError('inspection-overlay-failed', { cause });
  }
}

async function resolveGitCommonDirectory(gitDirectory: string): Promise<string> {
  const commonFile = path.join(gitDirectory, 'commondir');
  try {
    const contents = await readFile(commonFile, 'utf8');
    const value = contents.trimEnd();
    if (value.length === 0 || value.includes('\0')) {
      throw new GitInspectionError('inspection-overlay-failed');
    }
    return await realpath(path.resolve(gitDirectory, value));
  } catch (cause) {
    if (isErrno(cause, 'ENOENT')) return gitDirectory;
    throw new GitInspectionError('inspection-overlay-failed', { cause });
  }
}

async function buildInspectionOverlay(
  commonDirectory: string,
  structural: StructuralConfiguration,
): Promise<{ readonly root: string; readonly common: string }> {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'buildframe-git-inspection-'));
  try {
    await chmod(temporaryRoot, 0o700);
    const shadowCommonDirectory = path.join(temporaryRoot, 'common');
    await mkdir(shadowCommonDirectory, { mode: 0o700 });

    const commonEntries = await readdir(commonDirectory).catch(cause => {
      throw new GitInspectionError('inspection-overlay-failed', { cause });
    });
    for (const entry of commonEntries) {
      if (
        entry === 'config' ||
        entry === 'config.worktree' ||
        entry === 'hooks' ||
        entry === 'info' ||
        entry === 'worktrees'
      ) {
        continue;
      }
      const source = path.join(commonDirectory, entry);
      const sourceStatus = await lstat(source).catch(cause => {
        throw new GitInspectionError('inspection-overlay-failed', { cause });
      });
      if (sourceStatus.isDirectory()) {
        await symlinkRequired(source, path.join(shadowCommonDirectory, entry), 'dir');
      } else if (sourceStatus.isFile() || sourceStatus.isSymbolicLink()) {
        await symlinkRequired(source, path.join(shadowCommonDirectory, entry), 'file');
      }
    }

    const informationDirectory = path.join(shadowCommonDirectory, 'info');
    await mkdir(informationDirectory, { mode: 0o700 });
    const exclude = path.join(commonDirectory, 'info', 'exclude');
    const excludeStatus = await lstat(exclude).catch(cause => {
      if (isErrno(cause, 'ENOENT')) return undefined;
      throw new GitInspectionError('inspection-overlay-failed', { cause });
    });
    if (excludeStatus !== undefined) {
      if (!excludeStatus.isFile() && !excludeStatus.isSymbolicLink()) {
        throw new GitInspectionError('inspection-overlay-failed');
      }
      await symlinkRequired(exclude, path.join(informationDirectory, 'exclude'), 'file');
    }

    const configurationLines: string[] = [
      '[core]',
      `\trepositoryformatversion = ${structural.repositoryFormatVersion}`,
      '\tbare = false',
    ];
    if (structural.fileMode !== null) {
      configurationLines.push(`\tfilemode = ${structural.fileMode}`);
    }
    if (structural.ignoreCase !== null) {
      configurationLines.push(`\tignorecase = ${structural.ignoreCase}`);
    }
    if (structural.precomposeUnicode !== null) {
      configurationLines.push(`\tprecomposeunicode = ${structural.precomposeUnicode}`);
    }
    if (structural.symbolicLinks !== null) {
      configurationLines.push(`\tsymlinks = ${structural.symbolicLinks}`);
    }
    if (structural.trustCtime !== null) {
      configurationLines.push(`\ttrustctime = ${structural.trustCtime}`);
    }
    if (structural.checkStat !== null) {
      configurationLines.push(`\tcheckstat = ${structural.checkStat}`);
    }
    if (structural.autoCrlf !== null) {
      configurationLines.push(`\tautocrlf = ${structural.autoCrlf}`);
    }
    if (structural.endOfLine !== null) {
      configurationLines.push(`\teol = ${structural.endOfLine}`);
    }
    if (structural.safeCrlf !== null) {
      configurationLines.push(`\tsafecrlf = ${structural.safeCrlf}`);
    }
    if (structural.logAllReferenceUpdates !== null) {
      configurationLines.push(`\tlogallrefupdates = ${structural.logAllReferenceUpdates}`);
    }
    if (structural.sparseCheckout !== null) {
      configurationLines.push(`\tsparsecheckout = ${structural.sparseCheckout}`);
    }
    if (structural.sparseCheckoutCone !== null) {
      configurationLines.push(`\tsparsecheckoutcone = ${structural.sparseCheckoutCone}`);
    }
    if (
      structural.hashFormat !== null ||
      structural.compatibilityHashFormat !== null ||
      structural.referenceStorageFormat !== null
    ) {
      configurationLines.push('[extensions]');
      if (structural.hashFormat !== null) {
        configurationLines.push(`\tobjectformat = ${structural.hashFormat}`);
      }
      if (structural.compatibilityHashFormat !== null) {
        configurationLines.push(`\tcompatobjectformat = ${structural.compatibilityHashFormat}`);
      }
      if (structural.referenceStorageFormat !== null) {
        configurationLines.push(`\trefstorage = ${structural.referenceStorageFormat}`);
      }
    }
    configurationLines.push('');
    await writeFile(path.join(shadowCommonDirectory, 'config'), configurationLines.join('\n'), {
      encoding: 'utf8',
      mode: 0o600,
    });

    return { root: temporaryRoot, common: shadowCommonDirectory };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function rejectUnsupportedOperatorConditions(
  executable: string,
  checkout: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const result = await runGitProcess({
    executable,
    checkout,
    arguments: [
      'config',
      '--includes',
      '--null',
      '--name-only',
      '--get-regexp',
      '^includeif\\.hasconfig:remote\\.\\*\\.url:.*\\.path$',
    ],
    environment,
    maxStdoutBytes: 64 * 1024,
    timeoutMilliseconds: DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
    allowedExitCodes: [0, 1],
  });
  if (result.exitCode === 0) {
    throw new GitInspectionError('unsupported-operator-config');
  }
}

export async function prepareGitInspectionContext(
  checkout: string,
  gitDirectory: string,
  options: { readonly allowConfiguredWorkTree?: boolean } = {},
): Promise<GitInspectionContext> {
  const executable = await resolveGitExecutable();
  const canonicalCheckout = await realpath(checkout).catch(cause => {
    throw new GitInspectionError('inspection-overlay-failed', { cause });
  });
  const canonicalGitDirectory = await realpath(gitDirectory).catch(cause => {
    throw new GitInspectionError('inspection-overlay-failed', { cause });
  });

  const commonDirectory = await resolveGitCommonDirectory(canonicalGitDirectory);
  const configurationEntries = await inspectCheckoutConfiguration(
    executable,
    canonicalCheckout,
    path.join(commonDirectory, 'config'),
  );
  const structural = structuralConfiguration(configurationEntries, options.allowConfiguredWorkTree === true);
  if (structural.worktreeConfig) {
    const worktreeEntries = await inspectCheckoutConfiguration(
      executable,
      canonicalCheckout,
      path.join(canonicalGitDirectory, 'config.worktree'),
    );
    if (worktreeEntries.length === 0) {
      throw new GitInspectionError('unsupported-checkout-config');
    }
    applySparseWorktreeConfiguration(structural, worktreeEntries);
  }
  const overlay = await buildInspectionOverlay(commonDirectory, structural);

  let disposed = false;
  // Keep the real per-worktree gitdir so operator includeIf.gitdir matching
  // retains its native semantics. Redirect only the common metadata root: its
  // config is sanitized, and checkout-owned hooks/info/worktree config are not
  // reachable. All inherited GIT_* controls were removed above.
  const environment = strippedGitEnvironment();
  environment.GIT_DIR = canonicalGitDirectory;
  environment.GIT_COMMON_DIR = overlay.common;
  environment.GIT_WORK_TREE = canonicalCheckout;
  environment.GIT_NO_LAZY_FETCH = '1';
  environment.GIT_OPTIONAL_LOCKS = '0';
  environment.GIT_PAGER = 'cat';
  environment.GIT_TERMINAL_PROMPT = '0';

  try {
    await rejectUnsupportedOperatorConditions(executable, canonicalCheckout, environment);
  } catch (error) {
    await rm(overlay.root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  return {
    executable,
    checkout: canonicalCheckout,
    gitDirectory: canonicalGitDirectory,
    commonDirectory,
    environment,
    dispose: async (): Promise<void> => {
      if (disposed) return;
      disposed = true;
      await rm(overlay.root, { recursive: true, force: true });
    },
  };
}
