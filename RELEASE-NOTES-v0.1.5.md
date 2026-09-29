# dsh-auto-paste v0.1.5

One package now runs on **both** dsh lines — `0.1.5-rc.x` and `0.1.7-rc.x`. Four separate 0.1.7 incompatibilities are fixed; the 0.1.5 behaviour is unchanged, and each fix is a capability probe rather than a version check.

## Fixes

- **0.1.7: the plugin could take the official workspace UI down with it.** 0.1.7's typert loader rejects a strict codec that has no `create()` factory. Typert definitions are committed and withdrawn per owner, so a contributor that fails to register leaves the whole batch incomplete — the official workspace remotes (workspace list and directory picker) stopped resolving, which surfaces as "my sessions disappeared": the sessions were intact, the UI just could not enumerate workspaces. All six codecs are now built by one helper that always supplies `create`.
- **0.1.7: a large paste was silently a no-op.** The paste listener read the session from `sessions.list.getSnapshot().current`. 0.1.7 moved the selection out of `ClientSessions` and deleted that field, so the read answered `undefined`, the handler returned **before** `preventDefault()`, and the browser pasted the raw text — no file, no toast, and nothing in the console. The session now resolves through one helper that prefers the 0.1.5 snapshot and falls back to the identity every `scope: session` slot component is handed (`SessionStandardProps.sessionId`; this plugin's bar lives in `conversation.input.overlay`, which is exactly such a slot).
- **0.1.7: the settings row broke the whole config path.** 0.1.7's `SettingsForms` keeps the service but drops `get` and `register`. The unguarded `this.settings()?.get(ns)` threw `this.settings(...)?.get is not a function`, which failed `getConfig` and left the threshold on the built-in fallback. Reads now go through one guarded helper and `register` sits behind a `typeof` probe.
- **0.1.7: `minChars` could not be edited.** 0.1.7 projects a settings form out of each plugin's **own Config** and exposes only fields marked volatile — a plugin without one gets no generated form and its write is refused. This plugin declared no Config at all. It now declares one with `minChars` volatile, and the host reads the field live (a volatile field arrives as a box: `config.x.get()`), so a saved value applies without a restart.
  - Compatibility note: `.volatile()` exists **only** on the 0.1.7 line — dsh 0.1.5 ships schemastery 3.18.2, whose whole package contains no such method — so the field is wrapped only behind a capability probe. Calling it unconditionally would throw while the module loads and take the plugin down on 0.1.5.

## New

- **Tells you once when the sidebar integration is missing.** With no `dsh-better-sidebar` installed, the capture bar explains what the integration adds (in-place editing, not merely viewing — dsh's built-in file panel already browses `pastes/`, it just cannot change anything), and a read-only 「侧栏集成」 row in **Settings → General** keeps saying so until the sidebar appears. Shown once and remembered.

## Engineering

- The session identity comes from slot props instead of a list field a version removed; `canConfigure` is re-specified to require a working **write path** (`update`, plus either `get` on 0.1.5 or a volatile field on 0.1.7) rather than a read-back channel alone.
- `dist/client.js` is produced by `tsc` from `src/client.js`; `sync-client` only writes `lib/`. Both are committed, as CI requires.
- Test suite: **88** checks. Every assertion added in this release was contrast-red verified — run against `git show HEAD:<file>` — keeping only the ones that fail before the fix and pass after it.
- README and the `cordis.patch.yml` comment now state where an override is stored on each line, instead of claiming a settings document that 0.1.7 no longer uses.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.1.4...v0.1.5
