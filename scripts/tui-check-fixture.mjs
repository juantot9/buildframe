// Builds a throwaway repository for checking the TUI by hand in a terminal
// (WF-314): nested folders, an added and a deleted file, long and wide lines,
// a CRLF file Git converts, enough commits to page, a merge commit, a branch
// and a tag. Prints its path; open it with `pnpm dogfood -- <path>`.
//
//   node scripts/tui-check-fixture.mjs [directory]
//
// The directory must not exist yet; by default a new one is made in the
// system temporary directory. Nothing outside it is touched.
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const requested = process.argv[2];
const root =
  requested === undefined ? await mkdtemp(path.join(tmpdir(), 'buildframe-tui-check-')) : path.resolve(requested);
if (requested !== undefined) await mkdir(root);

const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
const write = async (file, content) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content);
};
const commit = (message, when) => {
  git('add', '-A');
  git(
    '-c',
    `user.name=TUI Check`,
    '-c',
    'user.email=tui-check@example.invalid',
    'commit',
    '-qm',
    message,
    `--date=${when}`,
  );
};

const lines = (count, label) =>
  Array.from({ length: count }, (_, index) => `${label} line ${index + 1}`).join('\n') + '\n';
const longLine = word => `${word}: ${'0123456789abcdef'.repeat(24)} end\n`;
const wide = [
  'Kanji and kana: 漢字テキスト、ひらがな、カタカナ',
  'Hangul: 한국어 텍스트',
  'Emoji: 😀 👍🏽 👩‍💻 🇪🇸',
  'Combining: é ä ñ',
  'Tab:\tafter a tab',
  'Box: ┌─┬─┐ │ │ │ └─┴─┘',
];

git('init', '-q', '-b', 'main');
git('config', 'core.autocrlf', 'false');
await write('.gitattributes', 'windows.txt text eol=crlf\n');
await write('src/app/main.ts', lines(120, 'main'));
await write('src/app/util/strings.ts', lines(20, 'strings'));
await write('src/lib/wide.txt', `${wide.join('\n')}\n`);
await write('notes/long-line.txt', `short\n${longLine('first')}${longLine('second')}`);
await write('a/b/c/d/deep.txt', lines(5, 'deep'));
await write('old.txt', lines(3, 'old'));
await write('windows.txt', lines(5, 'windows').replaceAll('\n', '\r\n'));
commit('Start the fixture', '2026-01-01T09:00:00');

for (let index = 1; index <= 40; index += 1) {
  await write('docs/log.txt', lines(index, 'log'));
  commit(`Log entry ${index}`, `2026-01-02T09:${String(index).padStart(2, '0')}:00`);
}
git('tag', 'v0.1');

git('switch', '-q', '-c', 'feature');
await write('src/lib/feature.txt', lines(4, 'feature'));
commit('Add a feature file', '2026-01-03T09:00:00');
git('switch', '-q', 'main');
await write('docs/main-only.txt', lines(2, 'main only'));
commit('Change main alongside the feature', '2026-01-03T10:00:00');
git(
  '-c',
  'user.name=TUI Check',
  '-c',
  'user.email=tui-check@example.invalid',
  'merge',
  '-q',
  '--no-ff',
  'feature',
  '-m',
  'Merge the feature',
);

// Uncommitted changes for the Review.
const edit = (text, from, to) => text.replace(from, to);
await write(
  'src/app/main.ts',
  [10, 60, 110].reduce(
    (text, line) => edit(text, `main line ${line}\n`, `main line ${line} (edited)\n`),
    lines(120, 'main'),
  ),
);
await write('src/app/util/strings.ts', edit(lines(20, 'strings'), 'strings line 3\n', 'strings line 3, now longer\n'));
await write('src/lib/wide.txt', `${wide.map(line => (line.startsWith('Emoji') ? `${line} 🎉` : line)).join('\n')}\n`);
await write('notes/long-line.txt', `short\n${longLine('first')}${longLine('SECOND')}`);
await write('a/b/c/d/deep.txt', edit(lines(5, 'deep'), 'deep line 5\n', 'deep line 5 (edited)\n'));
await rm(path.join(root, 'old.txt'));
await write('src/app/new-file.ts', lines(6, 'new'));
await write(
  'windows.txt',
  edit(lines(5, 'windows'), 'windows line 3\n', 'windows line 3 (edited)\n').replaceAll('\n', '\r\n'),
);

console.log(root);
