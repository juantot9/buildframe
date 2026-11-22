import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, chmod, link, lstat, open, readFile, realpath, rm, stat } from 'node:fs/promises';
import { release } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  GitExecutableResolutionError,
  prepareGitInspectionContext,
  runGitProcess,
  type GitInspectionContext,
} from './gitProcess.js';
import { renameFile, syncDirectory } from './durableFiles.js';
import { BootstrapProblem, authorityUnavailable } from './bootstrapProblem.js';
import { userStateDirectoryFor } from './privateDirectories.js';
import { withRegistryLock } from './registryLock.js';
import type { WorkspaceBootstrapDiagnostic } from './workspaceBootstrapDiagnostics.js';
import type { WorkspaceIdentity } from './baseTypes.js';
import { objectRecord } from './workspaceLockOwner.js';

const MARKER_FILE_NAME = 'neoflow-workspace-identity.json';
const MARKER_FORMAT_VERSION = 1;
const REGISTRY_FILE_NAME = 'workspace-registry.json';
const REGISTRY_FORMAT_VERSION = 1;
const GIT_DIRECTORY_IDENTITY_PATTERN = /^fs:[0-9]+:[0-9]+:[0-9]+$/u;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface GitWorktree {
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
  readonly gitDirectoryIdentity: string;
}

interface Marker {
  readonly workspaceIdentity: WorkspaceIdentity;
}

interface RegistryRegistration {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
  /** Optional only while reading a registry written by the pre-review P04 build. */
  readonly gitDirectoryIdentity: string | undefined;
}

interface Registry {
  readonly registrations: readonly RegistryRegistration[];
}

interface ResolvedWorkspaceIdentity {
  readonly status: 'ready';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
}

interface RejectedWorkspaceIdentity {
  readonly status: 'rejected';
  readonly diagnostic: WorkspaceBootstrapDiagnostic;
}

export type WorkspaceIdentityResolution = ResolvedWorkspaceIdentity | RejectedWorkspaceIdentity;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function makeWorkspaceIdentity(value: string): WorkspaceIdentity {
  return value as WorkspaceIdentity;
}

function newWorkspaceIdentity(): WorkspaceIdentity {
  return makeWorkspaceIdentity(`wsp_${randomUUID()}`);
}

function platformDiagnostic(): WorkspaceBootstrapDiagnostic | undefined {
  if (process.platform === 'darwin' || process.platform === 'win32') return undefined;

  if (process.platform === 'linux') {
    const kernelRelease = release().toLowerCase();
    if (
      kernelRelease.includes('microsoft') &&
      !kernelRelease.includes('wsl2') &&
      !kernelRelease.includes('microsoft-standard')
    ) {
      return {
        code: 'unsupported-platform',
        platform: process.platform,
        reason: 'wsl1',
      };
    }
    return undefined;
  }

  return {
    code: 'unsupported-platform',
    platform: process.platform,
    reason: 'unsupported-operating-system',
  };
}

async function inspectStartDirectory(requestedPath: string): Promise<string> {
  let canonicalStart: string;
  try {
    canonicalStart = await realpath(requestedPath);
  } catch (error) {
    throw new BootstrapProblem({
      code: 'path-unavailable',
      requestedPath,
      reason: isErrno(error, 'ENOENT') ? 'missing' : 'unreadable',
    });
  }

  try {
    if (!(await stat(canonicalStart)).isDirectory()) {
      throw new BootstrapProblem({
        code: 'path-unavailable',
        requestedPath,
        reason: 'not-directory',
      });
    }
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw new BootstrapProblem({
      code: 'path-unavailable',
      requestedPath,
      reason: isErrno(error, 'ENOENT') ? 'missing' : 'unreadable',
    });
  }

  return canonicalStart;
}

function stripFinalLineEnding(value: string): string {
  if (value.endsWith('\r\n')) return value.slice(0, -2);
  if (value.endsWith('\n')) return value.slice(0, -1);
  return value;
}

