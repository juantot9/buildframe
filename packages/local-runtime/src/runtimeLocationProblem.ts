export type RuntimeLocationProblemCode =
  | 'unsupported-platform'
  | 'runtime-directory-insecure'
  | 'runtime-endpoint-missing'
  | 'runtime-endpoint-insecure'
  | 'runtime-endpoint-active';

export class RuntimeLocationProblem extends Error {
  readonly code: RuntimeLocationProblemCode;

  constructor(code: RuntimeLocationProblemCode) {
    super(code);
    this.name = 'RuntimeLocationProblem';
    this.code = code;
  }
}

export interface RuntimeLocation {
  readonly directory: string;
  /** A Unix socket path, or on Windows a named pipe (`\\.\pipe\…`). */
  readonly endpoint: string;
  /**
   * A base directory BuildFrame creates itself in a shared location (the `/tmp`
   * fallback). Another local user could create it first, or rename the
   * private directory inside it, so it must be owner-private too.
   */
  readonly ownedBase?: string;
  /**
   * Windows only: the file in the private directory that holds the running
   * runtime's handshake secret. Both sides of a pipe prove they know it
   * before any frame is exchanged (`runtimeHandshake.ts`).
   */
  readonly secret?: string;
}

/** The file a runtime published (its socket, or on Windows its secret), by identity. */
export interface OwnedEndpoint {
  readonly device: bigint;
  readonly inode: bigint;
}
