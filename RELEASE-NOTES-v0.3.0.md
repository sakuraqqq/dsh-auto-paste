# dsh-auto-paste v0.3.0

Two review findings fixed, and the plugin now ships **zero runtime dependencies** — which is what DSH STORE's admission policy requires.

## Why a minor bump

The dependency shape changed (no `dependencies` at all; artifacts are now single-file bundles) and two behaviour fixes landed. Under 0.x semantics that is a minor.

## What changed

### R1 — the settings row was read-only on the dsh 0.1.5 line

0.2.4 fixed the settings round-trip but, in doing so, ANDed `.volatile` into the overall read capability. `.volatile()` does not exist on dsh 0.1.5 (schemastery 3.18.2), so `canConfigure()` returned `false` there and the row silently degraded to read-only — while `package.json` still declared `^0.1.5-rc.1`.

The two lines close the loop differently, and the check now says so:

```ts
if (typeof settings.get === 'function') return true                      // 0.1.5: get + update alone
return typeof settings.describe === 'function' && schemaVolatileCapable  // 0.1.7+: both required
```

### R2 — the serialization timeout trusted the callee

0.2.4 bounded the await with an `AbortController`. But `abort()` only *notifies*: a callee that ignores the signal leaves the promise pending forever, and by then the caller has already called `preventDefault` — so the user gets no chip, no text and no message while the file is already on disk. The bound is now owned by this side:

```js
await Promise.race([controller?.serializeReference?.(…, bounds.signal), expired])
```

`abort` stays for cooperative cancellation, but it is no longer the only defence.

**Both guards were rewritten to assert the property, not the spelling.** The D2 guard previously accepted any of `Promise.race` / a `setTimeout`+`abort` / the timeout constant — which is exactly why an abort-only implementation passed it. It now demands `Promise.race` *and* forbids a bare `await serializeReference(…)`. The `canConfigure` guard now asserts that `.volatile` may only ever guard the `describe()` path.

### Runtime dependencies: now zero

`zod` is removed from `dependencies` and compiled into `dist/typert.host.js` by `scripts/bundle.mjs` (esbuild); it stays in `devDependencies` for the build.

Why inline rather than pin: DSH STORE's automation policy carries `allowRuntimeDependencies: false`, and all **27** already-approved catalog entries declare no `dependencies` at all. Pinning an exact version does not help — the objection is to the dependency *edge*, not to the range.

```
dist/index.js        17,337 B   (was 30,827 — shrinks: no zod, tree-shaken)
dist/typert.host.js 547,016 B   (was  5,369 — zod inlined)
```

Platform packages stay external (`@deepseek-ai/*`) because dsh supplies them through `peerDependencies`. `THIRD_PARTY_NOTICES.md` carries zod's full MIT text, and the bundle emits a `banner` with the copyright line — esbuild's `legalComments` cannot preserve zod's own notice, because its sources use plain `//` comments rather than `/*! … */` legal comments.

### Compatibility

`dsh.compatibility.dshReleases` now records **`0.2.1-alpha.5: compatible`**, measured in a disposable profile on the real runtime — install, boot and uninstall all evidenced.

The `dsh` peer range is **unchanged** (`^0.1.5-rc.1 || ^0.2.0-rc.2`): dsh validates peers with `includePrerelease`, so `^0.2.0-rc.2` already covers the `0.2.1-alpha.*` line. (This release corrects an earlier assumption of mine that it would not.)

## Verification

```
tests      117 total · 111 pass · 6 fail
```

The 6 are `spawnSync`-based and fail **only** in a restricted agent sandbox that forbids child pipes; they fail identically on the previous release's commit.

```
lint       0 errors
prettier   All matched files use Prettier code style
metrics    6 files · 108 functions · 0 over limit
privacy    PASS — no identity, history or package finding (11 files ship)
```

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste@0.3.0
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.2.4...v0.3.0
