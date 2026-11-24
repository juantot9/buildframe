// TEMPORARY: visual-review captures (2026-11-23). Not for commit.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import type { WorkspaceIdentity } from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import { openWorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { describe, it } from 'vitest';

import { resolveGitExecutable } from '../../../../packages/workspace/src/gitProcess.js';
import { createReviewingApplicationForTest } from '../../src/reviewingScreen.js';
import { createFileUserConfiguration } from '../../src/userConfiguration.js';

/** Where frames go; the captures run only when this is set (BUILDFRAME_VISUAL_OUT=/some/dir). */
const OUT = process.env.BUILDFRAME_VISUAL_OUT ?? '';
const run = promisify(execFile);
const git = async (checkout: string, ...args: string[]): Promise<void> => {
  await run(await resolveGitExecutable(), ['-C', checkout, ...args]);
};

class Adapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  readonly directives: CommittedHarnessDirective[] = [];
  sink?: HarnessEvidenceSink;
  constructor(workspaceIdentity: WorkspaceIdentity, canonicalCheckout: string) {
    this.manifest = {
      schema: 'neoflow.harness-capabilities/1',
      adapterImplementationIdentity: 'scripted-dogfood-pi',
      adapterDisplayName: 'Pi',
      reviewedHostVersions: ['0.80.6'],
      capabilities: [
        {
          contractVersion: 1,
          capabilityIdentity: 'direct-question-review-v1',
          handoffKind: 'submit-review-batch',
          route: 'direct',
          authority: 'discussion-only',
          effectConstraint: { strength: 'enforced', scope: 'workspace-read-only', limitation: 'Read only.' },
          evidenceProfile: {
            dispatchRejection: 'correlated',
            start: 'correlated',
            normalEnd: 'correlated',
            failure: 'correlated',
            interruption: 'correlated',
            replay: 'unavailable',
          },
          interruption: { route: 'direct-request' },
          artifactResultContract: {
            contractVersion: 1,
            contractIdentity: 'pi-settled-final-assistant-review-response-v1',
            artifactKind: 'review-response',
            source: 'settled-final-assistant-text',
            completeness: 'all-final-text-blocks-after-correlated-user-message',
            maximumBytes: 16 * 1024,
          },
          noStartTimeoutMs: 30_000,
          knownLimitations: ['Read only.'],
        },
      ],
    } as never;
    this.attachment = {
      evidenceIdentity: 'capture-attachment-1',
      attachmentIdentity: `att_${'7'.repeat(64)}` as never,
      workspaceIdentity,
      hostVersion: '0.80.6',
      destination: { harnessLabel: 'Pi', sessionLabel: 'session', repositoryLabel: 'shop', canonicalCheckout },
      availability: { status: 'available' },
    };
  }
  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.sink = sink;
    return {
      perform: async directive => {
        this.directives.push(directive);
        return { status: 'accepted-for-observation' };
      },
    };
  }
  async emit(evidence: NormalizedHarnessEvidence): Promise<void> {
    const ack = await this.sink!.accept(evidence);
    if (ack.status !== 'applied') throw new Error(`refused ${JSON.stringify(ack)}`);
  }
}

