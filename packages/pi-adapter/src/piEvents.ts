import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type UnsafePiEventHandler = (...arguments_: unknown[]) => unknown;
type UnsafePiEventRegistration = (event: string, handler: UnsafePiEventHandler) => void;

/** Private failure containment for every callback registered with the Pi host. */
export function guardPiEvents(pi: ExtensionAPI): Pick<ExtensionAPI, 'on'> {
  const register = pi.on.bind(pi) as unknown as UnsafePiEventRegistration;
  const on = ((event: string, handler: UnsafePiEventHandler): void => {
    register(event, async (...arguments_): Promise<unknown> => {
      try {
        return await handler(...arguments_);
      } catch {
        return undefined;
      }
    });
  }) as ExtensionAPI['on'];
  return { on };
}