// `--show-toplevel` and `--absolute-git-dir` are already absolute, and both
// results are canonicalized below, so no `--path-format` option is needed. That
// keeps the supported Git floor low instead of silently misreporting every
// repository as unmanaged on a Git that predates the option.
async function runGit(context: GitInspectionContext, argument: string): Promise<string> {
  const result = await runGitProcess({
    executable: context.executable,
    checkout: context.checkout,
    arguments: ['-C', context.checkout, 'rev-parse', argument],
    environment: context.environment,
    maxStdoutBytes: 64 * 1024,
    timeoutMilliseconds: DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  });
  return stripFinalLineEnding(result.stdout.toString('utf8'));
}

type GitBoundaryEvidence = 'absent' | 'present' | 'inaccessible';

/**
 * Git's "not a git repository" text is ambiguous: it is also emitted for an
 * unreadable `.git` directory and a broken gitfile. Filesystem evidence keeps
 * those damaged repositories from being mistaken for unmanaged directories.
 */
async function inspectGitBoundary(canonicalStart: string): Promise<GitBoundaryEvidence> {
  let current = canonicalStart;
  while (true) {
    const candidate = path.join(current, '.git');
    try {
      const entry = await lstat(candidate);
      try {
        await access(candidate, fsConstants.R_OK | (entry.isDirectory() ? fsConstants.X_OK : 0));
      } catch (error) {
        if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) {
          return 'inaccessible';
        }
      }
      return 'present';
    } catch (error) {
      if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) {
        return 'inaccessible';
      }
      if (!isErrno(error, 'ENOENT') && !isErrno(error, 'ENOTDIR')) {
        return 'present';
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return 'absent';
    current = parent;
  }
}

function gitFailure(requestedPath: string, error: unknown, boundaryEvidence: GitBoundaryEvidence): BootstrapProblem {
  // Resolution failures and spawn ENOENT both mean the process cannot use the
  // selected executable; neither describes a checkout path disappearing.
  if (error instanceof GitExecutableResolutionError || isErrno(error, 'ENOENT')) {
    return new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'git-unavailable',
    });
  }

  const details = error as { readonly stderr?: unknown };
  const stderr =
    typeof details?.stderr === 'string'
      ? details.stderr.toLowerCase()
      : Buffer.isBuffer(details?.stderr)
        ? details.stderr.toString('utf8').toLowerCase()
        : '';

  if (
    boundaryEvidence === 'inaccessible' ||
    stderr.includes('dubious ownership') ||
    stderr.includes('permission denied')
  ) {
    return new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'repository-inaccessible',
    });
  }

  if (boundaryEvidence === 'absent' && stderr.includes('not a git repository')) {
    return new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
  }

  return new BootstrapProblem({
    code: 'git-inspection-failed',
    requestedPath,
    reason: 'inspection-failed',
  });
}

function filesystemIdentity(status: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly birthtimeNs: bigint;
}): string {
  return `fs:${status.dev}:${status.ino}:${status.birthtimeNs}`;
}

interface DiscoveredGitDirectory {
  readonly checkout: string;
  readonly gitDirectory: string;
}

