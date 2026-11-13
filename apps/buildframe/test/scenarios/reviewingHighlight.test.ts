import { access } from 'node:fs/promises';
import { RGBA, StyledText, TextRenderable, TreeSitterClient } from '@opentui/core';
import { createTestRenderer, MockTreeSitterClient } from '@opentui/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { REVIEWING_FILETYPES, reviewingFiletype } from '../../src/highlightAssets.js';
import { ReviewingHighlight } from '../../src/reviewingHighlight.js';
import { REVIEWING_TOKEN_ROLES } from '../../src/userConfiguration.js';

const palette = Object.fromEntries(REVIEWING_TOKEN_ROLES.map(role => [role, '#81b9d4']));
const fixtures: Readonly<Record<string, string>> = {
  typescript: 'const answer: string = "界🙂";',
  typescriptreact: 'const view = <div title="yes" />;',
  javascript: 'const answer = 42;',
  javascriptreact: 'const view = <div title="yes" />;',
  markdown: '**exact** [link](https://example.invalid) `code`',
  zig: 'const answer: u32 = 42;',
  python: 'def answer(): return 42',
  go: 'package main',
  rust: 'fn main() { let n = 42; }',
  c: 'const int n = 42;',
  cpp: 'constexpr int n = 42;',
  java: 'class Main { int n = 42; }',
  json: '{"answer":42}',
  yaml: 'answer: true',
  toml: 'answer = 42',
  bash: 'echo "hello"',
  html: '<div class="answer">hello</div>',
  css: 'a { color: red; }',
};

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 800; i += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Highlight did not settle');
}

class ControlledClient extends MockTreeSitterClient {
  override async initialize(): Promise<void> {}
  override isInitialized(): boolean {
    return true;
  }
  override addFiletypeParser(): void {}
  override async preloadParser(): Promise<boolean> {
    return true;
  }
}

describe('application-owned bounded highlighting', () => {
  it('renders every shipped grammar as exact fallback text plus palette-colored spans, and destroys its worker', async () => {
    expect(Object.keys(fixtures).sort()).toEqual([...REVIEWING_FILETYPES].sort());
    const setup = await createTestRenderer({ width: 100, height: 3 });
    let changed = 0;
    let client: TreeSitterClient | undefined;
    let directory = '';
    const highlight = new ReviewingHighlight(
      () => {
        changed += 1;
      },
      dataPath => {
        directory = dataPath;
        client = new TreeSitterClient({ dataPath });
        return client;
      },
    );
    highlight.attachRenderer(setup.renderer.nativeScene);
    try {
      for (const [filetype, content] of Object.entries(fixtures)) {
        const before = changed;
        expect(highlight.text(content, filetype, palette, false)).toBe(content);
        await until(() => changed > before);
        const styled = highlight.text(content, filetype, palette, false);
        expect(styled, filetype).toBeInstanceOf(StyledText);
        const text = new TextRenderable(setup.renderer, { content, fg: '#ffffff' });
        setup.renderer.root.add(text);
        await setup.renderOnce();
        const fallback = setup.captureCharFrame();
        text.content = styled;
        await setup.renderOnce();
        expect(setup.captureCharFrame(), filetype).toBe(fallback);
        expect(
          setup
            .captureSpans()
            .lines.flatMap(line => line.spans)
            .some(span => span.text.trim() !== '' && span.fg.equals(RGBA.fromHex(palette.keyword!))),
          filetype,
        ).toBe(true);
        text.destroy();
      }
      expect(client?.isInitialized()).toBe(true);
      expect(client?.getAllBuffers()).toEqual([]);
    } finally {
      await highlight.destroy();
      setup.renderer.destroy();
    }
    expect(client?.isInitialized()).toBe(false);
    await expect(access(directory)).rejects.toThrow();
    await highlight.destroy();
  });

  it('never creates a worker for no-color or unknown extensions, including rejected Vue', async () => {
    const create = vi.fn(() => {
      throw new Error('must stay lazy');
    });
    const highlight = new ReviewingHighlight(() => {}, create);
    expect(reviewingFiletype('dir/VIEW.TSX')).toBe('typescriptreact');
    for (const file of ['README', 'file.txt', 'View.vue', 'View.svelte', 'View.astro']) {
      expect(reviewingFiletype(file)).toBeUndefined();
      expect(highlight.text('const n = 42;', reviewingFiletype(file), palette, false)).toBe('const n = 42;');
    }
    expect(highlight.text('const n = 42;', 'typescript', palette, true)).toBe('const n = 42;');
    expect(create).not.toHaveBeenCalled();
    await highlight.destroy();
  });

  it('latches worker startup failure once per session and preserves exact plain text', async () => {
    let changed = 0;
    let directory = '';
    const create = vi.fn((dataPath: string) => {
      directory = dataPath;
      throw new Error('worker unavailable');
    });
    const highlight = new ReviewingHighlight(() => {
      changed += 1;
    }, create);
    const content = 'const value = "unchanged";';
    expect(highlight.text(content, 'typescript', palette, false)).toBe(content);
    await until(() => changed > 0);
    for (let i = 0; i < 10; i += 1) {
      expect(highlight.text(content + i, 'typescript', palette, false)).toBe(content + i);
    }
    expect(create).toHaveBeenCalledTimes(1);
    await highlight.destroy();
    await expect(access(directory)).rejects.toThrow();
  });

  it('deduplicates pending work, shares results across palettes, retains negative entries, and ignores late completion after shutdown', async () => {
    const client = new ControlledClient();
    const request = vi.spyOn(client, 'highlightOnce');
    const changed = vi.fn();
    const highlight = new ReviewingHighlight(changed, () => client);
    const setup = await createTestRenderer({ width: 20, height: 1 });
    highlight.attachRenderer(setup.renderer.nativeScene);
    const content = 'const n = 42;';
    highlight.text(content, 'typescript', palette, false);
    highlight.text(content, 'typescript', {}, false);
    await until(() => client.isHighlighting());
    expect(request).toHaveBeenCalledTimes(1);
    client.setMockResult({ highlights: [[0, 5, 'keyword']] });
    client.resolveAllHighlightOnce();
    await until(() => changed.mock.calls.length > 0);
    const styled = highlight.text(content, 'typescript', { keyword: '#abcdef' }, false) as StyledText;
    expect(styled.chunks[0]?.fg?.equals(RGBA.fromHex('#abcdef'))).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    highlight.text('failure', 'typescript', palette, false);
    await until(() => client.isHighlighting());
    client.setMockResult({ error: 'query failed' });
    client.resolveAllHighlightOnce();
    await until(() => changed.mock.calls.length === 2);
    expect(highlight.text('failure', 'typescript', palette, false)).toBe('failure');
    expect(request).toHaveBeenCalledTimes(2);
    highlight.text('late', 'typescript', palette, false);
    await until(() => client.isHighlighting());
    await highlight.destroy();
    setup.renderer.destroy();
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
