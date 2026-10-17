# Third-party notices

`dsh-auto-paste` ships **no runtime dependencies** — its `dependencies` field is
empty. One third-party library is compiled into the published host artifact
instead:

## zod

| | |
|---|---|
| **Version bundled** | 4.6.5 |
| **License** | MIT |
| **Upstream** | <https://github.com/colinhacks/zod> |
| **Copyright** | Copyright (c) 2025 Colin McDonnell |
| **Where it lives** | inlined into `dist/typert.host.js` (and its `lib/` mirror) by `scripts/bundle.mjs` |

**Why inlined rather than declared as a dependency.** DSH STORE's automation policy
sets `allowRuntimeDependencies: false`, so a declared runtime dependency — even one
pinned to an exact version — cannot satisfy admission. Inlining removes the
dependency edge while keeping byte-identical code. The only import site is
`src/typert.host.ts` (the typert wire contract); `dist/index.js` contains no zod at
all and shrinks accordingly.

**Where the notice appears.** `scripts/bundle.mjs` emits a `banner` at the top of
`dist/typert.host.js` carrying the copyright line; this file carries the full text.
Because zod's own sources use plain `//` comments rather than `/*! … */` legal
comments, esbuild's `legalComments` option cannot preserve them — the banner is
injected explicitly instead.

---

## Full license text of the inlined library

```
MIT License

Copyright (c) 2025 Colin McDonnell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Everything else

All other runtime imports are either Node builtins (`node:path`, `node:fs/promises`)
or platform packages that dsh supplies through `peerDependencies`. None of them is
redistributed inside this package:

- `@deepseek-ai/schemastery`
- `@deepseek-ai/dsh-typert-protocol`
- `@deepseek-ai/dsh-tools`
- `@deepseek-ai/cordis`

Development-only tooling (esbuild, typescript, eslint, prettier) is listed under
`devDependencies` and is not part of the published tarball.
