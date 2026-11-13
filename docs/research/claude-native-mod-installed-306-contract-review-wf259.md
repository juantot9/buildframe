# WF-259 — installed2.1.306 Mod contract review

## Outcome — 2026-10-21

Owner approved reviewing the installed version and Mod contracts, **no prompts or
model calls**. Source/evidence captured at **`b222f1c`**, branch
`prototype/wf259-installed-306-contract-review`, based on `448d0ed`.
Worktree: `/private/tmp/neoflow-wf259-installed-306-contract-review`.
Primary captures/fixtures:
`packages/claude-adapter/prototypes/wf259-plannotator-session-controller/control-pairing/installed-contract-review/`.

**A concrete incompatibility was found, not just a missing old executable.** The
installed native CLI is2.1.306. It accepts the Mod's static source after an author
metadata fix, but its official offline Mod hook environment does NOT expose the
key-generation/signing/encryption functions required by our WebCrypto port.

Our earlier public-SDK check incorrectly added browser `DOM` globals and skipped
declaration conflicts. That masked the restricted Mod `crypto` global already
specified by the public SDK. The check is corrected; it now rejects the port.
The known-incompatible operator/native-launch paths are withheld, with no override.
Do not ask the operator to try this Implementation or treat a version change as
its fix. Next direction is trusted Node-helper key custody using the existing
Node codec, not more operator-driven simulation. No helper is implemented here.

## Installed artifact and authorized operations

The agent shell's PATH did not resolve `claude`; executable metadata inspection
found the native installation via `$HOME/.local/bin/claude`, resolving to2.1.306.
The old2.1.291 absence remains true; it did not mean no Claude was installed.

Sandboxed `--version` returned **`2.1.306 (Claude Code)`** at
**2026-10-21T13:20:59Z**. Selected executable SHA256:
`b5d795b7760032d79954b55a9cd1876dcf3a8dc9608fd6bb9f618593f69fd44b`.
This identifies the reviewed CLI artifact, NOT a live foreground worker/session.
The Node/npm launcher and other retained native versions were not executed.

Authorized checks used private temporary HOME/config, no inherited credentials,
disabled updater/telemetry, and OS denial of ALL outbound network. Twelve CLI
invocations: version metadata, three help queries, two strict validations, two
offline-kit cases, then four commands reproducing those findings. There was no
interactive conversation, existing-session adoption, actual native tool/model/
prompt submission, workflow-store inspection or assistant/transcript capture.
CLI metadata and our own test diagnostics are not conversation capture.

Seven separate anonymous primary-source HTTP GETs refreshed five docs and fetched
the latest public declaration commit/file. No public writes, credentials, issue
poll, installation/update or production version-policy change. No funded call;
the prior8/8 allowance remains exhausted.

## Static loader: accepts source, does not guarantee globals

[Official create guide](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod)
says `plugin validate` performs the runtime's static source analysis without
running the code or opening a session.

The first strict validation failed solely on the missing `author` attribution.
Adding `author: { name: 'Neoflow prototype' }` in the isolated manifest and including
the README produced exit0, `success:true`, no manifest/hook warnings/errors.
Its notes recognize the exact scoped connect and Pane hooks and native calls.
Missing license/icon remain directory-listing findings with no directory profile
selected; private-load validation success is NOT marketplace acceptance. No
license or submission claim is fabricated.

The import/`$` locality corrections in `448d0ed` are therefore accepted by this
CLI's analyzer. That does not type-check the crypto surface or prove a real pane,
operator comparison, actual scope, lease or native turn association.

## Runtime-contract finding: digest/randomness, not browser WebCrypto

