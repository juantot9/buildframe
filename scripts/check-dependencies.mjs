import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const repoRoot = process.cwd();

const retiredPackages = [
  { directory: 'apps/cli', name: '@buildframe/cli' },
  { directory: 'apps/tui', name: '@buildframe/tui' },
  { directory: 'packages/ai-harness', name: '@buildframe/ai-harness' },
  { directory: 'packages/core', name: '@buildframe/core' },
  { directory: 'packages/pi-connector', name: '@buildframe/pi-connector' },
];
const legacyDirectories = retiredPackages.map(({ directory }) => path.join(repoRoot, directory));
// `scripts/smoke-build.mjs` is no longer listed: the active build smoke
// reclaimed the name when the effort-label suffixes were removed (WF-207).
const retiredStandalonePaths = ['nvim', 'apps/buildframe/prototypes'];
const retiredExternalPackages = ['commander', 'ink', 'react', '@types/react'];

const PI_HOST_PACKAGE = '@earendil-works/pi-coding-agent';
const OPENTUI_PACKAGE = '@opentui/core';
const TEST_RUNNER_PACKAGE = 'vitest';
// Claude Code's built-in Mod test kit (`claude-code/testing`), supplied by the CLI, never installed.
const CLAUDE_MOD_TEST_KIT = 'claude-code';
// Query/WASM assets only; confined to the Reviewing application.
const REVIEWING_PARSER_PACKAGES = [
  'tree-sitter-wasms',
  '@tree-sitter-grammars/tree-sitter-yaml',
  'tree-sitter-python',
  'tree-sitter-go',
  'tree-sitter-rust',
  'tree-sitter-c',
  'tree-sitter-cpp',
  'tree-sitter-java',
  'tree-sitter-json',
  'tree-sitter-toml',
  'tree-sitter-bash',
  'tree-sitter-html',
  'tree-sitter-css',
];

function externalDependencyPolicy({ production = [], test = [], manifest = {} }) {
  return {
    production: new Set(production),
    test: new Set(test),
    manifest: Object.fromEntries(Object.entries(manifest).map(([field, packages]) => [field, new Set(packages)])),
  };
}

const v1Packages = [
  {
    directory: path.join(repoRoot, 'packages/workspace'),
    allowedV1Dependencies: new Set(),
    allowedExternalDependencies: externalDependencyPolicy({
      test: [TEST_RUNNER_PACKAGE],
    }),
  },
  {
    directory: path.join(repoRoot, 'packages/local-runtime'),
    allowedV1Dependencies: new Set(['@buildframe/workspace']),
    allowedExternalDependencies: externalDependencyPolicy({
      test: [TEST_RUNNER_PACKAGE],
    }),
  },
  {
    directory: path.join(repoRoot, 'packages/pi-adapter'),
    allowedV1Dependencies: new Set(['@buildframe/local-runtime', '@buildframe/workspace']),
    allowedExternalDependencies: externalDependencyPolicy({
      production: [PI_HOST_PACKAGE],
      test: [TEST_RUNNER_PACKAGE],
      manifest: {
        devDependencies: [PI_HOST_PACKAGE],
        peerDependencies: [PI_HOST_PACKAGE],
      },
    }),
  },
  {
    directory: path.join(repoRoot, 'packages/claude-adapter'),
    // The Direct Mod's tests run under `claude plugin test`, which requires them inside the plugin.
    testDirectories: ['test', 'plugin/tests'],
    allowedV1Dependencies: new Set(['@buildframe/local-runtime', '@buildframe/workspace']),
    allowedExternalDependencies: externalDependencyPolicy({
      test: [TEST_RUNNER_PACKAGE, CLAUDE_MOD_TEST_KIT],
    }),
  },
  {
    directory: path.join(repoRoot, 'apps/buildframe'),
    allowedV1Dependencies: new Set(['@buildframe/local-runtime', '@buildframe/workspace']),
    allowedExternalDependencies: externalDependencyPolicy({
      production: [OPENTUI_PACKAGE, ...REVIEWING_PARSER_PACKAGES],
      test: [OPENTUI_PACKAGE, TEST_RUNNER_PACKAGE],
      manifest: {
        dependencies: [OPENTUI_PACKAGE, ...REVIEWING_PARSER_PACKAGES],
      },
    }),
  },
];

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
// `.claude-plugin` holds manifests and the type declarations Claude Code generates on load.
const ignoredDirectories = new Set(['dist', 'node_modules', '.claude-plugin']);
const violations = [];

