import { BUILDFRAME_RPC, type BuildFrameStatusEvent } from './openCodeHost.js';

/** The parts of OpenCode's TUI context the connector uses, typed by shape. */
export interface OpenCodeTuiContext {
  readonly client: {
    rpc(definition: typeof BUILDFRAME_RPC): {
      readonly events: {
        on(name: 'status', listener: (event: { readonly data: BuildFrameStatusEvent }) => void): () => void;
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
  };
}

/** OpenCode's TUI part: shows what the server part says as a toast, since a successful command shows nothing. */
const buildframeTui: { readonly id: string; setup(context: OpenCodeTuiContext): () => void } = {
  id: 'buildframe.tui',
  setup: context =>
    context.client.rpc(BUILDFRAME_RPC).events.on('status', event => {
      context.ui.toast.show({ title: 'BuildFrame', message: event.data.message, variant: event.data.variant });
    }),
};

export default buildframeTui;
