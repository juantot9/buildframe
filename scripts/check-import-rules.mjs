// Import rules the dependency firewall can't see, checked inside each package's src:
// 1. No runtime import loops. Type-only imports and lazy import() are ignored:
//    they don't run module code in a circle. A loop makes load order decide
//    whether a value is defined yet, and loops grew back after being removed.
// 2. The shell's generic parts never import Reviewing (shell*.ts and
//    keyInput.ts may not import reviewing*.ts), so screens can be added beside
//    Reviewing without touching its files.
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const sourceRoots = [
  'apps/buildframe/src',
  ...(await fs.readdir(path.join(repoRoot, 'packages'))).map(name => `packages/${name}/src`),
];
const violations = [];

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (/\.(ts|mts)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

/** The relative modules a file imports at runtime, and every relative module it names. */
function importsOf(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const runtime = [];
  const all = [];
  for (const statement of source.statements) {
    let specifier;
    let typeOnly = false;
    if (ts.isImportDeclaration(statement)) {
      specifier = statement.moduleSpecifier;
      const clause = statement.importClause;
      if (clause === undefined) typeOnly = false; // side-effect import
      else if (clause.isTypeOnly) typeOnly = true;
      else {
        const bindings = clause.namedBindings;
        const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : undefined;
        typeOnly =
          clause.name === undefined &&
          named !== undefined &&
          named.length > 0 &&
          named.every(element => element.isTypeOnly);
      }
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
      specifier = statement.moduleSpecifier;
      const clause = statement.exportClause;
      typeOnly =
        statement.isTypeOnly ||
        (clause !== undefined &&
          ts.isNamedExports(clause) &&
          clause.elements.length > 0 &&
          clause.elements.every(element => element.isTypeOnly));
    }
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), specifier.text.replace(/\.js$/u, '.ts'));
    all.push(target);
    if (!typeOnly) runtime.push(target);
  }
  return { runtime, all };
}

for (const root of sourceRoots) {
  const directory = path.join(repoRoot, root);
  const files = await sourceFiles(directory);
  const graph = new Map();
  for (const file of files) {
    const { runtime, all } = importsOf(file, await fs.readFile(file, 'utf8'));
    graph.set(
      file,
      runtime.filter(target => files.includes(target)),
    );
    const base = path.basename(file);
    if (root === 'apps/buildframe/src' && (base.startsWith('shell') || base === 'keyInput.ts')) {
      for (const target of all) {
        if (path.basename(target).startsWith('reviewing')) {
          violations.push(
            `${path.relative(repoRoot, file)} imports ${path.basename(target)}: the shell must not depend on Reviewing`,
          );
        }
      }
    }
  }
  // Depth-first search for runtime cycles; each cycle is reported once.
  const state = new Map();
  const stack = [];
  const reported = new Set();
  const visit = file => {
    state.set(file, 'open');
    stack.push(file);
    for (const target of graph.get(file) ?? []) {
      if (state.get(target) === 'open') {
        const cycle = stack.slice(stack.indexOf(target)).map(entry => path.relative(directory, entry));
        const key = [...cycle].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          violations.push(`${root}: runtime import loop ${[...cycle, cycle[0]].join(' → ')}`);
        }
      } else if (!state.has(target)) visit(target);
    }
    stack.pop();
    state.set(file, 'done');
  };
  for (const file of files) if (!state.has(file)) visit(file);
}

if (violations.length > 0) {
  console.error(`Import rules failed:\n${violations.map(violation => `- ${violation}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('import rules passed: no runtime import loops; the shell does not import Reviewing');
}
