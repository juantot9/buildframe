import type { Renderable } from '@opentui/core';

/** Every renderable under `renderable` (itself included) whose id starts with `prefix`. */
export function descendantsWithIdPrefix(renderable: Renderable, prefix: string): readonly Renderable[] {
  const matches: Renderable[] = [];
  const visit = (candidate: Renderable): void => {
    if (candidate.id.startsWith(prefix)) matches.push(candidate);
    candidate.getChildren().forEach(child => visit(child as Renderable));
  };
  visit(renderable);
  return matches;
}

/** The plain text of a renderable tree, one renderable per line. */
export function renderableTreeText(value: unknown): string {
  if (value === null || typeof value !== 'object') return '';
  const renderable = value as {
    readonly plainText?: unknown;
    readonly getChildren?: () => readonly unknown[];
  };
  const ownText = typeof renderable.plainText === 'string' ? renderable.plainText : '';
  const children = typeof renderable.getChildren === 'function' ? renderable.getChildren() : [];
  return `${ownText}\n${children.map(renderableTreeText).join('\n')}`;
}
