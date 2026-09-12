// dsh-auto-paste — client half (web platform): composer paste listener.
//
// Self-contained bundle: the only thing it requires is `react` (a platform seed
// word — see dsh-prompt-enhancer's generated wrapper for the same pattern), so
// the bundle stays pure while still rendering into dsh's UI through the slots
// registry. Registration goes through the module-table handoff exactly like
// in-box client packages (window.__ModuleLoader__.load({ id, factory })), and
// the factory receives the shared `require`.
//
// Flow on a large paste into the composer:
//   capture-phase 'paste' → text >= minChars → intercept →
//   connection.rpc.call('/api', 'pasteStore/savePaste', { args }) →
//   host writes <workspace>/pastes/<timestamp>.txt →
//   a file-path reference replaces the raw text in the composer, and a transient
//   toast reports the outcome in the composer card's own overlay seat
//   (conversation.input.overlay — the same place dsh's shipped input-bar toast
//   points at, `anchor: cardRef`).
// On any failure the original text is inserted instead — user data is never
// lost, the paste just falls back to normal behavior.
//
window.__ModuleLoader__.load({
  id: 'dsh-auto-paste',
  factory: (require) => {
    'use strict'

    const PACKAGE = 'dsh-auto-paste'
    // FALLBACK ONLY. The host owns the threshold (its loader row config is the
    // single authority) and hands the effective value over `pasteStore/getConfig`
    // below. This number applies while that call is in flight, or if it fails.
    // A client bundle never receives a loader row config — `dsh.client` accepts
    // only platform/inject/external/immediately, and the boot graph carries no
    // config — so a local copy could never track the configured value.
    const DEFAULT_MIN_CHARS = 500
    // RPC timeout: pastes must land quickly; failure falls back to raw text.
    const RPC_TIMEOUT_MS = 15000
    // The startup config fetch is best-effort: never stall the listener.
    const CONFIG_TIMEOUT_MS = 5000

    const name = 'dsh-auto-paste'

    // Wait until the connection carrier and the sessions runtime are live.
    const inject = ['sessions', 'connection']

    // ---- transient save toast (composer-card overlay) -----------------------
    // `react` is a platform seed word, so a self-contained bundle may require it
    // (same pattern as the shipped client packages). Everything below degrades
    // to a no-op when React or the slots service is missing — the paste path
    // must never depend on the toast.
    let React = null
    try {
      React = require('react')
    } catch (error) {
      console.warn(`[${PACKAGE}] react unavailable — save toasts disabled:`, error)
    }

    /** How long one toast stays on screen. */
    const TOAST_MS = 2600

    // Snapshot handed to useSyncExternalStore: a NEW array only when it changes,
    // the same reference otherwise (otherwise uSES re-renders forever).
    let toastList = []
    let toastSeq = 0
    const toastListeners = new Set()
    const publishToasts = () => {
      for (const listener of toastListeners) listener()
    }
    const subscribeToasts = (listener) => {
      toastListeners.add(listener)
      return () => {
        toastListeners.delete(listener)
      }
    }
    const readToasts = () => toastList

    /** Show one transient line in dsh's frame-wide overlay; auto-dismisses. */
    function showToast(text, level) {
      const id = (toastSeq += 1)
      toastList = [...toastList, { id, text, level: level === 'error' ? 'error' : 'info' }]
      publishToasts()
      setTimeout(() => {
        toastList = toastList.filter((entry) => entry.id !== id)
        publishToasts()
      }, TOAST_MS)
    }

    // The seat is dsh's own: `conversation.input.overlay` renders inside the
    // composer card's zero-height anchor strip — dsh ships
    // `.uV2eYG_overlayAnchor{height:0;position:absolute;inset:0 0 auto}`, i.e. a
    // full-width strip pinned to the card's TOP edge. The only placement we add
    // is inside that strip: pinned to its bottom edge (= the card's top edge)
    // and growing upward, which floats the bubble just above the composer —
    // where dsh's shipped input-bar toast sits. No invented screen coordinates:
    // the card owns the horizontal position and the width.
    const TOAST_CSS = [
      '.dsh-auto-paste-toasts{position:absolute;left:0;right:0;bottom:8px;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}',
      '.dsh-auto-paste-toast{box-sizing:border-box;max-width:100%;padding:8px 14px;border-radius:999px;',
      'border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));',
      'background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.94));',
      'color:var(--dsw-alias-label-primary,#f5f5f5);font-size:13px;line-height:18px;',
      'box-shadow:0 6px 24px rgba(0,0,0,.18);animation:dsh-auto-paste-toast-in .16s ease-out}',
      '.dsh-auto-paste-toast-error{border-color:var(--dsw-alias-state-error-primary,#e5484d);',
      'color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '@keyframes dsh-auto-paste-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    ].join('')

    /** The overlay occupant: renders whatever the store currently holds. */
    function ToastHost() {
      const items = React.useSyncExternalStore(subscribeToasts, readToasts)
      if (items.length === 0) return null
      return React.createElement(
        'div',
        { className: 'dsh-auto-paste-toasts' },
        items.map((entry) =>
          React.createElement(
            'div',
            {
              key: entry.id,
              role: 'status',
              className: `dsh-auto-paste-toast${entry.level === 'error' ? ' dsh-auto-paste-toast-error' : ''}`,
            },
            entry.text,
          ),
        ),
      )
    }

    /**
     * Best-effort toast surface: an additive entry in the composer card's own
     * overlay seat (`conversation.input.overlay`, replaceRisk "none" — a fresh
     * id sits BESIDE the shipped entries, never replacing them).
     *
     * That seat is session-scoped, but the binding comes from the RENDERER (the
     * renderer throws `scope 'session' rendered without a standard-source
     * binding` only when a session slot is rendered without one), and the
     * composer calls `renderSlot('conversation.input.overlay', {})` unfiltered
     * inside the card. So registering from this root fiber is enough:
     * `slots.inject` waits for the declaration that a mounted composer makes,
     * and re-runs it per declaration lifetime (dispose on collapse).
     *
     * Returns false when the surface is unavailable, in which case saves still
     * work and merely go unreported.
     */
    function mountToastSurface(ctx) {
      if (React === null) return false
      const slots = ctx.get('slots')
      if (slots === undefined || typeof slots.inject !== 'function') return false
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = TOAST_CSS
        document.head.appendChild(style)
        return () => style.remove()
      })
      ctx.effect(() =>
        slots.inject('conversation.input.overlay', () =>
          slots.register(
            {
              name: 'conversation.input.overlay',
              id: PACKAGE,
              order: 100,
              label: 'dsh-auto-paste toasts',
            },
            ToastHost,
          ),
        ),
      )
      return true
    }

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

    /**
     * Fetch the host's effective config. The paste decision has to be
     * synchronous (`preventDefault` must run inside the paste event itself), so
     * this runs once at startup instead of at paste time; the listener always
     * reads whichever value is current.
     */
    async function fetchHostConfig(connection) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS)
      try {
        const result = await connection.rpc.call(
          '/api',
          'pasteStore/getConfig',
          { args: {} },
          controller.signal,
        )
        if (result && result.ok && result.value) return result.value
        const detail =
          result && result.error ? `${result.error.code}: ${result.error.message}` : 'unknown error'
        throw new Error(`getConfig failed: ${detail}`)
      } finally {
        clearTimeout(timer)
      }
    }

    function apply(ctx) {
      const sessions = ctx.sessions
      const connection = ctx.connection

      // The host is the authority. Until its answer lands — or if it never does
      // — the documented fallback applies, so the listener is never blocked.
      let minChars = DEFAULT_MIN_CHARS
      if (connection) {
        fetchHostConfig(connection)
          .then((remote) => {
            if (
              typeof remote.minChars === 'number' &&
              Number.isInteger(remote.minChars) &&
              remote.minChars > 0
            ) {
              minChars = remote.minChars
              console.log(
                `[${PACKAGE}] config from host: minChars=${remote.minChars}, maxBytes=${remote.maxBytes}`,
              )
            } else {
              console.warn(
                `[${PACKAGE}] host sent an unusable minChars (${JSON.stringify(remote.minChars)}) — keeping the ${DEFAULT_MIN_CHARS}-char fallback`,
              )
            }
          })
          .catch((error) => {
            console.warn(
              `[${PACKAGE}] host config unavailable — keeping the ${DEFAULT_MIN_CHARS}-char fallback threshold:`,
              error,
            )
          })
      }

      if (!mountToastSurface(ctx)) {
        console.warn(
          `[${PACKAGE}] toast surface unavailable (react=${React !== null}) — saves still work, just without the on-screen confirmation`,
        )
      }

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
            showToast(`已保存为 ${result.path}（${result.chars} 字符）`)
          })
          .catch((error) => {
            // Never lose user data: on failure insert the original text.
            console.error(`[${PACKAGE}] paste save failed, falling back to raw text:`, error)
            insertTextAtCaret(target, text)
            showToast('大段粘贴保存失败，已按原样粘贴（内容未丢失）', 'error')
          })
      }

      document.addEventListener('paste', onPaste, true)
      ctx.effect(() => () => document.removeEventListener('paste', onPaste, true))
      console.log(
        `[${PACKAGE}] client paste listener attached — threshold ${minChars} chars until the host's config arrives`,
      )
    }

    return { name, inject, apply }
  },
})
