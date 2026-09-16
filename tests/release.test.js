// dsh-auto-paste — release test suite (node:test, zero deps).
// Run: pnpm test  (build first: pnpm run build)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  pasteFilename,
  savePasteTo,
  resolveWorkspaceDir,
  isRegisteredWorkspace,
  assertPasteSize,
  sanitizeLabel,
  resolveMaxBytes,
  resolveMinChars,
  effectiveMinChars,
  PasteSettingsSchema,
  PASTE_SETTINGS_NAMESPACE,
  MIN_CHARS_FIELD,
  MAX_PASTE_BYTES,
  MAX_PASTE_BYTES_CAP,
  MIN_CHARS_DEFAULT,
} from '../dist/index.js'

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

async function tmpDir() {
  return mkdtemp(join(tmpdir(), 'dsh-auto-paste-test-'))
}

describe('pasteFilename — same-second collision regression', () => {
  test('two calls within the same second produce different names (ms resolution)', async () => {
    const a = pasteFilename()
    await new Promise((r) => setTimeout(r, 5))
    const b = pasteFilename()
    assert.notEqual(a, b)
  })

  test('name format carries milliseconds: YYYYMMDD-HHMMSSmmm.txt', () => {
    const now = new Date(2026, 7, 15, 20, 30, 6, 123)
    assert.match(pasteFilename(now), /^\d{8}-\d{6}\d{3}\.txt$/)
  })

  test('savePasteTo twice with the SAME timestamp never overwrites (collision guard)', async () => {
    const dir = await tmpDir()
    try {
      const now = new Date(2026, 7, 15, 20, 30, 6, 123)
      const r1 = await savePasteTo(dir, 'first paste', now)
      const r2 = await savePasteTo(dir, 'second paste', now)
      assert.notEqual(r1.path, r2.path)
      assert.equal(await readFile(join(dir, r1.path), 'utf8'), 'first paste')
      assert.equal(await readFile(join(dir, r2.path), 'utf8'), 'second paste')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('savePasteTo — write/read-back roundtrip', () => {
  test('unicode + newlines survive verbatim; result stats are accurate', async () => {
    const dir = await tmpDir()
    try {
      const text = '第一行\n第二行 emoji 🎉 中文'
      const result = await savePasteTo(dir, text, new Date(2026, 7, 15, 21, 0, 0, 0))
      assert.equal(result.path, 'pastes/20260815-210000000.txt')
      assert.equal(result.chars, text.length)
      assert.equal(result.bytes, Buffer.byteLength(text, 'utf8'))
      assert.equal(await readFile(join(dir, result.path), 'utf8'), text)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveWorkspaceDir — strict session→workspace routing (no silent fallback)', () => {
  const ctxWith = (workspaces) => ({
    get(name) {
      return name === 'workspaceRegistry' ? { list: () => workspaces } : undefined
    },
  })
  const wsA = { path: 'C:/ws-a', sessionIds: ['s1', 's2'] }
  const wsB = { path: 'C:/ws-b', sessionIds: ['s3'] }

  test('a session owned by a workspace resolves to its path', () => {
    assert.equal(resolveWorkspaceDir(ctxWith([wsA, wsB]), 's3'), 'C:/ws-b')
  })

  test('an unknown session is REFUSED instead of silently falling back', () => {
    assert.throws(
      () => resolveWorkspaceDir(ctxWith([wsA, wsB]), 'nobody'),
      (err) => err instanceof Error && /refusing to save/i.test(err.message),
    )
  })

  test('the refusal names the session, lists every registered workspace, and says how to fix it', () => {
    try {
      resolveWorkspaceDir(ctxWith([wsA, wsB]), 'nobody')
      assert.fail('expected an unknown session to be refused')
    } catch (err) {
      assert.match(err.message, /nobody/) // why: which session was involved
      assert.match(err.message, /C:\/ws-a/) // what exists
      assert.match(err.message, /C:\/ws-b/)
      assert.match(err.message, /How to fix/i) // how to recover
    }
  })

  test('a single workspace with no session id is unambiguous and resolves', () => {
    assert.equal(resolveWorkspaceDir(ctxWith([wsA])), 'C:/ws-a')
  })

  test('several workspaces with no session id are ambiguous → refused', () => {
    assert.throws(
      () => resolveWorkspaceDir(ctxWith([wsA, wsB])),
      (err) => err instanceof Error && /refusing to save/i.test(err.message),
    )
  })

  test('no workspaces → undefined; no registry → undefined (caller reports it)', () => {
    assert.equal(resolveWorkspaceDir(ctxWith([]), 's1'), undefined)
    assert.equal(resolveWorkspaceDir({ get: () => undefined }, 's1'), undefined)
  })
})

describe('savePasteTo — failure is loud, never swallowed', () => {
  test('write failure rejects with an error carrying a message', async () => {
    const dir = await tmpDir()
    try {
      // Block the pastes/ dir with a regular file so mkdir fails.
      await writeFile(join(dir, 'pastes'), 'i am a file, not a directory', 'utf8')
      await assert.rejects(
        () => savePasteTo(dir, 'boom', new Date(2026, 7, 15, 21, 0, 0, 0)),
        (err) => err instanceof Error && typeof err.message === 'string' && err.message.length > 0,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('static regression guards — past bugs must not resurrect', () => {
  test('package.json declares dsh.client.inject [sessions, connection]', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    assert.deepEqual(pkg.dsh.client.inject, ['sessions', 'connection'])
  })

  test('package.json peer-depends on @deepseek-ai/dsh-typert-protocol', () => {
    const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
    assert.ok(pkg.peerDependencies['@deepseek-ai/dsh-typert-protocol'])
  })

  test('src/index.ts PasteStoreService extends TypertRemoteService', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'index.ts'), 'utf8')
    assert.match(src, /class PasteStoreService extends TypertRemoteService/)
  })

  test('src/client.js composer detection covers textarea AND the Lexical contenteditable composer', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('function isComposerTarget')
    assert.ok(start >= 0, 'isComposerTarget must exist in src/client.js')
    const body = src.slice(start, start + 400)
    assert.match(body, /TEXTAREA/, 'legacy <textarea> composer must still match')
    assert.match(body, /isContentEditable/, 'dsh >= 0.1.5 contenteditable composer must match')
  })

  test('src/client.js mounts a toast into dsh own composer-card overlay seat', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    assert.match(
      src,
      /factory:\s*\(require\)/,
      'the self-contained bundle needs the shared require',
    )
    assert.match(src, /require\('react'\)/, 'react is the platform seed word used to render')
    assert.match(
      src,
      /slots\.inject\('conversation\.input\.overlay'/,
      "the toast must register into dsh's own composer-card overlay seat (the seat its shipped input-bar toast points at), not a self-invented position",
    )
    assert.match(
      src,
      /id:\s*PACKAGE/,
      'the overlay entry keeps its own id (additive, never replacing)',
    )
  })

  test('the client takes minChars from the host, never from a local copy', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    // dsh never hands a client bundle the loader row config: `dsh.client`
    // accepts only platform/inject/external/immediately, and the boot graph
    // carries no config at all (dsh-client-modules/lib/index.js). So the
    // browser half must ask the host — reading a local config is dead code
    // that would silently pin whatever default we shipped.
    assert.match(
      src,
      /pasteStore\/getConfig/,
      'the client must fetch the effective value from the host over the existing RPC',
    )
    assert.doesNotMatch(
      src,
      /config\.minChars/,
      'the client receives no config object — its threshold must come from the host',
    )
    assert.match(
      src,
      /DEFAULT_MIN_CHARS/,
      'a documented fallback must remain for the case where the config RPC fails',
    )
  })

  test('the host owns minChars: exported resolver + interpolated tool description', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'index.ts'), 'utf8')
    assert.match(
      src,
      /export function resolveMinChars\(/,
      'resolveMinChars must be exported (unit-tested directly)',
    )
    assert.doesNotMatch(
      src,
      /roughly 500\+ characters/,
      'the tool description must not hardcode a third copy of the threshold',
    )
    assert.match(
      src,
      /roughly \$\{minChars\}\+ characters/,
      'the tool description must state the EFFECTIVE threshold',
    )
  })

  test('src/typert.host.ts declares the pasteStore/getConfig invocation', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'typert.host.ts'), 'utf8')
    assert.match(src, /id: 'dsh-auto-paste#pasteStore\/getConfig'/)
    assert.match(src, /method: 'getConfig'/)
    assert.match(src, /minChars: z\.number\(\)/)
    assert.match(
      src,
      /minCharsSource: z\.string\(\)/,
      'getConfig must report where the effective value came from',
    )
    assert.match(
      src,
      /canConfigure: z\.boolean\(\)/,
      'getConfig must report whether the preference can be stored at all',
    )
  })

  test('the client contributes a General settings row that writes through the host', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    assert.match(
      src,
      /slots\.inject\('settings\.general\.item'/,
      "dsh's own seat for a single setting that needs no page of its own",
    )
    assert.match(
      src,
      /pasteStore\/setMinChars/,
      'the row persists through the host — the browser cannot touch the settings document',
    )
  })

  test('src/typert.host.ts declares the pasteStore/setMinChars invocation', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'typert.host.ts'), 'utf8')
    assert.match(src, /id: 'dsh-auto-paste#pasteStore\/setMinChars'/)
    assert.match(src, /method: 'setMinChars'/)
  })

  test('the capture bar sits in a seat dsh actually paints, and reuses betterSidebar', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    // Seat choice is evidence-driven: conversation.composer.dock laid the pill out
    // (probe: rect 333x24, real box) inside a class-less wrapper the host never
    // paints, so the bar moved into the composer overlay anchor — the very strip
    // the shipped input-bar toast visibly uses.
    assert.match(
      src,
      /slots\.inject\('conversation\.input\.overlay'/,
      'the bar shares the proven-visible composer overlay seat',
    )
    assert.match(
      src,
      /features\.includes\('openFile'\)/,
      'the openFile capability must be probed before use (the documented gate)',
    )
    assert.match(src, /\.openFile\(/, 'viewing a paste is one betterSidebar call')
  })

  test('the reference string has ONE source, used by both insert and remove', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    assert.match(src, /function pasteReference\(/, 'the reference builder must be a named function')
    const uses = src.match(/pasteReference\(/g) ?? []
    assert.ok(uses.length >= 2, 'insertion and removal must both go through the same builder')
    const literals = src.match(/已保存大段粘贴为附件/g) ?? []
    assert.equal(literals.length, 1, 'the reference literal must live in exactly one place')
  })

  test('removal hands the edit to the editor as beforeinput, not through execCommand', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    // Measured 2026-09-12 (dsh 0.1.5-rc.1 + Chrome, instrumented composer):
    // `document.execCommand('delete')` empties the DOM text and fires only an
    // `input` event — Lexical adopts edits through `beforeinput` alone, so with an
    // unchanged model it re-rendered the reference straight back (textLen
    // 53 → 0 → 53 inside that single command). The edit is therefore handed over in
    // the shape Lexical's handler consumes: a `beforeinput` whose
    // `getTargetRanges()` returns the reference's range.
    //
    // The assertions below run on CODE with block comments removed: the source is
    // SUPPOSED to keep documenting the refuted command path in prose, and that
    // history must not read as a violation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '')
    assert.match(
      code,
      /new InputEvent\('beforeinput'/,
      'the edit must be announced, not performed behind the editor',
    )
    assert.match(code, /inputType: 'deleteContentBackward'/)
    assert.match(code, /getTargetRanges/, 'Lexical reads the target range from this method')
    assert.doesNotMatch(
      code,
      /execCommand\('delete'\)/,
      'the reverted command path must not come back as the deletion mechanism',
    )
    assert.doesNotMatch(
      code,
      /deleteContents\(\)[\s\S]{0,200}已保存大段粘贴/,
      'no hand-rolled deletion of the reference',
    )
  })

  test('the removal verdict is read asynchronously and the fallback is actionable', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('function removeCapture')
    assert.ok(start >= 0, 'removeCapture must exist')
    const body = src.slice(start, src.indexOf('function openCapture', start))
    // The editor re-renders on its own schedule: right after the hand-off the DOM
    // still shows the reference (measured: textLen 53 at dispatch, 0 one task
    // later), so a synchronous verdict would report a failure that never happened.
    assert.match(body, /window\.setTimeout\(/, 'the verdict must be read one task later')
    assert.match(body, /按 Backspace 删除/, 'when the hand-off fails, say exactly what to press')
    assert.match(
      body,
      /textRangeOf\(composer, capture\.ref\)/,
      'the fallback re-selects the reference, so that key press really removes it',
    )
  })
})

describe('savePasteTo — concurrent same-timestamp saves (atomic, no TOCTOU)', () => {
  test('6 concurrent saves with the same timestamp all land in distinct files with intact contents', async () => {
    const dir = await tmpDir()
    try {
      const now = new Date(2026, 7, 15, 22, 0, 0, 0)
      const contents = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => `CONCURRENT-${x}`)
      for (let round = 0; round < 10; round += 1) {
        const results = await Promise.all(contents.map((c) => savePasteTo(dir, c, now)))
        const unique = new Set(results.map((r) => r.path)).size
        assert.equal(
          unique,
          contents.length,
          `round ${round}: every concurrent save must own a distinct file`,
        )
        for (let i = 0; i < contents.length; i += 1) {
          assert.equal(
            await readFile(join(dir, results[i].path), 'utf8'),
            contents[i],
            `round ${round} content ${i}`,
          )
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('isRegisteredWorkspace — cwd boundary guard', () => {
  const workspaces = [
    { path: 'C:/ws-a', sessionIds: ['s1'] },
    { path: 'C:/ws-b', sessionIds: ['s2'] },
  ]

  test('registered path matches (trailing separators tolerated)', () => {
    assert.equal(isRegisteredWorkspace('C:/ws-a', workspaces), true)
    assert.equal(isRegisteredWorkspace('C:\\ws-a\\', workspaces), true)
  })

  test('unregistered or sub path rejected', () => {
    assert.equal(isRegisteredWorkspace('C:/ws-other', workspaces), false)
    assert.equal(isRegisteredWorkspace('C:/ws-a/sub', workspaces), false)
  })
})

describe('assertPasteSize / maxBytes — oversized pastes rejected before touching disk', () => {
  test('default cap is 1 MiB and violations throw with byte counts', () => {
    assert.equal(MAX_PASTE_BYTES, 1024 * 1024)
    const big = 'x'.repeat(MAX_PASTE_BYTES + 1)
    assert.throws(
      () => assertPasteSize(big),
      (err) => err instanceof Error && /exceeds the 1048576-byte limit/.test(err.message),
    )
  })

  test('boundary: exactly maxBytes passes, one byte more throws', () => {
    const limit = 6
    assert.doesNotThrow(() => assertPasteSize('abcdef', limit))
    assert.throws(() => assertPasteSize('abcdefg', limit))
    // multibyte: 2 CJK chars = 6 UTF-8 bytes
    assert.doesNotThrow(() => assertPasteSize('中文', limit))
    assert.throws(() => assertPasteSize('中文x', limit))
  })

  test('savePasteTo rejects oversized text and creates no file or directory', async () => {
    const dir = await tmpDir()
    try {
      const now = new Date(2026, 7, 15, 23, 0, 0, 0)
      await assert.rejects(
        () => savePasteTo(dir, 'hello world', now, 4),
        (err) => err instanceof Error && /paste too large/.test(err.message),
      )
      // mkdir never ran: not even pastes/ exists
      await assert.rejects(() => readFile(join(dir, 'pastes'), 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('savePasteTo still accepts normal text with default cap', async () => {
    const dir = await tmpDir()
    try {
      const result = await savePasteTo(dir, 'ok', new Date(2026, 7, 15, 23, 1, 0, 0))
      assert.equal(result.chars, 2)
      assert.equal(await readFile(join(dir, result.path), 'utf8'), 'ok')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('sanitizeLabel — filename-safe paste labels', () => {
  test('accepts ASCII word characters, dash and underscore, up to 32 chars', () => {
    assert.equal(sanitizeLabel('notes'), 'notes')
    assert.equal(sanitizeLabel('my-note_01'), 'my-note_01')
    assert.equal(sanitizeLabel('a'.repeat(32)), 'a'.repeat(32))
  })

  test('throws a clear error for empty, over-long, non-ASCII and path-ish labels', () => {
    const bad = [
      '',
      '   ',
      'a'.repeat(33),
      '中文',
      'note 1',
      'a/b',
      'a\\b',
      'a:b',
      'a.b',
      '..',
      '../x',
      'a?b',
      'a*b',
      'a\nb',
    ]
    for (const value of bad) {
      assert.throws(
        () => sanitizeLabel(value),
        (err) => err instanceof Error && /label/.test(err.message),
        `expected rejection for ${JSON.stringify(value)}`,
      )
    }
  })
})

describe('pasteFilename — optional label suffix', () => {
  const now = new Date(2026, 7, 15, 20, 30, 6, 123)

  test('label is appended after the timestamp', () => {
    assert.equal(pasteFilename(now, 'notes'), '20260815-203006123-notes.txt')
  })

  test('without a label the previous shape is unchanged', () => {
    assert.equal(pasteFilename(now), '20260815-203006123.txt')
  })
})

describe('savePasteTo — label lands in the filename', () => {
  const now = new Date(2026, 7, 15, 20, 30, 6, 123)

  test('the written file carries the label and content is verbatim', async () => {
    const dir = await tmpDir()
    try {
      const result = await savePasteTo(dir, 'hello', now, MAX_PASTE_BYTES, 'notes')
      assert.equal(result.path, 'pastes/20260815-203006123-notes.txt')
      assert.equal(
        await readFile(join(dir, 'pastes', '20260815-203006123-notes.txt'), 'utf8'),
        'hello',
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('same second + same label never overwrites: -n is appended AFTER the label', async () => {
    const dir = await tmpDir()
    try {
      const first = await savePasteTo(dir, 'A', now, MAX_PASTE_BYTES, 'notes')
      const second = await savePasteTo(dir, 'B', now, MAX_PASTE_BYTES, 'notes')
      assert.equal(first.path, 'pastes/20260815-203006123-notes.txt')
      assert.equal(second.path, 'pastes/20260815-203006123-notes-1.txt')
      assert.equal(await readFile(join(dir, first.path), 'utf8'), 'A')
      assert.equal(await readFile(join(dir, second.path), 'utf8'), 'B')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a label already ending in -1 does not collide with the -n collision suffix', async () => {
    const dir = await tmpDir()
    try {
      const a = await savePasteTo(dir, 'A', now, MAX_PASTE_BYTES, 'note-1')
      const b = await savePasteTo(dir, 'B', now, MAX_PASTE_BYTES, 'note-1')
      assert.equal(a.path, 'pastes/20260815-203006123-note-1.txt')
      assert.equal(b.path, 'pastes/20260815-203006123-note-1-1.txt')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveMaxBytes — configurable cap with a hard ceiling', () => {
  test('absent config falls back to the default (1 MiB)', () => {
    assert.equal(MAX_PASTE_BYTES, 1048576)
    assert.equal(resolveMaxBytes(undefined), MAX_PASTE_BYTES)
  })

  test('valid values pass through, including the ceiling itself', () => {
    assert.equal(MAX_PASTE_BYTES_CAP, 67108864)
    assert.equal(resolveMaxBytes(2048), 2048)
    assert.equal(resolveMaxBytes(MAX_PASTE_BYTES_CAP), MAX_PASTE_BYTES_CAP)
  })

  test('non-positive, non-integer, non-number and over-ceiling values throw', () => {
    const bad = [0, -1, 1.5, '1024', null, true, Number.NaN, MAX_PASTE_BYTES_CAP + 1]
    for (const value of bad) {
      assert.throws(
        () => resolveMaxBytes(value),
        (err) => err instanceof Error && /maxBytes/.test(err.message),
        `expected rejection for ${String(value)}`,
      )
    }
  })

  test('a configured maxBytes is enforced before anything is written', async () => {
    const dir = await tmpDir()
    try {
      await assert.rejects(
        () =>
          savePasteTo(
            dir,
            'x'.repeat(2049),
            new Date(2026, 7, 15, 23, 2, 0, 0),
            resolveMaxBytes(2048),
          ),
        (err) => err instanceof Error && /paste too large/.test(err.message),
      )
      // mkdir never ran: not even pastes/ exists
      await assert.rejects(() => readFile(join(dir, 'pastes'), 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveMinChars — the host is the single authority for the paste threshold', () => {
  test('absent config falls back to the documented default', () => {
    assert.equal(MIN_CHARS_DEFAULT, 500)
    assert.equal(resolveMinChars(undefined), MIN_CHARS_DEFAULT)
  })

  test('valid positive integers pass through unchanged (no ceiling by design)', () => {
    assert.equal(resolveMinChars(1), 1)
    assert.equal(resolveMinChars(2000), 2000)
  })

  test('non-positive, non-integer and non-number values throw with a minChars message', () => {
    const bad = [0, -1, 1.5, '500', null, true, Number.NaN, Number.POSITIVE_INFINITY]
    for (const value of bad) {
      assert.throws(
        () => resolveMinChars(value),
        (err) => err instanceof Error && /minChars/.test(err.message),
        `expected rejection for ${String(value)}`,
      )
    }
  })
})

describe('effectiveMinChars — the user preference wins, otherwise the deployment default', () => {
  test('a valid stored value beats the deployment value', () => {
    assert.deepEqual(effectiveMinChars(2000, 800), { minChars: 2000, source: 'user' })
    assert.deepEqual(effectiveMinChars(1, MIN_CHARS_DEFAULT), { minChars: 1, source: 'user' })
  })

  test('without a stored value the deployment value applies', () => {
    assert.deepEqual(effectiveMinChars(undefined, 800), { minChars: 800, source: 'deployment' })
    assert.deepEqual(effectiveMinChars(undefined, MIN_CHARS_DEFAULT), {
      minChars: MIN_CHARS_DEFAULT,
      source: 'deployment',
    })
  })

  test('an unusable stored value never wins and never throws', () => {
    for (const bad of [0, -5, 1.5, '2000', null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(
        effectiveMinChars(bad, 800),
        { minChars: 800, source: 'deployment' },
        `a stored ${String(bad)} must not be honoured`,
      )
    }
  })

  test('an unusable deployment value falls back to the documented default', () => {
    for (const bad of [undefined, 0, -1, 1.5, 'big', null]) {
      assert.deepEqual(effectiveMinChars(undefined, bad), {
        minChars: MIN_CHARS_DEFAULT,
        source: 'deployment',
      })
    }
  })
})

describe('PasteSettingsSchema — the user layer this plugin owns', () => {
  test('the namespace is a lowercase hyphenated identifier (a dsh requirement)', () => {
    assert.equal(PASTE_SETTINGS_NAMESPACE, 'dsh-auto-paste')
    assert.match(PASTE_SETTINGS_NAMESPACE, /^[a-z][a-z0-9-]*$/)
    assert.equal(MIN_CHARS_FIELD, 'minChars')
  })

  test('an absent field is valid and means "not overridden"', () => {
    assert.equal(PasteSettingsSchema({})[MIN_CHARS_FIELD], undefined)
  })

  test('a positive integer round-trips', () => {
    assert.equal(PasteSettingsSchema({ minChars: 2000 })[MIN_CHARS_FIELD], 2000)
  })

  test('zero, negatives, fractions and strings are refused by the schema itself', () => {
    for (const bad of [0, -1, 1.5, '2000']) {
      assert.throws(
        () => PasteSettingsSchema({ minChars: bad }),
        `expected the stored section to be refused for ${String(bad)}`,
      )
    }
  })
})

describe('review batch A/B (2026-09-12) — release pipeline, wire cap, client honesty', () => {
  const readSrc = (...parts) => readFileSync(join(PKG_ROOT, ...parts), 'utf8')
  const readClient = () => readSrc('src', 'client.js')
  const readHost = () => readSrc('src', 'index.ts')

  // A1 — the tag must point at the bump commit, and publishing belongs to
  // .github/workflows/publish.yml (OIDC, triggered by the tag push).
  test('release.mjs commits the version bump BEFORE tagging, and never publishes locally', () => {
    const src = readSrc('scripts', 'release.mjs')
    const commit = src.indexOf('git add package.json')
    const tag = src.indexOf('git tag v')
    assert.ok(commit >= 0, 'the version bump must be committed by the script')
    assert.ok(tag >= 0, 'the script must still tag the release')
    assert.ok(
      commit < tag,
      'commit → tag → push: a tag created before the bump points at the previous version',
    )
    assert.doesNotMatch(
      src,
      /sh\(`npm publish/,
      'the script must not publish: the OIDC workflow does, on tag push',
    )
    assert.doesNotMatch(src, /--next/, 'the dist-tag is owned by publish.yml, not by this script')
  })

  // A2 — zod `.max` counts UTF-16 chars while the host enforces UTF-8 bytes;
  // two authorities on one limit means the wrong one rejects first.
  test('the savePaste wire schema carries no character cap — the host byte cap is the authority', async () => {
    const { TYPERT } = await import('../dist/typert.host.js')
    const invocation = TYPERT.invocations.find((entry) => entry.method === 'savePaste')
    assert.ok(invocation, 'the savePaste invocation must exist')
    const text = invocation.parameters.find((parameter) => parameter.name === 'text')
    assert.ok(text, 'the text parameter must exist')
    assert.equal(
      text.codec.schema.safeParse('x'.repeat(2_000_000)).success,
      true,
      'the wire must not reject on character count — the host byte cap is authoritative',
    )
    assert.equal(text.codec.schema.safeParse(123).success, false, 'it is still a string codec')
  })

  // A3 — the fallback path claimed "content is not lost" without verifying it.
  test('insertTextAtCaret reports whether the text landed, and nothing overclaims', () => {
    const src = readClient()
    const start = src.indexOf('function insertTextAtCaret')
    assert.ok(start >= 0, 'insertTextAtCaret must exist')
    assert.match(
      src.slice(start, start + 700),
      /return inserted/,
      'the caller must be able to tell a real insertion from a silent failure',
    )
    assert.match(
      src,
      /const inserted = insertTextAtCaret\(target, text\)/,
      'the save-failure fallback must check the result before reporting',
    )
    assert.doesNotMatch(
      src,
      /内容未丢失/,
      'never promise the content survived unless the insertion was verified',
    )
  })

  // A4 — a capture belongs to ONE session: its bar and its [查看] affordance
  // must never appear on top of another session's composer.
  test('the capture bar is bound to the session that produced the paste', () => {
    const src = readClient()
    assert.match(
      src,
      /capture\.sessionId === currentSessionId\(\)/,
      'render and refresh must compare the capture session against the live one',
    )
    assert.match(
      src,
      /sessionsRef = sessions/,
      'apply() must capture the sessions runtime so the comparison has a source',
    )
  })

  // B1 — pastes can hold sensitive text: private dir/file modes on POSIX
  // (Windows ignores `mode`, so this is additive there, not a behaviour change).
  test('paste writes are private: 0700 directory, 0600 file', () => {
    const src = readHost()
    assert.match(src, /mkdir\(dirname\(base\), \{ recursive: true, mode: 0o700 \}\)/)
    assert.match(src, /writeFile\(candidate, text, \{ flag: 'wx', mode: 0o600 \}\)/)
  })

  // B2 — savePaste is a public service: the wire validates, a direct caller may not.
  test('PasteStoreService.savePaste guards its input type at runtime', () => {
    const src = readHost()
    const start = src.indexOf('async savePaste(')
    assert.ok(start >= 0, 'savePaste must exist')
    const body = src.slice(start, start + 500)
    assert.match(body, /typeof text !== 'string'/, 'a non-string text must be refused by name')
    assert.match(body, /throw new Error/, 'and refused loudly, with a message')
  })

  // B3 — a toast timer firing after unload writes into a disposed plugin.
  test('toast timers are tracked and cleared when the plugin unloads', () => {
    const src = readClient()
    assert.match(src, /const toastTimers = new Set\(\)/, 'timers must be collected')
    assert.match(src, /toastTimers\.add\(timer\)/, 'each timer must be registered')
    assert.match(src, /clearTimeout\(timer\)/, 'and cleared on teardown')
    assert.match(src, /toastTimers\.clear\(\)/, 'the collection itself must be emptied')
  })

  // B4 — the smoke test only ever looked at invocations[0], so a broken
  // getConfig/setMinChars descriptor would have passed it.
  test('smoke.mjs walks EVERY typert invocation and uses the OS temp area', () => {
    const src = readSrc('smoke.mjs')
    assert.match(
      src,
      /for \(const inv of TYPERT\.invocations\)/,
      'every invocation must be validated, not just the first',
    )
    assert.doesNotMatch(src, /TYPERT\.invocations\[0\]/, 'no first-element shortcut may remain')
    assert.match(src, /tmpdir\(\)/, 'temp dirs belong to the OS temp area, not the plugin tree')
  })

  // B5 — replace({}) resets the WHOLE namespace; a path-addressed unset removes
  // exactly the one field this plugin owns.
  test('setMinChars(null) unsets the single field, never the whole namespace', () => {
    const src = readHost()
    assert.match(
      src,
      /op: 'unset', path: \[MIN_CHARS_FIELD\]/,
      'clearing must be a path-addressed unset of our own field',
    )
    assert.doesNotMatch(
      src,
      /settings\.replace\(/,
      'replace({}) would wipe every field in the namespace, including ones we do not own',
    )
  })
})

describe('review batch C (2026-09-12) — frozen chars unit, absolute path stays host-side', () => {
  const readSrc = (...parts) => readFileSync(join(PKG_ROOT, ...parts), 'utf8')
  const readClient = () => readSrc('src', 'client.js')
  const readHost = () => readSrc('src', 'index.ts')

  // C1 — the unit is a frozen contract, not an accident: every reference line
  // already sitting in old messages shows a number computed this way, so it gets
  // DOCUMENTED (host, client, README) instead of silently changed.
  test('C1: chars is documented as UTF-16 code units everywhere it surfaces', () => {
    assert.match(readHost(), /UTF-16 code units/, 'the host result types must name the unit')
    assert.match(readClient(), /UTF-16 code units/, 'the reference builder must name the unit')
    assert.match(readSrc('README.md'), /UTF-16 code units/, 'the README must name the unit too')
  })

  // C2 — the absolute path embeds the machine's user name and directory layout;
  // no consumer needs it, so the boundary carries path/bytes/chars only.
  test('C2: publicPasteRef drops absolutePath and passes the rest through verbatim', async () => {
    const { publicPasteRef } = await import('../dist/index.js')
    const narrow = publicPasteRef({
      path: 'pastes/20260815-103000.txt',
      absolutePath: 'C:/Users/someone/ws/pastes/20260815-103000.txt',
      bytes: 21,
      chars: 15,
    })
    assert.deepEqual(Object.keys(narrow).sort(), ['bytes', 'chars', 'path'])
    assert.deepEqual(narrow, { path: 'pastes/20260815-103000.txt', bytes: 21, chars: 15 })
  })

  // D — the browser half needs the absolute path: the sidebar's file API refuses
  // relative ones (`requireAbsolute` → 400 "… is not an absolute path"), so a
  // capture opened via [查看] could be READ (the surface resolves addresses) but
  // never saved back. The RPC result therefore carries the absolute path, while the
  // MODEL-facing tool output stays narrowed — the assertions below pin that half.
  test('D: the savePaste wire result carries the absolute path the sidebar needs', async () => {
    const { TYPERT } = await import('../dist/typert.host.js')
    const invocation = TYPERT.invocations.find((entry) => entry.method === 'savePaste')
    assert.ok(invocation, 'the savePaste invocation must exist')
    assert.deepEqual(Object.keys(invocation.result.schema.shape).sort(), [
      'absolutePath',
      'bytes',
      'chars',
      'path',
    ])
  })

  test('D: wirePasteRef adds exactly the absolute path to the boundary shape', async () => {
    const { wirePasteRef } = await import('../dist/index.js')
    const wire = wirePasteRef({
      path: 'pastes/20260815-103000.txt',
      absolutePath: 'C:/Users/someone/ws/pastes/20260815-103000.txt',
      bytes: 21,
      chars: 15,
    })
    assert.deepEqual(Object.keys(wire).sort(), ['absolutePath', 'bytes', 'chars', 'path'])
    assert.equal(wire.path, 'pastes/20260815-103000.txt')
    assert.equal(wire.absolutePath, 'C:/Users/someone/ws/pastes/20260815-103000.txt')
  })

  test('C2: the save_paste tool output schema is path/bytes/chars only', () => {
    const src = readHost()
    const start = src.indexOf('output: {')
    assert.ok(start >= 0, 'the tool must declare an output schema')
    const block = src.slice(start, src.indexOf('async execute', start))
    for (const field of ['path', 'bytes', 'chars']) {
      assert.match(block, new RegExp(`${field}: \\{ type:`), `${field} must stay declared`)
    }
    assert.doesNotMatch(block, /absolutePath/, 'the tool output must not leak the absolute path')
  })
})

describe('review batch D (2026-09-13) — the sidebar receives a path it can write', () => {
  test('D: [查看] hands better-sidebar the absolute spelling, with a relative fallback', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('function openCapture')
    assert.ok(start >= 0, 'openCapture must exist')
    const body = src.slice(start, src.indexOf('const BAR_CSS', start))
    assert.match(
      body,
      /capture\.absolutePath \?\? capture\.path/,
      'the sidebar file API refuses relative paths — prefer the absolute one it can write',
    )
  })

  test('D: the capture carries the absolute path the RPC result returned', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    assert.match(
      src,
      /capture: \{[\s\S]{0,160}?absolutePath: result\.absolutePath/,
      'the capture snapshot must keep the absolute path for the [查看] call',
    )
  })
})

describe('0.1.5-① — the bar says so when no sidebar is installed', () => {
  const readClient = () => readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
  const count = (src, re) => (src.match(re) ?? []).length
  const from = (src, marker, span = 900) => {
    const start = src.indexOf(marker)
    assert.ok(start >= 0, `${marker} must exist in src/client.js`)
    return src.slice(start, start + span)
  }

  test('the one-shot hint exists, with a single source of copy', () => {
    const src = readClient()
    assert.equal(
      count(src, /没装 dsh-better-sidebar/g),
      1,
      'the hint copy must appear exactly once (built once, reused by the bar)',
    )
  })

  test('showing the hint once is remembered, and a throwing localStorage cannot break the bar', () => {
    const src = readClient()
    assert.equal(
      count(src, /'dsh-auto-paste:sidebar-hint'/g),
      1,
      'one storage key, referenced once',
    )
    const reader = from(src, 'function readSidebarHint')
    assert.match(reader, /localStorage\.getItem\(SIDEBAR_HINT_KEY\)/, 'the memory is read back')
    const marker = from(src, 'function markSidebarHintSeen')
    assert.match(marker, /localStorage\.setItem\(SIDEBAR_HINT_KEY, '1'\)/, 'and written when shown')
    assert.match(marker, /catch \(error\)/, 'private mode throws on write — that must not surface')
  })

  test('a service that was EVER adopted suppresses the hint forever', () => {
    const src = readClient()
    assert.match(
      src,
      /let betterSidebarEverAdopted = false/,
      'the latch must exist: ctx.inject dispose calls adopt(null) on every reload',
    )
    assert.match(
      from(src, 'function adoptBetterSidebar', 1200),
      /if \(service !== null\) betterSidebarEverAdopted = true/,
      'adopting a real service must latch it',
    )
    const verdict = from(src, 'function shouldOfferSidebarHint', 600)
    assert.match(
      verdict,
      /betterSidebarEverAdopted/,
      'the verdict must consult the latch, never the live value alone',
    )
    assert.match(verdict, /readSidebarHint\(\)/, 'and the one-shot memory, so it nags at most once')
  })

  test('the General settings row explains the gap, and disappears once the sidebar is there', () => {
    const src = readClient()
    assert.equal(count(src, /未检测到 dsh-better-sidebar/g), 1, 'one settings-row explainer')
    const row = from(src, 'function SettingsSidebarRow', 1200)
    assert.match(row, /betterSidebarEverAdopted/, 'the row must hide once the sidebar is installed')
  })

  test('the second settings row does not reuse the first row id (a list slot throws)', () => {
    const src = readClient()
    assert.match(
      src,
      /id: `\$\{PACKAGE\}:sidebar`/,
      'the explainer needs its own id: a second entry at the same id at the same priority throws',
    )
  })
})
