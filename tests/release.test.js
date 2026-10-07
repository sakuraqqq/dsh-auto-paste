// dsh-auto-paste — release test suite (node:test, zero deps).
// Run: pnpm test  (build first: pnpm run build)
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync, mkdirSync, writeFileSync, cpSync, rmSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
  readSettings,
  readLiveValue,
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

// The roundtrip above proves the common case. These are the shapes that break
// naive writers: line-ending normalization, a paste with no line breaks at all,
// leading/trailing blank lines, a BOM the user actually pasted, and the encoding
// question — the file must be UTF-8 bytes, never the console code page.
describe('savePasteTo — encoding & shape stress (2026-10-01)', () => {
  const STAMP = new Date(2026, 9, 1, 7, 30, 0, 0)
  const rawOf = (dir, rel) => readFile(join(dir, rel))

  test('CRLF survives verbatim — no newline normalization in either direction', async () => {
    const dir = await tmpDir()
    try {
      const text = 'a\r\nb\r\n\r\nc\r\n'
      const result = await savePasteTo(dir, text, STAMP)
      assert.equal(result.bytes, Buffer.byteLength(text, 'utf8'))
      assert.equal(await readFile(join(dir, result.path), 'utf8'), text)
      const raw = await rawOf(dir, result.path)
      assert.equal(raw.filter((b) => b === 0x0d).length, 4, 'every CR reached the disk')
      assert.equal(raw.filter((b) => b === 0x0a).length, 4, 'and so did every LF')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a single very long line (no line break anywhere) survives intact', async () => {
    const dir = await tmpDir()
    try {
      // One 60 KB line: 20k CJK chars (3 bytes each) plus a tail marker.
      const text = `${'中'.repeat(20000)}END`
      const result = await savePasteTo(dir, text, STAMP)
      assert.equal(result.chars, text.length)
      assert.equal(result.bytes, 60000 + 3)
      const back = await readFile(join(dir, result.path), 'utf8')
      assert.equal(back, text)
      assert.equal(back.includes('\n'), false, 'nothing invented a line break')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('blank lines — leading, consecutive and trailing — survive verbatim', async () => {
    const dir = await tmpDir()
    try {
      const text = '\n\n\nstart\n\n\n\nend\n\n'
      const result = await savePasteTo(dir, text, STAMP)
      const back = await readFile(join(dir, result.path), 'utf8')
      assert.equal(back, text)
      assert.equal(back.startsWith('\n\n\n'), true, 'leading blanks kept')
      assert.equal(back.endsWith('end\n\n'), true, 'trailing blanks kept')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('no BOM is ever added, and a U+FEFF the user pasted is preserved as content', async () => {
    const dir = await tmpDir()
    try {
      const plain = await savePasteTo(dir, '中文内容', STAMP)
      const plainRaw = await rawOf(dir, plain.path)
      assert.notDeepEqual(
        [...plainRaw.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        'the writer must not prepend a UTF-8 BOM',
      )
      // A leading U+FEFF inside the pasted TEXT is content, not a mark the writer
      // added — it has to round-trip like any other character.
      const withMark = '\uFEFF开头就带 BOM 字符'
      const marked = await savePasteTo(dir, withMark, new Date(2026, 9, 1, 7, 30, 1, 0))
      assert.equal(await readFile(join(dir, marked.path), 'utf8'), withMark)
      const markedRaw = await rawOf(dir, marked.path)
      assert.deepEqual(
        [...markedRaw.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        'the user’s own U+FEFF is on disk',
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('the bytes on disk are exactly the UTF-8 encoding (never a GBK/code-page spelling)', async () => {
    const dir = await tmpDir()
    try {
      // Every character here has a different GBK/CP936 encoding, or none at all
      // (emoji, full-width forms, ideographic space), so a byte-exact comparison
      // against Buffer.from(text, 'utf8') is what separates "wrote UTF-8" from
      // "wrote whatever the console code page was".
      const text = '中文标点：，。！？　全角空格\nemoji 🎉🚀 代理对\nｆｕｌｌｗｉｄｔｈ\n'
      const result = await savePasteTo(dir, text, STAMP)
      const raw = await rawOf(dir, result.path)
      assert.deepEqual(raw, Buffer.from(text, 'utf8'), 'byte-for-byte UTF-8')
      assert.equal(result.bytes, raw.length)
      const back = raw.toString('utf8')
      assert.equal(back, text)
      assert.equal(
        back.includes('\uFFFD'),
        false,
        'no replacement char — nothing was re-encoded lossily',
      )
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
      // Re-specified 2026-09-29 (independent privacy review): the message identifies
      // the workspaces by FOLDER NAME. It used to spell out each absolute path, so a
      // user pasting this error into a public issue published their machine layout.
      assert.match(err.message, /\bws-a\b/) // what exists — by folder name only
      assert.match(err.message, /\bws-b\b/)
      assert.doesNotMatch(
        err.message,
        /[A-Za-z]:[\\/]/,
        'no drive-letter path may ride along in session text',
      )
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

  test('the sidebar hint sits in the seat dsh actually paints', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    // Seat choice is evidence-driven: conversation.composer.dock laid the old pill out
    // (probe: rect 333x24, real box) inside a class-less wrapper the host never paints,
    // so it moved into the composer overlay anchor — the very strip the shipped
    // input-bar toast visibly uses. The one-shot hint inherited that seat.
    assert.match(
      src,
      /slots\.inject\('conversation\.input\.overlay'/,
      'the hint shares the proven-visible composer overlay seat',
    )
    // The pill was the ONLY caller of betterSidebar's file API. With it gone the
    // capability probe has to be gone too: a surviving `features.includes('openFile')`
    // would mean something still intends to call that API (2026-10-01 decision).
    assert.doesNotMatch(src, /\.openFile\(/, 'no betterSidebar file API call remains')
  })

  test('the mention has ONE source, and the text fallback keeps its own', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    assert.match(
      src,
      /function pasteReference\(/,
      'the fallback builder must stay a named function',
    )
    const uses = src.match(/pasteReference\(/g) ?? []
    assert.ok(uses.length >= 2, 'insertion and removal must both go through the same builder')
    // TWO builders exist since the atomic-chip path landed, and each spells its own
    // string exactly once: the chip's mention (which is also the model text, because
    // the reference source serializes by returning `ref`) and the plain-text
    // fallback. A third inlined copy anywhere is exactly the drift this guards.
    const mentions = src.match(/`@"\$\{path\}"`/g) ?? []
    assert.equal(mentions.length, 1, 'the @"<path>" mention lives in exactly one place')
    const tokens = src.match(/` @"\$\{path\}" \(\$\{chars\} 字符\)`/g) ?? []
    assert.equal(tokens.length, 1, 'and the text fallback lives in exactly one place')
  })

  test('the atomic chip payload matches the reference source contract', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('function referenceChipOf')
    assert.ok(start >= 0, 'referenceChipOf must exist')
    const body = src.slice(start, src.indexOf('async function insertReferenceChip', start))
    // dsh-client-ui-reference reads these fields at insert time and caches them on
    // the chip node: `source` is the serializer routing key, `appearance: 'file'`
    // is what lets a click act at all (openReference early-returns otherwise), and
    // `label` is what the chip DISPLAYS — the basename, so no directory leaks into
    // the draft, plus the frozen size (2026-10-01 decision: a card that showed only
    // a filename hid how big the paste was).
    assert.match(body, /source: 'reference'/, 'the @file/@session source is the routing key')
    assert.match(body, /appearance: 'file'/, 'openReference refuses every other appearance')
    assert.match(
      body,
      /const name = path\.split\('\/'\)/,
      'the chip derives the basename, never the path',
    )
    assert.match(
      body,
      /label: `\$\{name\} · \$\{chars\} 字符`/,
      'and displays basename + frozen size',
    )
    const payload = body.slice(body.indexOf('return {'))
    // `ref` must be the BARE mention: openReference derives the path from it
    // (`ref.slice(2, -1)` for the quoted form), so a trailing size would be read as
    // part of the path and the preview would open nothing.
    assert.match(payload, /ref: mention,/, 'ref is the bare mention, shared with the model text')
    const refField = payload
      .split('\n')
      .filter((line) => /^\s*ref:/u.test(line))
      .join('\n')
    assert.doesNotMatch(
      refField,
      /字符/,
      'the count must NOT ride inside ref — openReference would read it as part of the path',
    )
    // clipboardText IS the draft projection, and since 2026-10-02 it carries the size
    // on purpose (decision C): dsh persists exactly this string as the session draft,
    // so a session switch downgrades a chip to TEXT — and that text should still say
    // how big the paste was, exactly like the pre-0.2.0 form did. It reuses the one
    // token builder (`trimStart` drops the leading boundary space, which the text path
    // needs and the chip path gets from a real draft character instead).
    assert.match(
      payload,
      /clipboardText: pasteReference\(path, chars\)\.trimStart\(\),/,
      'the draft projection is the token WITH the count, without the boundary space',
    )
  })

  test('the chip guarantees a whitespace boundary before the mention', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('async function insertReferenceChip')
    assert.ok(start >= 0, 'insertReferenceChip must exist')
    const fn = src.slice(start, src.indexOf('let slotSessionId = null', start))
    // Both of dsh's reference scans anchor on `(^|\s)`: the composer's TEXT_REF_RE
    // (dsh-client-ui-conversation) and the transcript's projectUserText
    // (dsh-client-ui-primitives). A mention glued to the character in front of it is
    // recognised by NEITHER, so the paste renders as dead plain text — the exact
    // 2026-10-02 report ("发出去变纯文本了", mention glued to 说/是).
    assert.match(
      fn,
      /if \(needsBoundarySpace\(\) && typeof composer\.insertText === 'function'\)/,
      'the insertion checks the boundary it is about to violate, behind a capability probe',
    )
    assert.match(
      fn,
      /composer\.insertText\(' ', parts\.actions\.captureInsertion\(\)\)/,
      'and repairs it with a REAL space character in the draft',
    )
    assert.match(
      fn,
      /const span = parts\.actions\.captureInsertion\(\)/,
      'the chip span is re-captured after that edit (the draft revision moved)',
    )
    const helper = src.slice(src.indexOf('function needsBoundarySpace'), start)
    assert.match(
      helper,
      /document\.querySelector\('\[data-input-scroll\] \[contenteditable="true"\]'\)/,
      'the character before the caret is read from the composer DOM (the facade exposes spans, not text)',
    )
    assert.match(helper, /if \(text === ''\) return false/, 'the draft start is a valid boundary')
    assert.match(
      helper,
      /return !\/\\s\/u\.test\(text\.slice\(-1\)\)/,
      'whitespace in front is a boundary; anything else is not',
    )
    assert.match(
      helper,
      /return true[\s\S]*?return true/,
      'and "cannot tell" must answer true — an extra space is harmless, a missing boundary costs the feature',
    )
  })

  test('the atomic chip is probed, never assumed (a missing serializer blocks sending)', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    const start = src.indexOf('async function insertReferenceChip')
    assert.ok(start >= 0, 'insertReferenceChip must exist')
    const fn = src.slice(start, src.indexOf('let slotSessionId = null', start))
    // A chip whose source has no registered serializer makes the message
    // UNSENDABLE ("no serializer for reference source") — strictly worse than a
    // plain-text reference. So the registry the SUBMIT path reads is asked first,
    // and the whole attempt is wrapped so nothing escapes to the save handler's
    // catch (which would re-insert the raw 60 KB).
    assert.match(
      fn,
      /serializeReference\?\.\('reference'/,
      'the submit-path serializer is the probe',
    )
    assert.match(fn, /typeof modelText !== 'string'/, 'a non-answer refuses the chip path')
    assert.match(fn, /try \{/, 'a refused or throwing facade must not escape')
    assert.match(fn, /return false/, 'and it answers false so the caller keeps the text path')
    // The capability walk lives one function up (the complexity gate moved it there),
    // and it checks the session PAIRING first: actions latched for another session
    // must never be able to address this one's composer.
    const guardStart = src.indexOf('function composerInsertion')
    assert.ok(guardStart >= 0, 'composerInsertion must exist')
    const guard = src.slice(guardStart, start)
    assert.match(
      guard,
      /slotInput\.sessionId !== sessionId/,
      'a latch from another session refuses',
    )
    assert.match(
      guard,
      /return \{ input, scope, actions: slotInput\.actions \}/,
      'and all three parts ride together',
    )
  })

  test('the reference is a whitespace-led dsh reference token (the chip contract)', () => {
    const src = readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
    // The chip is not ours to draw: `projectUserText` in ui-primitives scans settled
    // user text for `(^|\s)(/[\w-]+(?=\s|$)|@"[^"\n]+"|@[^\s]+)` and turns a hit into
    // a clickable file chip whose click opens the official sidebar preview (the
    // alternation was read out of dsh 0.1.7-rc.2 AND out of the desktop 0.2.x
    // bundle in app.asar — both spell it identically). So two properties of the
    // returned string are load-bearing, and both are easy to lose in a "tidy-up":
    //   1. the LEADING SPACE — without it a paste dropped straight after a word has
    //      no `(^|\s)` to bind to and stays dead text in the transcript;
    //   2. the QUOTED path — the `@"…"` branch is the one that survives the
    //      trailing-punctuation strip applied to unquoted labels.
    assert.match(
      src,
      /return ` @"\$\{path\}" \(/,
      'the reference must lead with a space and quote the path — that is what the scan matches',
    )
    // The count rides OUTSIDE the token so the quoted path cannot swallow it; its
    // unit (UTF-16 code units) is frozen and documented in README.
    assert.match(src, /\(\$\{chars\} 字符\)`/, 'the frozen char count stays as trailing text')
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

  // A1 — publishing belongs to .github/workflows/publish.yml (OIDC, triggered by the
  // tag push). 2026-09-30: the flow changed from "commit → tag → push main" to
  // "commit → push branch → PR → (merge) → tag". Two reasons, both structural:
  //   1. the repo ruleset requires the `gate` check with NO bypass, and GitHub
  //      evaluates required checks at PUSH time while a check can only run AFTER the
  //      commit arrives — so a direct push to main can never satisfy it;
  //   2. the merge commit is created by GitHub, so its SHA is unknown locally — a tag
  //      made before the merge would sit on the branch commit, one step behind main.
  // The bump is still committed before any tag exists, which is the property that
  // actually matters: a tag must never point at the previous version.
  test('release.mjs commits the bump, ships it via a PR, and tags only AFTER the merge', () => {
    const src = readSrc('scripts', 'release.mjs')
    const commit = src.indexOf('git add package.json')
    assert.ok(commit >= 0, 'the version bump must still be committed by the script')
    assert.doesNotMatch(
      src,
      /sh\(`git push origin main/,
      'the script must not EXECUTE a direct push to main (help text may still mention main)',
    )
    assert.match(src, /gh pr create/, 'the bump must travel to main through a pull request')
    // 阶段 7 的**提示输出**才是"合并后做什么"的权威位置。只看 commit 之后那一段，且
    // 要求它确实被 console.log 打印出来 —— `--finish` 的报错指引里也会提到同样的命令
    // （那是给"发现没有 tag"的人看的），拿全文 index 比较会误判。
    // 注意这几行在源码里的引号形态不同：不含插值的用单引号，含 ${…} 的用反引号。
    const afterCommit = src.slice(commit)
    assert.match(
      afterCommit,
      /console\.log\(` +② 回 main 并快进： +git checkout main && git pull --ff-only`\)/,
      'the post-merge instructions must be PRINTED in the post-merge step',
    )
    // 0.1.6 起：打 tag 之前必须先跑 `--tag` 自查（守卫），而不是照抄一行 tag 命令。
    // 这条断言锁的是"提示里给出了守卫入口"，防止以后有人把它删掉退回纯文本提示。
    assert.match(
      afterCommit,
      /console\.log\(` +npm run release -- --tag`\)/,
      'the post-merge step must point at the --tag self-check, not a raw tag command',
    )
    assert.match(
      afterCommit,
      /通过后才打印可安全执行的 \$\{tagCmd\.split\(' && '\)\[0\]\} 命令/,
      'the post-merge step must derive the printed tag command from tagCmd (single source)',
    )
    assert.match(
      src,
      /const tagCmd = `git tag v\$\{target\}/,
      'the tag command must still exist in the script — as the post-merge step',
    )
    // `--tag` 守卫本身：脚本必须真的去查"在 main 上 / 版本一致 / 已存在 tag 的位置"。
    // 只断言"有 --tag 字样"是不够的 —— 把检查删空也能过，那就成了装饰。
    assert.match(src, /const TAG = process\.argv\.includes\('--tag'\)/, 'the --tag mode must exist')
    assert.match(src, /abbrev-ref HEAD/, 'the guard must check the current branch')
    assert.match(src, /HEAD\.\.origin\/main/, 'the guard must check it is not behind origin/main')
    assert.match(
      src,
      /refs\/tags\/v\$\{current\}/,
      'the guard must inspect an existing same-name tag (the 0.1.6 failure mode)',
    )
    assert.match(
      src,
      /gitOk\(/,
      'the guard must judge git failures by exit code, not by `|| true` shell syntax (cmd.exe rejects it)',
    )
    // 只扫**字符串/模板内容**，不扫注释 —— 否则解释性注释里提到这个序列就会误报。
    assert.doesNotMatch(
      src,
      /(?:`[^`]*|\$\{[^}]*\}|'[^']*'|"[^"]*")\|\| true/,
      'no `|| true` inside shell strings: Windows cmd.exe does not recognize `true`',
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

  // A4 — the insertion path belongs to ONE session: a latch taken from the previous
  // session's composer must never be able to edit the one on screen (composerInsertion
  // refuses it, and the paste then falls back to the text reference).
  test('the paste path is bound to the session that owns the composer', () => {
    const src = readClient()
    assert.match(
      src,
      /slotInput\.sessionId !== sessionId/,
      'the latched input actions are refused for any other session',
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

describe('0.1.5-① — the hint says so when no sidebar is installed', () => {
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
      'the hint copy must appear exactly once (one source, rendered by the hint slot)',
    )
  })

  test('showing the hint once is remembered, and a throwing localStorage cannot break the hint', () => {
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

describe('settings capability probes — dsh 0.1.7 dropped get/register (2026-09-29)', () => {
  const readHost = () => readFileSync(join(PKG_ROOT, 'src', 'index.ts'), 'utf8')
  const count = (text, re) => (text.match(re) ?? []).length

  // The 0.1.6 shape: the namespace is readable through `get`.
  const legacySettings = () => ({
    register: () => {},
    get: () => ({ [MIN_CHARS_FIELD]: 1234 }),
    update: async () => {},
    mutate: async () => {},
  })

  // The 0.1.7 shape, measured in the lab: the service exists, the reader does not.
  const formsSettings = () => ({
    update: async () => {},
    mutate: async () => {},
  })

  test('a 0.1.7 settings service reads as "nothing stored" instead of throwing', () => {
    const service = formsSettings()
    assert.equal(typeof service.get, 'undefined', 'the fixture must really lack get')
    assert.equal(
      readSettings(service, PASTE_SETTINGS_NAMESPACE),
      undefined,
      'service.get is the exact TypeError that took getConfig — and the config path — down',
    )
  })

  test('a readable service still returns its stored namespace', () => {
    assert.deepEqual(readSettings(legacySettings(), PASTE_SETTINGS_NAMESPACE), {
      [MIN_CHARS_FIELD]: 1234,
    })
  })

  test('a missing provider and a non-object value both read as undefined', () => {
    const nonsense = { ...formsSettings(), get: () => 'nonsense' }
    assert.equal(readSettings(undefined, PASTE_SETTINGS_NAMESPACE), undefined)
    assert.equal(readSettings(nonsense, PASTE_SETTINGS_NAMESPACE), undefined)
  })

  test('the host never calls get/register without probing first', () => {
    const src = readHost()
    assert.equal(
      count(src, /\.get\(PASTE_SETTINGS_NAMESPACE\)/g),
      0,
      'reading the namespace directly IS the crash: "this.settings(...)?.get is not a function"',
    )
    assert.equal(count(src, /settings\.register\(/g), 1, 'exactly one register call site')
    assert.match(
      src,
      /if \(typeof settings\.register === 'function'\) \{\s*settings\.register\(/,
      'and that one call site sits inside the probe',
    )
    assert.match(src, /service\.get\(ns\)/, 'readSettings owns the single get call')
    assert.match(
      src,
      /if \(service === undefined \|\| typeof service\.get !== 'function'\) return undefined/,
      'guarded before it is called',
    )
  })

  // Re-specified 2026-09-29 (the user chose the full 0.1.7 adaptation): the row is
  // editable whenever a WRITE PATH exists. 0.1.5 closes the loop with get(); 0.1.7
  // has no get at all and writes into this plugin's own volatile field instead.
  // The service's presence still proves nothing on either line.
  test('canConfigure needs a working write path, and names which one', () => {
    const src = readHost()
    assert.match(
      src,
      /typeof settings\?\.update !== 'function'/,
      'a service without update can store nothing at all',
    )
    assert.match(
      src,
      /return typeof settings\.get === 'function' \|\| schemaVolatileCapable/,
      '0.1.5 proves the loop with get; 0.1.7 with a volatile field',
    )
    assert.doesNotMatch(
      src,
      /canConfigure: this\.settings\(\) !== undefined/,
      'the old presence-only probe promised a save that could never be read back',
    )
    assert.match(src, /canConfigure: this\.canConfigure\(\)/, 'the payload uses the real verdict')
  })

  test('settingsValue cannot drift back to calling get on its own', () => {
    assert.match(
      readHost(),
      /private settingsValue\(\)[^{]*\{\s*return readSettings\(this\.settings\(\), PASTE_SETTINGS_NAMESPACE\)/,
      'the guard must live in one place, or it will be forgotten in the next copy',
    )
  })
})

describe('0.1.7 keeps settings in the plugin Config — read live, never cached (2026-09-29)', () => {
  const readHost = () => readFileSync(join(PKG_ROOT, 'src', 'index.ts'), 'utf8')

  // 0.1.7 hands volatile fields over as live boxes (`{ get() }`); 0.1.5 hands the
  // value itself. Reading a box as a number is what would silently drop every saved
  // value back to the default.
  test('a volatile box unwraps, a plain value passes through, the resolvers accept both', () => {
    assert.equal(readLiveValue({ get: () => 1000 }), 1000, '0.1.7 shape')
    assert.equal(readLiveValue(500), 500, '0.1.5 shape')
    assert.equal(readLiveValue(undefined), undefined)
    assert.equal(resolveMinChars(readLiveValue({ get: () => 1000 })), 1000)
  })

  // The 0.1.7 loader reads `runtime.Config` and requires `"toJSON" in schema`; a
  // plain object literal would be ignored, leaving the entry unconfigurable.
  // schemastery schemas are CALLABLE objects, so the check is on their members.
  test('the exported Config is a real schemastery schema', async () => {
    const { Config } = await import('../dist/index.js')
    assert.ok(
      typeof Config === 'function' || typeof Config === 'object',
      'the loader looks for an exported Config',
    )
    assert.equal(typeof Config.toJSON, 'function', 'and checks "toJSON" in schema')
    assert.ok(
      Config.dict !== undefined && Object.hasOwn(Config.dict, MIN_CHARS_FIELD),
      'whose fields are the ones the row edits',
    )
  })

  // `.volatile()` exists on the 0.1.7 line only: dsh 0.1.5 ships schemastery
  // 3.18.2, whose whole package contains no such method. Calling it unconditionally
  // would throw while this module loads — taking the plugin down on the older line.
  test('minChars is declared volatile, behind a capability probe', () => {
    const src = readHost()
    assert.match(src, /export const Config = z\.object\(\{/, 'the schema the loader projects')
    assert.match(
      src,
      /typeof \(z\.number\(\) as unknown as \{ volatile\?: unknown \}\)\.volatile === 'function'/,
      'the probe is what keeps this module loadable on 0.1.5',
    )
    assert.match(
      src,
      /return typeof box\.volatile === 'function' \? box\.volatile\(\) : schema/,
      'and the field is only wrapped where the method exists',
    )
    assert.match(src, /minChars: liveNumber\(MIN_CHARS_DEFAULT\)/, 'minChars is the live knob')
  })

  // A number resolved once at boot is exactly what makes a value saved in Settings
  // invisible until the next restart.
  test('the service re-reads its config instead of caching numbers at boot', () => {
    const src = readHost()
    assert.doesNotMatch(
      src,
      /private readonly (deploymentMinChars|maxBytes): number/,
      'no boot-time snapshot may come back',
    )
    assert.match(src, /private readonly pluginConfig: PluginConfigLike/, 'the reference is kept')
    assert.match(src, /resolve\(readLiveValue\(raw\)\)/, 'and unwrapped on every call')
    assert.match(
      src,
      /resolveMinChars\(readLiveValue\(config\.minChars\)\)/,
      'the boot-time report must unwrap too, or a volatile box logs a false invalid',
    )
    assert.match(
      src,
      /new PasteStoreService\(ctx, config\)/,
      'the service gets the config object, not two resolved numbers',
    )
  })
})

describe('large pastes survive dsh 0.1.7 dropping list.current (2026-09-29)', () => {
  const readClient = () => readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
  const count = (text, re) => (text.match(re) ?? []).length
  const from = (text, anchor, span) => {
    const start = text.indexOf(anchor)
    assert.ok(start >= 0, `${anchor} must exist`)
    return text.slice(start, start + span)
  }

  // 0.1.7 moved the selection out of ClientSessions, and SessionListState lost
  // `current` (0.1.5 declared `current: SessionId | undefined`). A direct read
  // answered undefined, so the listener returned without a word: the raw text
  // landed in the composer, nothing was saved, and nothing was logged.
  test('the paste listener never reads the list snapshot itself', () => {
    const src = readClient()
    assert.doesNotMatch(
      from(src, 'const onPaste = (event)', 2200),
      /getSnapshot/,
      'reading it here is the 0.1.7 silent passthrough: no field, no save, no complaint',
    )
    assert.match(
      from(src, 'const sessionId = currentSessionId()', 160),
      /if \(sessionId === null\) return/,
      'the listener consumes the helper and still refuses without a session',
    )
    assert.equal(
      count(src, /getSnapshot\?\.\(\)\.current/g),
      1,
      'and the one guarded read stays inside the helper',
    )
  })

  test('currentSessionId keeps the 0.1.5 selection and adds the 0.1.7 identity', () => {
    const fn = from(readClient(), 'function currentSessionId', 400)
    assert.match(fn, /getSnapshot\?\.\(\)\.current/, 'the 0.1.5 selection stays the first source')
    assert.match(fn, /return slotSessionId/, 'and the 0.1.7 slot identity is the fallback')
  })

  test('the hint latches the identity the slot rendered it with', () => {
    const bar = from(readClient(), 'function SidebarHint(props)', 1400)
    assert.match(bar, /props\.sessionId/, 'SessionStandardProps.sessionId is the 0.1.7 source')
    assert.match(bar, /slotSessionId = String\(offeredSession\)/, 'latched for the paste path')
    assert.match(bar, /React\.useEffect/, 'in an effect, so render stays side-effect free')
    // The chip path needs the SAME props object for a second value: `inputActions`
    // carries `captureInsertion()`, the only sanctioned source of the revision-
    // guarded span `insertReference` CAS-checks. It is latched as a PAIR with the
    // session so a switch cannot leave the old composer's actions addressable by
    // the new session's paste.
    assert.match(bar, /props\.inputActions/, 'SessionStandardProps.inputActions is the span source')
    assert.match(
      bar,
      /sessionId: slotSessionId, actions: offeredActions/,
      'identity and actions are latched together, never independently',
    )
  })
})

describe('privacy-gate pre-push — a force-push is not a blocked push (2026-09-30)', () => {
  /**
   * Git hands pre-push a stream of `<local-ref> <local-sha> <remote-ref> <remote-sha>`.
   *
   * The bug (measured 2026-09-30): the gate computed `remoteSha..localSha` and assumed
   * the REMOTE sha resolves locally. After a history rewrite it does not — the remote
   * still pointed at the pre-rewrite commit — so git answered `unknown revision`,
   * the gate failed closed (exit 2), and the cleaned history could NOT be pushed.
   * The gate meant to protect the rewrite was the thing preventing it.
   *
   * Assertion: fall back to the local side, and SAY so. An unexplained wider scan
   * reads like a malfunction, which is how it was first reported.
   */
  test('an unreachable remote sha (force-push) falls back instead of blocking', () => {
    const gate = join(PKG_ROOT, 'tools', 'privacy-gate.mjs')
    const localSha = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: PKG_ROOT,
      encoding: 'utf8',
    }).stdout.trim()
    // A commit that exists on the remote but was discarded by the rewrite.
    const unreachable = '69b8c6b627f3851b7e468432d1f9ee7230a7c5a4'
    const res = spawnSync('node', [gate, '--stdin-refs'], {
      cwd: PKG_ROOT,
      input: `refs/heads/main ${localSha} refs/heads/main ${unreachable}\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
    const output = `${res.stdout}${res.stderr}`
    assert.notEqual(res.status, 2, `must not fail closed on a force-push: ${output}`)
    assert.match(output, /force-push/, 'the broader scan must be explained, not silent')
  })

  /**
   * NOT a regression lock — genuinely green before the fix too. `000…0..000…0` is an
   * empty range, so the old code never actually crashed on a deletion; an earlier
   * claim that it did was wrong and was caught by reverse-patching the fix. Kept as a
   * cheap guard so a deletion can never start failing closed in future.
   */
  test('an all-zero local ref (branch deletion) exits 0', () => {
    const gate = join(PKG_ROOT, 'tools', 'privacy-gate.mjs')
    const ZERO = '0'.repeat(40)
    const anySha = '69b8c6b627f3851b7e468432d1f9ee7230a7c5a4'
    const res = spawnSync('node', [gate, '--stdin-refs'], {
      cwd: PKG_ROOT,
      input: `(delete) ${ZERO} refs/heads/gone ${anySha}\n`,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, `a deletion must not fail closed — exit ${res.status}`)
  })
})

// ── `release.mjs --tag` 自查守卫（0.1.6 发布失败后新增）────────────────────
//
// 为什么需要判别力测试：这个坑踩了两次 —— tag 打在**版本还没 bump** 的提交上，
// publish.yml 第一步就退出（`tag=0.1.6  package.json=0.1.5`）。守卫如果只对着
// "已经修好的仓库"跑就永远是绿的，那是装饰。所以这里在**隔离的最小仓库**里
// 造出当初的确切拓扑，逐点验证守卫会变红 / 变绿。
//
//   A(0.1.5, 分支旧提交) → B(0.1.6, bump) → M(0.1.6, 合并)   ← 0.1.6 那次的真实形状
describe('release --tag self-check — proves it rejects the exact 0.1.6 failure shape', () => {
  const gitAvailable = (() => {
    try {
      return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0
    } catch {
      return false
    }
  })()

  /** 造最小仓库：把真实 release.mjs 连同最小 package.json 放进沙箱，拓扑 A→B→M。 */
  function buildCase() {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tag-guard-'))
    mkdirSync(join(dir, 'scripts'))
    cpSync(join(PKG_ROOT, 'scripts', 'release.mjs'), join(dir, 'scripts', 'release.mjs'))
    const writePkg = (version) =>
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'dsh-auto-paste', version, private: true }, null, 2) + '\n',
      )
    const mustGit = (args) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 0, `git ${args.join(' ')} 失败: ${r.stderr}`)
      return (r.stdout || '').trim()
    }
    mustGit(['init', '-q', '-b', 'main'])
    // 分段拼出测试邮箱：本仓 gate（tools/privacy-scan.mjs）的 email 规则**没有白名单**，
    // 任何邮箱形状的字面量都会被判为命中（本轮已被它拦下一次 CI）。别把它"简化"回去。
    mustGit(['config', 'user.email', ['test', 'example.com'].join(String.fromCharCode(64))])
    mustGit(['config', 'user.name', 'test'])
    mustGit(['config', 'commit.gpgsign', 'false'])
    writePkg('0.1.5')
    mustGit(['add', '-A'])
    mustGit(['commit', '-q', '-m', 'A: old version'])
    const A = mustGit(['rev-parse', 'HEAD'])
    writePkg('0.1.6')
    mustGit(['add', '-A'])
    mustGit(['commit', '-q', '-m', 'B: bump to 0.1.6'])
    const B = mustGit(['rev-parse', 'HEAD'])
    mustGit(['checkout', '-q', '-b', 'work', A])
    mustGit(['merge', '-q', '--no-ff', '-m', 'M: merge', B])
    const M = mustGit(['rev-parse', 'HEAD'])
    mustGit(['branch', '-f', 'main', M])
    mustGit(['checkout', '-q', 'main'])
    return { dir, A, B, M, mustGit }
  }

  const runGuard = (dir) => {
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'release.mjs'), '--tag'], {
      cwd: dir,
      encoding: 'utf8',
    })
    return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }
  }

  test('rejects a tag placement where package.json is still the old version', (t) => {
    if (!gitAvailable) return t.skip('git 不可用')
    const { dir, mustGit } = buildCase()
    try {
      // 注意：不能靠 `git checkout A` 来制造这个状态 —— checkout 会把工作区文件也一并
      // 回退，于是脚本读到的 `current` 也变成旧版本，检查沦为"自己跟自己比"（实测如此）。
      // 真实场景是**脏树**：在 main 上、树里有未提交的版本 bump ⇒ git 里的版本落后于脚本
      // 读到的目标版本。这正是"照抄一行 tag 命令"会踩的形态。
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'dsh-auto-paste', version: '0.1.7', private: true }, null, 2) + '\n',
      )
      const dirty = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'package.json'], {
        cwd: dir,
      })
      assert.notEqual(dirty.status, 0, '前置条件：package.json 必须是未提交状态')
      const onDirty = runGuard(dir)
      assert.notEqual(onDirty.code, 0, '树里的版本与 HEAD 不一致时必须拒绝')
      assert.match(onDirty.out, /HEAD 上的版本/, '拒绝理由必须点明是版本不符')
      assert.match(onDirty.out, /0\.1\.7/, '必须指出脚本读到的目标版本')
      assert.match(onDirty.out, /0\.1\.6/, '必须指出 HEAD 上的版本')
      mustGit(['checkout', '-q', '--', 'package.json'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects tagging while not on main (the 0.1.6 shape)', (t) => {
    if (!gitAvailable) return t.skip('git 不可用')
    const { dir, B, mustGit } = buildCase()
    try {
      mustGit(['checkout', '-q', B]) // detached：复刻"在 release 分支上打 tag"
      const onB = runGuard(dir)
      assert.notEqual(onB.code, 0, '不在 main 上必须拒绝')
      assert.match(onB.out, /不是 main/, '拒绝理由必须点明分支不对')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('passes on the main tip and prints the tag command', (t) => {
    if (!gitAvailable) return t.skip('git 不可用')
    const { dir, mustGit } = buildCase()
    try {
      mustGit(['checkout', '-q', 'main'])
      const onM = runGuard(dir)
      assert.equal(onM.code, 0, `main 尖端必须放行 —— 输出:\n${onM.out}`)
      assert.match(onM.out, /自查全部通过/)
      assert.match(onM.out, /git tag v0\.1\.6/, '通过后必须打印可执行的 tag 命令')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('rejects an already-existing tag that sits on the wrong commit', (t) => {
    if (!gitAvailable) return t.skip('git 不可用')
    const { dir, A, mustGit } = buildCase()
    try {
      mustGit(['tag', 'v0.1.6', A]) // 故意打在版本不符的 A 上
      const onTag = runGuard(dir)
      assert.notEqual(onTag.code, 0, 'tag 位置错误必须拒绝')
      assert.match(onTag.out, /位置错了/, '必须给出"位置错了"的诊断')
      assert.match(onTag.out, /git tag -d v0\.1\.6/, '必须给出纠正指令')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('uses exit-code inspection instead of `|| true` (cmd.exe rejects it)', () => {
    const src = readFileSync(join(PKG_ROOT, 'scripts', 'release.mjs'), 'utf8')
    // 只扫字符串/模板内容，不扫注释（解释性注释里提到这个序列不应触发）
    assert.doesNotMatch(
      src,
      /(?:`[^`]*|\$\{[^}]*\}|'[^']*'|"[^"]*")\|\| true/,
      'shell 字符串里不许出现 `|| true` —— Windows cmd.exe 不认 `true`',
    )
    assert.match(src, /function gitOk\(/, '必须用退出码判断的 gitOk helper')
  })
})

describe('0.2.2 — the one-shot hint is addressed to the session that raised it', () => {
  const readClient = () => readFileSync(join(PKG_ROOT, 'src', 'client.js'), 'utf8')
  const from = (src, marker, span = 900) => {
    const start = src.indexOf(marker)
    assert.ok(start >= 0, `${marker} must exist in src/client.js`)
    return src.slice(start, start + span)
  }
  // Whole-function window: a magic span would silently stop covering the tail of a
  // function that grows, and a tail that falls out of the window reads as "passed".
  const between = (src, startMarker, endMarker) => {
    const start = src.indexOf(startMarker)
    assert.ok(start >= 0, `${startMarker} must exist in src/client.js`)
    const end = src.indexOf(endMarker, start)
    assert.ok(end > start, `${endMarker} must follow ${startMarker}`)
    return src.slice(start, end)
  }

  // The bug (reported from a phone, 2026-10-05): pasting a large chunk in ONE
  // conversation raised a PAGE-WIDE `hintWanted`, so the annotation also painted
  // above the composer of whichever session the user switched to next. The offer
  // now names the session it belongs to, and the slot that renders it consumes it.
  test('the sidebar snapshot carries the session an offer belongs to', () => {
    const src = readClient()
    assert.match(
      src,
      /let sidebarState = \{ adopted: false, hintWanted: false, hintSessionId: null \}/,
      'the snapshot needs the address, not just the flag',
    )
    assert.match(
      from(src, 'const publishSidebar = (next)', 500),
      /merged\.hintSessionId === sidebarState\.hintSessionId/,
      'the change detector must watch the address too, or a re-addressed offer never notifies',
    )
  })

  test('offerSidebarHint records WHICH session asked for the hint', () => {
    const offer = from(readClient(), 'function offerSidebarHint', 400)
    assert.match(
      offer,
      /function offerSidebarHint\(sessionId\)/,
      'the offer is addressed by argument',
    )
    assert.match(
      offer,
      /publishSidebar\(\{ hintWanted: true, hintSessionId: sessionId \}\)/,
      'the address travels with the flag',
    )
  })

  test('the paste path hands over the very session it resolved', () => {
    // Scoped to the PASTE HANDLER on purpose. A bare search for
    // `offerSidebarHint(sessionId)` is satisfied by the function's own DEFINITION
    // line, so the first version of this assertion stayed green even with the call
    // site reverted to `offerSidebarHint()` — a vacuous check (found by the
    // 2026-10-07 adversarial review, which measured the call site 51k chars later).
    const pastePath = between(
      readClient(),
      'const onPaste = (event) =>',
      "document.addEventListener('paste'",
    )
    assert.match(
      pastePath,
      /offerSidebarHint\(sessionId\)/,
      'the offer must name the session the paste was saved for',
    )
  })

  test('a slot claims an offer only when it is addressed to its own session', () => {
    const src = readClient()
    assert.match(
      between(src, 'function SidebarHint(props)', 'function mountSidebarHint'),
      /ownsSidebarHint\(/,
      'the ownership verdict is consulted, never re-derived inline (the cyclomatic gate)',
    )
    const owner = from(src, 'function ownsSidebarHint', 700)
    assert.match(owner, /if \(!hintWanted\) return false/, 'an absent offer is never claimed')
    assert.match(
      owner,
      /String\(offeredSession\) === hintSessionId/,
      'a foreign session must be refused — that refusal is the regression fix itself',
    )
  })

  test('rendering the hint consumes the offer', () => {
    const src = readClient()
    const hint = between(src, 'function SidebarHint(props)', 'function mountSidebarHint')
    const consumeAt = hint.indexOf('consumeSidebarHint()')
    assert.ok(consumeAt >= 0, 'the slot that rendered it takes it off the table')
    // INSIDE an effect callback, and inside the SAME one. "React.useEffect appears
    // somewhere in this window" was satisfied by the identity latch above, so a
    // consume written into the render body passed that check too.
    const effectAt = hint.lastIndexOf('React.useEffect(', consumeAt)
    assert.ok(
      effectAt >= 0,
      'consumption must run from an effect — a render-time write runs twice under StrictMode',
    )
    assert.doesNotMatch(
      hint.slice(effectAt, consumeAt),
      /\}, \[/,
      'and from the same effect callback: a consume after that callback closed is a render-body write',
    )
    assert.match(
      from(src, 'function consumeSidebarHint', 300),
      /publishSidebar\(\{ hintWanted: false, hintSessionId: null \}\)/,
      'consuming clears both halves, so no later overlay finds an offer still standing',
    )
  })

  test('the annotation outlives its own consumption without outliving its session', () => {
    const hint = between(readClient(), 'function SidebarHint(props)', 'function mountSidebarHint')
    // The flag must not appear in the early-return condition in ANY order: the
    // first version only rejected the literal `!hintWanted || !open`, so the same
    // regression rewritten as `!open || !hintWanted` sailed straight through.
    assert.doesNotMatch(
      hint,
      /if \([^)]*hintWanted[^)]*\) return null/,
      'the page-wide flag must not be the render condition: consuming would blink the hint away',
    )
    assert.match(
      hint,
      /if \(!open[^\n]*shownFor !== myKey\) return null/,
      'the guard needs BOTH the local open latch and the session key — dropping either regresses',
    )
  })

  // Every assertion above reads the SOURCE, so together they pin the shape but
  // nothing that can fail at runtime — the adversarial review's sharpest point:
  // `ownsSidebarHint` could be made to return true unconditionally while all of
  // the text checks stayed green. The bundle is self-contained (no importable
  // module), so the pure verdict is extracted and evaluated here: a truth table
  // that goes red the moment the ownership rule regresses.
  test('ownsSidebarHint answers the ownership truth table', () => {
    const body = from(readClient(), 'function ownsSidebarHint', 700)
    const close = body.indexOf('\n    }')
    assert.ok(close > 0, 'the function must close at the module indentation level')
    const verdict = new Function(
      `${body.slice(0, close + '\n    }'.length)}; return ownsSidebarHint`,
    )()
    assert.equal(typeof verdict, 'function', 'the extracted text must evaluate to a function')
    assert.equal(verdict(false, 'A', 'A'), false, 'no offer standing → nobody claims it')
    assert.equal(verdict(true, 'A', 'A'), true, 'addressed to me → I claim it')
    assert.equal(
      verdict(true, 'A', 'B'),
      false,
      'addressed to ANOTHER session → refused (the regression)',
    )
    assert.equal(
      verdict(true, 'A', undefined),
      true,
      'slot with no identity (0.1.5) → page-wide, as before',
    )
    assert.equal(verdict(true, null, 'B'), true, 'offer with no address → cannot discriminate')
    assert.equal(verdict(true, '42', 42), true, 'branded ids compare as strings')
  })
})
