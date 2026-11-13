import { watch } from 'node:fs';

export type SubscribeToWorkspaceInvalidation = (onInvalidate: () => void) => () => void;

/**
 * File-system events are hints only. Projection always follows them with a
 * generation-safe Workspace Evidence capture before claiming fresh content.
 */
export function workspaceInvalidationSource(canonicalCheckout: string): SubscribeToWorkspaceInvalidation {
  return onInvalidate => {
    let closed = false;
    let watcher: ReturnType<typeof watch> | undefined;
    try {
      watcher = watch(canonicalCheckout, { recursive: true, persistent: false }, () => {
        if (!closed) onInvalidate();
      });
      watcher.on('error', () => {
        // The owner-side fallback verification remains active. A watcher error
        // is never upgraded into stale/current evidence.
      });
    } catch {
      // Unsupported or temporarily unavailable watch sources degrade to the
      // owner-side fallback verification without changing semantic truth.
    }
    return () => {
      closed = true;
      watcher?.close();
    };
  };
}
