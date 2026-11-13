---
id: WF-148
title: "Clarify changed-target reselection"
status: closed
labels:
  - wayfinder:bug
parent: WF-147
assignee: juanan
blocked_by: []
created: 2026-08-28
---

## Problem

The fresh WF-147 acceptor proved the changed-target safety transition works, but could not understand it confidently. The target-changed composer simultaneously says `[Esc] reselect target in Live Changes` and, on the next row, `[Esc] leave without asking`. Enter's refusal also tells the user to return and reselect even though the composer remains open and Esc performs that exact retargeting in place. The private View contradicts the model-owned behavior at the moment safety matters most.

## Acceptance evidence

- A target-changed Question composer presents one unambiguous local explanation: source changed after composition began, exact Question text remains preserved, Enter cannot Ask the earlier target, and Esc retargets that same text to the currently selected Live Changes target.
- The target-changed composer contains no simultaneous instruction that Esc leaves, cancels, or closes. The ordinary unchanged-target composer retains its existing Esc-to-leave behavior.
- Enter while changed remains a no-command refusal and explains the available in-place retarget action. One Esc performs the existing exact file/row or whole-file reselection, preserves body and cursor, keeps the composer open, and confirms the new Live target. A later Enter independently reports Attachment availability.
- Keep changed-target detection, generation ordering, exact Anchor construction, Attachment ordering, Workspace commands, State versions, durable bytes, and package Interfaces unchanged. Add no global warning, new key mode, generic notice system, or Workspace read.
- Extend the owner-local real Workspace/OpenTUI scenarios for both attached and unattached paths to assert the complete contextual instruction set, absence of contradictory Esc text, unchanged State on refusal/reselection, preserved text/cursor, exact reselected target, and ordinary composer cancellation.
- The old presentation fails the new contextual control. Focused Application tests, a clean compiled control, canonical `pnpm v1:verify`, all four compiled risk probes, and `git diff --check` pass on Node 26.5.1 with pnpm 11.20.0. The affected WF-147 human case is rerun before closure.

## Authority

- Human gate: [Run fresh human Reviewing acceptance](./WF-147-run-fresh-human-reviewing-acceptance.md)
- Prior target localization: [Localize target safety and stabilize Review commands](./WF-144-localize-target-safety-and-stabilize-review-commands.md)
- Accepted Live Changes behavior: [Implement the accepted Live Changes design](./WF-079-implement-accepted-live-changes-design.md)

## Seam decision

Keep the fix inside the existing private Application model/view seam. The model already owns exact target comparison and retargeting; the View already owns contextual composer instructions. Make those two halves tell one truth instead of adding another Interface or another source of policy.

## Constraints

- Esc keeps its established contextual meanings: retarget only while changed, leave only while unchanged.
- Preserve the composer's bounded geometry and normalized 64 KiB Draft limit.
- OpenTUI continues to own key, paste, cursor, and ANSI decoding.
- Do not address historical loading, historical visual distinction, or the global Reviewing header in this child.
- Do not continue WF-147 scenarios B/C until this failed A case is accepted.
- Preserve legacy/user data, P54 scope, and the unrelated root `package.json` bump.

## Progress (2026-08-28)

The target-changed composer now spends its existing three control rows on one contextual truth: source changed and text is preserved; Enter blocks the old target; Esc retargets to Live; retargeting keeps the editor open. The ordinary composer alone retains Esc-to-leave. Enter's refusal names the in-place Esc action, and successful retargeting confirms that text remains available for review before Ask.

Both real Workspace/OpenTUI paths now prove the ordinary and changed control sets, absence of contradictory Esc text, no State/effect on refusal or retargeting, exact body/cursor retention, exact reselected line Anchor, later Attachment ordering, and ordinary cancellation after the target is current. The old presentation fails both controls at the missing contextual explanation. Source Application tests pass 26/26, a clean compiled control passes both affected scenarios, canonical verification passes 26 files / 147 tests, and all four compiled risk probes pass after the dogfood probe adopted the new refusal text and exercised no-effect Esc retargeting. The exact WF-147 human retry remains required before closure.

## Resolution comment

The focused retry ran the built Application at commit
`0ddb543feb00708e67a2f7168f72412a7b7a3a80` under Node 26.5.1 in Warp
Terminal `v0.2026.08.19.08.15.stable_01`, macOS arm64, true color, at 136x50.
After a fresh sanitized source move, the acceptor waited for `TARGET CHANGED`,
read the new contextual controls, exercised Enter refusal and one Esc retarget,
and accepted the corrected presentation: “I like it better” and “the rest feels
ok.” The acceptor explicitly chose acceptance with the use of Esc for retargeting
deferred for later reconsideration rather than blocking this gate.

Bounded postinspection proved the fixture retained its exact State version,
two immutable Versions and Responses, changed Live posture, and Current Review;
no Ask, replay, or other command escaped the refusal/reselection path. The
ordinary and target-changed composer meanings are no longer simultaneous, and
no Workspace Interface, durable byte, or target-safety rule changed. WF-148 is
accepted and closed; the separate top-header and historical-dialog findings from
scenario A remain owned by WF-147 rather than being hidden here.
