# Git checkout-configuration execution controls (WF-096)

Date: 2026-08-12

Status: primary-source and behavioral research complete for implementation

## Question

Can Neoflow prevent a checkout's local/worktree Git configuration from selecting
external commands at either production Git seam while retaining operator-owned
system/global configuration and legitimate repository interpretation?

## Sources and versions

The implementation target and behavioral probes use Git `2.51.2`. Primary
sources are the official Git source and documentation at tag
[`v2.51.2`](https://github.com/git/git/tree/v2.51.2) (commit
`bb5c624209fcaebd60b9572b2cc8c61086e39b57`):

- configuration load order and scopes:
  [`config.c`](https://github.com/git/git/blob/v2.51.2/config.c#L1503-L1569) and
  [`git-config`](https://github.com/git/git/blob/v2.51.2/Documentation/git-config.adoc#configuration-scopes);
- includes and conditional includes:
  [`config.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/config.adoc#includes)
  and
  [`config.c`](https://github.com/git/git/blob/v2.51.2/config.c#L330-L431);
- repository format and worktree configuration:
  [`setup.c`](https://github.com/git/git/blob/v2.51.2/setup.c#L586-L797) and
  [`extensions.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/config/extensions.adoc);
- repository path routing:
  [`path.c`](https://github.com/git/git/blob/v2.51.2/path.c#L99-L135) and the
  files/reftable reference backends;
- clean filters, attributes, and fsmonitor:
  [`filter.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/config/filter.adoc),
  [`core.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/config/core.adoc),
  [`convert.c`](https://github.com/git/git/blob/v2.51.2/convert.c#L996-L1062),
  and
  [`fsmonitor-settings.c`](https://github.com/git/git/blob/v2.51.2/fsmonitor-settings.c#L103-L143);
- attribute-source override:
  [`git.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/git.adoc#environment-variables)
  and
  [`attr.adoc`](https://github.com/git/git/blob/v2.51.2/Documentation/config/attr.adoc).

## Findings

### Git exposes no local-only suppression control

Git reads configuration in increasing precedence: system, global, local,
worktree, then command. Its public environment controls can replace or suppress
the system and global files, and can add command-scope values, but there is no
parallel `GIT_CONFIG_LOCAL` or public switch that makes ordinary commands ignore
only local/worktree configuration. The internal implementation has
`ignore_repo` and `ignore_worktree` options, but ordinary commands do not expose
them.

A finite dangerous-key reset cannot close the class. Git does not make every
command-valued setting protected configuration: local `core.fsmonitor` and local
`filter.<name>.clean` both execute during `status` on 2.51.2. Checkout-local
includes retain local provenance even when they point outside the checkout.

### Config listing is a safe but narrow preflight primitive

After stripping every inherited `GIT_*` variable, this fixed command can parse a
specific config file without repository setup or includes:

```text
git config --file <path> --no-includes --null --list
```

Behavioral probes confirmed that it did not invoke local `core.fsmonitor` or a
clean filter. It is suitable for reading repository-format data only. It is not
a general effective-configuration sanitizer.

Flattening system/global records and replaying them at command scope was tested
and rejected. Included entries change scope/origin under replay, relative paths
and conditional context can change, and `includeIf.hasconfig:remote.*.url` can be
selected by a URL from another scope. In a concrete probe, a command-scope remote
URL activated a global hasconfig include whose `core.fsmonitor` ran during
`status`. The implementation therefore leaves operator files native rather than
claiming flattened replay preserves their semantics, but rejects an effective
operator hasconfig directive until that cross-scope condition has focused support.

### Provenance-isolated metadata closes the checkout-config path

The selected mechanism redirects Git's common metadata root to a private
temporary directory. Production Git receives:

- the real per-worktree `GIT_DIR`, preserving `HEAD`, index interpretation, and
  operator `includeIf.gitdir` matching;
- the canonical checkout as `GIT_WORK_TREE`;
- a private `GIT_COMMON_DIR` whose object/ref storage links to the real common
  directory;
- a generated local `config` containing only strictly validated repository
  format and structural interpretation settings; and
- no checkout-owned `config`, `config.worktree`, `hooks`, `info/attributes`, or
  `worktrees` path through the private common directory; the non-executable
  `info/exclude` interpretation is linked back explicitly.

Keeping the real per-worktree gitdir is important. A temporary gitdir changed the
path seen by operator `includeIf.gitdir`. Using only `GIT_COMMON_DIR` preserves
that native operator condition while making Git load local config from the
private common directory. The topology passed `rev-parse`, `status`,
`diff-tree`, `show`, and `cat-file` probes for main and linked worktrees. It also
passed SHA-256 and reftable repository probes on Git 2.51.2.

The structural config policy is default-deny. Known repository-format settings
are copied only after type/value validation. Includes, executable selectors,
unknown `core.*`/`extensions.*`/`index.*` settings, partial-clone activation, and
worktree-config activation fail closed. Non-structural settings such as user and
remote metadata are omitted. Unsupported repositories fail as inspection
failure rather than falling back to ordinary Git.

The overlay omits checkout-local `info/attributes`, so that unversioned metadata
cannot select even an operator-owned command, while retaining `info/exclude`.
Tracked `.gitattributes` remains
active. An operator-owned global clean filter selected by tracked attributes
still ran in the measured overlay, while a checkout-local filter with the same
selection path was rejected before any repository-aware Git call.

### Attribute suppression is not behavior-preserving

A corrected clean-filter repository was measured with worktree bytes
`worktree:canonical\n`, index bytes `canonical\n`, tracked `.gitattributes`
selecting a legitimate clean driver, and an invalidated stat cache:

- normal `status` ran the clean driver and reported a clean tree;
- `GIT_ATTR_SOURCE=HEAD` did the same;
- `GIT_ATTR_SOURCE=<empty-tree>` did not run the driver but reported the file
  modified.

Empty-tree attribute suppression changes legitimate repository interpretation
and creates a false modification. It is not a transparent S-01 mechanism. A
legitimate repository that requires a checkout-local clean command is therefore
rejected explicitly by the selected design rather than silently misreported.

### Inherited Git controls must not cross the seam

The controlled environment strips all inherited `GIT_*` names before adding its
own repository paths and non-interactive controls. This removes caller-selected
config files and command-scope values, object/index/ref overrides, attribute
sources, external diff commands, trace destinations, and related bypasses. Git
still reads operator-owned system/global files through its native paths.

## Completeness argument

The control is over provenance, not today's enumeration of executable keys:

1. Workspace Identity locates `.git` or a gitfile with filesystem operations.
   Before its first repository-aware Git call, it parses the common config only
   with the fixed no-repository/no-includes command and builds the private common
   metadata overlay.
2. Workspace Evidence performs the same preparation before each inspection
   operation. Every Git subprocess in that operation receives the context's
   absolute executable, canonical checkout, and controlled environment.
3. Production Git cannot open checkout-local/worktree config bytes: its local
   config path resolves to the generated private file, worktree config is not
   enabled, and checkout-local includes were never followed.
4. Checkout-controlled hooks and `info/attributes` are absent from the routed
   metadata. Tracked attributes can select only commands supplied by native
   operator configuration because local executable config causes preflight
   rejection. Operator `includeIf.hasconfig:remote.*.url` is detected within the
   isolated context and fails closed before inspection.
5. Unknown executable-capable settings added in the future cannot escape merely
   because they are missing from a blocklist: arbitrary checkout config is never
   replayed. Unknown settings in structural namespaces fail closed; other local
   settings are omitted as data.
6. Each temporary context is removed in `finally`. Preparation or cleanup
   failure maps to the existing bootstrap/evidence inspection-failure outcomes;
   there is no ordinary-Git fallback.

## Implementation consequence

Preparation and cleanup belong behind the package-private Git Process module.
Workspace Identity and Workspace Evidence use that private seam without changing
the Workspace package Interface or dependency firewall. Support for currently
rejected repository forms can be added later only with focused semantic and
execution evidence.
