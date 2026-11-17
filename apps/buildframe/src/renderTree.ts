import {
  BoxRenderable,
  Renderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  type TextOptions,
} from '@opentui/core';

/**
 * The Reviewing surface describes each frame as a tree and mounts it in one
 * pass. OpenTUI 0.9 removed its own description layer (`h()`, `Box()`,
 * `Text()`), so this module keeps the few pieces the view relies on.
 */
export interface RenderNode {
  readonly create: (context: RenderContext) => Renderable;
  readonly children: readonly RenderChild[];
}

export type RenderChild = RenderNode | Renderable | readonly RenderChild[] | null | undefined | false;

type RenderableClass<Options> = new (context: RenderContext, options: Options) => Renderable;

export function h<Options>(type: RenderableClass<Options>, props: Options, ...children: RenderChild[]): RenderNode {
  return { create: context => new type(context, props), children };
}

export function Box(props: BoxOptions = {}, ...children: RenderChild[]): RenderNode {
  return h(BoxRenderable, props, ...children);
}

export function Text(props: TextOptions = {}): RenderNode {
  return h(TextRenderable, props);
}

/** Creates the Renderables a tree describes, parents before children. */
export function mount(context: RenderContext, node: RenderNode | Renderable): Renderable {
  if (node instanceof Renderable) return node;
  const renderable = node.create(context);
  const attach = (child: RenderChild): void => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      for (const nested of child as readonly RenderChild[]) attach(nested);
      return;
    }
    renderable.add(mount(context, child as RenderNode | Renderable));
  };
  for (const child of node.children) attach(child);
  return renderable;
}
