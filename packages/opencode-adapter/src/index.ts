import type { OpenCodeServerContext } from './openCodeHost.js';
import { setUpBuildFrame } from './plugin.js';

/** OpenCode's server part. `Plugin.define` returns its argument, so a plain object is the same plugin. */
const buildframe: {
  readonly id: string;
  setup(ctx: OpenCodeServerContext): Promise<() => Promise<void>>;
} = {
  id: 'buildframe',
  setup: async ctx => await setUpBuildFrame(ctx),
};

export default buildframe;
