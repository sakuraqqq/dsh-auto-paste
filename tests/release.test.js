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
  MAX_PASTE_BYTES,
  MAX_PASTE_BYTES_CAP,
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