// Discovery is filesystem-only so no repository-aware Git command can run
// before the controlled inspection context exists.
async function discoverGitDirectory(canonicalStart: string): Promise<DiscoveredGitDirectory | undefined> {
  let current = canonicalStart;
  while (true) {
    const candidate = path.join(current, '.git');
    try {
      const entry = await lstat(candidate);
      if (entry.isDirectory()) {
        return {
          checkout: current,
          gitDirectory: await realpath(candidate),
        };
      }
      if (entry.isFile()) {
        const contents = await readFile(candidate, 'utf8');
        const match = /^gitdir: (.+)$/mu.exec(contents.trimEnd());
        if (match?.[1] === undefined) return undefined;
        return {
          checkout: current,
          gitDirectory: await realpath(path.resolve(current, match[1])),
        };
      }
    } catch (error) {
      if (
        !isErrno(error, 'ENOENT') &&
        !isErrno(error, 'ENOTDIR') &&
        !isErrno(error, 'EACCES') &&
        !isErrno(error, 'EPERM')
      ) {
        return undefined;
      }
      if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function looksLikeBareGitDirectory(directory: string): Promise<boolean> {
  try {
    const [head, objects, refs] = await Promise.all([
      stat(path.join(directory, 'HEAD')),
      stat(path.join(directory, 'objects')),
      stat(path.join(directory, 'refs')),
    ]);
    return head.isFile() && objects.isDirectory() && refs.isDirectory();
  } catch {
    return false;
  }
}

async function inspectGitWorktree(requestedPath: string): Promise<GitWorktree> {
  const canonicalStart = await inspectStartDirectory(requestedPath);
  const boundaryEvidence = await inspectGitBoundary(canonicalStart);
  const discovered = await discoverGitDirectory(canonicalStart);
  if (discovered === undefined) {
    if (boundaryEvidence === 'absent') {
      let current = canonicalStart;
      while (true) {
        if (await looksLikeBareGitDirectory(current)) {
          throw new BootstrapProblem({
            code: 'bare-git-repository',
            requestedPath,
          });
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      throw new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
    }
    throw new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: boundaryEvidence === 'inaccessible' ? 'repository-inaccessible' : 'inspection-failed',
    });
  }

  const canonicalCheckout = await realpath(discovered.checkout).catch((error: unknown) => {
    throw gitFailure(requestedPath, error, boundaryEvidence);
  });
  const candidateGitDirectory = discovered.gitDirectory;
  const candidateStatus = await stat(candidateGitDirectory, { bigint: true }).catch((error: unknown) => {
    throw gitFailure(requestedPath, error, boundaryEvidence);
  });
  if (!candidateStatus.isDirectory()) {
    throw new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'inspection-failed',
    });
  }

  // A directory containing HEAD, objects, and refs but no enclosing `.git`
  // boundary is a bare repository. Reject it before forcing a work tree into
  // the controlled inspection environment.
  if (boundaryEvidence === 'absent') {
    throw new BootstrapProblem({
      code: 'bare-git-repository',
      requestedPath,
    });
  }

  let context: GitInspectionContext | undefined;
  try {
    context = await prepareGitInspectionContext(canonicalCheckout, candidateGitDirectory);
    const [isBare, isInsideWorktree, checkout] = await Promise.all([
      runGit(context, '--is-bare-repository'),
      runGit(context, '--is-inside-work-tree'),
      runGit(context, '--show-toplevel'),
    ]);

    if (isBare === 'true') {
      throw new BootstrapProblem({
        code: 'bare-git-repository',
        requestedPath,
      });
    }
    if (isBare !== 'false') {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inspection-failed',
      });
    }
    if (isInsideWorktree !== 'true') {
      throw new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
    }
    if (checkout.length === 0) {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inconsistent-worktree',
      });
    }

    const inspectedCheckout = await realpath(path.resolve(canonicalCheckout, checkout)).catch(() => undefined);
    if (inspectedCheckout !== canonicalCheckout) {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inconsistent-worktree',
      });
    }
    return {
      canonicalCheckout,
      gitDirectory: candidateGitDirectory,
      gitDirectoryIdentity: filesystemIdentity(candidateStatus),
    };
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw gitFailure(requestedPath, error, boundaryEvidence);
  } finally {
    await context?.dispose().catch(() => undefined);
  }
}

/** Shared only inside the Workspace owner; callers never receive this path. */
export function userStateDirectory(requestedPath: string): string {
  const directory = userStateDirectoryFor();
  if (directory === undefined) throw authorityUnavailable(requestedPath, 'resolve-user-state');
  return directory;
}

function parseMarker(content: string): Marker | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const record = objectRecord(parsed);
  if (
    !record ||
    record.formatVersion !== MARKER_FORMAT_VERSION ||
    typeof record.workspaceIdentity !== 'string' ||
    !WORKSPACE_ID_PATTERN.test(record.workspaceIdentity)
  ) {
    return undefined;
  }

  return {
    workspaceIdentity: makeWorkspaceIdentity(record.workspaceIdentity),
  };
}

async function readMarker(markerFile: string, requestedPath: string): Promise<Marker | 'missing' | 'invalid'> {
  try {
    const marker = parseMarker(await readFile(markerFile, 'utf8'));
    return marker ?? 'invalid';
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return 'missing';
    throw authorityUnavailable(requestedPath, 'read-marker');
  }
}

