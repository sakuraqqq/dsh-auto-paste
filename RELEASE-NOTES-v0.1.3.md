# dsh-auto-paste v0.1.3

## Fixes

- **Support the new dsh 0.1.5 composer.** dsh 0.1.5 replaced the composer `<textarea>` with a Lexical `contenteditable` div. The paste listener matched on `tagName === 'TEXTAREA'` alone, so it returned early and large pastes silently stopped being saved — no file, no console output. Composer detection now keys on editable-ness plus the existing `data-phase` / `[data-input-scroll]` anchors, with a contenteditable insertion fallback.
  - Before: pasting 500+ characters did nothing at all.
  - After: the paste is written to `pastes/<timestamp>.txt` and a path reference lands in the composer.

## Dependencies

- Pinned every `@deepseek-ai/dsh-*` package to **`0.1.5-rc.1`** (exact, in both `peerDependencies` and `devDependencies`) so the plugin stays on the same line as the dsh runtime it targets. Mixing lines makes pnpm install two copies of the `@deepseek-ai/dsh-*` closure, which surfaces as confusing runtime errors.

## Engineering

- Added quality gates: ESLint + Prettier (`npm run lint`, `npm run format:check`), a complexity/metrics gate (`npm run metrics` — fails on over-limit functions), and a GitHub Actions CI workflow that runs the full gate chain.
- Added an npm **Trusted Publishing (OIDC)** release workflow: future versions publish from CI on a `v*` tag, with no long-lived tokens.
- Housekeeping: removed machine-specific absolute paths from tracked docs, and gitignored internal handoff docs so they stay local.

## Install

```bash
dsh plugin --profile <your-profile> add dsh-auto-paste
```

**Full diff:** https://github.com/sakuraqqq/dsh-auto-paste/compare/v0.1.2...v0.1.3
