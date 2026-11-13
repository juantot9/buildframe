# Security

## Reporting a vulnerability

Please report security problems privately through
[GitHub's private vulnerability reporting](https://github.com/juantot9/buildframe/security/advisories/new),
not as a public issue. Include the BuildFrame version (`buildframe --version`), your
OS, and the steps that show the problem.

## What counts

BuildFrame is a local, single-user tool. These are in scope:

- Another local user, or a process that is not yours, reaching BuildFrame's
  background process or sending text into a connected agent session.
- A repository's contents, Git configuration, file names or commit messages
  making BuildFrame run commands, write outside its own folders, or put control
  sequences on your terminal.
- BuildFrame sending anything over the network. It makes no network calls of its
  own.

Out of scope: what an agent does with a Message you sent it, and anything that
needs code already running as your own user.

## Supported versions

Only the latest published release gets fixes while BuildFrame is in `0.x`.
