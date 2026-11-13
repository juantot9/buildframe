# BuildFrame

BuildFrame is a terminal app for reviewing what your coding agent changed. Open it
in a repository, read the changes as a file tree and a Diff, write a Message on
any line, and send it to a connected Pi or Claude Code session. The agent's
answer comes back under your Message, together with what it changed in the code.

Everything stays on your machine. BuildFrame sends a Message only to the agent
session you connected, exactly as you wrote it.

> **0.1.0 is a preview.** It covers Reviewing only, on macOS and Linux. Expect
> rough edges, and please [report them as GitHub issues](https://github.com/juantot9/buildframe/issues)
> with the output of `buildframe doctor`.

## Install

```bash
npm i -g @buildframe/cli      # or: pnpm add -g @buildframe/cli
```

Then, inside a Git repository:

```bash
buildframe      # or the shorter: bframe
```

### Requirements

- macOS or Linux. Windows is not supported yet.
- Node.js 26 (`>=26.4.0 <27.0.0`); CI tests `26.4.0` and the newest 26.x, and
  development runs on `26.5.1`. Its terminal
  interface needs Node 26's FFI, which BuildFrame turns on for itself.
- Git. `--no-color` and `--ascii` help on limited terminals.

## Connect an agent

Run `/buildframe` in an agent session inside the same repository. From then on,
every Message you send in BuildFrame goes straight to that session.

| Agent | Install once | Then, in a session |
|---|---|---|
| Pi `>=0.80.6 <2.0.0` | `pi install npm:@buildframe/pi` | `/buildframe` |
| Claude Code `>=2.1.310 <3.0.0` | `/plugin marketplace add juantot9/buildframe`, then `/plugin install buildframe@buildframe` | `/buildframe` |

- One session is connected per repository. Running `/buildframe` in another
  session moves the connection there, and the first session is told.
- `/buildframe status` says whether the session is connected, and
  `/buildframe disconnect` ends the connection from the agent's side.
- The agent works with its own permissions; BuildFrame never extends them. In Pi,
  `/buildframe readonly` connects so that Messages run with Pi's read-only tools
  only, and `/buildframe write` switches back.
- `x` on a running Message asks the agent to stop that turn; you can also stop
  it in the agent itself.

## Use it

- **Home** offers the current changes, a commit or range, and Previous Reviews.
- **`a`** writes a Message on the selected line. **`F3`** shows exactly what
  will be sent. **`Enter`** sends it.
- **`r`** sends a Message again. **`?`** lists every key.

### Message template

Messages use a built-in layout: your text, a blank line, then `<file>:<line>`.
To change it, put a `message-template.md` beside `config.json` in BuildFrame's
configuration folder (`$XDG_CONFIG_HOME/buildframe/`, or `~/.config/buildframe/`). A
template for current code uses `{{message}}` and `{{location}}` once each:

```md
## Review request

{{message}}

Context: `{{location}}`
```

A Message about saved, not current, code keeps its built-in quoted-source
layout, unless the template also uses `{{source}}` and `{{origin}}` together
(`{{location}}` is optional):

```md
## Historical review request

{{message}}

{{origin}}

{{source}}
```

`F3` always shows the exact result.

## When something doesn't work

```bash
buildframe doctor            # or: buildframe doctor --json
```

`doctor` checks Node, the repository, whether BuildFrame's background process is
running (and from which install), whether its saved data reads, which agent is
connected, and your Pi and Claude Code versions. It changes nothing. Include
its output when you report a problem.

## Your data

- Saved Reviews and Messages live outside your repository, in
  `$XDG_STATE_HOME/buildframe` when that is set, otherwise
  `~/Library/Application Support/BuildFrame` on macOS and `~/.local/state/buildframe`
  on Linux. Settings live in the configuration folder above.
- BuildFrame makes no network calls of its own: no telemetry, no update checks.
- Uninstalling removes the program only, never your saved data. To remove that
  too, quit BuildFrame and delete the data and configuration folders.

## Update and remove

```bash
npm i -g @buildframe/cli@latest        # update
pi update npm:@buildframe/pi           # update the Pi connector
npm rm -g @buildframe/cli              # remove; saved data stays
pi remove npm:@buildframe/pi
```

In Claude Code, manage the plugin with `/plugin`.

## Develop BuildFrame

This repository is one pnpm workspace that builds every published piece from
one version.

```bash
pnpm install --frozen-lockfile
pnpm verify          # lint, format, dependencies, tests, typecheck, build, smokes
```

Compiled end-to-end checks:

```bash
pnpm risk:state
pnpm risk:runtime
pnpm risk:pi         # runs the Pi pinned in packages/pi-adapter
pnpm risk:dogfood
```

To probe the Pi on your `PATH` instead:

```bash
BUILDFRAME_PI_BINARY="$(command -v pi)" BUILDFRAME_PI_VERSION="$(pi --version)" \
  node scripts/probe-pi-adapter.mjs
```

### Run from source

```bash
pnpm dogfood -- /path/to/repository
```

`pnpm dogfood` rebuilds first, which briefly empties each package's `dist/`.
Start agents after BuildFrame is up:

```bash
pi -e /path/to/buildframe/packages/pi-adapter/dist/index.js
claude --plugin-dir /path/to/buildframe/packages/claude-adapter/plugin
```

### Assemble a release

```bash
pnpm release:assemble    # builds @buildframe/cli and @buildframe/pi into release/ and checks them
pnpm release:manifest    # regenerates support/manifest.json after a support fact changes
```

### Repository layout

```text
apps/buildframe             the app: terminal interface, launcher, doctor
packages/workspace       Reviews, Messages, saved State, Git evidence
packages/local-runtime   the background process and its local IPC
packages/pi-adapter      the Pi connector
packages/claude-adapter  the Claude Code connector and its plugin
.claude-plugin/          the Claude Code marketplace
scripts/                 verification, risk probes, release assembly
support/manifest.json    what a release supports, generated
```

The working method is tracked beside the source, and is mostly historical:

- `.issues/` is the record of work: design decisions and finished tasks, in
  the project's own vocabulary. Bugs and feedback go to GitHub Issues instead.
- `PRODUCT.md` says what BuildFrame is for, `CONTEXT.md` defines its vocabulary,
  and `DESIGN.md` is the design statement.
- `HANDOFF.md` is the current state of work, for whoever picks it up next, and
  `WORKFLOW_RESEARCH.md` an early survey of other coding-agent terminal apps.
- `docs/` holds blueprints, testing guides, research, and dated audits whose
  findings have since been dealt with.

Development before 0.1.0 happened in a private repository; commit IDs and
branches that tickets and docs mention from that time resolve there, not here.

Removing code never removes users' saved State, configuration or files from
earlier versions such as `.neoflow/review.json`.

## License

MIT. See [LICENSE](LICENSE).
