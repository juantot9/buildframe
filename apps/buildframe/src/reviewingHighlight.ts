import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  StyledText,
  SyntaxStyle,
  TreeSitterClient,
  treeSitterToTextChunks,
  type NativeResourceOwner,
  type SimpleHighlight,
} from '@opentui/core';
import { REVIEWING_FILETYPES, reviewingParserAssets } from './highlightAssets.js';
import type { ReviewingTokenPalette } from './userConfiguration.js';

const CACHE_LIMIT = 1024;
const SUPPORTED = new Set(REVIEWING_FILETYPES);
const CAPTURE_ROLES: Readonly<Record<string, string>> = Object.freeze({
  text: 'markup',
  heading: 'markup',
  boolean: 'constant',
  attribute: 'property',
  delimiter: 'punctuation',
  constructor: 'function',
  float: 'number',
});
type Entry = { spans: SimpleHighlight[] | undefined; pending: boolean };

/** Application-owned, bounded, content-addressed presentation. Pending and failed
 * items are exact plain text. Completion only fills the cache and invalidates a
 * frame; it never retains a renderable, row identity, Workspace, or source path. */
export class ReviewingHighlight {
  readonly #cache = new Map<string, Entry>();
  readonly #parsers = new Map<string, Promise<boolean>>();
  readonly #styles = new Map<string, SyntaxStyle>();
  #client: TreeSitterClient | undefined;
  /** The renderer scene that owns native colour styles; plain text until one is attached. */
  #styleOwner: NativeResourceOwner | undefined;
  #initializing: Promise<TreeSitterClient | undefined> | undefined;
  #dataPath: string | undefined;
  #failed = false;
  #stopped = false;
  #destroying: Promise<void> | undefined;

  constructor(
    readonly invalidate: () => void,
    readonly createClient: (dataPath: string) => TreeSitterClient = dataPath => new TreeSitterClient({ dataPath }),
  ) {}

  /** Colour styles are native resources of one renderer; switching renderer drops the old ones. */
  attachRenderer(owner: NativeResourceOwner): void {
    if (owner === this.#styleOwner) return;
    for (const style of this.#styles.values()) style.destroy();
    this.#styles.clear();
    this.#styleOwner = owner;
  }

  text(
    content: string,
    filetype: string | undefined,
    tokens: ReviewingTokenPalette,
    noColor: boolean,
    foreground?: string,
  ): string | StyledText {
    // The single fallback seam: no-color, unsupported, failed worker, failed
    // parser/highlight, or pending. ASCII substitution is owned by the caller.
    if (
      noColor ||
      filetype === undefined ||
      !SUPPORTED.has(filetype) ||
      this.#failed ||
      this.#stopped ||
      content.length === 0
    )
      return content;
    const key = `${filetype}:${createHash('sha256').update(content).digest('hex')}`;
    let entry = this.#cache.get(key);
    if (entry === undefined) {
      if (this.#cache.size >= CACHE_LIMIT) {
        // Never evict in-flight requests: rapid navigation cannot create an
        // unbounded worker queue. Retry new content on a later frame instead.
        const oldest = [...this.#cache].find(([, item]) => !item.pending)?.[0];
        if (oldest === undefined) return content;
        this.#cache.delete(oldest);
      }
      entry = { spans: undefined, pending: true };
      this.#cache.set(key, entry);
      void this.#highlight(content, filetype, entry);
      return content;
    }
    this.#cache.delete(key);
    this.#cache.set(key, entry);
    // Parsing may finish before a renderer exists; colour needs its scene.
    if (entry.spans === undefined || this.#styleOwner === undefined) return content;
    try {
      const paletteKey = JSON.stringify({ tokens, foreground });
      let style = this.#styles.get(paletteKey);
      if (style === undefined) {
        if (this.#styles.size >= 16) {
          const oldest = this.#styles.keys().next().value!;
          this.#styles.get(oldest)!.destroy();
          this.#styles.delete(oldest);
        }
        style = SyntaxStyle.fromStyles(
          {
            ...(foreground === undefined ? {} : { default: { fg: foreground } }),
            ...Object.fromEntries(Object.entries(tokens).map(([role, fg]) => [role, { fg }])),
          },
          this.#styleOwner,
        );
        this.#styles.set(paletteKey, style);
      }
      const spans = entry.spans.map(([start, end, group, meta]): SimpleHighlight => {
        const root = group.split('.')[0]!;
        const mapped = CAPTURE_ROLES[root];
        const role = mapped === undefined ? group : mapped + group.slice(root.length);
        return meta === undefined ? [start, end, role] : [start, end, role, meta];
      });
      const chunks = treeSitterToTextChunks(content, spans, style, { enabled: false });
      // Fail closed even if a future converter changes offset/conceal semantics.
      if (chunks.map(chunk => chunk.text).join('') !== content) return content;
      return new StyledText(chunks);
    } catch {
      entry.spans = undefined;
      return content;
    }
  }

  async #initialize(): Promise<TreeSitterClient | undefined> {
    this.#initializing ??= (async () => {
      try {
        this.#dataPath = await mkdtemp(path.join(tmpdir(), 'buildframe-highlighting-'));
        if (this.#stopped) return undefined;
        const client = this.createClient(this.#dataPath);
        this.#client = client;
        client.on('error', () => {
          if (!client.isInitialized()) {
            this.#failed = true;
            if (!this.#stopped) this.invalidate();
          }
        });
        await client.initialize();
        if (this.#stopped) return undefined;
        for (const parser of reviewingParserAssets()) client.addFiletypeParser(parser);
        return client;
      } catch {
        this.#failed = true;
        return undefined;
      }
    })();
    return this.#initializing;
  }

  async #highlight(content: string, filetype: string, entry: Entry): Promise<void> {
    try {
      const client = await this.#initialize();
      if (client === undefined || this.#stopped || this.#failed) return;
      let parser = this.#parsers.get(filetype);
      if (parser === undefined) {
        parser = client.preloadParser(filetype).catch(() => false);
        this.#parsers.set(filetype, parser);
      }
      if (!(await parser) || this.#stopped || this.#failed) return;
      const result = await client.highlightOnce(content, filetype);
      if (
        !result.error &&
        !result.warning &&
        result.highlights?.every(
          ([start, end]) =>
            Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= content.length,
        )
      )
        entry.spans = result.highlights;
    } catch {
      if (!this.#client?.isInitialized()) this.#failed = true;
    } finally {
      entry.pending = false;
      if (!this.#stopped) this.invalidate();
    }
  }

  destroy(): Promise<void> {
    this.#destroying ??= this.#destroy();
    return this.#destroying;
  }

  async #destroy(): Promise<void> {
    this.#stopped = true;
    // Interrupt an initializing/live worker before waiting on initialization.
    await this.#client?.destroy();
    await this.#initializing;
    await this.#client?.destroy();
    for (const style of this.#styles.values()) style.destroy();
    this.#styles.clear();
    this.#cache.clear();
    this.#parsers.clear();
    if (this.#dataPath !== undefined) await rm(this.#dataPath, { recursive: true, force: true });
  }
}
