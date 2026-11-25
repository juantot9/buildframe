import { BUILDFRAME_RPC, type BuildFrameLightEvent, type BuildFrameStatusEvent } from './openCodeHost.js';

/** A colour from OpenCode's theme, read inside a reactive render so it follows theme changes. */
type ThemeColor = unknown;

/** The parts of OpenCode's TUI context the connector uses, typed by shape. */
export interface OpenCodeTuiContext {
  readonly client: {
    rpc(definition: typeof BUILDFRAME_RPC): {
      readonly events: {
        on(name: 'status', listener: (event: { readonly data: BuildFrameStatusEvent }) => void): () => void;
        on(name: 'light', listener: (event: { readonly data: BuildFrameLightEvent }) => void): () => void;
      };
    };
  };
  readonly ui: {
    readonly toast: {
      show(toast: {
        readonly title: string;
        readonly message: string;
        readonly variant: BuildFrameStatusEvent['variant'];
      }): void;
    };
    slot(claim: {
      readonly append: 'prompt.footer.status';
      readonly render: (input: { readonly sessionID?: string }) => unknown;
    }): () => void;
  };
  readonly theme: {
    readonly text: {
      readonly muted: ThemeColor;
      readonly feedback: Record<BuildFrameLightEvent['tone'], { readonly base: ThemeColor }>;
    };
  };
}

/**
 * The few OpenTUI Solid primitives the light needs. OpenCode supplies
 * `@opentui/solid` and `solid-js` to its plugins, so the connector builds the
 * light with them directly instead of compiling JSX against its own copy.
 */
export interface OpenTuiSolid {
  createSignal<T>(value: T): [() => T, (value: T) => void];
  createElement(tag: 'box' | 'text'): object;
  insert(parent: object, accessor: () => unknown): void;
  effect(run: () => void): void;
  setProp(node: object, name: string, value: unknown): void;
}

async function loadOpenTuiSolid(): Promise<OpenTuiSolid> {
  // Literal specifiers: OpenTUI finds them in this file and hands over OpenCode's
  // own copies, so the light shares the host's reactivity. They exist only there.
  // @ts-expect-error -- provided by OpenCode at runtime
  const solid = (await import('solid-js')) as Pick<OpenTuiSolid, 'createSignal'>;
  // @ts-expect-error -- provided by OpenCode at runtime
  const openTui = (await import('@opentui/solid')) as Omit<OpenTuiSolid, 'createSignal'>;
  return {
    createSignal: solid.createSignal,
    createElement: openTui.createElement,
    insert: openTui.insert,
    effect: openTui.effect,
    setProp: openTui.setProp,
  };
}

/**
 * The light in the prompt footer of the session BuildFrame is connected to:
 * the glyph in the tone's colour and a muted name while connected, all in the
 * tone otherwise, nothing in other sessions.
 */
export function showLight(
  context: OpenCodeTuiContext,
  solid: OpenTuiSolid,
): { readonly set: (light: BuildFrameLightEvent) => void; readonly dispose: () => void } {
  const [light, setLight] = solid.createSignal<BuildFrameLightEvent | undefined>(undefined);
  const dispose = context.ui.slot({
    append: 'prompt.footer.status',
    render: input => {
      const row = solid.createElement('box');
      const glyph = solid.createElement('text');
      const name = solid.createElement('text');
      const shown = (): BuildFrameLightEvent | undefined => {
        const current = light();
        return current !== undefined && current.text !== '' && current.sessionID === input.sessionID
          ? current
          : undefined;
      };
      // One line, as OpenCode's own footer items: a long problem is cut, never wrapped.
      solid.setProp(row, 'flexDirection', 'row');
      solid.setProp(row, 'flexShrink', 1);
      solid.setProp(row, 'minWidth', 0);
      solid.setProp(glyph, 'flexShrink', 0);
      solid.setProp(name, 'wrapMode', 'none');
      solid.setProp(name, 'truncate', true);
      solid.setProp(name, 'flexShrink', 1);
      solid.setProp(name, 'minWidth', 0);
      solid.insert(glyph, () => shown()?.text.slice(0, 1) ?? '');
      solid.insert(name, () => shown()?.text.slice(1) ?? '');
      solid.effect(() => {
        const current = shown();
        if (current === undefined) return;
        const tone = context.theme.text.feedback[current.tone].base;
        solid.setProp(glyph, 'fg', tone);
        solid.setProp(name, 'fg', current.tone === 'success' ? context.theme.text.muted : tone);
      });
      solid.insert(row, () => (shown() === undefined ? [] : [glyph, name]));
      return row;
    },
  });
  return { set: setLight, dispose };
}

/**
 * OpenCode's TUI part: toasts for what the server part says once, and the
 * light for whether this session is connected. Without OpenTUI Solid the
 * toasts alone remain.
 */
export interface BuildFrameTui {
  readonly id: string;
  setup(context: OpenCodeTuiContext): () => void;
}

export function createBuildFrameTui(load: () => Promise<OpenTuiSolid> = loadOpenTuiSolid): BuildFrameTui {
  return {
    id: 'buildframe.tui',
    setup: context => {
      const events = context.client.rpc(BUILDFRAME_RPC).events;
      let light: ReturnType<typeof showLight> | undefined;
      let pending: BuildFrameLightEvent | undefined;
      let closed = false;
      const stopToasts = events.on('status', event => {
        context.ui.toast.show({ title: 'BuildFrame', message: event.data.message, variant: event.data.variant });
      });
      const stopLight = events.on('light', event => {
        if (light === undefined) pending = event.data;
        else light.set(event.data);
      });
      void load()
        .then(solid => {
          if (closed) return;
          light = showLight(context, solid);
          if (pending !== undefined) light.set(pending);
        })
        .catch(() => undefined);
      return () => {
        closed = true;
        stopToasts();
        stopLight();
        light?.dispose();
      };
    },
  };
}

const buildframeTui: BuildFrameTui = createBuildFrameTui();

export default buildframeTui;
