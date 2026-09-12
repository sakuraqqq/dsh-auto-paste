# dsh-auto-paste v0.1.4

## Fixes

- **The ✕ button removes the reference again.** Removal went through `document.execCommand('delete')`, which on current Chrome empties the DOM text but fires only an `input` event — Lexical adopts edits through `beforeinput` alone, so it re-rendered the reference straight back and the button never actually removed anything (measured: textLen 53 → 0 → 53 inside that single command, not one `beforeinput`). The deletion is now handed to the editor as a `beforeinput` carrying the target range, the verdict is read one task later (the editor re-renders asynchronously), and when the hand-off does not take, the reference is left selected with the toast naming the key to press.
- **Editing a paste in the sidebar can now be saved.** `[查看]` opened the file by its workspace-relative path; the sidebar's file API stores that path verbatim and its write endpoint requires an absolute one (`requireAbsolute` → 400 `"… is not an absolute path"`), so the file could be read but never written back. The savePaste RPC result carries `absolutePath` again and the view button prefers it.
- **A failed save no longer promises more than it verified.** The fallback toast claimed the content was not lost without checking whether the text actually landed. It now reports what happened and points at the clipboard when the insertion did not take.
- **The capture bar belongs to the session that produced the paste.** Switching sessions used to leave the bar (and its `[查看]` button, which opened that other session's file) sitting over another session's composer.
- **`save_paste`'s output no longer carries the machine's absolute path** — it is `path` / `bytes` / `chars`. The absolute path stays on the RPC result, which only the browser half reads. The `chars` unit is documented as **UTF-16 code units** and frozen: reference lines already sitting in old messages show numbers computed that way.

## Engineering

- `npm run release` no longer publishes by itself. It commits the version bump, then tags, then pushes — in that order, so the tag always points at the bumped commit (`publish.yml` verifies `tag == package.json version`). Publishing is the OIDC workflow's job, and the script's closing step now hands over verification commands instead of failing on an async CI run.
- Hardening: paste files are written `0700`/`0600` on POSIX (Windows ignores the mode), `savePaste` validates its input type at runtime, `setMinChars(null)` unsets exactly its own settings field instead of resetting the whole namespace, and toast timers are cancelled on plugin unload.
- The smoke test walks **every** typert invocation instead of only the first, and both `smoke.mjs` and the test suite pin the wire contract (RPC result vs. model-facing tool output).
- Test suite: **70** checks.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.1.3...v0.1.4
