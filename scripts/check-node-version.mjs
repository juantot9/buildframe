import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();

const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const declaredRange = manifest.engines?.node;

const rangePattern = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)\.(\d+)\.(\d+)$/;
const parsedRange = rangePattern.exec(declaredRange ?? '');

if (parsedRange === null) {
  console.error(
    `node version check failed: root engines.node is ${JSON.stringify(declaredRange)}, ` +
      'which this check cannot read. It understands only ">=X.Y.Z <A.B.C".',
  );
  process.exitCode = 1;
} else {
  const [, ...bounds] = parsedRange.map(Number);
  const minimum = bounds.slice(0, 3);
  const exclusiveMaximum = bounds.slice(3, 6);

  const running = process.versions.node.split('.').map(Number);
  const compare = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

  const supported = compare(running, minimum) >= 0 && compare(running, exclusiveMaximum) < 0;

  if (supported) {
    console.log(`node version check passed (v${process.versions.node})`);
  } else {
    const pinnedVersion = (await fs.readFile(path.join(repoRoot, '.nvmrc'), 'utf8')).trim();

    console.error(
      `node version check failed: BuildFrame needs Node ${declaredRange}, ` +
        `and you are running v${process.versions.node}.\n`,
    );
    console.error(`- the pinned version is ${pinnedVersion}, recorded in .nvmrc`);
    console.error('- run `nvm use`, or `nvm install` first if that version is missing');

    process.exitCode = 1;
  }
}
