// sync-client.mjs — put the web client bundle where super-injector expects it.
// src/client.js is already a self-contained __ModuleLoader__.load bundle
// (same shape as tsdown output), so build:client just copies it into lib/.
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src', 'client.js')
const dest = join(root, 'lib', 'client.js')

if (!existsSync(src)) {
  console.error('sync-client: src/client.js missing')
  process.exit(1)
}
mkdirSync(dirname(dest), { recursive: true })
cpSync(src, dest)
console.log('sync-client: src/client.js -> lib/client.js')
console.log('sync-client: done')