async function installMarker(
  markerFile: string,
  proposedIdentity: WorkspaceIdentity,
  canonicalCheckout: string,
  requestedPath: string,
): Promise<WorkspaceIdentity> {
  const temporaryFile = path.join(path.dirname(markerFile), `.${MARKER_FILE_NAME}.${randomUUID()}.tmp`);
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryHandle = await open(temporaryFile, 'wx', 0o600);
    await temporaryHandle.writeFile(
      `${JSON.stringify({
        formatVersion: MARKER_FORMAT_VERSION,
        workspaceIdentity: proposedIdentity,
      })}\n`,
      'utf8',
    );
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    try {
      await link(temporaryFile, markerFile);
      return proposedIdentity;
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error;
      const existing = await readMarker(markerFile, requestedPath);
      if (existing === 'missing' || existing === 'invalid') {
        throw new BootstrapProblem({
          code: 'workspace-marker-invalid',
          canonicalCheckout,
        });
      }
      return existing.workspaceIdentity;
    }
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw authorityUnavailable(requestedPath, 'write-marker');
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

function parseRegistry(content: string): Registry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }

  const record = objectRecord(parsed);
  if (!record || typeof record.formatVersion !== 'number') {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }
  if (record.formatVersion !== REGISTRY_FORMAT_VERSION) {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'unsupported-version',
    });
  }
  if (!Array.isArray(record.registrations)) {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }

  const registrations: RegistryRegistration[] = [];
  const identities = new Set<string>();
  const gitDirectories = new Set<string>();
  for (const value of record.registrations) {
    const registration = objectRecord(value);
    if (
      !registration ||
      typeof registration.workspaceIdentity !== 'string' ||
      !WORKSPACE_ID_PATTERN.test(registration.workspaceIdentity) ||
      typeof registration.canonicalCheckout !== 'string' ||
      !path.isAbsolute(registration.canonicalCheckout) ||
      typeof registration.gitDirectory !== 'string' ||
      !path.isAbsolute(registration.gitDirectory) ||
      (registration.gitDirectoryIdentity !== undefined &&
        (typeof registration.gitDirectoryIdentity !== 'string' ||
          !GIT_DIRECTORY_IDENTITY_PATTERN.test(registration.gitDirectoryIdentity))) ||
      identities.has(registration.workspaceIdentity) ||
      gitDirectories.has(registration.gitDirectory)
    ) {
      throw new BootstrapProblem({
        code: 'workspace-registry-invalid',
        reason: 'invalid-registration',
      });
    }

    identities.add(registration.workspaceIdentity);
    gitDirectories.add(registration.gitDirectory);
    registrations.push({
      workspaceIdentity: makeWorkspaceIdentity(registration.workspaceIdentity),
      canonicalCheckout: registration.canonicalCheckout,
      gitDirectory: registration.gitDirectory,
      gitDirectoryIdentity:
        typeof registration.gitDirectoryIdentity === 'string' ? registration.gitDirectoryIdentity : undefined,
    });
  }

  return { registrations };
}

async function readRegistry(registryFile: string, requestedPath: string): Promise<Registry> {
  try {
    return parseRegistry(await readFile(registryFile, 'utf8'));
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { registrations: [] };
    if (error instanceof BootstrapProblem) throw error;
    throw authorityUnavailable(requestedPath, 'read-registry');
  }
}

