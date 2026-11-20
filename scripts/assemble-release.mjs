// Assembles the npm packages one release publishes, from one clean build, into
// release/cli, release/pi and release/opencode, then checks them. It publishes nothing.
//
//   pnpm release:assemble            build, bundle, check
//   pnpm release:manifest            only rewrite support/manifest.json
//
// The private workspace packages are bundled in; native and WASM dependencies
// (OpenTUI, tree-sitter grammars) stay ordinary npm dependencies, and Pi's own
// packages stay host-provided peers. The OpenCode plugin imports nothing from
// OpenCode, which refuses plugins that ship its modules.
import assert from 'node:assert/strict';
import { exec, execFile } from 'node:child_process';
import { chmod, cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
// npm and pnpm are `.cmd` scripts on Windows, which run only through a shell.
// The arguments here are fixed words, never user input.
const runTool = async (tool, args, options = {}) =>
  process.platform === 'win32'
    ? await execAsync([tool, ...args].join(' '), options)
    : await execFileAsync(tool, args, options);
const importFile = async file => await import(pathToFileURL(file).href);
const root = fileURLToPath(new URL('..', import.meta.url));
const at = (...parts) => path.join(root, ...parts);
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

const rootManifest = await readJson(at('package.json'));
const version = rootManifest.version;
const app = await readJson(at('apps/buildframe/package.json'));
const piSource = await readJson(at('packages/pi-adapter/package.json'));
const { supportManifest, RELEASE_COORDINATES } = await import(
  new URL('../apps/buildframe/dist/supportManifest.js', import.meta.url).href
);

const manifest = supportManifest(version);
await writeFile(at('support/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// Keep the checked-in file in the repository's own format.
await runTool('pnpm', ['exec', 'oxfmt', 'support/manifest.json'], { cwd: root });
if (process.argv.includes('--manifest-only')) {
  console.log(`support/manifest.json written for ${version}`);
  process.exit(0);
}

const release = at('release');
await rm(release, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  legalComments: 'none',
  logLevel: 'warning',
  // Bundled CommonJS dependencies may call require; give ESM output one.
  banner: {
    js: "import { createRequire as __buildframeCreateRequire } from 'node:module'; const require = __buildframeCreateRequire(import.meta.url);",
  },
};

const repositoryUrl = `https://${RELEASE_COORDINATES.claudeCode.repository}`;
const publicMetadata = {
  homepage: `${repositoryUrl}#readme`,
  bugs: { url: `${repositoryUrl}/issues` },
  repository: { type: 'git', url: `git+${repositoryUrl}.git` },
  // Scoped packages are private on first publish unless they say otherwise.
  // The registry is pinned because npm reads no repository .npmrc from
  // release/, so a user-level registry (a company mirror) would otherwise win.
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
};

// --- @buildframe/cli -------------------------------------------------------------
const nativeDependencies = Object.fromEntries(
  Object.entries(app.dependencies).filter(([name]) => !name.startsWith('@buildframe/')),
);
const cli = path.join(release, 'cli');
await build({
  ...common,
  entryPoints: {
    buildframe: at('apps/buildframe/dist/developerExecutable.js'),
    runtimeProcess: at('apps/buildframe/dist/runtimeProcess.js'),
    'buildframe-claude-helper': at('packages/claude-adapter/dist/direct/helperCommand.js'),
    // Loaded as a worker thread from the file next to the State code, not imported.
    authoritativeStateWorker: at('packages/workspace/dist/authoritativeStateWorker.js'),
  },
  outdir: path.join(cli, 'dist'),
  // One shared chunk holds the runtime library, so the launcher and the
  // runtime process fingerprint the same file and recognise each other.
  splitting: true,
  chunkNames: 'chunk-[hash]',
  external: Object.keys(nativeDependencies),
});
for (const bin of ['buildframe.js', 'buildframe-claude-helper.js']) await chmod(path.join(cli, 'dist', bin), 0o755);
await writeFile(
  path.join(cli, 'package.json'),
  `${JSON.stringify(
    {
      name: RELEASE_COORDINATES.application,
      version,
      description: 'Review what your coding agent changed, and send it Messages from the terminal.',
      license: 'MIT',
      type: 'module',
      bin: {
        buildframe: './dist/buildframe.js',
        bframe: './dist/buildframe.js',
        'buildframe-claude-helper': './dist/buildframe-claude-helper.js',
      },
      files: ['dist', 'support-manifest.json'],
      engines: { node: app.engines.node },
      os: ['darwin', 'linux', 'win32'],
      dependencies: nativeDependencies,
      ...publicMetadata,
      keywords: ['code-review', 'tui', 'coding-agent', 'pi', 'claude-code'],
    },
    null,
    2,
  )}\n`,
);
await writeFile(path.join(cli, 'support-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// --- @buildframe/pi --------------------------------------------------------------
const piHostPackages = [
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-tui',
  'typebox',
];
const pi = path.join(release, 'pi');
await build({
  ...common,
  entryPoints: { index: at('packages/pi-adapter/dist/index.js') },
  outdir: path.join(pi, 'dist'),
  external: piHostPackages,
});
await writeFile(
  path.join(pi, 'package.json'),
  `${JSON.stringify(
    {
      name: RELEASE_COORDINATES.pi,
      version,
      description: 'Connect a Pi session to BuildFrame with /buildframe, so each Message you send becomes a turn.',
      license: 'MIT',
      type: 'module',
      main: './dist/index.js',
      files: ['dist'],
      engines: { node: piSource.engines.node },
      // Pi lists any npm package with this keyword on pi.dev/packages.
      keywords: ['pi-package', 'buildframe', 'code-review'],
      pi: { extensions: ['./dist/index.js'] },
      // Pi supplies its own packages; the connector's own range check runs at load.
      peerDependencies: { '@earendil-works/pi-coding-agent': '*' },
      ...publicMetadata,
    },
    null,
    2,
  )}\n`,
);

// --- @buildframe/opencode --------------------------------------------------------
const opencode = path.join(release, 'opencode');
await build({
  ...common,
  entryPoints: {
    index: at('packages/opencode-adapter/dist/index.js'),
    tui: at('packages/opencode-adapter/dist/tui.js'),
  },
  outdir: path.join(opencode, 'dist'),
});
await writeFile(
  path.join(opencode, 'package.json'),
  `${JSON.stringify(
    {
      name: RELEASE_COORDINATES.opencode,
      version,
      description:
        'Connect an OpenCode session to BuildFrame with /buildframe, so each Message you send becomes a turn.',
      license: 'MIT',
      type: 'module',
      // OpenCode loads the server part from `.` and the TUI part from `./tui`.
      exports: { '.': './dist/index.js', './tui': './dist/tui.js' },
      files: ['dist'],
      keywords: ['opencode', 'opencode-plugin', 'buildframe', 'code-review'],
      ...publicMetadata,
    },
    null,
    2,
  )}\n`,
);

for (const directory of [cli, pi, opencode]) {
  await cp(at('LICENSE'), path.join(directory, 'LICENSE'));
}
const requirements =
  `Needs macOS, Linux or Windows, Node ${app.engines.node} and Git. ` +
  `${version} is a preview: see the [full guide](${repositoryUrl}#readme) ` +
  `and report problems at ${repositoryUrl}/issues.\n`;
await writeFile(
  path.join(cli, 'README.md'),
  `# BuildFrame\n\nReview what your coding agent changed, and send it Messages from the terminal.\n\n` +
    `\`\`\`\nnpm i -g ${RELEASE_COORDINATES.application}\nbuildframe\n\`\`\`\n\n` +
    `Connect an agent from its session with \`/buildframe\`: install ${RELEASE_COORDINATES.pi} for Pi, ` +
    `${RELEASE_COORDINATES.opencode} for OpenCode, run \`!buildframe\` in Codex, ` +
    `or the \`buildframe\` plugin from the \`buildframe\` marketplace for Claude Code. ` +
    `Run \`buildframe doctor\` if something doesn't connect.\n\n` +
    requirements,
);
await writeFile(
  path.join(pi, 'README.md'),
  `# BuildFrame for Pi\n\n\`\`\`\npi install npm:${RELEASE_COORDINATES.pi}\n\`\`\`\n\n` +
    `Then run \`/buildframe\` in a Pi session inside the repository BuildFrame is reviewing. ` +
    `Needs the BuildFrame app: \`npm i -g ${RELEASE_COORDINATES.application}\`.\n\n` +
    requirements,
);

await writeFile(
  path.join(opencode, 'README.md'),
  `# BuildFrame for OpenCode\n\n\`\`\`\nopencode plugin add ${RELEASE_COORDINATES.opencode}@${version}\n\`\`\`\n\n` +
    `Then run \`/buildframe\` in an OpenCode session inside the repository BuildFrame is reviewing. ` +
    `Needs OpenCode 2 and the BuildFrame app: \`npm i -g ${RELEASE_COORDINATES.application}\`.\n\n` +
    requirements,
);

// --- Checks -------------------------------------------------------------------
async function packedFiles(directory) {
  const { stdout } = await runTool('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: directory });
  return JSON.parse(stdout)[0]
    .files.map(file => file.path)
    .sort();
}

async function bundledSources(directory) {
  const files = await readdir(path.join(directory, 'dist'));
  return await Promise.all(files.map(async file => [file, await readFile(path.join(directory, 'dist', file), 'utf8')]));
}

for (const [directory, allowed] of [
  [
    cli,
    /^(dist\/(buildframe|runtimeProcess|buildframe-claude-helper|authoritativeStateWorker|chunk-[A-Z0-9]+)\.js|package\.json|LICENSE|README\.md|support-manifest\.json)$/u,
  ],
  [pi, /^(dist\/index\.js|package\.json|LICENSE|README\.md)$/u],
  [opencode, /^(dist\/(index|tui)\.js|package\.json|LICENSE|README\.md)$/u],
]) {
  const files = await packedFiles(directory);
  const unexpected = files.filter(file => !allowed.test(file));
  assert.deepEqual(unexpected, [], `${path.basename(directory)} would publish unexpected files`);
  const shipped = new Set(files);
  for (const [file, source] of await bundledSources(directory)) {
    // Code that loads a sibling file by URL (a worker, a child process) needs that file shipped beside it.
    for (const match of source.matchAll(/new URL\(\s*["']\.\/([\w.-]+\.js)["']\s*,\s*import\.meta\.url\s*\)/gu)) {
      assert.ok(shipped.has(`dist/${match[1]}`), `${file} loads ./${match[1]}, which the package doesn't ship`);
    }
    // Private workspace code is bundled in; nothing may still import it by name.
    assert.ok(
      !/from\s*["']@buildframe\//u.test(source) && !/import\(\s*["']@buildframe\//u.test(source),
      `${file} imports a private @buildframe package`,
    );
  }
}

for (const directory of [cli, pi, opencode]) {
  const { publishConfig } = await readJson(path.join(directory, 'package.json'));
  assert.deepEqual(publishConfig, { access: 'public', registry: 'https://registry.npmjs.org/' });
}

const versions = [
  (await readJson(path.join(cli, 'package.json'))).version,
  (await readJson(path.join(pi, 'package.json'))).version,
  (await readJson(path.join(opencode, 'package.json'))).version,
  (await readJson(at('packages/claude-adapter/plugin/.claude-plugin/plugin.json'))).version,
  (await readJson(at('.claude-plugin/marketplace.json'))).plugins[0].version,
];
assert.deepEqual(
  versions,
  versions.map(() => version),
  'every released piece carries the product version',
);

// Run the assembled packages the way an install would, with their declared dependencies resolvable.
const scratch = await mkdtemp(path.join(tmpdir(), 'buildframe-release-'));
try {
  const installedCli = path.join(scratch, 'cli');
  await cp(cli, installedCli, { recursive: true });
  // A junction on Windows, which needs no Developer Mode; a symlink elsewhere.
  await symlink(at('apps/buildframe/node_modules'), path.join(installedCli, 'node_modules'), 'junction');
  const help = await execFileAsync(process.execPath, [path.join(installedCli, 'dist/buildframe.js'), '--help']);
  assert.match(help.stdout, /Usage: buildframe /u);
  const bins = (await readJson(path.join(cli, 'package.json'))).bin;
  assert.equal(bins.bframe, bins.buildframe, 'bframe runs the same program as buildframe');
  // Inside Codex, `buildframe` connects the session instead of opening the app.
  const codex = await execFileAsync(process.execPath, [path.join(installedCli, 'dist/buildframe.js'), 'status'], {
    env: { ...process.env, CODEX_THREAD_ID: 'release-check-thread' },
  });
  assert.equal(codex.stdout, 'BuildFrame is not connected to this session.\n', 'buildframe answers !buildframe status');
  const doctor = await execFileAsync(process.execPath, [
    path.join(installedCli, 'dist/buildframe.js'),
    'doctor',
    '--json',
    root,
  ]).catch(error => error);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.schema, 'buildframe.doctor/1');
  assert.equal(report.checks.find(check => check.id === 'buildframe')?.summary, `BuildFrame ${version}`);

  const installedPi = path.join(scratch, 'pi');
  await cp(pi, installedPi, { recursive: true });
  await symlink(at('packages/pi-adapter/node_modules'), path.join(installedPi, 'node_modules'), 'junction');
  const extension = await importFile(path.join(installedPi, 'dist/index.js'));
  assert.equal(typeof extension.default, 'function', '@buildframe/pi exports its extension');

  // OpenCode resolves nothing for the plugin: both parts must load from the package alone.
  const installedOpenCode = path.join(scratch, 'opencode');
  await cp(opencode, installedOpenCode, { recursive: true });
  const server = (await importFile(path.join(installedOpenCode, 'dist/index.js'))).default;
  assert.equal(server.id, 'buildframe', '@buildframe/opencode exports its server part');
  assert.equal(typeof server.setup, 'function', '@buildframe/opencode exports its server part');
  const tui = (await importFile(path.join(installedOpenCode, 'dist/tui.js'))).default;
  assert.equal(typeof tui.setup, 'function', '@buildframe/opencode exports its TUI part');
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log(
  `Release ${version} assembled in release/: ${RELEASE_COORDINATES.application}, ${RELEASE_COORDINATES.pi}, ${RELEASE_COORDINATES.opencode}`,
);
