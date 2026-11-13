---
id: WF-238
title: "Divide Messages rows with a subtle rule"
status: closed
labels:
  - wayfinder:task
parent: WF-227
assignee: juanan
created: 2026-09-15
---

## Outcome

Adjacent Messages read as separate entries: one dim horizontal rule separates each entry from the next in the vertical Messages pane, while the first entry and the compact horizontal strip stay undecorated.

## Finding

WF-232 removed the card gap so entries would be dense, and WF-233/WF-234 filled the selected entry with its complete body and Response. In the rendered pane, adjacent entries then ran together — a collapsed preview directly above the selected entry's `Message ·` line looked like one block. The owner asked for "a little division between rows".

## Interface

Each entry after the first owns one leading divider row inside its own box, so the rule is exactly between entries, never before the first and never after the last. It spans the card content width, uses the dim border color, and becomes `-` in ASCII presentation. Entry heights include the row, so the pane scroll model keeps working unchanged. The compact strip is untouched.

## Acceptance

- [x] A dim rule separates adjacent entries in the vertical Messages pane.
- [x] The first entry has no leading rule and there is no trailing rule.
- [x] ASCII presentation uses `-`; no-color and plain output keep the rule.
- [x] The provisional local entry is divided from prior Messages and undivided when it is the only entry.
- [x] Scroll offsets, hover expansion, and complete selected entries keep working; focused scenarios and full verification pass.

## Resolution

The rule belongs to the entry it precedes, which keeps every row count deterministic for the scroll model and avoids a trailing line when the last entry is selected. The divider is presentation only: no projection, model, or pane-scroll Interface changed.

## Completion evidence (2026-09-15)

- `questionsPane` renders one leading `─` (or `-`) row in the dim border color for durable entries with an absolute ordinal above zero and for the provisional entry whenever Messages already exist; `cardItems` sizes include that row.
- The wheel-scrolling scenario asserts the second entry carries a divider run while the first entry does not, and the rest of the suite keeps passing; the rendered 100×28 frame shows clean full-width rules between entries with the selected entry's tint starting at its own rule.
- Verification on Node 26.5.1: the app scenario suite, lint, format, dependency firewall, typechecks, clean builds, build smoke, compiled dogfood fault probe, and `git diff --check` pass with unrelated work unstaged.
