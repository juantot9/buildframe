---
status: accepted
---

# A public integration contract, with unverified integrations allowed

Until now only reviewed first-party Adapters could attach a Harness, through a
private seam. We decided to publish an integration contract any harness or
tool can implement, and to admit integrations we have not reviewed as
**Unverified Integrations**: they get the same Handoff authority choices as
reviewed Adapters, but their declared capabilities are their own claim, so
preview, History and doctor label them unverified. Keeping the gate closed
would have meant every new harness waits for us; trusting outside claims
silently would break the Truth-Critical Distinction between what BuildFrame
observed and what an integration says.

## Consequences

- The wire protocol is the contract; SDKs are conveniences. Our four Adapters
  move onto it (Codex first, Pi last), so the public path is the one we use.
- v1 stays on the same-user local socket with no token. Anything reachable
  beyond the user's own account needs a new decision.
- The socket path is not part of the contract; `bframe endpoint --json` is.
- Whether the contract is our own protocol or a standard (ACP, MCP, A2A) is
  left to WF-322's research and brief.
