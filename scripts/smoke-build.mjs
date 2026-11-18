import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const entrypoints = [
  '../packages/workspace/dist/index.js',
  '../packages/workspace/dist/runtime.js',
  '../packages/workspace/dist/harness-interaction/index.js',
  '../packages/local-runtime/dist/index.js',
  '../packages/local-runtime/dist/launcher.js',
  '../packages/local-runtime/dist/harnessAdapter.js',
  '../packages/pi-adapter/dist/index.js',
  '../apps/buildframe/dist/index.js',
  '../apps/buildframe/dist/launcher.js',
];

const [
  workspace,
  workspaceRuntime,
  harnessInteraction,
  localRuntime,
  localRuntimeLauncher,
  localRuntimeHarnessAdapter,
  piAdapter,
  application,
  applicationLauncher,
] = await Promise.all(entrypoints.map(entrypoint => import(new URL(entrypoint, import.meta.url).href)));
assert.deepEqual(
  Object.keys(workspace).sort(),
  ['WORKSPACE_INTERFACE_VERSION', 'bootstrapWorkspace'],
  'P04 must expose only the closed Workspace bootstrap and Interface version',
);
assert.deepEqual(
  Object.keys(workspaceRuntime),
  ['openWorkspaceRuntimeOwner'],
  'P08 Workspace writer ownership must remain launcher-only and State-private',
);
assert.deepEqual(
  Object.keys(harnessInteraction),
  [],
  'P13 reviewed Adapter integration subpath must expose contracts only',
);
assert.deepEqual(
  Object.keys(localRuntime).sort(),
  ['LOCAL_RUNTIME_PROTOCOL_VERSION', 'LocalRuntimeSessionError', 'connectWorkspaceRuntime'],
  'P07 must expose only semantic runtime bootstrap and session diagnostics',
);
assert.deepEqual(
  Object.keys(localRuntimeLauncher).sort(),
  [
    'LocalRuntimeServerError',
    'ensureWorkspaceRuntime',
    'inspectWorkspaceRuntime',
    'runWorkspaceRuntimeProcess',
    'startLocalRuntimeServer',
  ],
  'P08 runtime controls must remain on the launcher-only Interface',
);
assert.deepEqual(
  Object.keys(localRuntimeHarnessAdapter).sort(),
  [
    'HARNESS_ADAPTER_PROTOCOL_VERSION',
    'connectHarnessAdapterRuntime',
    'exactReviewMessageText',
    'openConnectorSession',
  ],
  'P14 Adapter-role transport must remain on its reviewed integration subpath',
);
assert.deepEqual(Object.keys(piAdapter), ['default'], 'P14 Pi package root must expose only its host-loaded extension');
assert.deepEqual(
  Object.keys(application),
  ['createReviewingApplication'],
  'P12 application root must expose only the deep Reviewing surface factory',
);
assert.deepEqual(
  Object.keys(applicationLauncher).sort(),
  ['openDeveloperReviewing', 'openDeveloperWorkspaceRuntime'],
  'P15 must keep executable assembly on the developer launcher subpath',
);
await fs.access(new URL('../apps/buildframe/dist/runtimeProcess.js', import.meta.url));
const executable = new URL('../apps/buildframe/dist/developerExecutable.js', import.meta.url);
await fs.access(executable);
const help = await execFileAsync(process.execPath, [executable.pathname, '--help']);
assert.match(help.stdout, /Usage: buildframe \[--no-color\]/u);
assert.match(help.stdout, /running \/buildframe in a Pi or Claude Code session/u);
const versionRun = await execFileAsync(process.execPath, [executable.pathname, '--version']);
assert.equal(
  versionRun.stdout,
  `${JSON.parse(await fs.readFile(new URL('../apps/buildframe/package.json', import.meta.url), 'utf8')).version}\n`,
);
const developerArguments = await import(new URL('../apps/buildframe/dist/developerArguments.js', import.meta.url).href);
assert.deepEqual(
  developerArguments.parseDeveloperArguments(['--no-color', '--', '/tmp/dogfood-workspace'], '/tmp/default-workspace'),
  {
    command: 'review',
    json: false,
    startPath: '/tmp/dogfood-workspace',
    noColor: true,
    ascii: false,
    help: false,
    version: false,
  },
  "P15 developer invocation must accept pnpm's forwarded option separator",
);
assert.deepEqual(
  developerArguments.parseDeveloperArguments(['--', ''], '/tmp/default-workspace'),
  {
    command: 'review',
    json: false,
    startPath: '/tmp/default-workspace',
    noColor: false,
    ascii: false,
    help: false,
    version: false,
  },
  'P15 developer invocation must treat an empty forwarded workspace as omitted',
);

const manifest = JSON.parse(await fs.readFile(new URL('../support/manifest.json', import.meta.url), 'utf8'));
const { supportManifest } = await import(new URL('../apps/buildframe/dist/supportManifest.js', import.meta.url).href);
const rootManifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.deepEqual(
  manifest,
  JSON.parse(JSON.stringify(supportManifest(rootManifest.version))),
  'support/manifest.json must equal the generated support claims; run pnpm release:manifest',
);

console.log('v1 build smoke tests passed');
