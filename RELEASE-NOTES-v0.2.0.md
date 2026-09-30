# dsh-auto-paste v0.2.0

A large paste now lands in the composer as **dsh's own atomic reference chip** — a filename with its size, removed with one key, clicked to open the file — and the floating capture bar is gone. The model still receives the same bare mention it always did.

## New

- **The composer gets an atomic reference chip instead of a line of text.**
  Pasting above the threshold inserts dsh's `reference-chip` node (the same node dsh's attachments use) showing `📄 20260815-103000.txt · 1234 字符`:

  - **one key removes it** — the node is a Lexical decorator with `contenteditable="false"` and `isKeyboardSelectable() === false`, so Backspace/Delete take the whole chip, and there is no partial-deletion state to get stuck in;
  - **clicking opens the file** in the right Sidebar — dsh routes the click itself (official read-only preview, or `dsh-better-sidebar`'s editor when that plugin claims the address);
  - **the model text is unchanged**: the chip serializes to the same `@"pastes/20260815-103000.txt"` mention as before, so `dsh-file-reference`'s "this grammar adds no request tokens" property still holds and the model still reads the file rather than receiving 60 KB of text.

  The size rides in the chip's **display** field only, never inside the mention: `openReference` derives the path from the mention (`ref.slice(2, -1)` for the quoted form), so a size inside it would be read as part of the path and the click would open nothing.

- **Insertion goes through dsh's public input facade**, not a private editor hook: `ctx.get('conversation').input.for(actx).insertReference(reference, span)` with the revision-guarded span from the slot's `inputActions.captureInsertion()`. Verified against **dsh 0.1.7-rc.2** and against the desktop **0.2.x** bundle, which ships the identical implementation.

- **Every capability is probed before use.** The load-bearing probe is the reference source's serializer: a chip whose source has no registered serializer makes the message *unsendable* (`no serializer for reference source`), which is far worse than a plain-text reference. Missing facade, stale session, refused edit or a thrown error all fall back to the text form.

## Changed

- **The capture bar (pill) is removed**, together with everything that existed only to serve it: the capture snapshot store, the composer-scan removal path (`beforeinput` hand-off included), the view action, its CSS, and the composer `input` listener.
  - The plugin **no longer calls `dsh-better-sidebar`'s file API at all**. Presence detection stays (`ctx.inject(['betterSidebar'])`), because it drives the one-shot hint and the Settings → General status row.
- **The one-shot hint moved onto the chip.** Its copy is now `没装 dsh-better-sidebar（官方侧栏能看，装了能直接编辑）`, and it is raised when a paste first lands as a chip (still shown once, still dismissible, still remembered).

- ⚠️ **Known upstream limitation, documented in the README**: `dsh-better-sidebar`'s editor saves a file using the **workspace-relative** spelling it was given, while its write route requires an absolute path — so saving from a chip-opened editor answers `400 "…" is not an absolute path`. That is upstream [omdsh-dev/DSH-better-sidebar#646](https://github.com/omdsh-dev/DSH-better-sidebar/issues/646) and it affects any session-scoped file address, including dsh's own `@file` picks. Until it is fixed, open the file from better-sidebar's own file tree (that route resolves to an absolute path) to save. The previous pill offered a second route that passed an absolute path; with the pill gone, that workaround is no longer part of this plugin.

## Engineering

- `dist/client.js` is emitted by `tsc` from `src/client.js` (the `tsconfig.json` `allowJs` + `outDir: dist` path); `sync-client` writes `lib/` only. Both copies are committed, as CI requires.
- **Test suite: 99 checks.** Five new ones lock the shapes a naive writer breaks, and all five were **mutation-verified** — each goes red when the host is changed to normalize CRLF, to prepend a BOM, or to write `latin1`:
  - CRLF survives verbatim (every CR *and* LF is counted on disk);
  - a single 60 KB line with no line break anywhere survives intact;
  - leading / consecutive / trailing blank lines survive;
  - the writer adds no BOM — and a `U+FEFF` the *user pasted* is preserved as content;
  - the bytes on disk are exactly `Buffer.from(text, 'utf8')`, with no `U+FFFD` — i.e. the file is never a code-page (GBK/CP936) spelling.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.1.6...v0.2.0
