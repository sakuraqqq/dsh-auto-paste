// sync-lib.mjs — align tsc dist output to the super-injector lib/ layout.
// The plugin is built with tsc -> dist/ (host index.js + client + typert.host),
// while dsh-super-injector's hot-assembly (dev_install_package / dev_inject_plugin)
// expects lib/. This script copies the host artifact into lib/ so both
// pipelines work: official `dsh plugin add` uses dist/ (package.json exports),
// super-injector uses lib/.
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const pairs = [
  ['dist/index.js', 'lib/index.js'],
  ['dist/typert.host.js', 'lib/typert.host.js'],
]

for (const [from, to] of pairs) {
  const src = join(root, from)
  if (!existsSync(src)) {
    console.error(`sync-lib: missing ${from} — run tsc build first (npm run build skips tsc if you call it directly)`)
    continue
  }
  const dest = join(root, to)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest)
  console.log(`sync-lib: ${from} -> ${to}`)
}
console.log('sync-lib: done')