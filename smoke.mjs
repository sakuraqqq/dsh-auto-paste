// dsh-auto-paste self-test smoke — run from the plugin directory after build:
//   node smoke.mjs
// Covers: export surface, deterministic paste filename, a real write+readback
// roundtrip into a workspace-local temp dir, workspace resolution logic, and
// the hand-written Typert host manifest shape (what typert-loader validates).
import { apply, name, savePasteTo, pasteFilename, resolveWorkspaceDir } from './dist/index.js'
import { TYPERT } from './dist/typert.host.js'

const fail = (msg) => {
  console.error('SMOKE-FAIL:', msg)
  process.exit(1)
}

// 1. export surface
if (name !== 'dsh-auto-paste') fail('unexpected export name: ' + name)
if (typeof apply !== 'function') fail('apply is not a function')

// 2. deterministic Windows-safe filename (local-time components, ms suffix
// for collision-safety — same-second pastes must not collide)
const testNow = new Date(2026, 7, 15, 10, 30, 0)
const fn = pasteFilename(testNow)
console.log('pasteFilename:', fn)
if (!/^\d{8}-\d{9}\.txt$/.test(fn) || fn !== '20260815-103000000.txt') fail('unexpected filename ' + fn)

// 3. real write + readback roundtrip (workspace-local temp dir)
const os = await import('node:os')
const path = await import('node:path')
const fs = await import('node:fs/promises')
const dir = await fs.mkdtemp(path.join(process.cwd(), '..', '.smoke-'))
try {
  const result = await savePasteTo(dir, 'hello paste\n第二行', testNow)
  console.log('savePasteTo ->', JSON.stringify(result))
  if (result.path !== 'pastes/20260815-103000000.txt') fail('unexpected relative path ' + result.path)
  const readBack = await fs.readFile(result.absolutePath, 'utf8')
  if (readBack !== 'hello paste\n第二行') fail('roundtrip content mismatch')
  console.log('roundtrip OK (bytes=' + result.bytes + ', chars=' + result.chars + ')')
} finally {
  await fs.rm(dir, { recursive: true, force: true })
}

// 4. workspace resolution: session-owned workspace, then first-workspace fallback
const fakeCtx = {
  get(key) {
    if (key === 'workspaceRegistry') {
      return { list: () => [{ path: '/ws/a', sessionIds: ['s1', 's2'] }, { path: '/ws/b', sessionIds: ['s3'] }] }
    }
    return undefined
  },
}
if (resolveWorkspaceDir(fakeCtx, 's3') !== '/ws/b') fail('session workspace resolution wrong')
if (resolveWorkspaceDir(fakeCtx, 'missing') !== '/ws/a') fail('fallback resolution wrong')
if (resolveWorkspaceDir(fakeCtx) !== '/ws/a') fail('no-session fallback wrong')
if (resolveWorkspaceDir({ get: () => undefined }, 's1') !== undefined) fail('no registry must yield undefined')
console.log('resolveWorkspaceDir OK')

// 5. Typert host manifest shape (mirrors typert-loader validation)
if (TYPERT.package !== 'dsh-auto-paste' || TYPERT.face !== 'host') fail('TYPERT identity wrong')
if (!Array.isArray(TYPERT.schemas) || !Array.isArray(TYPERT.invocations)) fail('TYPERT arrays wrong')
if (typeof TYPERT.model !== 'object' || TYPERT.model === null) fail('TYPERT model missing')
const inv = TYPERT.invocations[0]
if (!inv || inv.service !== 'pasteStore' || inv.namespace !== 'pasteStore' || inv.method !== 'savePaste') fail('invocation wrong')
if (inv.invocation.kind !== 'direct') fail('receiver kind wrong')
for (const p of inv.parameters) {
  if (p.source !== 'json') fail('parameter source wrong')
  if (!(p.codec.mode === 'strict' && '_zod' in p.codec.schema && typeof p.codec.schema.parse === 'function')) fail('param codec not strict zod')
}
if (!(inv.result.mode === 'strict' && '_zod' in inv.result.schema && typeof inv.result.schema.parse === 'function')) fail('result codec not strict zod')
const parsed = inv.result.schema.parse({ path: 'p', absolutePath: 'a', bytes: 1, chars: 2 })
console.log('result schema parse ->', JSON.stringify(parsed))
console.log('typert manifest OK')

console.log('SMOKE-OK')
