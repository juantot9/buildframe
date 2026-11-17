// Pre-commit check: keeps agent-authored files under 5,000 tokens (tokens = bytes / 4).
// Only staged files are checked. A file already over the limit may be edited as long as it
// does not grow; a new or previously small file may not cross the limit.
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const MAX_TOKENS = 5_000;
const BYTES_PER_TOKEN = 4;
const MAX_BYTES = MAX_TOKENS * BYTES_PER_TOKEN;

// Files that agents don't write by hand. Generated files elsewhere can opt out with
// `<path> linguist-generated` in .gitattributes.
const IGNORED_PATTERNS = [
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|bun\.lockb?|Cargo\.lock)$/,
  /\.lock$/,
  /(^|\/)test\/fixtures\//,
  /(^|\/)dist\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
  /\.map$/,
];

const git = (args, input) => execFileSync('git', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });

const tokensFor = bytes => Math.ceil(bytes / BYTES_PER_TOKEN);
const formatTokens = bytes => tokensFor(bytes).toLocaleString('en-US');

// `--numstat -z` reports binary files as `-\t-` and renames as `added\tdeleted\t\0old\0new\0`.
function readStagedChanges() {
  const fields = git(['diff', '--cached', '--numstat', '-z', '--diff-filter=ACMR', '-M']).split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index] === '') continue;
    const [added, , inlinePath] = fields[index].split('\t');
    const binary = added === '-';
    if (inlinePath === '') {
      changes.push({ previousPath: fields[index + 1], path: fields[index + 2], binary });
      index += 2;
    } else {
      changes.push({ previousPath: inlinePath, path: inlinePath, binary });
    }
  }
  return changes;
}

// Returns sizes in bytes for each object spec, or null where the object does not exist.
function objectSizes(specs) {
  if (specs.length === 0) return [];
  const output = git(['cat-file', '--batch-check=%(objectsize)'], specs.map(spec => `${spec}\n`).join(''));
  return output
    .trimEnd()
    .split('\n')
    .map(line => (line.endsWith(' missing') || line.endsWith(' ambiguous') ? null : Number(line)));
}

function markedGenerated(paths) {
  if (paths.length === 0) return new Set();
  const fields = git(['check-attr', '-z', '--stdin', 'linguist-generated'], paths.join('\0') + '\0').split('\0');
  const generated = new Set();
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const value = fields[index + 2];
    if (value === 'set' || value === 'true') generated.add(fields[index]);
  }
  return generated;
}

const candidates = readStagedChanges().filter(
  change => !change.binary && !IGNORED_PATTERNS.some(pattern => pattern.test(change.path)),
);

const stagedSizes = objectSizes(candidates.map(change => `:${change.path}`));
const oversized = candidates
  .map((change, index) => ({ ...change, stagedBytes: stagedSizes[index] }))
  .filter(change => change.stagedBytes > MAX_BYTES);

const hasHead = (() => {
  try {
    git(['rev-parse', '--verify', '--quiet', 'HEAD']);
    return true;
  } catch {
    return false;
  }
})();
const previousSizes = hasHead ? objectSizes(oversized.map(change => `HEAD:${change.previousPath}`)) : [];
const generated = markedGenerated(oversized.map(change => change.path));

const violations = oversized
  .map((change, index) => ({ ...change, previousBytes: previousSizes[index] ?? null }))
  .filter(change => !generated.has(change.path))
  .filter(
    change =>
      change.previousBytes === null || change.previousBytes <= MAX_BYTES || change.stagedBytes > change.previousBytes,
  );

if (violations.length > 0) {
  const pathWidth = Math.max(...violations.map(violation => violation.path.length));
  const rows = violations.map(violation => {
    const size = `${formatTokens(violation.stagedBytes)} tokens`;
    let reason;
    if (violation.previousBytes === null) reason = 'new file';
    else if (violation.previousBytes <= MAX_BYTES)
      reason = `was ${formatTokens(violation.previousBytes)}, now over the limit`;
    else reason = `already over the limit and grew from ${formatTokens(violation.previousBytes)}`;
    return `  ${violation.path.padEnd(pathWidth)}  ${size} (${reason})`;
  });

  console.error(
    [
      '',
      `Commit blocked: ${violations.length === 1 ? '1 staged file is' : `${violations.length} staged files are`} over ${MAX_TOKENS.toLocaleString('en-US')} tokens (tokens = bytes / ${BYTES_PER_TOKEN}, so the limit is ${MAX_BYTES.toLocaleString('en-US')} bytes).`,
      '',
      ...rows,
      '',
      'New files must stay under the limit. Files that are already over it may be edited, but must not grow.',
      '',
      'How to split a file:',
      '',
      '  1. Find the seams. List what the file does and group its contents by responsibility',
      '     (one feature, one data type and its helpers, one view section, one parsing stage).',
      '     Each group becomes a new file. Do not split at an arbitrary line count.',
      '  2. Create each new file next to the original, named for what it holds',
      '     (e.g. reviewingView.ts -> reviewingViewFooter.ts, reviewingViewDiffPane.ts).',
      `     Aim for well under the limit (~${Math.round((MAX_TOKENS * 0.6) / 100) * 100} tokens) so the files have room to grow.`,
      '  3. Move code verbatim. Do not rename, refactor, or change behaviour in the same commit.',
      '     Export what the other files need; keep everything else private to its new file.',
      '  4. Update imports in the original file and in every caller (search the repo for the',
      '     moved names). Avoid circular imports: shared types and helpers go in their own file',
      '     that the others import, not in the original.',
      '  5. Test files: split by describe block or scenario group, and move shared setup',
      '     (fixtures, builders, helpers) into a separate helper file that each test file imports.',
      '  6. Markdown: split by top-level heading into separate files in a folder, and keep the',
      '     original as a short index that links to each part.',
      '  7. For a file that was already over the limit, at minimum move out more than you added',
      '     so it shrinks. Splitting it fully under the limit is better.',
      '  8. Run the checks (typecheck, lint, tests), stage the new files with `git add`, and commit again.',
      '',
      'If a file is generated rather than written by hand, mark it in .gitattributes',
      '(`path/to/file linguist-generated`) and it will be skipped.',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
}
