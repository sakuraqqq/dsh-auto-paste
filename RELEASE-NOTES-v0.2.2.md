# dsh-auto-paste v0.2.2

Fixes a one-shot hint that leaked into **every other conversation**.

## Fixes

- **The "no sidebar installed" hint followed the user into other sessions.** The hint is raised the first time a large paste lands as an atomic chip, and it renders in `conversation.input.overlay` — a slot that **every conversation mounts**. Its one-shot flag, `sidebarState.hintWanted`, was page-wide and owned by nobody, so the annotation raised in session A also painted above the composer of whichever session the user switched to next (reported from a phone, 2026-10-05; the shape dates back to 0.2.0, when the hint moved off the pill and onto the composer overlay).

  The offer now names the session it belongs to (`hintSessionId`), a slot only claims an offer addressed to its own `props.sessionId` (`ownsSidebarHint`), and the slot that renders it **consumes** it (`consumeSidebarHint`). A conversation that never raised the hint can no longer find one standing.

  - The rendered annotation stays on screen after its own offer is consumed: a local `shownFor` latch — not the page-wide flag — keeps it visible, and its session key is what keeps it off every other conversation.
  - A slot with no session identity (dsh 0.1.5 hands the overlay no `sessionId` prop) keeps the old behavior rather than hiding the hint forever; the consumption above is what bounds it there.

## Engineering

- **Test suite: 106 checks.** The six new guards were written **red first** (`106 tests, 6 fail`) and only then made green. They pin the address on the snapshot, the change detector that must watch it, the `offerSidebarHint(sessionId)` call site, the ownership refusal, the consumption, and the local latch that outlives it.
- Gate chain green: typecheck · eslint 0 · prettier 0 · privacy PASS · metrics 0 over-limit · smoke · artifacts rebuild byte-identically (`src/client.js` and `lib/client.js` share one SHA-256).
- No change on the paste path itself: the model still receives the bare reference, and the chip is untouched.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste@next
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.2.1...v0.2.2
