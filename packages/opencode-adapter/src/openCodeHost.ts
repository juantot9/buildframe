/**
 * The parts of OpenCode's plugin context the connector uses, typed by shape.
 * OpenCode supplies `@opencode/plugin` itself and refuses a plugin that ships
 * its own copy, so the connector imports nothing from it: `Plugin.define` and
 * `Rpc.define` return their argument unchanged, and these types describe what
 * OpenCode 2.3.2 hands the plugin.
 */

export type OpenCodeDelivery = 'steer' | 'queue';

export interface OpenCodePromptHookEvent {
  readonly sessionID: string;
  readonly messageID: string;
  delivery: OpenCodeDelivery;
}

export interface OpenCodeCommandInvocation {
  readonly sessionID: string;
  readonly prompt: { readonly text: string };
}

export interface OpenCodeServerEvent {
  readonly type: string;
  readonly data?: unknown;
}

/** What the server part tells the TUI part: one line to show as a toast. */
export interface BuildFrameStatusEvent {
  readonly sessionID: string;
  readonly message: string;
  readonly variant: 'info' | 'success' | 'warning' | 'error';
}

/** The connection light in the prompt footer of one session; an empty `text` takes it away. */
export interface BuildFrameLightEvent {
  readonly sessionID: string;
  readonly text: string;
  readonly tone: 'success' | 'warning' | 'error';
}

/** The plugin's RPC: no methods; the TUI part listens to its toasts and its light. */
export const BUILDFRAME_RPC = {
  id: 'buildframe',
  methods: {},
  events: {
    status: {
      schema: {
        type: 'object',
        properties: {
          sessionID: { type: 'string' },
          message: { type: 'string' },
          variant: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
        },
        required: ['sessionID', 'message', 'variant'],
        additionalProperties: false,
      },
    },
    light: {
      schema: {
        type: 'object',
        properties: {
          sessionID: { type: 'string' },
          text: { type: 'string' },
          tone: { type: 'string', enum: ['success', 'warning', 'error'] },
        },
        required: ['sessionID', 'text', 'tone'],
        additionalProperties: false,
      },
    },
  },
} as const;

export interface OpenCodeServerContext {
  readonly app: { readonly version: string };
  readonly session: {
    get(input: { readonly sessionID: string }): Promise<{
      readonly location: { readonly directory: string };
      readonly title?: string;
    }>;
    prompt(input: {
      readonly sessionID: string;
      readonly id: string;
      readonly text: string;
      readonly delivery: OpenCodeDelivery;
    }): Promise<{ readonly payload: { readonly text: string } }>;
    interrupt(input: {
      readonly sessionID: string;
      readonly resume: boolean;
    }): Promise<{ readonly interrupted: boolean }>;
    hook(name: 'prompt', callback: (event: OpenCodePromptHookEvent) => void): Promise<unknown>;
  };
  readonly command: {
    transform(
      callback: (editor: {
        add(definition: {
          readonly name: string;
          readonly description: string;
          execute(invocation: OpenCodeCommandInvocation): Promise<void>;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
  readonly event: {
    subscribe(options: {
      readonly types: readonly string[];
      readonly signal: AbortSignal;
    }): AsyncIterable<OpenCodeServerEvent>;
  };
  readonly rpc: {
    register(
      definition: typeof BUILDFRAME_RPC,
      implementation: Record<string, never>,
    ): Promise<{
      readonly events: {
        emit(name: 'status', data: BuildFrameStatusEvent): unknown;
        emit(name: 'light', data: BuildFrameLightEvent): unknown;
      };
    }>;
  };
}
