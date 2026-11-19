/**
 * Which signal the `--experimental-ffi` re-exec parent passes on to its child.
 *
 * On macOS and Linux it forwards both, so the child runs its own cleanup. On
 * Windows `child.kill` cannot deliver a signal: it ends the child at once
 * (TerminateProcess), before it can restore the console. There Ctrl+C already
 * reaches the child itself, as it reaches every process attached to the
 * console, so the parent only stays alive until the child exits. Nothing
 * outside can send SIGTERM to a Windows process, so it is not forwarded either.
 */
export function signalForChild(
  signal: 'SIGINT' | 'SIGTERM',
  platform: NodeJS.Platform = process.platform,
): 'SIGINT' | 'SIGTERM' | undefined {
  return platform === 'win32' ? undefined : signal;
}
