# WF-231 / WF-232 simple manual test

This is a short exploratory check for the immediate Review acknowledgement and
the inline Messages pane. The automated suites and compiled probes already pass;
you only need to check how the real TUI feels and behaves.

## Start

A disposable changed worktree and launch scripts are already prepared under
`.local/wf231-wf232-manual/`. No fixture, build, Node, or State setup is needed.

From the Neoflow repository, run these in two terminals:

```bash
# Terminal A
.local/wf231-wf232-manual/neoflow.sh

# Terminal B
.local/wf231-wf232-manual/pi.sh
```

Inside Pi, type `/neoflow` and press Enter to attach that session, then wait
for Pi to say `Neoflow Review attached (workspace write).` The attached Harness
may modify the working tree with its own tools, so a Message can now apply code
changes that appear as ordinary live changes in the Diff. Narrow the session
with `/neoflow readonly` when you only want discussion, and use
`/neoflow status` or `/neoflow disconnect` to inspect or release the
attachment. Only an explicitly attached Pi session can receive Messages. Then
use terminal A for the checklist below.

After a rebuild, stop everything first with
`.local/wf231-wf232-manual/stop.sh`: an attached Pi session keeps the old
runtime process alive, so a restarted Neoflow would otherwise keep running the
previous build.

To restore the prepared file changes later, stop both processes and run:

```bash
.local/wf231-wf232-manual/reset-worktree.sh
```

The fixture and its state are disposable and ignored by the outer repository.

## Required ten-minute check

### 1. Open the Review

1. Go to Home and select **Review current changes**.
2. Press Enter once.

Expected:

- a Review shell appears immediately—there is no blank pause;
- the first shell says `OPENING / PENDING`, `Snapshot evidence is pending`, and
  `Projection pending`;
- it does not claim `ACTIVE RETAINED CONTEXT` before the projection settles;
- Files, Diff, and Messages then fill in normally.

Judge perceived immediacy only. Manual testing cannot prove the strict 16.7 ms
frame deadline.

### 2. Send one long Message

1. Select a changed Diff line with `j`/`k`.
2. Press `a`.
3. Enter or paste:

   ```text
   Manual UI check: explain this briefly while preserving café, naïve, 界面, 🙂, and enough ordinary words to exercise wrapping in the Messages pane.
   ```

4. Press Enter once and watch the Messages pane.

Expected:

- the exact outgoing preview (`F3`) states `may modify the working tree`;
- exactly one `+ local` entry appears immediately with `… Checking`;
- the complete local Message body is visible, with no permanent ellipsis;
- it does not claim to be saved before commitment;
- it becomes exactly one numbered Message such as `#1`—no duplicate remains;
- the selected durable row still exposes the complete Message body; use the
  Messages-pane wheel if the body is taller than the pane;
- while waiting, it says `○ Awaiting` and `Response · awaiting Harness`;
- after the attached Harness finishes normally, it says `✓ Response` and the
  selected row shows the Harness answer in full, not a three-row preview; use
  the Messages-pane wheel if the Message-and-Response pair is taller than the
  pane.

Durable commitment and Harness completion may take longer; only the truthful
local acknowledgement must feel immediate.

### 3. Check keyboard, hover, and scrolling

Use three or more existing Messages, or send a few short Messages first.

1. Tab to the Messages pane and select a middle Message with `j`/`k`.
2. Hover a different collapsed Message without clicking.
3. Move the pointer back out of the Messages pane.
4. Use the wheel over Messages, Files, and Diff.

Expected:

- a dim rule visibly separates adjacent Messages, with no rule above the
  first Message and none after the last;
- keyboard selection shows its complete Message and Response inline;
- hover temporarily expands another Message to a bounded preview without
  changing keyboard selection or clipping the selected pair;
- moving away restores the keyboard-selected Message/Response expansion;
- wheel scrolling affects only the pane under the pointer;
- rows do not flicker, jump, overlap borders, or move out from under the pointer.

### 4. Check real mouse text selection

This is the most important behavior not fully covered by synthetic tests.

1. Expand a Message with a Response.
2. Hold the left mouse button and drag more than two cells across its text.
3. Release, then press Ctrl+C once.
4. Paste into a scratch editor.

Expected:

- the text remains visibly selected during and after the drag;
- hover does not rerender the row underneath the active drag;
- Ctrl+C copies the selection instead of quitting Neoflow;
- the pasted text matches the selection.

### 5. Check the outgoing Message template

The fixture ships a sample template at
`.local/wf227-pi/config/neoflow/message-template.md`:

```md
## Review request

{{message}}

Context: `{{location}}`
```

1. Send a Message and press `F3` before Enter.
2. Edit the template file while Neoflow stays open and preview again.
3. Delete the file and preview once more.

Expected:

- the overlay opens on the `F3` key press and shows `preparing exact material`
  while the target is verified, then fills in the exact bytes, destination,
  SHA-256, and assessment;
- while the preview is open the composer is frozen: typing does nothing, and
  `Esc`/`F3` closes the overlay to keep editing;
- the preview shows the complete rendered template, not just its first line;
- the new structure appears immediately after the file is edited;
- deleting the file restores `{{message}}`, a blank line, and `{{location}}`;
- an invalid template (for example `{{unknown}}`, a missing placeholder, or an
  unpaired `{{source}}`/`{{origin}}`) refuses to send and says the template is
  invalid;
- a template using `{{source}}` and `{{origin}}` together renders a historical
  (saved review point) Message and shows the exact historical passage in the
  preview; a template without them keeps the fixed quoted structure;
- a historical template used on a current-code Message refuses to send instead
  of fabricating a saved origin.

### 6. Resize the terminal

Try normal wide size, about 100 columns, and 80×24. At each size, briefly select,
hover, and scroll a Message.

Look for:

- clipped or overwritten borders;
- missing state text;
- large unexplained dead areas;
- words or wide Unicode glyphs split incorrectly;
- selection or scrolling that becomes unstable.

## Optional fault checks

These are useful but are not required for the basic exploratory pass.

### Rejected send

1. Open a composer and type a disposable draft.
2. Run `/neoflow disconnect` in Pi (or exit Pi) before pressing Enter.
3. Press Enter once after the Adapter detaches.

Expected: one local attempt becomes `! Not sent`, the draft remains available,
and reattaching Pi with `/neoflow` does not send it automatically.

### Aborted Harness response

1. Send a disposable Message.
2. Once the attached Pi Harness receives it, abort that turn before a normal
   response.

Expected: the durable Message remains once, with `○ Awaiting` and no fabricated
Response. Do **not** expect a per-Message `Failed` marker; the current projection
cannot truthfully associate that failure with a Message.

### ASCII and no-color

Only if you want a broader visual pass, restart with:

```bash
.local/wf231-wf232-manual/neoflow.sh --ascii --no-color
```

Check that borders, state markers, clipping, and scrolling remain understandable.

### Unknown post-commit outcome

Skip this manually unless a controlled fault harness is available. Do not kill
processes at random or retry an ambiguous Message. The expected UI is
`? Unknown` with `Outcome unknown · do not replay`; automated fault coverage
already checks the no-replay guarantee.

## What to record

For a problem, note only:

- terminal size and mode;
- exact steps;
- expected versus actual result;
- whether it reproduces twice;
- a screenshot or short recording for timing, hover, drag, or clipping defects.

If the required checks pass, WF-231 and WF-232 need no further work.
