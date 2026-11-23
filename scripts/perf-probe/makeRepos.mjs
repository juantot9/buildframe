// Temporary perf probe: builds disposable synthetic Git repositories.
// usage: node makeRepos.mjs <outDir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('outDir required');
mkdirSync(out, { recursive: true });

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const word = () =>
  ['const', 'let', 'value', 'return', 'function', 'items', 'map', 'filter', 'await', 'result', 'index', 'state'][
    Math.floor(rand() * 12)
  ];

function tsLine(i, width = 60) {
  let text = `  const v${i} = ${word()}(${word()}, ${i});`;
  while (text.length < width) text += ` // ${word()}`;
  return text;
}
function fileBody(lines, width) {
  const out = [];
  for (let i = 0; i < lines; i += 1) out.push(tsLine(i, width));
  return out.join('\n') + '\n';
}

function init(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Perf Probe');
  git(dir, 'config', 'user.email', 'probe@example.invalid');
  git(dir, 'config', 'commit.gpgsign', 'false');
}
function commit(dir) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
}
function editLines(file, _lines, _width, every) {
  const body = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < body.length - 1; i += every) body[i] = body[i] + ' // edited';
  writeFileSync(file, body.join('\n'));
}

// small: 50 files, 5 changed (4 modified, 1 added)
function small() {
  const dir = path.join(out, 'small');
  init(dir);
  for (let f = 0; f < 50; f += 1) {
    mkdirSync(path.join(dir, `src/m${f % 5}`), { recursive: true });
    writeFileSync(path.join(dir, `src/m${f % 5}/file${f}.ts`), fileBody(120, 60));
  }
  commit(dir);
  for (let f = 0; f < 4; f += 1) editLines(path.join(dir, `src/m${f % 5}/file${f}.ts`), 120, 60, 15);
  writeFileSync(path.join(dir, 'src/m0/added.ts'), fileBody(80, 60));
}

// large: 5,000 files (~150 lines), 300 changed (260 modified, 25 added, 15 deleted)
function large() {
  const dir = path.join(out, 'large');
  init(dir);
  for (let f = 0; f < 5000; f += 1) {
    const sub = path.join(dir, `pkg${f % 25}/src/d${f % 10}`);
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(sub, `file${f}.ts`), fileBody(150, 60));
  }
  commit(dir);
  for (let f = 0; f < 260; f += 1) {
    const g = f * 19;
    editLines(path.join(dir, `pkg${g % 25}/src/d${g % 10}/file${g}.ts`), 150, 60, 12);
  }
  for (let f = 0; f < 25; f += 1) writeFileSync(path.join(dir, `pkg${f}/src/new${f}.ts`), fileBody(100, 60));
  for (let f = 0; f < 15; f += 1) {
    const g = f * 19 * 17 + 7;
    rmSync(path.join(dir, `pkg${g % 25}/src/d${g % 10}/file${g}.ts`));
  }
}

// huge file: one 20,000-line file with every 10th line edited; plus a long-line file (400 lines x 2,000 chars)
function hugeFile() {
  const dir = path.join(out, 'hugefile');
  init(dir);
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src/big.ts'), fileBody(20000, 60));
  writeFileSync(path.join(dir, 'src/longlines.js'), fileBody(400, 2000));
  for (let f = 0; f < 20; f += 1) writeFileSync(path.join(dir, `src/other${f}.ts`), fileBody(50, 60));
  commit(dir);
  editLines(path.join(dir, 'src/big.ts'), 20000, 60, 10);
  editLines(path.join(dir, 'src/longlines.js'), 400, 2000, 7);
}

const which = process.argv[3] ?? 'all';
if (which === 'all' || which === 'small') small();
if (which === 'all' || which === 'large') large();
if (which === 'all' || which === 'hugefile') hugeFile();
for (const r of ['small', 'large', 'hugefile']) {
  const dir = path.join(out, r);
  if (!existsSync(dir)) continue;
  const status = git(dir, 'status', '--porcelain').toString().trim().split('\n').length;
  console.log(r, 'changed', status, git(dir, 'diff', '--shortstat').toString().trim());
}
