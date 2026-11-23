/**
 * One shared check per key at the current live generation. A check still
 * running is always shared; a finished one is reused only while a watcher
 * would report changes, because only then does the generation move on as soon
 * as the working tree changes. A failed check is never reused.
 */
export class GenerationCache<Key, Value> {
  readonly #entries = new Map<
    Key,
    { readonly generation: number; settled: boolean; readonly promise: Promise<Value> }
  >();

  async read(key: Key, generation: number, watching: boolean, check: () => Promise<Value>): Promise<Value> {
    const shared = this.#entries.get(key);
    if (shared !== undefined && shared.generation === generation && (!shared.settled || watching)) {
      return await shared.promise;
    }
    const entry = { generation, settled: false, promise: check() };
    this.#entries.set(key, entry);
    try {
      return await entry.promise;
    } catch (error) {
      if (this.#entries.get(key) === entry) this.#entries.delete(key);
      throw error;
    } finally {
      entry.settled = true;
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
