---
id: WF-317
title: "At about 30 columns, the header, pane tabs and footer are cut mid-word"
status: open
labels:
  - wayfinder:task
assignee: null
blocked_by: []
created: 2026-11-20
---

## Finding

Found while checking the TUI in Windows terminals
([WF-314](./WF-314-check-the-tui-in-windows-terminals.md)); the layout code
is shared, so it probably happens everywhere.

In a Review at 29 columns:

```text
  Buil… LIVE  ·  ○ No agent
  Current Review · ◆ ━━━━ ○ ━
  Files   Diff   History 0  [
 [a]       [?] keys  [q] qui
```

- The title shortens with `…`, but the timeline and the pane-tab row
  (`[Tab] switch`) are cut with no marker.
- The footer's anchor reads `[q] qui`. `keysRow` in
  `apps/buildframe/src/shellKeys.ts` promises that the anchor never shortens
  and that keys drop first; here a key (`[a]`) stays while the anchor is cut.

At 59 columns everything fits.

## Verification

- From 60 down to the narrowest supported width, no row of chrome is cut
  without a marker, and the footer keeps `[?] keys  [q] quit` whole while any
  other key is shown.
- If there is a narrowest supported width, it is written down and below it
  BuildFrame says the terminal is too small instead of drawing cut text.
