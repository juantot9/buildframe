import { runWorkspaceRuntimeProcess } from '@buildframe/local-runtime/launcher';

await runWorkspaceRuntimeProcess({
  runtimeEntrypoint: new URL(import.meta.url),
});
