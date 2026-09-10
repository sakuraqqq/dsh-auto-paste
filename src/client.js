// dsh-auto-paste — client half (web platform): composer paste listener.
//
// Plain JS on purpose: no cross-bundle runtime imports, so the compiled
// bundle is self-contained and registers through the module-table handoff
// exactly like in-box client packages (see dsh-client-ui-input-trigger's
// lib/client.js: window.__ModuleLoader__.load({ id, factory })).
//
// Flow on a large paste into the composer textarea:
//   capture-phase 'paste' → text >= minChars → intercept →
//   connection.rpc.call('/api', 'pasteStore/savePaste', { args }) →
//   host writes <workspace>/pastes/<timestamp>.txt →
//   a file-path reference replaces the raw text in the composer.
// On any failure the original text is inserted instead — user data is
// never lost, the paste just falls back to normal behavior.
//
window.__ModuleLoader__.load({
  id: 'dsh-auto-paste',
  factory: () => {
    'use strict'

    const PACKAGE = 'dsh-auto-paste'
    // Mirrors the host row config (cordis.patch.yml `minChars`); the row
    // config also reaches apply() below and overrides this default.
    const DEFAULT_MIN_CHARS = 500
    // RPC timeout: pastes must land quickly; failure falls back to raw text.
    const RPC_TIMEOUT_MS = 15000

    const name = 'dsh-auto-paste'

    // Wait until the connection carrier and the sessions runtime are live.
    const inject = ['sessions', 'connection']

    /**
     * Is this paste target the dsh composer surface?
     * dsh <= 0.1.1 rendered the composer as a <textarea>; dsh >= 0.1.5 renders
     * it as a Lexical contenteditable div (dsh-client-ui-conversation's
     * ComposerContentEditable). Both carry `data-phase` and sit inside the
     * input scroll wrapper ([data-input-scroll]), so key on editable-ness plus
     * those anchors instead of the tag name alone — otherwise every paste on
     * the new composer early-returns silently.
     */
    function isComposerTarget(target) {
      if (!target || target.nodeType !== 1) return false
      const editable = target.tagName === 'TEXTAREA' || target.isContentEditable === true
      if (!editable) return false
      if (target.hasAttribute('data-phase')) return true
      return target.closest('[data-input-scroll]') !== null
    }

    /**
     * Fallback insertion for a contenteditable composer: splice a text node at
     * the live selection and emit a bubbling input event so editor listeners
     * (Lexical's beforeinput/input pipeline) stay in sync. Only reached when
     * execCommand('insertText') did not take.
     */
    function insertIntoContentEditable(target, text) {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return false
      const range = selection.getRangeAt(0)
      if (!target.contains(range.commonAncestorContainer)) return false
      range.deleteContents()
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      try {
        target.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
        )
      } catch {
        target.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return true
    }

    /**
     * execCommand('insertText') — the one insertion primitive that works for
     * both the legacy <textarea> and the current contenteditable composer (it
     * fires the input event the composer listens to). Returns false when the
     * API is unavailable or refused the insertion.
     */
    function insertViaExecCommand(text) {
      try {
        return document.execCommand('insertText', false, text) === true
      } catch {
        return false
      }
    }

    /**
     * Insert text at the caret. execCommand is the primary path; setRangeText
     * covers textarea/input engines without it; the Selection API covers the
     * contenteditable composer when execCommand is unavailable.
     */
    function insertTextAtCaret(target, text) {
      target.focus()
      let inserted = insertViaExecCommand(text)
      if (!inserted && typeof target.setRangeText === 'function') {
        const start = target.selectionStart ?? target.value.length
        const end = target.selectionEnd ?? start
        target.setRangeText(text, start, end, 'end')
        inserted = true
      }
      if (!inserted && target.isContentEditable === true) {
        insertIntoContentEditable(target, text)
      }
    }

    /** Call the host pasteStore service over the existing connection RPC. */
    async function savePaste(connection, sessionId, text) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
      try {
        const result = await connection.rpc.call(
          '/api',
          'pasteStore/savePaste',
          { args: { text, sessionId } },
          controller.signal,
        )
        if (result && result.ok && result.value) return result.value
        const detail =
          result && result.error ? `${result.error.code}: ${result.error.message}` : 'unknown error'
        throw new Error(`savePaste failed: ${detail}`)
      } finally {
        clearTimeout(timer)
      }
    }

    function apply(ctx, config = {}) {
      const minChars =
        typeof config.minChars === 'number' && config.minChars > 0
          ? config.minChars
          : DEFAULT_MIN_CHARS
      const sessions = ctx.sessions
      const connection = ctx.connection

      const onPaste = (event) => {
        const target = event.target
        if (!isComposerTarget(target)) return
        const clipboard = event.clipboardData
        if (!clipboard) return
        const text = clipboard.getData('text/plain')
        if (!text || text.length < minChars) return

        // Hardening: if the injected services never arrived, warn loudly and
        // fall back to plain paste instead of a silent TypeError mid-listener.
        if (!sessions || !connection) {
          console.warn(
            `[${PACKAGE}] sessions/connection services unavailable — large paste falls back to raw text (check dsh.client.inject in package.json, restart dsh, hard-refresh)`,
          )
          return
        }

        // The current agent session id (list snapshot `current`); no open
        // session means no workspace to write into — plain paste.
        const current = sessions.list.getSnapshot().current
        if (!current) return
        const sessionId = String(current)

        // Intercept: the large chunk lands in a file and the composer gets
        // a path reference (Chatbox-like attachment behavior).
        event.preventDefault()
        event.stopImmediatePropagation()

        savePaste(connection, sessionId, text)
          .then((result) => {
            const ref = `[已保存大段粘贴为附件: ${result.path} (${result.chars} 字符)]`
            insertTextAtCaret(target, ref)
            console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path}`)
          })
          .catch((error) => {
            // Never lose user data: on failure insert the original text.
            console.error(`[${PACKAGE}] paste save failed, falling back to raw text:`, error)
            insertTextAtCaret(target, text)
          })
      }

      document.addEventListener('paste', onPaste, true)
      ctx.effect(() => () => document.removeEventListener('paste', onPaste, true))
      console.log(`[${PACKAGE}] client paste listener ready (minChars=${minChars})`)
    }

    return { name, inject, apply }
  },
})
