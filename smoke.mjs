// dsh-auto-paste self-test smoke — run from the plugin directory after build:
//   node smoke.mjs
// Covers: export surface, deterministic paste filename, a real write+readback
// roundtrip into an OS temp dir, workspace resolution logic, and the hand-written
// Typert host manifest shape (what typert-loader validates) for EVERY invocation.
import { tmpdir } from 'node:os'
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
if (!/^\d{8}-\d{9}\.txt$/.test(fn) || fn !== '20260815-103000000.txt')
  fail('unexpected filename ' + fn)

// 3. real write + readback roundtrip (OS temp dir — never inside the plugin tree)
const path = await import('node:path')
const fs = await import('node:fs/promises')
const dir = await fs.mkdtemp(path.join(tmpdir(), 'dsh-auto-paste-smoke-'))
try {
  const result = await savePasteTo(dir, 'hello paste\n第二行', testNow)
  console.log('savePasteTo ->', JSON.stringify(result))
  if (result.path !== 'pastes/20260815-103000000.txt')
    fail('unexpected relative path ' + result.path)
  const readBack = await fs.readFile(result.absolutePath, 'utf8')
  if (readBack !== 'hello paste\n第二行') fail('roundtrip content mismatch')
  console.log('roundtrip OK (bytes=' + result.bytes + ', chars=' + result.chars + ')')
} finally {
  await fs.rm(dir, { recursive: true, force: true })
}

// 4. workspace resolution: STRICT — an unknown or ambiguous session is refused
// outright; the plugin never silently routes a paste into another workspace.
const fakeCtx = {
  get(key) {
    if (key === 'workspaceRegistry') {
      return {
        list: () => [
          { path: '/ws/a', sessionIds: ['s1', 's2'] },
          { path: '/ws/b', sessionIds: ['s3'] },
        ],
      }
    }
    return undefined
  },
}
const refuses = (fn, label) => {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error && /refusing to save/.test(error.message)) return
    fail(`${label}: unexpected error — ${error}`)
  }
  fail(`${label}: expected a refusal, got a silent fallback`)
}
if (resolveWorkspaceDir(fakeCtx, 's3') !== '/ws/b') fail('session workspace resolution wrong')
if (resolveWorkspaceDir(fakeCtx, 's1') !== '/ws/a') fail('second workspace owner resolution wrong')
refuses(() => resolveWorkspaceDir(fakeCtx, 'missing'), 'unknown session')
refuses(() => resolveWorkspaceDir(fakeCtx), 'ambiguous call without a session id')
const soloCtx = { get: () => ({ list: () => [{ path: '/ws/only', sessionIds: [] }] }) }
if (resolveWorkspaceDir(soloCtx) !== '/ws/only')
  fail('single-workspace no-session resolution wrong')
if (resolveWorkspaceDir({ get: () => undefined }, 's1') !== undefined)
  fail('no registry must yield undefined')
console.log('resolveWorkspaceDir OK (strict)')

// 5. Typert host manifest shape (mirrors typert-loader validation).
// EVERY invocation is walked: checking only invocations[0] would have shipped a
// broken getConfig/setMinChars descriptor unnoticed.
if (TYPERT.package !== 'dsh-auto-paste' || TYPERT.face !== 'host') fail('TYPERT identity wrong')
if (!Array.isArray(TYPERT.schemas) || !Array.isArray(TYPERT.invocations))
  fail('TYPERT arrays wrong')
if (typeof TYPERT.model !== 'object' || TYPERT.model === null) fail('TYPERT model missing')
if (TYPERT.invocations.length === 0) fail('TYPERT declares no invocations')
// The methods the client and the tools actually call — a missing one is a runtime
// failure in the browser, and an extra one is a descriptor nobody asked for.
const EXPECTED_METHODS = ['savePaste', 'getConfig', 'setMinChars']
const seen = []
for (const inv of TYPERT.invocations) {
  if (!inv || inv.service !== 'pasteStore' || inv.namespace !== 'pasteStore')
    fail(`invocation ${inv?.method}: unexpected service/namespace`)
  if (typeof inv.method !== 'string' || inv.method.length === 0) fail('invocation without a method')
  if (!String(inv.id ?? '').startsWith('dsh-auto-paste#')) fail(`invocation ${inv.method}: bad id`)
  if (inv.invocation?.kind !== 'direct') fail(`invocation ${inv.method}: receiver kind wrong`)
  if (!Array.isArray(inv.parameters)) fail(`invocation ${inv.method}: parameters must be an array`)
  for (const p of inv.parameters) {
    if (p.source !== 'json') fail(`invocation ${inv.method}: parameter source wrong`)
    if (!(
      p.codec.mode === 'strict' &&
      '_zod' in p.codec.schema &&
      typeof p.codec.schema.parse === 'function'
    ))
      fail(`invocation ${inv.method}: param codec not strict zod`)
  }
  if (!(
    inv.result.mode === 'strict' &&
    '_zod' in inv.result.schema &&
    typeof inv.result.schema.parse === 'function'
  ))
    fail(`invocation ${inv.method}: result codec not strict zod`)
  seen.push(inv.method)
}
for (const method of EXPECTED_METHODS) {
  if (!seen.includes(method)) fail(`manifest is missing the ${method} invocation`)
}
if (seen.length !== EXPECTED_METHODS.length) fail(`unexpected invocation set: ${seen.join(', ')}`)
const savePasteInvocation = TYPERT.invocations.find((inv) => inv.method === 'savePaste')
const parsed = savePasteInvocation.result.schema.parse({
  path: 'p',
  absolutePath: 'a',
  bytes: 1,
  chars: 2,
})
console.log('result schema parse ->', JSON.stringify(parsed))
console.log(`typert manifest OK (${seen.length} invocations: ${seen.join(', ')})`)

console.log('SMOKE-OK')
