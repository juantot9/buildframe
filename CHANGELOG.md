# Changelog

## 0.1.0 — unreleased

The first public preview: Reviewing only, on macOS and Linux with Node 26.

- Review your current changes, a commit or a range in the terminal, with a
  file tree, inline or side-by-side Diff, search and history.
- Write a Message on any line and send it to a connected coding agent exactly
  as written; its answer comes back as the Message's Response, with what it
  changed in the code.
- Connect Pi (`pi install npm:@buildframe/pi`) or Claude Code (the `buildframe`
  plugin) by running `/buildframe` in a session in the same repository. One
  session is connected per repository; the newest `/buildframe` wins.
- `buildframe doctor` checks Node, the repository, BuildFrame's background process,
  its saved data, and the installed Pi and Claude Code.
- `buildframe --version` prints the installed version.
- `bframe` is a shorter name for the `buildframe` command.
