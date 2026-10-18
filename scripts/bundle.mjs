// scripts/bundle.mjs — inline third-party runtime code into dist/, so the published
// plugin declares ZERO runtime dependencies.
//
// Why: DSH STORE's automation policy carries `allowRuntimeDependencies: false`, and
// all 27 approved catalog entries declare no `dependencies` at all. A `zod`
// dependency — even pinned to an exact version — cannot satisfy that policy, because
// the objection is to the dependency itself, not to its version range.
//
// What stays external: everything dsh itself provides via peerDependencies
// (`@deepseek-ai/*`), plus Node builtins (platform: 'node' handles those).
// What gets inlined: zod, the only third-party import in the host half.
//
// `legalComments: 'eof'` is deliberate: the inlined MIT code must keep its
// copyright notice (license requirement), not be swallowed by the bundler.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Inlined MIT code must keep its copyright notice. esbuild's `legalComments` only
// preserves /*! … */ and @license banners, and zod's sources use plain // comments,
// so the notice is injected explicitly instead. Applies to the artifact that
// actually carries zod (dist/typert.host.js), not to the one that does not.
//
// ⚠️ The version is READ from the installed package, never hand-written. 0.3.0 stated
// 4.6.5 by hand while the bundle actually contained 4.4.3. A banner generated from the
// same file the bundler reads cannot drift from the bundle.
const ZOD_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', 'zod', 'package.json'), 'utf8')).version
  } catch {
    return null
  }
})()

const ZOD_BANNER = `/*! dsh-auto-paste bundles zod${ZOD_VERSION ? ' ' + ZOD_VERSION : ' (version unresolved at build time)'} (https://github.com/colinhacks/zod) — Copyright (c) 2025 Colin McDonnell, MIT License.
 *  Inlined by scripts/bundle.mjs so that this package declares no runtime dependencies.
 *  The version above is read from node_modules/zod/package.json at build time, never hand-written.
 *  Full license text: node_modules/zod/LICENSE and THIRD_PARTY_NOTICES.md. */`

const shared = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // dsh supplies these at runtime through peerDependencies — never inline them.
  external: ['@deepseek-ai/*'],
  // Keep any third-party copyright headers that ARE in legal-comment form.
  legalComments: 'eof',
  sourcemap: false,
  logLevel: 'warning',
}

const targets = [
  ['src/index.ts', 'dist/index.js', false],
  ['src/typert.host.ts', 'dist/typert.host.js', true],
]

for (const [entry, outfile, carriesZod] of targets) {
  await build({
    ...shared,
    entryPoints: [entry],
    outfile,
    ...(carriesZod ? { banner: { js: ZOD_BANNER } } : {}),
  })
  console.log(`bundle: ${entry} -> ${outfile}${carriesZod ? '  (+ zod notice)' : ''}`)
}
console.log('bundle: done')