function serverSource(version: 'old' | 'new'): string {
  const lines: string[] = [];
  lines.push("import { createServer } from 'node:http';");
  lines.push("import { retry } from '../lib/retry.js';");
  lines.push('');
  for (let index = 0; index < 220; index += 1) {
    if (index === 6) {
      lines.push(
        version === 'old'
          ? 'export async function connect(url: string) { return await retry(() => open(url), { attempts: 3 }); }'
          : 'export async function connectToUpstreamWithBackoff(url: string, options: { readonly attempts: number; readonly delayMs: number } = { attempts: 5, delayMs: 250 }) { return await retry(() => open(url), options); }',
      );
    } else if (index === 40 && version === 'new') {
      lines.push(
        "  const message = 'The upstream did not answer in time; BuildFrame will retry with an exponential backoff until the attempts run out, then report the last error to the caller.';",
      );
      lines.push('  log.warn(message);');
    } else if (index === 120) {
      lines.push(version === 'old' ? '  await sleep(1000);' : '  await sleep(backoff(attempt));');
    } else if (index === 200 && version === 'old') {
      lines.push('  // TODO remove the legacy fallback');
      lines.push('  return legacyFallback(request);');
    } else {
      lines.push(`  const value${index} = compute(${index}, 'step-${index}');`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function buildRepository(root: string): Promise<string> {
  const checkout = path.join(root, 'shop');
  for (const dir of ['src/app/routes', 'src/lib', 'docs']) await mkdir(path.join(checkout, dir), { recursive: true });
  await git(checkout, 'init', '-q', '-b', 'main');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'user-9@masked.invalid');
  await writeFile(path.join(checkout, 'README.md'), '# Shop\n\nA small shop server.\n');
  await writeFile(path.join(checkout, 'package.json'), '{\n  "name": "shop",\n  "version": "1.0.0"\n}\n');
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'Start the shop');
  await writeFile(path.join(checkout, 'src/app/server.ts'), serverSource('old'));
  await writeFile(
    path.join(checkout, 'src/lib/retry.ts'),
    'export async function retry<T>(work: () => Promise<T>): Promise<T> {\n  return await work();\n}\n',
  );
  await writeFile(path.join(checkout, 'src/lib/legacy.ts'), 'export function legacyFallback() {\n  return null;\n}\n');
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'Add the server and retry helper');
  await writeFile(path.join(checkout, 'docs/guide.md'), '# Guide\n\nRun `pnpm start`.\n');
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'Write the first guide');
  // Live changes: modified, added, deleted, nested.
  await writeFile(path.join(checkout, 'src/app/server.ts'), serverSource('new'));
  await writeFile(
    path.join(checkout, 'src/lib/retry.ts'),
    'export async function retry<T>(work: () => Promise<T>, options: { attempts: number; delayMs: number }): Promise<T> {\n  let last: unknown;\n  for (let attempt = 0; attempt < options.attempts; attempt += 1) {\n    try {\n      return await work();\n    } catch (error) {\n      last = error;\n    }\n  }\n  throw last;\n}\n',
  );
  await writeFile(path.join(checkout, 'src/app/routes/users.ts'), "export const users = ['ada', 'grace'];\n");
  await writeFile(path.join(checkout, 'src/app/routes/orders.ts'), 'export const orders: string[] = [];\n');
  await rm(path.join(checkout, 'src/lib/legacy.ts'));
  await writeFile(
    path.join(checkout, 'docs/guide.md'),
    '# Guide\n\nRun `pnpm start`, then open http://localhost:3000.\n',
  );
  return checkout;
}

interface Variant {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly ascii?: boolean;
  readonly noColor?: boolean;
  readonly theme?: string;
  readonly spans?: boolean;
  readonly short?: boolean;
}