function isInside(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function packageMatches(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function recordViolation(file, message) {
  violations.push(`${path.relative(repoRoot, file)}: ${message}`);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

const legacyPackageNames = new Set(retiredPackages.map(({ name }) => name));
for (const retired of retiredPackages) {
  const directory = path.join(repoRoot, retired.directory);
  try {
    await fs.lstat(directory);
    recordViolation(directory, `retired package directory remains (${retired.name})`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
for (const retired of retiredStandalonePaths) {
  const retiredPath = path.join(repoRoot, retired);
  try {
    await fs.lstat(retiredPath);
    recordViolation(retiredPath, 'retired product path remains');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const rootManifestPath = path.join(repoRoot, 'package.json');
const rootManifest = await readJson(rootManifestPath);
for (const [name, command] of Object.entries(rootManifest.scripts ?? {})) {
  if (
    name.startsWith('legacy:') ||
    ['dev:tui', 'dev:cli', 'start:tui'].includes(name) ||
    retiredPackages.some(
      ({ directory, name: packageName }) => command.includes(directory) || command.includes(packageName),
    ) ||
    retiredStandalonePaths.some(retired => command.includes(retired))
  ) {
    recordViolation(rootManifestPath, `retired root script "${name}" remains`);
  }
}

const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
const lockfile = await fs.readFile(lockfilePath, 'utf8');
for (const { directory, name } of retiredPackages) {
  if (
    lockfile.includes(`\n  ${directory}:\n`) ||
    lockfile.includes(`'${name}':`) ||
    lockfile.includes(`${name}:`) ||
    lockfile.includes(`link:../../${directory}`) ||
    lockfile.includes(`link:../${path.basename(directory)}`)
  ) {
    recordViolation(lockfilePath, `retired package/importer remains (${name})`);
  }
}
for (const packageName of retiredExternalPackages) {
  const escaped = packageName.replaceAll('/', '\\/');
  if (new RegExp(`(?:^|\\n)  ['\"]?${escaped}@`, 'u').test(lockfile)) {
    recordViolation(lockfilePath, `retired external dependency remains (${packageName})`);
  }
}

const v1PackageByName = new Map();
for (const owner of v1Packages) {
  const manifestPath = path.join(owner.directory, 'package.json');
  const manifest = await readJson(manifestPath);
  owner.name = manifest.name;
  v1PackageByName.set(manifest.name, owner);

  if (manifest.private !== true) {
    recordViolation(manifestPath, 'v1 source packages must remain private');
  }
  if (manifest.type !== 'module') {
    recordViolation(manifestPath, 'v1 source packages must use strict ESM');
  }
}

function checkSpecifier(specifier, fromFile, owner, allowedExternalDependencies, dependencyContext) {
  for (const legacyName of legacyPackageNames) {
    if (packageMatches(specifier, legacyName)) {
      recordViolation(fromFile, `forbidden legacy package import "${specifier}"`);
      return;
    }
  }

  for (const [packageName, targetOwner] of v1PackageByName) {
    if (!packageMatches(specifier, packageName)) continue;
    if (targetOwner !== owner && !owner.allowedV1Dependencies.has(packageName)) {
      recordViolation(fromFile, `outward v1 dependency "${specifier}"`);
    }
    return;
  }

  let resolved;
  if (specifier.startsWith('file:')) {
    resolved = new URL(specifier).pathname;
  } else if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    resolved = path.resolve(path.dirname(fromFile), specifier);
  } else if (specifier.startsWith('node:')) {
    return;
  } else {
    const approved = [...allowedExternalDependencies].some(packageName => packageMatches(specifier, packageName));
    if (!approved) {
      recordViolation(fromFile, `unapproved external dependency "${specifier}" in ${dependencyContext}`);
    }
    return;
  }

  for (const legacyDirectory of legacyDirectories) {
    if (isInside(resolved, legacyDirectory)) {
      recordViolation(
        fromFile,
        `forbidden legacy path import "${specifier}" (${path.relative(repoRoot, legacyDirectory)})`,
      );
      return;
    }
  }

  for (const targetOwner of v1Packages) {
    if (
      targetOwner !== owner &&
      isInside(resolved, targetOwner.directory) &&
      !owner.allowedV1Dependencies.has(targetOwner.name)
    ) {
      recordViolation(fromFile, `outward v1 path import "${specifier}"`);
      return;
    }
  }
}

function visitModuleSpecifiers(sourceFile, visit) {
  function walk(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      visit(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      visit(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      visit(node.arguments[0].text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      visit(node.argument.literal.text);
    }

    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
}

async function collectSourceFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectStringValues(value, strings = []) {
  if (typeof value === 'string') {
    strings.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, strings);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStringValues(item, strings);
  }
  return strings;
}

for (const owner of v1Packages) {
  const manifestPath = path.join(owner.directory, 'package.json');
  const manifest = await readJson(manifestPath);

  for (const field of dependencyFields) {
    const allowed = owner.allowedExternalDependencies.manifest[field] ?? new Set();
    for (const dependencyName of Object.keys(manifest[field] ?? {})) {
      if (
        REVIEWING_PARSER_PACKAGES.includes(dependencyName) &&
        !/^\d+\.\d+\.\d+$/u.test(manifest[field][dependencyName])
      ) {
        recordViolation(manifestPath, `parser asset dependency must be exact-pinned: ${dependencyName}`);
      }
      checkSpecifier(dependencyName, manifestPath, owner, allowed, `manifest field "${field}"`);
    }
  }

  for (const target of collectStringValues(manifest.imports)) {
    checkSpecifier(target, manifestPath, owner, owner.allowedExternalDependencies.production, 'package import target');
  }

  for (const file of await collectSourceFiles(owner.directory)) {
    const sourceText = await fs.readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const isTestSource = (owner.testDirectories ?? ['test']).some(directory =>
      isInside(file, path.join(owner.directory, directory)),
    );
    const allowed = isTestSource
      ? owner.allowedExternalDependencies.test
      : owner.allowedExternalDependencies.production;
    visitModuleSpecifiers(sourceFile, specifier =>
      checkSpecifier(specifier, file, owner, allowed, isTestSource ? 'test source' : 'production source'),
    );
  }
}

if (violations.length > 0) {
  console.error('v1 dependency firewall failed:\n');
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('v1 dependency firewall passed');
}
