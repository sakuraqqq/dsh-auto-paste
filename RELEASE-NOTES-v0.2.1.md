# dsh-auto-paste v0.2.1

Fixes a reference chip that could reach the message as **dead plain text**, and keeps the paste size visible after a session switch.

## Fixes

- **A chip pasted right after typed text went out as plain text.** A paste dropped immediately after a character (the natural `他说<paste>`, `是<paste>`) produced the draft text `他说@"pastes/x.txt"` — glued, with no whitespace in front of the token. Every reference scan in dsh anchors on `(^|\s)`:

  - the composer's `TEXT_REF_RE` / `FOLDER_REF_RE` (`dsh-client-ui-conversation`), and
  - **the renderer for messages that were already sent**, `projectUserText` (`dsh-client-ui-primitives`).

  Neither can see a glued mention, so the reference rendered as dead text and was not clickable — the 2026-10-02 report. The insertion now puts a **real space character** into the draft first (read-only DOM probe of the character before the caret; "cannot tell" answers *yes, insert the space*), then re-captures the span and inserts the chip. A paste into an empty draft is untouched — it already sits at a valid boundary.

  > The space **cannot** live inside the chip: at send time the chip's span is replaced by `serializeReference(ref)`, which returns the bare mention — a space carried there would vanish exactly when it is needed.

  This plugin's plain-text fallback had documented the same `(^|\s)` constraint since 0.1.x; the chip path simply did not carry it over. Control pair from one session: `测试插件@"pastes/…txt"` (glued) → plain text; `📄 20261003-053449397.txt` (alone) → file card. After the fix, `是 📄 20261003-053548488.txt`.

- **The paste size now survives a session switch.** dsh persists a session's composer draft as a **plain string** (`localStorage` → `dsh.conversation.session-<id>` → `{"draft":"…"}`) and re-seeds it as text on remount, so any atomic chip comes back as text. The chip's draft projection therefore now carries the size (`… @"pastes/x.txt" (1161 字符)`), which makes the degraded text as informative as the pre-0.2.0 form — and it still satisfies the whitespace boundary above. The model is unaffected: the send path replaces that span with the bare mention, so the request text is byte-identical to 0.2.0.

## Known upstream limitation (not fixed here)

- A chip **still de-grades to a text reference** when a session is switched away and back: dsh's draft mirror stores text only, and its chip-aware restore (`restoreDraft(draft, occurrences)`) never receives the `occurrences` from that mirror. This affects every atomic node, including dsh's own. A fix belongs upstream (carry occurrences in the mirror, or re-scan on remount).

## Engineering

- **Test suite: 100 checks.** The two new/updated guards were written **red first** (`100 tests, 2 fail`) and only then made green:
  - the chip payload must build its draft projection from the one token builder, **with** the size and **without** the boundary space — while `ref` stays the bare mention (`openReference` derives the path from it);
  - the insertion must check `needsBoundarySpace()`, repair it with `insertText(' ', …)`, and re-capture the span afterwards (the draft revision moved).
- Live-verified in an isolated profile: the draft projection (exactly what the send path concatenates) reads `…测试 @"pastes/20261003-053618884.txt" (1161 字符) ` — boundary and size in one read.
- Gate chain green: eslint 0 · prettier 0 · privacy PASS · metrics 0 over-limit · smoke.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste@next
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.2.0...v0.2.1