function hex(c: { r: number; g: number; b: number; a: number }): string {
  if (c.a === 0) return 'transparent';
  const to = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

async function journey(variant: Variant): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'bf-visual-'));
  const dir = path.join(OUT, variant.name, `${variant.width}x${variant.height}`);
  await mkdir(dir, { recursive: true });
  const stateHome = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  const checkout = await buildRepository(root);
  const configPath = path.join(root, 'config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      version: 1,
      reviewing: variant.theme === undefined ? {} : { theme: { inherits: variant.theme } },
    }),
  );
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  if (opened.status !== 'ready') throw new Error('owner rejected');
  const owner = opened.owner;
  const identity = await owner.workspace.read({ kind: 'workspace.identity' });
  const adapter = new Adapter(identity.workspaceIdentity, identity.canonicalCheckout);
  await owner.harnessAdapters.establish(adapter);
  const terminal: TestRendererSetup = await createTestRenderer({
    width: variant.width,
    height: variant.height,
    exitOnCtrlC: false,
    kittyKeyboard: true,
  });
  const application = createReviewingApplicationForTest({
    workspace: owner.workspace,
    renderer: terminal.renderer,
    userConfiguration: createFileUserConfiguration(configPath),
    presentation: { ascii: variant.ascii ?? false, noColor: variant.noColor ?? false },
  });
  let last = '';
  const frame = (): string => {
    try {
      last = terminal.captureCharFrame();
    } catch {
      /* busy */
    }
    return last;
  };
  const frameLog: string[] = [];
  let logging = false;
  terminal.renderer.on('frame', () => {
    if (logging) {
      const current = frame();
      if (frameLog.at(-1) !== current) frameLog.push(current);
    }
  });
  const wait = async (predicate: () => boolean, what: string): Promise<void> => {
    for (let attempt = 0; attempt < 3000; attempt += 1) {
      await terminal.flush();
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`[${variant.name} ${variant.width}] timed out waiting for ${what}\n${frame()}`);
  };
  const shows = async (text: string): Promise<void> => await wait(() => frame().includes(text), `"${text}"`);
  const settle = async (): Promise<void> => {
    let previous = '';
    let stable = 0;
    for (let attempt = 0; attempt < 300 && stable < 4; attempt += 1) {
      await terminal.flush();
      await new Promise(resolve => setTimeout(resolve, 15));
      const current = frame();
      stable = current === previous ? stable + 1 : 0;
      previous = current;
    }
  };
  let step = 0;
  const snap = async (name: string): Promise<void> => {
    await settle();
    step += 1;
    const base = path.join(dir, `${String(step).padStart(2, '0')}-${name}`);
    await writeFile(`${base}.txt`, frame());
    if (variant.spans === true) {
      let captured;
      try {
        captured = terminal.captureSpans();
      } catch {
        await settle();
        captured = terminal.captureSpans();
      }
      const html: string[] = [];
      const summary: string[] = [];
      captured.lines.forEach((line, row) => {
        html.push(
          line.spans
            .map(span => {
              const bold = (span.attributes & 1) !== 0 ? 'font-weight:bold;' : '';
              const dim = (span.attributes & 2) !== 0 ? 'opacity:.6;' : '';
              const text = span.text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
              return `<span style="color:${hex(span.fg)};background:${hex(span.bg)};${bold}${dim}">${text}</span>`;
            })
            .join(''),
        );
        summary.push(
          `${String(row).padStart(2, '0')} ${line.spans
            .filter(span => span.text.trim() !== '')
            .map(
              span =>
                `[${hex(span.fg)}/${hex(span.bg)}${(span.attributes & 1) !== 0 ? ' b' : ''}]${span.text.trim().slice(0, 40)}`,
            )
            .join(' ')}`,
        );
      });
      await writeFile(
        `${base}.html`,
        `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><pre style="font:14px/1.15 Menlo,monospace;margin:0;padding:8px">${html.join('\n')}</pre>`,
      );
      await writeFile(`${base}.spans.txt`, summary.join('\n'));
    }
  };
  const key = (text: string): void => {
    for (const character of text) terminal.mockInput.pressKey(character);
  };
  const focus = async (pane: string): Promise<void> => {
    for (let tab = 0; tab < 5 && !frame().includes(`${pane} FOCUSED`); tab += 1) {
      terminal.mockInput.pressTab();
      await settle();
    }
  };

  try {
    await application.start();
    await shows('Review current changes');
    await snap('home-empty');

    logging = true;
    terminal.mockInput.pressEnter();
    await shows('Current Review');
    await settle();
    logging = false;
    if (variant.name === 'default' && variant.width === 120) {
      await writeFile(
        path.join(dir, '00-loading-frames.txt'),
        frameLog.map((f, i) => `=== frame ${i}\n${f}`).join('\n'),
      );
    }
    await snap('review-first');

    // Go to the long server file.
    for (
      let move = 0;
      move < 8 &&
      !frame()
        .split('\n')
        .some(line => /(Diff|Side-by-side)\b.*server\.ts/u.test(line));
      move += 1
    ) {
      key('J');
      await settle();
    }
    await snap('review-server');
    await focus('Diff');
    await snap('diff-focused');
    key('w');
    await snap('diff-nowrap-top');
    key('w');
    await settle();
    key('v');
    await snap('diff-side-by-side-top');
    key('v');
    await settle();
    terminal.renderer.stdin.emit('data', Buffer.from('\u001b[6~'));
    await snap('diff-paged');
    terminal.renderer.stdin.emit('data', Buffer.from('\u001b[5~'));
    await settle();

    // Composer and a sent, answered Message.
    for (let index = 0; index < 6; index += 1) key('j');
    key('a');
    await shows('New Message');
    await snap('composer-empty');
    key('Why does connect wait before the first attempt? Could it start at once and only back off after a failure?');
    await snap('composer-typed');
    terminal.mockInput.pressEnter();
    await wait(() => adapter.directives.length === 1, 'directive');
    await snap('message-saved');
    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'cap-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    await shows('started #1');
    await snap('message-working');
    const body =
      'It does not wait before the first attempt: `retry` calls `work()` at once and only sleeps after a failure.\n\nThe 250 ms you saw is `delayMs`, used between attempts. If you want no delay at all on the first retry, pass `{ attempts: 5, delayMs: 0 }`.';
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'cap-end',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    });
    await shows('answered');
    await snap('message-answered');
    await focus('History');
    await snap('history-focused');
    // History stays short beside the card, so it must lead back to the card: scroll the code away, then Enter.
    const cardShown = (): boolean => /(?:╭─|\+-) #1 /u.test(frame());
    await focus('Diff');
    for (let page = 0; page < 4; page += 1) terminal.renderer.stdin.emit('data', Buffer.from('\u001b[6~'));
    await wait(() => !cardShown(), 'card scrolled away');
    await focus('History');
    terminal.mockInput.pressEnter();
    await wait(cardShown, 'Enter in History brings the card back');
    await snap('history-enter-card');
    await focus('Files');
    await snap('files-focused');

    if (variant.short !== true) {
      key('?');
      await settle();
      await snap('keys-help');
      terminal.mockInput.pressEscape();
      await settle();

      key('/');
      await shows('Search');
      await snap('search-empty');
      key('retry');
      await snap('search-results');
      for (let attempt = 0; attempt < 2 && frame().includes('Search this Review'); attempt += 1) {
        terminal.mockInput.pressEscape();
        await settle();
      }

      key('e');
      await snap('jump-files');
      terminal.mockInput.pressEscape();
      await settle();
      key('m');
      await snap('jump-messages');
      terminal.mockInput.pressEscape();
      await settle();

      key('z');
      await snap('code-only');
      key('z');
      await settle();

      key('c');
      await shows('Configuration');
      await snap('configuration');
      terminal.mockInput.pressEscape();
      await settle();
      if (frame().includes('Configuration')) {
        terminal.mockInput.pressEscape();
        await settle();
      }
    }

    // Back to Home with a current Review.
    for (let attempt = 0; attempt < 3 && !frame().includes('Review a commit or range'); attempt += 1) {
      terminal.mockInput.pressEscape();
      await settle();
    }
    await shows('Review a commit or range');
    await snap('home-current');
    if (variant.short !== true) {
      for (let move = 0; move < 5; move += 1) {
        const selected =
          frame()
            .split('\n')
            .find(line => /[›>] /u.test(line)) ?? '';
        if (selected.includes('commit or range')) break;
        key('j');
        await settle();
      }
      await snap('home-commit-row');
      terminal.mockInput.pressEnter();
      await shows('Commits');
      await wait(() => /Commit {2}|Parent {2}/u.test(frame()), 'picker preview');
      await snap('commit-picker');
      terminal.mockInput.pressTab();
      await settle();
      await snap('commit-picker-range');
    }
  } finally {
    await writeFile(path.join(dir, 'zz-last.txt'), frame());
    await application.stop().catch(() => undefined);
    await owner.dispose().catch(() => undefined);
    if (stateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = stateHome;
    await rm(root, { recursive: true, force: true });
  }
}

const sizes = [
  [80, 24],
  [120, 34],
  [180, 45],
] as const;

describe.skipIf(OUT === '')('visual capture', () => {
  for (const [width, height] of sizes) {
    it(`default ${width}x${height}`, async () => {
      await journey({ name: 'default', width, height, spans: width !== 180 });
    }, 180_000);
    it(`ascii-nocolor ${width}x${height}`, async () => {
      await journey({ name: 'ascii-nocolor', width, height, ascii: true, noColor: true });
    }, 180_000);
  }
  for (const theme of ['quiet-paper', 'warm-carbon', 'indigo-night']) {
    it(`theme ${theme}`, async () => {
      await journey({ name: theme, width: 120, height: 34, theme, spans: true, short: true });
    }, 180_000);
  }
});
