## File size budget

Every hand-written file has a budget of 5,000 tokens (tokens = bytes / 4, so 20,000 bytes). Write new code to fit: when a file nears ~3,000 tokens, start the next responsibility in a new file beside it, cut at a seam (one feature, one data type and its helpers, one view section, one parsing stage).

Files already over budget are frozen at their current size. An edit to one must leave it no larger, so move out at least as much as you add.

The pre-commit hook (`scripts/check-staged-file-size.mjs`) enforces this on staged files; when it blocks a commit, its message gives the split steps. Generated files opt out via `linguist-generated` in `.gitattributes`.
