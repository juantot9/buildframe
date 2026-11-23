#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { developerUsage, parseDeveloperArguments, type DeveloperArguments } from './developerArguments.js';
import { nodeSupport } from './nodeSupport.js';
import { startupFailureSentence } from './reviewingReasons.js';

function experimentalFfiEnabled(): boolean {
  return (
    process.execArgv.includes('--experimental-ffi') ||
    (process.env.NODE_OPTIONS ?? '').split(/\s+/u).includes('--experimental-ffi')
  );
}

async function reexecuteWithFfi(): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      '--experimental-ffi',
      '--disable-warning=ExperimentalWarning',
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit', env: process.env },
  );
  const forward = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  const interrupt = (): void => forward('SIGINT');
  const terminate = (): void => forward('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  const outcome = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
  if (outcome.signal !== null) {
    process.kill(process.pid, outcome.signal);
    return;
  }
  process.exitCode = outcome.code ?? 1;
}

async function run(): Promise<void> {
  const support = nodeSupport(process.versions.node);
  if (support.status === 'refused') {
    process.stderr.write(support.message);
    process.exitCode = 1;
    return;
  }
  // Inside Codex, `!buildframe` (and its status and disconnect) connects that
  // session instead of opening the app; doctor, --help and --version still work there.
  const ownCommand = ['doctor', '--help', '-h', '--version', '-v'].includes(process.argv[2] ?? '');
  if (process.argv[2] === '--codex-helper' || (process.env.CODEX_THREAD_ID !== undefined && !ownCommand)) {
    const codex = await import('@buildframe/codex-adapter-source/helper');
    if (process.argv[2] === codex.CODEX_HELPER_ARGUMENT) await codex.runCodexHelper();
    else await codex.runCodexCommand(process.argv.slice(2), process.env, fileURLToPath(import.meta.url));
    return;
  }
  if (!experimentalFfiEnabled()) {
    await reexecuteWithFfi();
    return;
  }
  if (support.status === 'warning') process.stderr.write(support.message);

  const { openDeveloperReviewing } = await import('./launcher.js');
  let options: DeveloperArguments;
  try {
    options = parseDeveloperArguments(process.argv.slice(2), process.env.INIT_CWD || process.cwd());
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Invalid arguments'}\n\n${developerUsage()}\n`);
    process.exitCode = 2;
    options = {
      command: 'review',
      startPath: process.cwd(),
      json: false,
      noColor: false,
      ascii: false,
      help: true,
      version: false,
    };
  }

  if (process.exitCode !== 2 && options.help) {
    process.stdout.write(`${developerUsage()}\n`);
    return;
  }
  if (process.exitCode !== 2 && options.version) {
    const { productVersion } = await import('./doctor.js');
    process.stdout.write(`${await productVersion()}\n`);
    return;
  }
  if (process.exitCode === 2) return;

  if (options.command === 'doctor') {
    const { formatDoctorReport, hostVersionFromPath, runDoctor } = await import('./doctor.js');
    const report = await runDoctor({
      nodeVersion: process.versions.node,
      startPath: options.startPath,
      runtimeEntrypoint: new URL('./runtimeProcess.js', import.meta.url),
      hostVersion: hostVersionFromPath,
    });
    process.stdout.write(
      options.json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report, options.ascii),
    );
    process.exitCode = report.ok ? 0 : 1;
    return;
  }

  const lifetime = new AbortController();
  const stop = (): void => lifetime.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const opened = await openDeveloperReviewing({
      startPath: options.startPath,
      signal: lifetime.signal,
      presentation: {
        noColor: options.noColor,
        ascii: options.ascii,
      },
    });
    if (opened.status === 'rejected') {
      if (opened.diagnostic.code === 'runtime-unavailable' && opened.diagnostic.reason === 'cancelled') {
        // Ctrl+C while starting is a choice, not a failure.
        process.exitCode = 130;
      } else {
        process.stderr.write(`BuildFrame couldn’t start. ${startupFailureSentence(opened.diagnostic)}\n`);
        process.exitCode = 1;
      }
    } else {
      await opened.session.closed;
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim().length > 0 ? ` (${error.message.trim()})` : '';
    process.stderr.write(
      `BuildFrame stopped unexpectedly${detail}. Start it again; if it keeps happening, report it.\n`,
    );
    process.exitCode = 1;
  } finally {
    lifetime.abort();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

await run();
