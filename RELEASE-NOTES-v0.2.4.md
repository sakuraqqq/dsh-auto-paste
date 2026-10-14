# dsh-auto-paste v0.2.4

Ten defects surfaced by an independent review, fixed red-first — each one was reproduced by a failing example **before** any code changed.

## Client half

| # | What was wrong | What it is now |
|---|---|---|
| **D1** | The outer `.catch` wrapped the whole save chain. A throw from the toast or the one-shot hint — *after* the chip had already been inserted — fell into "we lost your paste" and re-inserted the raw text: **the chip plus the entire chunk in the composer at once**, which is the exact shape this plugin exists to prevent. | A flag marks the point where the paste is already on disk. Past it, a UI failure is reported as a UI failure instead of being "recovered" wrongly. |
| **D2** | `serializeReference` had no timeout, while the two other RPCs in the same file both do. The caller has already called `preventDefault` by then, so a serializer that never settles left **no chip, no text and no message** — the paste looked lost even though the file was written. | Bounded, like its two neighbours. |
| **D3** | `composerInsertion` answered `null` five different ways in total silence, so a chip that quietly stopped working left nothing to debug with. | One one-shot warning naming the reason. The `null` contract is unchanged, so behaviour is identical — only the diagnosis is new. |

## Host half

| # | What was wrong | What it is now |
|---|---|---|
| **HD4** | `minCharsSource` was permanently `'deployment'`. The plugin read the user layer back through `settings.get()` only — and the 0.1.7+ settings service has no `get` at all. So a saved preference was invisible to the plugin: the row's **"reset to default" button could never render**, and its copy kept saying the value came from the deployment — including immediately after a successful save. | Both read paths are probed: `get` where it exists, and `describe().user` on the lines that project settings out of each plugin's own Config. `canConfigure` now requires a **readable** layer, not merely a writable one. |
| **HD5** | The wire contract had degraded to `z.string()`, which let the `'user' \| 'deployment'` union evaporate at exactly the boundary. | Narrowed to an enum, so a typo in the client's comparison can no longer compile past the wire. |
| **HD6** | The `save_paste` tool handed its boot-time `maxBytes` snapshot to the writer, while the service re-reads the config on every call — and the comment claimed only the service path mattered. | The tool re-reads too, so both halves enforce the same ceiling. |
| **HD7** | `savePaste` documents that a direct caller can hand it anything and it will refuse — but only `text` was guarded. `sessionId` is what decides **which workspace a paste lands in**. | Guarded on the same terms. |
| **HD8** | The same-second collision retry loop was unbounded, so a directory full of squatters turned a paste into a hang rather than an error. | Bounded, with a real error past the cap. |
| **HD9** | `isRegisteredWorkspace` compared raw spellings, so `ws/./x` was refused as "not registered". | Paths are normalised first — a pure string operation, no filesystem hit, and symlinks are deliberately left alone. |

One more line changed in `tools/privacy-gate.mjs`: a comment explaining which patterns that scanner deliberately ignores restated those patterns verbatim. DSH STORE runs its own regular expressions over source text **without stripping comments**, so on the next rescan that line would have matched a permissions signal. The reasoning is kept; the literal strings are not.

## Guards

The reviewer's ten red examples now live in `tests/release.test.js` as a red-first block — they were first run **red** against the previous release (3 failing, then 7 more), and the suite is now **117 checks**.

**HD4b is a behavioural probe rather than a text assertion**: it imports the built host and hands `readSettings` a service shaped the way 0.1.7+ actually is — no `get`, but a working `describe` — then asserts the user layer comes back. It skips when the build is absent instead of passing silently.

Three existing assertions pinned the very shapes that had to change, and were updated **in place** rather than bypassed. The new read path additionally got its own "probe before you call" assertion, so the discipline that protects the old path covers the new one too.

## Verification

```
tests        117 total · 111 pass · 6 fail
```

The 6 are `spawnSync`-based and fail **only** inside a restricted agent sandbox that forbids child pipes; a pristine-HEAD worktree produces the identical 6, so they are environmental rather than regressions. On a normal terminal they pass.

```
lint        0 errors
prettier    All matched files use Prettier code style
metrics     5 files · 107 functions · 0 over limit
privacy     PASS — no identity, history or package finding
```

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste@0.2.4
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.2.3...v0.2.4
