import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { createPiAdapterExtension } from './extension.js';

export default function buildframePiAdapter(pi: ExtensionAPI): void {
  createPiAdapterExtension(pi);
}