The [official offline test kit](https://code.claude.com/docs/en/plugins/mods/test)
runs tests without a session, sign-in, network, actual model/tool/store operation.
The CLI help describes each test file as a child of this binary in an environment
like the Mod hook environment. We used no model/tool/store APIs or stubs for them.

1. The existing port's codec test failed immediately:
   `TypeError: crypto.subtle.generateKey is not a function`.
2. An independent probe queried ONLY public global-function presence from inside
   an actual Mod hook dispatched by the offline kit, not just the outer test
   callback. It passed and captured:

| Present as functions | Undefined |
| --- | --- |
| `crypto.randomUUID`, `crypto.getRandomValues`, `crypto.subtle.digest`, `btoa`, `atob`, `TextEncoder` | `generateKey`, `importKey`, `exportKey`, `sign`, `verify`, `deriveBits`, `deriveKey`, `encrypt`, `decrypt` on `crypto.subtle` |

No values from keys, credentials, transcripts or messages were inspected. The
fixture's command returns only these type labels to the offline test; it never
enters a real conversation. Fixture confirmations in the codec case are not
physical comparison evidence. The full codec stops before key creation.

This is installed-CLI/offline-hook evidence, not an interactive worker/UI test or
a universal absence claim across all versions. It is sufficient to reject reliance
on these **unsupported** functions in this candidate, not to assert an Anthropic
regression or that all private-key strategies are impossible.

### The declaration check should already have caught this

The latest public declaration file still points to
[`bf2323b3021c9d3db7a31e1e7d61068c3f704497`](https://github.com/anthropics/claude-code/blob/bf2323b3021c9d3db7a31e1e7d61068c3f704497/mods/types/claude-code.d.ts),
SHA256 `e51e637fbbebb2a6a49c4bdc3860a251c2ca2295884822dff0f4c3e3ec802163`.
Its global `crypto` declaration at lines11693–11702 provides only:

```ts
var crypto: {
  readonly subtle: {
    digest(algorithm: string | { name: string },
      data: ArrayBufferView | ArrayBuffer): Promise<ArrayBuffer>
  }
  randomUUID(): string
  getRandomValues<T extends ArrayBufferView>(array: T): T
}
```

`lib: ['ES2023','DOM']` in our earlier checker supplied a different browser crypto
global, hiding this limitation. Removing DOM makes the port fail for the missing
key types/functions and its unsupported extra TextDecoder argument. This invalidates
that earlier **native-global compatibility inference**, not the Node protocol/
lifecycle observations themselves. Corrected diagnostics are committed; the check
must stay red until the native Implementation uses supported globals.

The [build-generated definition precedence rule](https://code.claude.com/docs/en/plugins/mods/create#get-type-definitions-for-your-version)
still applies. Full2.1.306 definitions are NOT obtained here: documentation generates
them when an interactive Mod loads, which was deliberately not done. The public
copy is not promoted to exact306 declarations; its restricted crypto surface is
independently corroborated by the actual306 offline hook.

## Other reviewed contract changes and limits

- [Current API guide](https://code.claude.com/docs/en/plugins/mods/api#calls-and-background-work-after-the-user-interrupts-a-turn)
  documents v2.1.304+ refusal/drop behavior after interruption until the user's
  next input, and offers retry examples. Neoflow must NOT copy its pending-text
  retry loop: durable authority, exact disposition and no-replay rules remain.
- [Turn events](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn)
  join native lifecycle by turn ID, while the reviewed background-submit guide
  still supplies no engine-owned exact Send→turn receipt contract. The unchanged
  public type copy also supplies no new checked join. This is a bounded source
  review, not exact306 native submission evidence or an impossibility proof.
- None of the former2.1.291 live bytes/origin/overlap findings is silently extended
  to306. The candidate's hard-coded291 guards and main reviewed profile remain
  unchanged; no native trial is admitted by changing a number.

## Next bounded implementation

Keep signing/DH/encryption in our own bounded Node child and reuse the original
Node pairing codec. The Mod should retain only native calls/UI/lifecycle and a
scoped owning-control path to that child. Under the owner-confirmed trusted-code
baseline, this is an Implementation dependency, not a demand for independent
attestation of our own code through hostile installed Mods.

Still required: genuine owning startup (not socket-fetched roots), scoped/fresh
local control and helper lifetime, local-only comparison approval, no public
signer/confirm/publish operation, no key files or model-visible secret. Spawn stdin
is one-shot, not persistent owning IPC; do not transplant the old Node-parent IPC
proof onto it. No Message consent follows from pairing; existing post-commit grant
custody and engine-owned Send→turn correlation stay independent gates. No helper
transport or receiver is implemented by this review.

No manual JSON acceptance task is requested from the operator. Developer-owned
reproducer/negative fixtures are in the source README and reject another executable
SHA before running any CLI command. Both operator/native launcher currently refuse
the incompatible key owner even with a launch approval flag.

Main remains `a48220c`; production source, glossary/semantic contracts and reviewed
versions are untouched. Worktrees are committed/clean, no merge/push/dispatch.
The fresh private40-file custody baseline remains the comparison basis, not the
missing older scratch manifests. No full production suite was rerun for this review.
