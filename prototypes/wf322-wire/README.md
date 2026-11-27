# PROTOTYPE, throwaway (WF-322)

Answers: is an outside integration of the proposed v1 wire (JSON-RPC 2.0,
one message per line, same-user Unix socket) an afternoon's work?

    python3 -I fake_buildframe.py ep.json &
    python3 -I integration.py ep.json

`integration.py` (58 lines, stdlib) does the full level; the harness is
faked. Verdict and findings: `.issues/WF-322-*.md` on `main`. Never merge.