async function writeRegistry(registryFile: string, registry: Registry, requestedPath: string): Promise<void> {
  const registryDirectory = path.dirname(registryFile);
  const temporaryFile = path.join(registryDirectory, `.${REGISTRY_FILE_NAME}.${randomUUID()}.tmp`);
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryHandle = await open(temporaryFile, 'wx', 0o600);
    await temporaryHandle.writeFile(
      `${JSON.stringify(
        {
          formatVersion: REGISTRY_FORMAT_VERSION,
          registrations: registry.registrations,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await renameFile(temporaryFile, registryFile);
    await chmod(registryFile, 0o600);
    // The registry names Workspace identity authority. Do not report readiness
    // until the directory entry replacing it is durable as well as its bytes.
    await syncDirectory(registryDirectory);
  } catch {
    throw authorityUnavailable(requestedPath, 'write-registry');
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false;
    throw error;
  }
}

function markerFileFor(gitDirectory: string): string {
  return path.join(gitDirectory, MARKER_FILE_NAME);
}

async function pathStillExists(target: string, requestedPath: string): Promise<boolean> {
  try {
    return await exists(target);
  } catch {
    throw authorityUnavailable(requestedPath, 'read-marker');
  }
}

function registrationMatchesAdministration(registration: RegistryRegistration, worktree: GitWorktree): boolean {
  return registration.gitDirectoryIdentity === undefined
    ? registration.gitDirectory === worktree.gitDirectory
    : registration.gitDirectoryIdentity === worktree.gitDirectoryIdentity;
}

async function oldRegistrationStillExists(registration: RegistryRegistration, requestedPath: string): Promise<boolean> {
  if (registration.gitDirectoryIdentity !== undefined) {
    let oldDirectoryStatus: Awaited<ReturnType<typeof stat>>;
    try {
      oldDirectoryStatus = await stat(registration.gitDirectory, {
        bigint: true,
      });
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return false;
      throw authorityUnavailable(requestedPath, 'read-marker');
    }
    if (
      !oldDirectoryStatus.isDirectory() ||
      filesystemIdentity(oldDirectoryStatus) !== registration.gitDirectoryIdentity
    ) {
      return false;
    }

    const oldMarker = await readMarker(markerFileFor(registration.gitDirectory), requestedPath);
    return (
      oldMarker !== 'missing' &&
      oldMarker !== 'invalid' &&
      oldMarker.workspaceIdentity === registration.workspaceIdentity
    );
  }

  // Pre-review registries did not record administration generations. Preserve
  // their conservative collision behavior until a successful start enriches
  // the registration.
  const oldMarker = await readMarker(markerFileFor(registration.gitDirectory), requestedPath);
  if (
    oldMarker !== 'missing' &&
    oldMarker !== 'invalid' &&
    oldMarker.workspaceIdentity === registration.workspaceIdentity
  ) {
    return true;
  }
  return (
    (await pathStillExists(registration.canonicalCheckout, requestedPath)) ||
    (await pathStillExists(registration.gitDirectory, requestedPath))
  );
}

/**
 * Reconciles the registry with the marker that has already been read. The
 * marker is the identity authority, while the recorded administration
 * generation distinguishes a moved worktree from a recycled path. The registry
 * refuses both an identity live under another generation and one generation
 * claimed by two surviving checkouts.
 */
async function registerIdentity(
  registry: Registry,
  identity: WorkspaceIdentity,
  worktree: GitWorktree,
  requestedPath: string,
): Promise<Registry> {
  const registrationForAdministration = registry.registrations.find(registration =>
    registrationMatchesAdministration(registration, worktree),
  );
  if (
    registrationForAdministration &&
    registrationForAdministration.workspaceIdentity !== identity &&
    registrationForAdministration.canonicalCheckout !== worktree.canonicalCheckout &&
    (await pathStillExists(registrationForAdministration.canonicalCheckout, requestedPath))
  ) {
    throw new BootstrapProblem({
      code: 'workspace-identity-collision',
      reason: 'registered-worktree-mismatch',
      workspaceIdentity: identity,
      registeredCheckout: registrationForAdministration.canonicalCheckout,
      attemptedCheckout: worktree.canonicalCheckout,
    });
  }

  const existing = registry.registrations.find(registration => registration.workspaceIdentity === identity);
  if (existing) {
    if (registrationMatchesAdministration(existing, worktree)) {
      if (
        existing.canonicalCheckout === worktree.canonicalCheckout &&
        existing.gitDirectory === worktree.gitDirectory &&
        existing.gitDirectoryIdentity === worktree.gitDirectoryIdentity
      ) {
        return registry;
      }

      // A moved worktree leaves nothing behind; a copied checkout whose `.git`
      // file still points at this administration generation does.
      if (
        existing.canonicalCheckout !== worktree.canonicalCheckout &&
        (await pathStillExists(existing.canonicalCheckout, requestedPath))
      ) {
        throw new BootstrapProblem({
          code: 'workspace-identity-collision',
          reason: 'registered-worktree-mismatch',
          workspaceIdentity: identity,
          registeredCheckout: existing.canonicalCheckout,
          attemptedCheckout: worktree.canonicalCheckout,
        });
      }
    } else if (await oldRegistrationStillExists(existing, requestedPath)) {
      throw new BootstrapProblem({
        code: 'workspace-identity-collision',
        reason: 'duplicate-marker',
        workspaceIdentity: identity,
        registeredCheckout: existing.canonicalCheckout,
        attemptedCheckout: worktree.canonicalCheckout,
      });
    }
  }

  const retained = registry.registrations.filter(
    registration =>
      registration.workspaceIdentity !== identity &&
      registration.gitDirectory !== worktree.gitDirectory &&
      !registrationMatchesAdministration(registration, worktree),
  );
  return {
    registrations: [
      ...retained,
      {
        workspaceIdentity: identity,
        canonicalCheckout: worktree.canonicalCheckout,
        gitDirectory: worktree.gitDirectory,
        gitDirectoryIdentity: worktree.gitDirectoryIdentity,
      },
    ],
  };
}

async function resolveUnderLock(
  worktree: GitWorktree,
  stateDirectory: string,
  requestedPath: string,
): Promise<WorkspaceIdentity> {
  const registryFile = path.join(stateDirectory, REGISTRY_FILE_NAME);
  const registry = await readRegistry(registryFile, requestedPath);
  const markerFile = markerFileFor(worktree.gitDirectory);
  const marker = await readMarker(markerFile, requestedPath);

  if (marker === 'invalid') {
    throw new BootstrapProblem({
      code: 'workspace-marker-invalid',
      canonicalCheckout: worktree.canonicalCheckout,
    });
  }

  let identity: WorkspaceIdentity;
  if (marker === 'missing') {
    const registrationForAdministration = registry.registrations.find(registration =>
      registrationMatchesAdministration(registration, worktree),
    );
    if (registrationForAdministration) {
      // Missing authority for a known administration generation is ambiguous:
      // silently minting would make its existing state look like an empty
      // Workspace. Recycled paths have a different generation and remain new.
      throw new BootstrapProblem({
        code: 'workspace-marker-missing',
        canonicalCheckout: worktree.canonicalCheckout,
      });
    }
    identity = await installMarker(markerFile, newWorkspaceIdentity(), worktree.canonicalCheckout, requestedPath);
  } else {
    identity = marker.workspaceIdentity;
  }

  try {
    // The marker is Workspace identity authority. Its same-directory hard-link
    // publication is atomic, but authority cannot return until that directory
    // entry is durable too. Reconfirm existing markers so pre-barrier installs
    // and recovery after a failed sync cross the same boundary.
    await syncDirectory(path.dirname(markerFile));
  } catch {
    throw authorityUnavailable(requestedPath, 'write-marker');
  }

  const updatedRegistry = await registerIdentity(registry, identity, worktree, requestedPath);
  if (updatedRegistry !== registry) {
    await writeRegistry(registryFile, updatedRegistry, requestedPath);
  }

  return identity;
}

export async function resolveWorkspaceIdentity(requestedPath: string): Promise<WorkspaceIdentityResolution> {
  const unsupportedPlatform = platformDiagnostic();
  if (unsupportedPlatform) {
    return { status: 'rejected', diagnostic: unsupportedPlatform };
  }

  try {
    const worktree = await inspectGitWorktree(requestedPath);
    const stateDirectory = userStateDirectory(requestedPath);
    const workspaceIdentity = await withRegistryLock(stateDirectory, requestedPath, () =>
      resolveUnderLock(worktree, stateDirectory, requestedPath),
    );

    return {
      status: 'ready',
      workspaceIdentity,
      canonicalCheckout: worktree.canonicalCheckout,
      gitDirectory: worktree.gitDirectory,
    };
  } catch (error) {
    if (error instanceof BootstrapProblem) {
      return { status: 'rejected', diagnostic: error.diagnostic };
    }
    return {
      status: 'rejected',
      diagnostic: {
        code: 'workspace-authority-unavailable',
        requestedPath,
        operation: 'read-marker',
      },
    };
  }
}
