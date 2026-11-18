/**
 * Lists every kind of one union, checked when compiled: leaving a kind out
 * names the missing kinds in the error, and listing a foreign kind does not
 * type-check. Duplicates are caught when a route table is built.
 */
export function kindsOf<Kind extends string>(): <const List extends readonly Kind[]>(
  list: List &
    ([Exclude<Kind, List[number]>] extends [never] ? unknown : { readonly missingKinds: Exclude<Kind, List[number]> }),
) => readonly Kind[] {
  return list => Object.freeze([...list]);
}

/**
 * Maps each kind to the one owner that handles it. A kind claimed twice is a
 * construction error, so routing never depends on the order owners are listed.
 */
export class KindRoutes<Route> {
  readonly #routes = new Map<string, Route>();

  constructor(what: string, entries: readonly (readonly [readonly string[], Route])[]) {
    for (const [kinds, route] of entries) {
      for (const kind of kinds) {
        if (this.#routes.has(kind)) throw new TypeError(`Workspace ${what} kind ${kind} has two owners`);
        this.#routes.set(kind, route);
      }
    }
  }

  /** The route for `kind`; an unknown kind is refused as invalid input. */
  route(kind: unknown, what: string): Route {
    const route = typeof kind === 'string' ? this.#routes.get(kind) : undefined;
    if (route === undefined) throw new TypeError(`Unknown Workspace ${what} kind`);
    return route;
  }

  kinds(): readonly string[] {
    return [...this.#routes.keys()];
  }
}
