"use strict";
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
        'use strict';
        const PACKAGE = 'dsh-auto-paste';
        // FALLBACK ONLY. The host owns the threshold (its loader row config is the
        // single authority) and hands the effective value over `pasteStore/getConfig`
        // below. This number applies while that call is in flight, or if it fails.
        // A client bundle never receives a loader row config — `dsh.client` accepts
        // only platform/inject/external/immediately, and the boot graph carries no
        // config — so a local copy could never track the configured value.
        const DEFAULT_MIN_CHARS = 500;
        // RPC timeout: pastes must land quickly; failure falls back to raw text.
        const RPC_TIMEOUT_MS = 15000;
        // The startup config fetch is best-effort: never stall the listener.
        const CONFIG_TIMEOUT_MS = 5000;
        // Live threshold the paste listener reads. Module scope rather than a closure
        // inside apply(), because the Settings row writes it too: a preference saved
        // there must reach the listener at once, with no page reload.
        let minChars = DEFAULT_MIN_CHARS;
        // The connection the Settings row writes through. Captured in apply() because
        // the settings section renders the row with no props of its own.
        let connectionRef = null;
        // The sessions runtime: the paste path resolves the owning session, and the
        // slot component latches the identity it was rendered for.
        let sessionsRef = null;
        // betterSidebar (OPTIONAL) is observed for PRESENCE only — see adoptBetterSidebar.
        // A live reference is deliberately NOT kept: this plugin no longer calls that
        // plugin's file API (a chip's click is routed by dsh itself, and better-sidebar
        // claims the address when it is installed), so a stored service would be
        // write-only — which the linter caught when the pill went away.
        //
        // Latch, set the first time a REAL service arrives and never cleared. The inject
        // callback runs with null whenever better-sidebar reloads or unloads, so "absent
        // right now" cannot tell "never installed" from "reloading" — the one-shot hint
        // and the settings row must key off THIS.
        let betterSidebarEverAdopted = false;
        // The one-shot sidebar hint: D1 semantics, i.e. showing it once counts as seen,
        // so it never nags twice. The General-settings row (below) stays as the place to
        // look the situation up later, which is why silencing the hint costs nothing.
        const SIDEBAR_HINT_KEY = 'dsh-auto-paste:sidebar-hint';
        // null = not read yet, so a denied storage is probed exactly once per page.
        let sidebarHintSeen = null;
        /** Has the one-shot hint been shown already? Cached — the hint re-renders often. */
        function readSidebarHint() {
            if (sidebarHintSeen === null) {
                try {
                    sidebarHintSeen = window.localStorage.getItem(SIDEBAR_HINT_KEY) === '1';
                }
                catch (error) {
                    // Private mode / disabled storage throws on access. The in-memory flag
                    // still keeps this page quiet; the cost is one extra showing per reload.
                    console.warn(`[${PACKAGE}] localStorage unavailable — the sidebar hint may return:`, error);
                    sidebarHintSeen = false;
                }
            }
            return sidebarHintSeen;
        }
        /** Remember that the hint has been shown. Best effort: storage may be denied. */
        function markSidebarHintSeen() {
            if (sidebarHintSeen === true)
                return;
            sidebarHintSeen = true;
            try {
                window.localStorage.setItem(SIDEBAR_HINT_KEY, '1');
            }
            catch (error) {
                console.warn(`[${PACKAGE}] could not persist the sidebar hint state:`, error);
            }
        }
        // What the sidebar surfaces re-render on: whether the optional integration was
        // ever adopted, whether the one-shot hint is currently wanted, and WHICH session
        // that offer belongs to. ONE snapshot object, replaced only when a value really
        // changes (a fresh object per render would make useSyncExternalStore loop forever).
        //
        // The address is not decoration: the composer overlay is rendered by EVERY
        // conversation, so a page-wide `hintWanted` also painted the annotation in
        // whichever session the user switched to next (reported from a phone,
        // 2026-10-05). An offer now names ONE session, and is consumed by its slot.
        let sidebarState = { adopted: false, hintWanted: false, hintSessionId: null };
        const sidebarListeners = new Set();
        const publishSidebar = (next) => {
            const merged = { ...sidebarState, ...next };
            if (merged.adopted === sidebarState.adopted &&
                merged.hintWanted === sidebarState.hintWanted &&
                merged.hintSessionId === sidebarState.hintSessionId) {
                return;
            }
            sidebarState = merged;
            for (const listener of sidebarListeners)
                listener();
        };
        const subscribeSidebar = (listener) => {
            sidebarListeners.add(listener);
            return () => {
                sidebarListeners.delete(listener);
            };
        };
        const readSidebar = () => sidebarState;
        const name = 'dsh-auto-paste';
        // Wait until the connection carrier and the sessions runtime are live.
        const inject = ['sessions', 'connection'];
        // ---- transient save toast (composer-card overlay) -----------------------
        // `react` is a platform seed word, so a self-contained bundle may require it
        // (same pattern as the shipped client packages). Everything below degrades
        // to a no-op when React or the slots service is missing — the paste path
        // must never depend on the toast.
        let React = null;
        try {
            React = require('react');
        }
        catch (error) {
            console.warn(`[${PACKAGE}] react unavailable — save toasts disabled:`, error);
        }
        /** How long one toast stays on screen. */
        const TOAST_MS = 2600;
        // Live auto-dismiss timers. Collected so teardown can cancel them: a timer
        // that survives unload would fire into a disposed plugin.
        const toastTimers = new Set();
        // Snapshot handed to useSyncExternalStore: a NEW array only when it changes,
        // the same reference otherwise (otherwise uSES re-renders forever).
        let toastList = [];
        let toastSeq = 0;
        const toastListeners = new Set();
        const publishToasts = () => {
            for (const listener of toastListeners)
                listener();
        };
        const subscribeToasts = (listener) => {
            toastListeners.add(listener);
            return () => {
                toastListeners.delete(listener);
            };
        };
        const readToasts = () => toastList;
        /** Show one transient line in dsh's frame-wide overlay; auto-dismisses. */
        function showToast(text, level) {
            const id = (toastSeq += 1);
            toastList = [...toastList, { id, text, level: level === 'error' ? 'error' : 'info' }];
            publishToasts();
            const timer = setTimeout(() => {
                toastTimers.delete(timer);
                toastList = toastList.filter((entry) => entry.id !== id);
                publishToasts();
            }, TOAST_MS);
            toastTimers.add(timer);
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
        ].join('');
        /** The overlay occupant: renders whatever the store currently holds. */
        function ToastHost() {
            const items = React.useSyncExternalStore(subscribeToasts, readToasts);
            if (items.length === 0)
                return null;
            return React.createElement('div', { className: 'dsh-auto-paste-toasts' }, items.map((entry) => React.createElement('div', {
                key: entry.id,
                role: 'status',
                className: `dsh-auto-paste-toast${entry.level === 'error' ? ' dsh-auto-paste-toast-error' : ''}`,
            }, entry.text)));
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
            if (React === null)
                return false;
            const slots = ctx.get('slots');
            if (slots === undefined || typeof slots.inject !== 'function')
                return false;
            ctx.effect(() => {
                const style = document.createElement('style');
                style.textContent = TOAST_CSS;
                document.head.appendChild(style);
                return () => style.remove();
            });
            ctx.effect(() => slots.inject('conversation.input.overlay', () => slots.register({
                name: 'conversation.input.overlay',
                id: PACKAGE,
                order: 100,
                label: 'dsh-auto-paste toasts',
            }, ToastHost)));
            return true;
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
            if (!target || target.nodeType !== 1)
                return false;
            const editable = target.tagName === 'TEXTAREA' || target.isContentEditable === true;
            if (!editable)
                return false;
            if (target.hasAttribute('data-phase'))
                return true;
            return target.closest('[data-input-scroll]') !== null;
        }
        /**
         * Fallback insertion for a contenteditable composer: splice a text node at
         * the live selection and emit a bubbling input event so editor listeners
         * (Lexical's beforeinput/input pipeline) stay in sync. Only reached when
         * execCommand('insertText') did not take.
         */
        function insertIntoContentEditable(target, text) {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0)
                return false;
            const range = selection.getRangeAt(0);
            if (!target.contains(range.commonAncestorContainer))
                return false;
            range.deleteContents();
            const node = document.createTextNode(text);
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            try {
                target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
            }
            catch {
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        }
        /**
         * execCommand('insertText') — the one insertion primitive that works for
         * both the legacy <textarea> and the current contenteditable composer (it
         * fires the input event the composer listens to). Returns false when the
         * API is unavailable or refused the insertion.
         */
        function insertViaExecCommand(text) {
            try {
                return document.execCommand('insertText', false, text) === true;
            }
            catch {
                return false;
            }
        }
        /**
         * Insert text at the caret. execCommand is the primary path; setRangeText
         * covers textarea/input engines without it; the Selection API covers the
         * contenteditable composer when execCommand is unavailable.
         *
         * Returns whether the text really landed. The save-failure path has to know:
         * reporting "pasted as-is" when nothing was inserted is a false promise.
         */
        function insertTextAtCaret(target, text) {
            target.focus();
            let inserted = insertViaExecCommand(text);
            if (!inserted && typeof target.setRangeText === 'function') {
                const start = target.selectionStart ?? target.value.length;
                const end = target.selectionEnd ?? start;
                target.setRangeText(text, start, end, 'end');
                inserted = true;
            }
            if (!inserted && target.isContentEditable === true) {
                inserted = insertIntoContentEditable(target, text) === true;
            }
            return inserted === true;
        }
        // ---- saved-paste reference: atomic chip, else the text token ---------------
        /**
         * The reference line we drop into the composer. ONE source: the removal path
         * searches for exactly this string, so a second copy anywhere would silently
         * break the bar button that depends on it.
         *
         * FALLBACK FORM. The preferred insertion is the composer's own ATOMIC chip
         * (see insertReferenceChip) — filename only, one Backspace to remove, click to
         * preview. This text token is what a deployment without that facade gets, or
         * what a refused edit falls back to; it is plain draft text in the composer
         * (the scan below runs on the COMPOSER's own rules, which do not match a
         * quoted token) and becomes the clickable chip once SENT.
         *
         * The shape is dsh's OWN reference grammar — a quoted `@"<path>"` token. The
         * transcript renderer (`projectUserText`, ui-primitives) scans user text for
         * it and turns it into a clickable file chip; the click opens the official
         * sidebar preview, which falls back to plain text for any suffix no other
         * viewer claims (`.txt` included) — so the saved paste is one click away with
         * no extra plugin. The model still reads the file itself: dsh-file-reference
         * documents that the grammar adds no request tokens.
         *
         * The LEADING SPACE is load-bearing, not cosmetic. That scan accepts a token
         * only at the draft start or after whitespace (`(^|\s)`), so a paste dropped
         * straight after a word would stay dead text. With the space both spellings
         * work: kept, it is the whitespace the scan wants; trimmed, the token reaches
         * position 0 and matches `^` instead.
         *
         * The count stays OUTSIDE the token: it must not be swallowed by the quoted
         * path, and it keeps the number on screen now that the reference carries no
         * prose of its own. `chars` arrives from the host and counts UTF-16 code units
         * (`String.prototype.length`) — an emoji counts as 2, a CJK char as 1. The
         * unit is frozen: references already sitting in old messages show numbers
         * computed this way, so re-deriving them differently would restate them.
         *
         * Known cosmetic limit of THIS form, measured rather than guessed: the
         * COMPOSER's own decoration scan (`FOLDER_REF_RE`, syntax-only, no lexicon
         * gate) claims the `@"<dir>/` prefix as a folder token, so a draft built from
         * this string tints `@"pastes/` and leaves the remainder plain. The chip path
         * (insertReferenceChip) has no such artefact — it inserts a node, not text.
         */
        function pasteReference(path, chars) {
            return ` @"${path}" (${chars} 字符)`;
        }
        /**
         * The chip payload for one saved paste.
         *
         * `ref` is the SAME mention the text form carries, and that is deliberate: the
         * reference source serializes a chip by returning `ref` verbatim
         * (`codec.serialize` in dsh-client-ui-reference), so the model receives exactly
         * the string it received before — a path it reads itself, never the 60 KB of
         * text. `label` is what the chip DISPLAYS: the basename, exactly like every other
         * dsh file chip, plus the frozen size — a card that showed only a filename would
         * hide how big the paste was, and the size cannot ride inside `ref`
         * (`openReference` derives the PATH from it; see insertReferenceChip).
         *
         * `source: 'reference'` names the `@file`/`@session` source. It must be that
         * literal: it is the serializer routing key (see insertReferenceChip).
         */
        function referenceChipOf(path, chars) {
            const mention = `@"${path}"`;
            const name = path.split('/').filter(Boolean).at(-1) ?? path;
            return {
                source: 'reference',
                ref: mention,
                label: `${name} · ${chars} 字符`,
                appearance: 'file',
                // NOT the bare mention (2026-10-02, decision C): this string IS the draft
                // projection, and dsh persists exactly that as the session draft — so after a
                // session switch the chip returns as TEXT. Carrying the size keeps that text as
                // informative as the pre-0.2.0 form. The model still gets the bare mention: at
                // send time the send path replaces this whole span with `serializeReference`.
                clipboardText: pasteReference(path, chars).trimStart(),
            };
        }
        /**
         * Resolve the composer's insertion parts for one session, or null when any of
         * them is missing.
         *
         * Extracted rather than inlined because of the complexity gate: five sequential
         * guards inside one function read as cyc 16 to ESLint (optional chaining counts
         * there), so the capability walk lives here and the editing attempt stays flat.
         * The session PAIRING is checked first: actions latched from another session can
         * never address this one's composer.
         */
        function composerInsertion(ctx, sessionId) {
            if (slotInput === null)
                return null;
            if (slotInput.sessionId !== sessionId)
                return null;
            const input = ctx.get('conversation')?.input;
            if (!input)
                return null;
            const scope = sessionsRef?.scope?.(sessionId);
            if (!scope)
                return null;
            return { input, scope, actions: slotInput.actions };
        }
        /**
         * Does the mention need a separating space in front of it?
         *
         * Both of dsh's reference scans anchor on `(^|\s)`: the composer's
         * `TEXT_REF_RE`/`FOLDER_REF_RE` (dsh-client-ui-conversation) and the transcript's
         * `projectUserText` (dsh-client-ui-primitives). A chip whose mention ends up glued
         * to the character in front of it is invisible to BOTH, so the paste renders as dead
         * plain text — exactly the 2026-10-02 report (mention glued to 说 / 是; the same
         * paste alone in the draft renders as a proper file card).
         *
         * The character is read from the composer DOM because the facade hands out draft
         * SPANS, not draft text. `true` is the fail-safe answer: an extra space is harmless,
         * a missing boundary costs the whole feature.
         */
        function needsBoundarySpace() {
            const root = document.querySelector('[data-input-scroll] [contenteditable="true"]');
            const selection = window.getSelection();
            if (root === null || selection === null || selection.rangeCount === 0)
                return true;
            const caret = selection.getRangeAt(0);
            if (!root.contains(caret.startContainer))
                return true;
            const before = document.createRange();
            before.selectNodeContents(root);
            before.setEnd(caret.startContainer, caret.startOffset);
            const text = before.toString();
            if (text === '')
                return false;
            return !/\s/u.test(text.slice(-1));
        }
        /**
         * Insert the saved paste as the composer's OWN atomic reference chip, so the
         * draft reads like dsh's own attachments instead of a path with a pill over it.
         *
         * What the chip buys, all of it dsh's own behaviour rather than ours
         * (chip-node.tsx + ui-reference): the node is a Lexical DECORATOR, so arrows
         * step over it and Backspace/Delete remove it WHOLE (`isKeyboardSelectable()`
         * is false on purpose); it renders `label`, so the composer shows the filename;
         * and a click routes to the source's `openReference`, which previews the
         * current file contents in the right Sidebar.
         *
         * Every piece is PROBED, never assumed, and the serializer probe is the
         * load-bearing one: a chip whose source has no registered serializer makes the
         * message unsendable ("no serializer for reference source"), which is far worse
         * than a plain-text reference. Missing facade, stale session, refused edit or a
         * throw all answer false, and the caller keeps the text path.
         *
         * @param ctx - plugin context, for the service lookups below.
         * @param sessionId - the session that owns the composer on screen.
         * @param path - workspace-relative path of the saved paste.
         * @param chars - UTF-16 length of the saved text, for the chip's size suffix.
         * @returns whether the chip really landed in the draft.
         */
        async function insertReferenceChip(ctx, sessionId, path, chars) {
            const parts = composerInsertion(ctx, sessionId);
            if (parts === null)
                return false;
            const chip = referenceChipOf(path, chars);
            try {
                // The submit path reads the same registry this asks, so a string answer is
                // the exact capability proof that sending will not throw later.
                const controller = ctx.get('inputTriggers')?.sessionOf?.(parts.scope);
                const signal = new AbortController().signal;
                const modelText = await controller?.serializeReference?.('reference', chip.ref, signal);
                if (typeof modelText !== 'string')
                    return false;
                const composer = parts.input.for(parts.scope);
                // Put a real space into the draft when the caret follows a non-space (see
                // needsBoundarySpace). It has to be a CHARACTER of its own, never part of the
                // chip: the chip's span is replaced by the bare mention at send time, so a space
                // carried inside it would vanish exactly when it is needed.
                if (needsBoundarySpace() && typeof composer.insertText === 'function') {
                    composer.insertText(' ', parts.actions.captureInsertion());
                }
                // Re-captured AFTER that edit: the space moved the draft revision, and
                // `insertReference` CAS-checks the span it is handed.
                const span = parts.actions.captureInsertion();
                return composer.insertReference(chip, span) === true;
            }
            catch (error) {
                console.warn(`[${PACKAGE}] atomic reference chip unavailable, using the text reference instead:`, error);
                return false;
            }
        }
        /**
         * The session identity the hint was RENDERED for, latched from the slot props.
         *
         * Two shapes, measured against both lines: dsh 0.1.5 rode the selection on the
         * list snapshot (`list.getSnapshot().current`); 0.1.7 moved the selection out of
         * ClientSessions and dropped that field entirely, but every `scope: 'session'`
         * slot component is handed the Session identity as a prop instead
         * (`SessionStandardProps.sessionId`). The hint lives in exactly such a slot
         * (`conversation.input.overlay`, scope 'session') and is rendered for the
         * composer on screen; the paste path resolves the same identity through
         * `currentSessionId()` below.
         */
        let slotSessionId = null;
        /**
         * The same latch for the Session's PUBLIC INPUT ACTIONS
         * (`SessionStandardProps.inputActions`), paired with the session they were
         * rendered for.
         *
         * `captureInsertion()` is the only sanctioned source of the revision-guarded
         * `TokenSpan` that `insertReference` CAS-checks — the caret lives in the
         * shell's Lexical editor, so a plugin cannot compute that span from outside.
         * The PAIRING is what keeps a session switch honest: a latch from the previous
         * session answers nothing for the new one (see insertReferenceChip), and the
         * paste falls back to the text reference.
         */
        let slotInput = null;
        /** The agent session on screen right now, or null when there is none. */
        function currentSessionId() {
            const current = sessionsRef?.list?.getSnapshot?.().current;
            if (current)
                return String(current);
            // 0.1.7 path: no `current` on the snapshot any more — use the slot identity.
            return slotSessionId;
        }
        // The one-shot sidebar annotation — everything the pill left behind. No border,
        // no shadow, one line that never wraps (measured 2026-09-16: bare text sat
        // unreadably on the empty-session title, and a wrapping line squeezed the pill).
        const HINT_CSS = [
            '.dsh-auto-paste-hint{position:absolute;left:50%;transform:translateX(-50%);bottom:40px;display:flex;',
            'align-items:center;gap:6px;padding:2px 8px;border-radius:8px;',
            'max-width:min(100%,var(--dsh-composer-card-max-width,640px));',
            'font-size:11px;line-height:16px;white-space:nowrap;pointer-events:auto;',
            'background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.72));',
            'color:var(--dsw-alias-label-primary,#f5f5f5);opacity:.85}',
            '.dsh-auto-paste-hint-text{min-width:0;overflow:hidden;text-overflow:ellipsis}',
            '.dsh-auto-paste-hint-close{flex:none;padding:0 4px;border:0;border-radius:999px;font:inherit;font-size:11px;',
            'cursor:pointer;background:transparent;color:inherit;opacity:.7}',
            '.dsh-auto-paste-hint-close:hover{opacity:1}',
        ].join('');
        // The one-shot copy. ONE short line on purpose. It names the plugin rather than an
        // install command: the upstream recipe is three profile-bound commands, which an
        // annotation cannot carry without turning into noise.
        const SIDEBAR_HINT_TEXT = '没装 dsh-better-sidebar（官方侧栏能看，装了能直接编辑）';
        /**
         * Should the one-shot "no sidebar" hint be offered? Extracted rather than inlined:
         * every `&&` counts toward the cyclomatic gate in tools/metrics.mjs. It fires for
         * a paste that landed as an atomic chip, and only while the integration was NEVER
         * there (see betterSidebarEverAdopted).
         */
        function shouldOfferSidebarHint() {
            if (betterSidebarEverAdopted)
                return false;
            return !readSidebarHint();
        }
        /**
         * Raise the one-shot hint, ADDRESSED to the session whose paste raised it. The
         * slot that matches the address marks it seen and consumes it (below).
         */
        function offerSidebarHint(sessionId) {
            if (!shouldOfferSidebarHint())
                return;
            publishSidebar({ hintWanted: true, hintSessionId: sessionId });
        }
        /**
         * Take the standing offer back, once its slot has rendered it.
         *
         * Without this the page-wide flag outlives the conversation that raised it: the
         * NEXT session's overlay finds `hintWanted` still true and paints the annotation
         * there. Consuming is what makes the hint belong to one conversation instead of
         * to the page.
         */
        function consumeSidebarHint() {
            publishSidebar({ hintWanted: false, hintSessionId: null });
        }
        /**
         * Does THIS slot instance own the offer? Extracted rather than inlined: every
         * `&&`/`||` counts toward the cyclomatic gate in tools/metrics.mjs.
         *
         * An address missing on either side cannot discriminate — dsh 0.1.5 hands the
         * overlay no session prop at all, and the offer is minted from the selection
         * snapshot there — so those cases keep the old page-wide behavior rather than
         * hiding the hint forever.
         */
        function ownsSidebarHint(hintWanted, hintSessionId, offeredSession) {
            if (!hintWanted)
                return false;
            if (hintSessionId === null || offeredSession === undefined || offeredSession === null) {
                return true;
            }
            return String(offeredSession) === hintSessionId;
        }
        /** A session identity in comparable form; null when the line hands none. */
        function sessionKey(value) {
            if (value === undefined || value === null)
                return null;
            return String(value);
        }
        /**
         * The composer's one-shot annotation — the last thing left of the pill. It no
         * longer describes a control: the CHIP owns both verbs now (Backspace removes it
         * whole, clicking previews the file), so this only says what is missing.
         */
        function SidebarHint(props) {
            const { hintWanted, hintSessionId } = React.useSyncExternalStore(subscribeSidebar, readSidebar);
            const [open, setOpen] = React.useState(false);
            // dsh 0.1.7 delivers the Session identity through these props; latch it for the
            // paste path (see slotSessionId). An effect, not a render-time write: render
            // stays free of side effects, and the latch is idempotent.
            const offeredSession = props === undefined || props === null ? undefined : props.sessionId;
            const offeredActions = props === undefined || props === null ? undefined : props.inputActions;
            React.useEffect(() => {
                if (offeredSession === undefined || offeredSession === null)
                    return;
                slotSessionId = String(offeredSession);
                // Paired latch: the actions belong to the session they were rendered for,
                // so a session switch cannot leave them addressable by the new one.
                slotInput =
                    offeredActions === undefined || offeredActions === null
                        ? null
                        : { sessionId: slotSessionId, actions: offeredActions };
            }, [offeredSession, offeredActions]);
            // WHICH conversation this annotation is on screen for. A LOCAL latch, not a
            // derived value: the offer is consumed the moment it renders (below), so the
            // page-wide state can no longer answer "was this one mine?". `undefined` is the
            // "never shown" sentinel, which is why a session-less slot keys to null.
            const [shownFor, setShownFor] = React.useState(undefined);
            // Ownership first: an offer addressed to ANOTHER conversation must render
            // nothing here, however loudly the page-wide flag is set.
            const mine = ownsSidebarHint(hintWanted, hintSessionId, offeredSession);
            const myKey = sessionKey(offeredSession);
            // D1: showing it counts as seen. Latched inside an effect, never during render —
            // a render-time write is a side effect and would run twice under StrictMode.
            React.useEffect(() => {
                if (!mine)
                    return;
                markSidebarHintSeen();
                setShownFor(myKey);
                setOpen(true);
                // Consumed AFTER the render that claimed it, and only by that render: a flag
                // left standing for the next conversation is what leaked the hint there.
                consumeSidebarHint();
            }, [mine, myKey]);
            // The local latch — not the consumed flag — keeps this annotation on screen.
            if (!open || shownFor !== myKey)
                return null;
            return React.createElement('div', { className: 'dsh-auto-paste-hint' }, React.createElement('span', { className: 'dsh-auto-paste-hint-text' }, SIDEBAR_HINT_TEXT), React.createElement('button', {
                type: 'button',
                className: 'dsh-auto-paste-hint-close',
                title: '知道了，不再提示',
                onClick: () => setOpen(false),
            }, '×'));
        }
        /**
         * Additive entry in the composer overlay (an ambient annotation over the composer
         * card, `replaceRisk` "none"). Returns false when the surface is unavailable.
         */
        function mountSidebarHint(ctx) {
            if (React === null)
                return false;
            const slots = ctx.get('slots');
            if (slots === undefined || typeof slots.inject !== 'function')
                return false;
            ctx.effect(() => {
                const style = document.createElement('style');
                style.textContent = HINT_CSS;
                document.head.appendChild(style);
                return () => style.remove();
            });
            ctx.effect(() => slots.inject('conversation.input.overlay', () => slots.register({
                name: 'conversation.input.overlay',
                // A DISTINCT id: the toast lives in this same slot, and a list slot
                // throws when a second entry reuses an id at the same priority.
                id: `${PACKAGE}:hint`,
                order: 90,
                label: 'dsh-auto-paste sidebar hint',
            }, SidebarHint)));
            return true;
        }
        /**
         * One `pasteStore` call over the existing connection RPC, with a timeout and
         * the gateway's ok/error envelope unwrapped. The single place the wire shape
         * is known, so the three callers cannot drift apart; the endpoint stays a
         * literal at each call site, so the wire name is greppable where it is used.
         */
        async function callPasteStore(connection, endpoint, args, timeoutMs) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const result = await connection.rpc.call('/api', endpoint, { args }, controller.signal);
                if (result && result.ok && result.value)
                    return result.value;
                const detail = result && result.error ? `${result.error.code}: ${result.error.message}` : 'unknown error';
                throw new Error(`${endpoint} failed: ${detail}`);
            }
            finally {
                clearTimeout(timer);
            }
        }
        /** Call the host pasteStore service over the existing connection RPC. */
        async function savePaste(connection, sessionId, text) {
            return callPasteStore(connection, 'pasteStore/savePaste', { text, sessionId }, RPC_TIMEOUT_MS);
        }
        /**
         * Adopt a config payload from the host. Shared by the startup fetch and the
         * Settings row, so both paths validate and report identically; returns false
         * when the payload is unusable and the previous value stays in force.
         */
        function applyRemoteConfig(remote, origin) {
            if (typeof remote.minChars === 'number' &&
                Number.isInteger(remote.minChars) &&
                remote.minChars > 0) {
                minChars = remote.minChars;
                console.log(`[${PACKAGE}] config from ${origin}: minChars=${remote.minChars} (${remote.minCharsSource}), maxBytes=${remote.maxBytes}`);
                return true;
            }
            console.warn(`[${PACKAGE}] ${origin} sent an unusable minChars (${JSON.stringify(remote.minChars)}) — keeping the ${minChars}-char threshold`);
            return false;
        }
        /**
         * Fetch the host's effective config. The paste decision has to be
         * synchronous (`preventDefault` must run inside the paste event itself), so
         * this runs once at startup instead of at paste time; the listener always
         * reads whichever value is current.
         */
        function fetchHostConfig(connection) {
            return callPasteStore(connection, 'pasteStore/getConfig', {}, CONFIG_TIMEOUT_MS);
        }
        // ---- General-settings row ----------------------------------------------
        // dsh's own seat for "a single setting that needs no page of its own". Its
        // doc is explicit that the row draws its own internals — copy, current value
        // and write path are all ours — because the section projects no label and
        // passes no props. Both read and write go through our own pasteStore RPC, so
        // the row never needs the browser-side settings service.
        const ROW_CSS = [
            '.dsh-auto-paste-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:8px 0}',
            '.dsh-auto-paste-row-main{display:flex;flex-direction:column;gap:2px;min-width:0}',
            '.dsh-auto-paste-row-label{font-size:13px;line-height:20px}',
            '.dsh-auto-paste-row-hint{font-size:12px;line-height:16px;opacity:.75}',
            '.dsh-auto-paste-row-note{font-size:12px;line-height:16px;margin-top:2px;color:var(--dsw-alias-state-business-primary,inherit)}',
            '.dsh-auto-paste-row-controls{display:flex;align-items:center;gap:8px;flex:none}',
            '.dsh-auto-paste-row-input{box-sizing:border-box;width:104px;padding:4px 8px;border-radius:8px;font:inherit;font-size:13px;',
            'border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));',
            'background:var(--dsw-specific-input-major,transparent);color:inherit}',
            '.dsh-auto-paste-row-button{padding:4px 10px;border:0;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;',
            'background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:inherit}',
            '.dsh-auto-paste-row-button:disabled{opacity:.5;cursor:default}',
        ].join('');
        /** One line explaining where the effective value comes from, and what blocks saving. */
        function thresholdHint(remote) {
            if (remote === null)
                return '正在读取 host 配置…';
            if (remote.canConfigure === false) {
                return '当前 dsh 无法在界面保存该值 —— 请改 cordis.patch.yml 的 minChars 并重启 dsh';
            }
            if (remote.minCharsSource === 'user') {
                return `已自定义；部署默认值 ${remote.deploymentMinChars} 字符（cordis.patch.yml）`;
            }
            return '跟随 cordis.patch.yml 的部署默认值';
        }
        /** The preference row: current value, save, and reset back to the deployment default. */
        function SettingsMinCharsRow() {
            const [remote, setRemote] = React.useState(null);
            const [draft, setDraft] = React.useState('');
            const [note, setNote] = React.useState('');
            const [busy, setBusy] = React.useState(false);
            const adopt = React.useCallback((next, message) => {
                setRemote(next);
                setDraft(String(next.minChars));
                setNote(message);
                applyRemoteConfig(next, 'settings');
            }, []);
            React.useEffect(() => {
                let mounted = true;
                if (connectionRef === null) {
                    setNote('connection 未就绪 —— 刷新页面后重试');
                    return undefined;
                }
                fetchHostConfig(connectionRef)
                    .then((payload) => {
                    if (mounted)
                        adopt(payload, '');
                })
                    .catch((reason) => {
                    if (mounted)
                        setNote(`读取 host 配置失败：${reason.message}`);
                });
                return () => {
                    mounted = false;
                };
            }, [adopt]);
            const write = (value) => {
                if (connectionRef === null)
                    return;
                setBusy(true);
                setNote('');
                callPasteStore(connectionRef, 'pasteStore/setMinChars', { value }, CONFIG_TIMEOUT_MS)
                    .then((payload) => adopt(payload, value === null ? '已恢复部署默认值' : '已保存，立即生效'))
                    .catch((reason) => setNote(`保存失败：${reason.message}`))
                    .finally(() => setBusy(false));
            };
            const editable = remote !== null && remote.canConfigure !== false;
            const submit = () => {
                const parsed = Number(draft);
                if (!Number.isInteger(parsed) || parsed <= 0) {
                    setNote('请输入正整数（字符数）');
                    return;
                }
                write(parsed);
            };
            return React.createElement('div', { className: 'dsh-auto-paste-row' }, React.createElement('div', { className: 'dsh-auto-paste-row-main' }, React.createElement('div', { className: 'dsh-auto-paste-row-label' }, '大段粘贴阈值'), React.createElement('div', { className: 'dsh-auto-paste-row-hint' }, `粘贴达到该字符数时保存为 pastes/ 附件，输入框里只留一行引用。${thresholdHint(remote)}`), note === ''
                ? null
                : React.createElement('div', { className: 'dsh-auto-paste-row-note' }, note)), React.createElement('div', { className: 'dsh-auto-paste-row-controls' }, React.createElement('input', {
                className: 'dsh-auto-paste-row-input',
                type: 'number',
                min: 1,
                step: 1,
                value: draft,
                disabled: !editable || busy,
                'aria-label': '大段粘贴阈值（字符）',
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                    if (event.key === 'Enter')
                        submit();
                },
            }), React.createElement('button', {
                type: 'button',
                className: 'dsh-auto-paste-row-button',
                disabled: !editable || busy,
                onClick: submit,
            }, '保存'), remote !== null && remote.minCharsSource === 'user'
                ? React.createElement('button', {
                    type: 'button',
                    className: 'dsh-auto-paste-row-button',
                    disabled: busy,
                    onClick: () => write(null),
                }, '恢复默认')
                : null));
        }
        // The settings-row explainer copy, kept beside its row: this is where a user
        // lands after dismissing (or never noticing) the one-shot hint.
        const SIDEBAR_ROW_TEXT = '未检测到 dsh-better-sidebar —— 装它后点粘贴卡片会用它的编辑器打开并可直接编辑 pastes/ 文件；dsh 自带的侧栏只能浏览，不能改。';
        // The missing integration, explained where a user would go looking for it. It
        // disappears for good once better-sidebar is adopted — the same latch the hint
        // uses — and subscribes to the same snapshot so it reacts to the async arrival.
        function SettingsSidebarRow() {
            React.useSyncExternalStore(subscribeSidebar, readSidebar);
            if (betterSidebarEverAdopted)
                return null;
            return React.createElement('div', { className: 'dsh-auto-paste-row' }, React.createElement('div', { className: 'dsh-auto-paste-row-main' }, React.createElement('div', { className: 'dsh-auto-paste-row-label' }, '侧栏集成'), React.createElement('div', { className: 'dsh-auto-paste-row-hint' }, SIDEBAR_ROW_TEXT)));
        }
        /**
         * Additive entry in the General settings section (`settings.general.item`,
         * replaceRisk "none": a fresh id sits beside the shipped rows). Returns false
         * when the surface is unavailable — saving pastes never depends on it.
         */
        function mountSettingsRow(ctx) {
            if (React === null)
                return false;
            const slots = ctx.get('slots');
            if (slots === undefined || typeof slots.inject !== 'function')
                return false;
            ctx.effect(() => {
                const style = document.createElement('style');
                style.textContent = ROW_CSS;
                document.head.appendChild(style);
                return () => style.remove();
            });
            ctx.effect(() => slots.inject('settings.general.item', () => slots.register({
                name: 'settings.general.item',
                // 30 = right after the shipped composer-enter row (20).
                id: PACKAGE,
                order: 30,
                label: '大段粘贴阈值',
            }, SettingsMinCharsRow)));
            // A DISTINCT id: the same id at the same priority inside one list slot throws.
            ctx.effect(() => slots.inject('settings.general.item', () => slots.register({
                name: 'settings.general.item',
                id: `${PACKAGE}:sidebar`,
                order: 31,
                label: '侧栏集成',
            }, SettingsSidebarRow)));
            return true;
        }
        /**
         * Note whether the OPTIONAL betterSidebar service is around. A one-shot
         * `ctx.get()` at activation is NOT enough: a service provided by a
         * later-activating plugin is simply not there yet (measured: it read as absent
         * while that plugin's tabs were already registered in the slot tree).
         *
         * PRESENCE ONLY since the pill was removed: this plugin no longer calls that
         * plugin's file API — a paste chip's click is routed by dsh itself, and
         * better-sidebar claims the address when it is installed — so its `features`
         * capability gate is no longer probed. What the flag drives is the one-shot hint
         * and the General-settings row.
         */
        function adoptBetterSidebar(service) {
            // Latch on the REAL service only: the dispose path passes null on every reload,
            // and a null there must never look like "was never installed".
            if (service !== null)
                betterSidebarEverAdopted = true;
            console.log(`[${PACKAGE}] betterSidebar ${service === null ? 'gone' : 'present'}`);
            // The settings row must re-render so its status line appears (or disappears)
            // with the service, and useSyncExternalStore compares snapshot identity.
            publishSidebar({ adopted: betterSidebarEverAdopted });
        }
        function apply(ctx) {
            const sessions = ctx.sessions;
            const connection = ctx.connection;
            connectionRef = connection ?? null;
            sessionsRef = sessions ?? null;
            ctx.inject(['betterSidebar'], (sidebarCtx) => {
                adoptBetterSidebar(sidebarCtx.get('betterSidebar') ?? null);
                return () => adoptBetterSidebar(null);
            });
            // The host is the authority. Until its answer lands — or if it never does —
            // the documented fallback (already sitting in `minChars`) stays in force, so
            // the paste listener is never blocked on a round trip.
            if (connection) {
                fetchHostConfig(connection)
                    .then((remote) => applyRemoteConfig(remote, 'host'))
                    .catch((error) => {
                    console.warn(`[${PACKAGE}] host config unavailable — keeping the ${minChars}-char fallback threshold:`, error);
                });
            }
            if (!mountToastSurface(ctx)) {
                console.warn(`[${PACKAGE}] toast surface unavailable (react=${React !== null}) — saves still work, just without the on-screen confirmation`);
            }
            // Unload hygiene: pending auto-dismiss timers must not fire into the
            // disposed plugin, so they are all cancelled when this fiber tears down.
            ctx.effect(() => () => {
                for (const timer of toastTimers)
                    clearTimeout(timer);
                toastTimers.clear();
            });
            if (!mountSettingsRow(ctx)) {
                console.warn(`[${PACKAGE}] settings row unavailable (react=${React !== null}) — minChars stays adjustable via cordis.patch.yml only`);
            }
            if (!mountSidebarHint(ctx)) {
                console.warn(`[${PACKAGE}] sidebar hint unavailable (react=${React !== null}) — pastes still save; only the one-shot hint is skipped`);
            }
            console.log(`[${PACKAGE}] client paste listener ready — waiting for the optional betterSidebar service`);
            const onPaste = (event) => {
                const target = event.target;
                if (!isComposerTarget(target))
                    return;
                const clipboard = event.clipboardData;
                if (!clipboard)
                    return;
                const text = clipboard.getData('text/plain');
                if (!text || text.length < minChars)
                    return;
                // Hardening: if the injected services never arrived, warn loudly and
                // fall back to plain paste instead of a silent TypeError mid-listener.
                if (!sessions || !connection) {
                    console.warn(`[${PACKAGE}] sessions/connection services unavailable — large paste falls back to raw text (check dsh.client.inject in package.json, restart dsh, hard-refresh)`);
                    return;
                }
                // The session that owns this composer; no session means no workspace to
                // write into — plain paste. Resolved through the ONE helper, which knows
                // both lines (0.1.5 list.current, 0.1.7 slot identity): reading the
                // snapshot here directly is what silently disabled every large paste on
                // 0.1.7, where that field no longer exists.
                const sessionId = currentSessionId();
                if (sessionId === null)
                    return;
                // Intercept: the large chunk lands in a file and the composer gets
                // a path reference (Chatbox-like attachment behavior).
                event.preventDefault();
                event.stopImmediatePropagation();
                savePaste(connection, sessionId, text)
                    .then(async (result) => {
                    // Preferred: the composer's own atomic chip — filename + size, one
                    // Backspace to remove, click to preview. The chip owns both verbs, so no
                    // pill is published any more; the only follow-up is the one-shot hint.
                    // The helper never throws (it answers false), so the catch below stays
                    // reserved for a genuine save failure.
                    if (await insertReferenceChip(ctx, sessionId, result.path, result.chars)) {
                        console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path} as an atomic reference chip`);
                        showToast(`已保存为 ${result.path}（${result.chars} 字符）`);
                        offerSidebarHint(sessionId);
                        return;
                    }
                    // Fallback: plain draft text (older dsh lines, a busy composer, or a lost
                    // span race). Same mention, so the model text is identical either way.
                    const ref = pasteReference(result.path, result.chars);
                    insertTextAtCaret(target, ref);
                    console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path}`);
                    showToast(`已保存为 ${result.path}（${result.chars} 字符）`);
                })
                    .catch((error) => {
                    // Never lose user data: on failure insert the original text — and
                    // report what actually happened, rather than assuming it worked.
                    console.error(`[${PACKAGE}] paste save failed, falling back to raw text:`, error);
                    const inserted = insertTextAtCaret(target, text);
                    showToast(inserted
                        ? '大段粘贴保存失败，已按原样粘贴回输入框'
                        : '大段粘贴保存失败，也没能自动插回输入框——内容还在剪贴板，请手动 Ctrl+V 重试', 'error');
                });
            };
            document.addEventListener('paste', onPaste, true);
            ctx.effect(() => () => document.removeEventListener('paste', onPaste, true));
            console.log(`[${PACKAGE}] client paste listener attached — threshold ${minChars} chars until the host's config arrives`);
        }
        return { name, inject, apply };
    },
});
