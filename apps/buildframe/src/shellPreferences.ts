/**
 * Saves preferences without saving on every key: a change waits briefly so
 * a burst saves once, saves run one at a time in order, and stopping flushes
 * the last change and waits for it.
 */
export class DebouncedSave<Value> {
  readonly #save: (value: Value) => Promise<void>;
  readonly #delayMs: number;
  #pending: Value | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #chain: Promise<void> = Promise.resolve();

  /** `save` reports its own failures; the chain never rejects. */
  constructor(save: (value: Value) => Promise<void>, delayMs = 100) {
    this.#save = save;
    this.#delayMs = delayMs;
  }

  schedule(value: Value): void {
    this.#pending = value;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#flush();
    }, this.#delayMs);
  }

  /** Saves what is waiting now and resolves once every save has finished. */
  async settle(): Promise<void> {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#flush();
    await this.#chain;
  }

  #flush(): void {
    const value = this.#pending;
    if (value === undefined) return;
    this.#pending = undefined;
    this.#chain = this.#chain.then(async () => await this.#save(value)).catch(() => undefined);
  }
}
