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
        // The sessions runtime, for the same reason: the capture bar renders OUTSIDE
        // apply()'s closure and must know which session is on screen right now.
        let sessionsRef = null;
        // betterSidebar (OPTIONAL): the sidebar's own file API. Absent when that plugin
        // is not installed — the bar then offers removal only, never a dead button.
        let betterSidebar = null;
        let betterSidebarCanOpen = false;
        // The most recent capture THIS page made, plus whether its reference is still
        // in the composer. One snapshot object, replaced only when it changes (a fresh
        // object per render would make useSyncExternalStore loop forever).
        let captureState = { capture: null, present: false };
        const captureListeners = new Set();
        const publishCapture = (next) => {
            captureState = next;
            for (const listener of captureListeners)
                listener();
        };
        const subscribeCapture = (listener) => {
            captureListeners.add(listener);
            return () => {
                captureListeners.delete(listener);
            };
        };
        const readCapture = () => captureState;
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
        // ---- capture bar (composer dock) ---------------------------------------
        /**
         * The reference line we drop into the composer. ONE source: the removal path
         * searches for exactly this string, so a second copy anywhere would silently
         * break the bar button that depends on it.
         */
        function pasteReference(path, chars) {
            return `[已保存大段粘贴为附件: ${path} (${chars} 字符)]`;
        }
        /** The live composer editable, or null. */
        function composerElement() {
            return document.querySelector('[data-input-scroll] [contenteditable="true"]');
        }
        /**
         * Range covering the first exact occurrence of `text` inside `root`, or null
         * when it is not there (the user edited or sent it away). Walks text nodes so
         * a reference the editor split across nodes still matches — textContent is
         * their concatenation, but a Range needs the two boundary nodes.
         */
        function textRangeOf(root, text) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodes = [];
            let all = '';
            for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
                nodes.push({ node, start: all.length });
                all += node.data;
            }
            const at = all.indexOf(text);
            if (at < 0)
                return null;
            const locate = (offset) => {
                for (let index = nodes.length - 1; index >= 0; index -= 1) {
                    if (offset >= nodes[index].start) {
                        return { node: nodes[index].node, offset: offset - nodes[index].start };
                    }
                }
                return null;
            };
            const from = locate(at);
            const to = locate(at + text.length);
            if (from === null || to === null)
                return null;
            const range = document.createRange();
            range.setStart(from.node, from.offset);
            range.setEnd(to.node, to.offset);
            return range;
        }
        /** The agent session on screen right now, or null when there is none. */
        function currentSessionId() {
            const current = sessionsRef?.list?.getSnapshot?.().current;
            return current ? String(current) : null;
        }
        /**
         * A capture belongs to the session that MADE it. Sessions are switched
         * constantly, and a bar left over from the previous one would sit on top of
         * another session's composer — its [查看] button even opening that other
         * session's file. So every read of the capture is filtered through this.
         */
        function captureBelongsToCurrentSession(capture) {
            return capture !== null && capture.sessionId === currentSessionId();
        }
        /**
         * Re-derive whether the reference is still in the composer. The bar exists
         * only while it is: once the user edits it away or sends the message, there is
         * nothing left to remove and the bar disappears by itself. A capture from a
         * session we have since left is dropped outright.
         */
        function refreshCapture() {
            const { capture } = captureState;
            if (capture === null)
                return;
            if (!captureBelongsToCurrentSession(capture)) {
                publishCapture({ capture: null, present: false });
                return;
            }
            const root = composerElement();
            const present = root !== null && root.textContent.includes(capture.ref);
            if (present !== captureState.present)
                publishCapture({ capture, present });
        }
        /** Drop the reference from the composer. The file stays on disk. */
        function removeCapture() {
            const { capture } = captureState;
            const root = composerElement();
            const selection = window.getSelection();
            if (capture === null || root === null || selection === null)
                return;
            const range = textRangeOf(root, capture.ref);
            if (range === null) {
                publishCapture({ capture: null, present: false });
                return;
            }
            root.focus();
            selection.removeAllRanges();
            selection.addRange(range);
            // A browser edit command, NOT raw DOM surgery: it raises beforeinput, which
            // is the only way Lexical hears about the change — text deleted behind its
            // back comes straight back on its next render. Same reason insertion uses
            // execCommand. Failure is reported rather than papered over.
            const removed = document.execCommand('delete') === true;
            refreshCapture();
            if (!removed || captureState.present) {
                showToast('没能从输入框移除那行引用，请手动选中删除（文件仍保留在 pastes/）', 'error');
                return;
            }
            publishCapture({ capture: null, present: false });
        }
        /** Show the captured text in the sidebar editor (better-sidebar owns the view). */
        function openCapture() {
            const { capture } = captureState;
            if (!captureBelongsToCurrentSession(capture) || betterSidebar === null)
                return;
            betterSidebar.openFile({ sessionId: capture.sessionId }, capture.path);
        }
        const BAR_CSS = [
            '.dsh-auto-paste-bar{position:absolute;left:50%;transform:translateX(-50%);bottom:40px;display:flex;align-items:center;',
            'gap:7px;max-width:min(100%,var(--dsh-composer-card-max-width,640px));pointer-events:auto;',
            'padding:3px 10px;border-radius:999px;font-size:12px;line-height:18px;',
            'border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));',
            'background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.94));',
            'color:var(--dsw-alias-label-primary,#f5f5f5);box-shadow:0 6px 24px rgba(0,0,0,.18)}',
            '.dsh-auto-paste-bar-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap}',
            '.dsh-auto-paste-bar-meta{opacity:.7;flex:none}',
            '.dsh-auto-paste-bar-spacer{flex:1}',
            '.dsh-auto-paste-bar-button{flex:none;padding:1px 8px;border:0;border-radius:999px;font:inherit;cursor:pointer;',
            'background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.18));color:inherit}',
            '.dsh-auto-paste-bar-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.3))}',
        ].join('');
        /** The ambient bar over the composer: which paste, how big, view, remove. */
        function CaptureBar() {
            const { capture, present } = React.useSyncExternalStore(subscribeCapture, readCapture);
            if (capture === null || present !== true || !captureBelongsToCurrentSession(capture)) {
                return null;
            }
            const actions = [];
            if (betterSidebarCanOpen) {
                actions.push(React.createElement('button', {
                    key: 'open',
                    type: 'button',
                    className: 'dsh-auto-paste-bar-button',
                    onClick: openCapture,
                }, '查看'));
            }
            actions.push(React.createElement('button', {
                key: 'drop',
                type: 'button',
                className: 'dsh-auto-paste-bar-button',
                title: '把这行引用从输入框移除（文件保留在 pastes/）',
                onClick: removeCapture,
            }, '×'));
            return React.createElement('div', { className: 'dsh-auto-paste-bar' }, React.createElement('span', { className: 'dsh-auto-paste-bar-name' }, capture.path), React.createElement('span', { className: 'dsh-auto-paste-bar-meta' }, `${capture.chars} 字符`), React.createElement('span', { className: 'dsh-auto-paste-bar-spacer' }), actions);
        }
        /**
         * Additive entry in the composer dock (an ambient row below the composer card,
         * `replaceRisk` "none"). Returns false when the surface is unavailable.
         */
        function mountCaptureBar(ctx) {
            if (React === null)
                return false;
            const slots = ctx.get('slots');
            if (slots === undefined || typeof slots.inject !== 'function')
                return false;
            ctx.effect(() => {
                const style = document.createElement('style');
                style.textContent = BAR_CSS;
                document.head.appendChild(style);
                return () => style.remove();
            });
            ctx.effect(() => slots.inject('conversation.input.overlay', () => slots.register({
                name: 'conversation.input.overlay',
                // A DISTINCT id: the toast lives in this same slot, and a list slot
                // throws when a second entry reuses an id at the same priority.
                id: `${PACKAGE}:capture`,
                order: 90,
                label: 'dsh-auto-paste capture bar',
            }, CaptureBar)));
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
                return '此部署没有 settings 提供方，无法在界面保存 —— 请改 cordis.patch.yml 的 minChars 并重启 dsh';
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
            return true;
        }
        /**
         * Adopt the OPTIONAL betterSidebar service whenever it appears. A one-shot
         * `ctx.get()` at activation is NOT enough: a service provided by a
         * later-activating plugin is simply not there yet (measured: it read as absent
         * while that plugin's tabs were already registered in the slot tree). `features`
         * is its documented capability gate — probe it, never assume the method exists.
         */
        function adoptBetterSidebar(service) {
            betterSidebar = service;
            betterSidebarCanOpen =
                service !== null && Array.isArray(service.features) && service.features.includes('openFile');
            console.log(`[${PACKAGE}] betterSidebar ${service === null ? 'gone' : `adopted (openFile=${betterSidebarCanOpen})`}`);
            // A NEW snapshot object: the bar must re-render so the view action appears (or
            // disappears) with the service, and useSyncExternalStore compares identity.
            publishCapture({ capture: captureState.capture, present: captureState.present });
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
            if (!mountCaptureBar(ctx)) {
                console.warn(`[${PACKAGE}] capture bar unavailable (react=${React !== null}) — pastes still save, the reference just cannot be removed from the bar`);
            }
            console.log(`[${PACKAGE}] capture bar ready — waiting for the optional betterSidebar service`);
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
                // The current agent session id (list snapshot `current`); no open
                // session means no workspace to write into — plain paste.
                const current = sessions.list.getSnapshot().current;
                if (!current)
                    return;
                const sessionId = String(current);
                // Intercept: the large chunk lands in a file and the composer gets
                // a path reference (Chatbox-like attachment behavior).
                event.preventDefault();
                event.stopImmediatePropagation();
                savePaste(connection, sessionId, text)
                    .then((result) => {
                    const ref = pasteReference(result.path, result.chars);
                    insertTextAtCaret(target, ref);
                    console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path}`);
                    showToast(`已保存为 ${result.path}（${result.chars} 字符）`);
                    // The bar mirrors this exact reference, so it lives exactly as long as
                    // the text does in the composer (the input listener re-checks it).
                    publishCapture({
                        capture: { path: result.path, chars: result.chars, ref, sessionId },
                        present: true,
                    });
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
            // Keeps the bar honest: editing or deleting the reference away hides it, and
            // sending the message (which clears the composer) hides it too.
            const onComposerInput = () => refreshCapture();
            document.addEventListener('input', onComposerInput, true);
            ctx.effect(() => () => document.removeEventListener('input', onComposerInput, true));
            console.log(`[${PACKAGE}] client paste listener attached — threshold ${minChars} chars until the host's config arrives`);
        }
        return { name, inject, apply };
    },
});
