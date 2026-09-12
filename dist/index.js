// dsh-auto-paste — host half (scaffolded by create-dsh-plugin tool template,
// extended with a pasteStore Service + save_paste tool).
//
// What the host half does:
//   1. Publishes the `pasteStore` Service with `savePaste(text, sessionId)`.
//      The web client calls it over the existing connection RPC channel
//      (`/api` → typert gateway → strict descriptor in ./typert.host.ts).
//   2. Registers the `save_paste` model tool as the discipline-based fallback:
//      when the user pastes a large chunk, the model (reminded via AGENTS.md
//      or the tool description) persists it and references the file path.
//
// Registration is an EFFECT: ctx.tools.register() auto-disposes on unload.
// Pure ESM ("type": "module"); @deepseek-ai/cordis is a peerDependency —
// the host hands us `ctx` and the Service base class at runtime.
//
import { join, dirname, basename, relative } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { defineTool } from '@deepseek-ai/dsh-tools';
// Plugin display name, shown in loader diagnostics.
export const name = 'dsh-auto-paste';
/** Narrow an internal write result to the boundary shape ({@link SavedPasteRef}). */
export function publicPasteRef(result) {
    return { path: result.path, bytes: result.bytes, chars: result.chars };
}
/** Longest accepted `label` (chars) — keeps names far below path limits. */
export const MAX_LABEL_CHARS = 32;
/** `label` charset: ASCII word chars, dash and underscore only (filename-safe). */
const LABEL_PATTERN = /^[A-Za-z0-9_-]+$/;
/**
 * Validate a paste `label` for use inside a filename. Whitelist-only, so a label
 * can never inject a path separator, a drive letter, a dot-directory or an
 * extension. Throws a descriptive error on any violation; never rewrites
 * silently, so the caller always sees the bad input.
 */
export function sanitizeLabel(raw) {
    if (typeof raw !== 'string' || raw.length === 0) {
        throw new Error(`label must be a non-empty ASCII string (got ${JSON.stringify(raw)})`);
    }
    if (raw.length > MAX_LABEL_CHARS) {
        throw new Error(`label too long: ${raw.length} chars exceeds the ${MAX_LABEL_CHARS}-char limit (got ${JSON.stringify(raw)})`);
    }
    if (!LABEL_PATTERN.test(raw)) {
        throw new Error(`label may only contain [A-Za-z0-9_-] (got ${JSON.stringify(raw)})`);
    }
    return raw;
}
/**
 * Windows-safe timestamp filename: `20260815-103000.txt`, or
 * `20260815-103000-<label>.txt` when a label is given. The label is
 * re-validated here — the write path never trusts an upstream check alone.
 */
export function pasteFilename(now = new Date(), label) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`;
    return label === undefined ? `${d}-${t}.txt` : `${d}-${t}-${sanitizeLabel(label)}.txt`;
}
/** Default max UTF-8 bytes a single paste may occupy (1 MiB). */
export const MAX_PASTE_BYTES = 1024 * 1024;
/** Hard ceiling for the configurable `maxBytes` (64 MiB). */
export const MAX_PASTE_BYTES_CAP = 64 * 1024 * 1024;
/**
 * Resolve the configured `maxBytes`: `undefined` falls back to the default,
 * anything else must be a positive integer within the hard ceiling. Throws on
 * violation so the caller decides (boot logs it, then falls back to default).
 */
export function resolveMaxBytes(raw) {
    if (raw === undefined)
        return MAX_PASTE_BYTES;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        throw new Error(`maxBytes must be an integer (got ${JSON.stringify(raw)})`);
    }
    if (raw <= 0) {
        throw new Error(`maxBytes must be positive (got ${raw})`);
    }
    if (raw > MAX_PASTE_BYTES_CAP) {
        throw new Error(`maxBytes ${raw} exceeds the ${MAX_PASTE_BYTES_CAP}-byte hard ceiling`);
    }
    return raw;
}
/**
 * Default large-paste threshold (chars). The HOST owns this number: the web
 * client cannot read the loader row config (dsh never hands a client bundle
 * one — `dsh.client` accepts only platform/inject/external/immediately, and the
 * boot graph carries no config), so it fetches the effective value from us over
 * the RPC instead. One authority, no second default to drift.
 */
export const MIN_CHARS_DEFAULT = 500;
/**
 * Settings namespace this plugin owns (`settings.register` requires a lowercase
 * hyphenated identifier). The browser side backs it with a row in dsh's General
 * settings section (`settings.general.item`).
 */
export const PASTE_SETTINGS_NAMESPACE = 'dsh-auto-paste';
/** Field inside {@link PASTE_SETTINGS_NAMESPACE} carrying the user's threshold. */
export const MIN_CHARS_FIELD = 'minChars';
/**
 * Durable user layer, deliberately `required(false)`: an absent field means "the
 * user never overrode this", which is exactly what keeps `cordis.patch.yml` the
 * deployment default instead of being shadowed by a schema default.
 */
export const PasteSettingsSchema = z.object({
    [MIN_CHARS_FIELD]: z.natural().min(1).required(false),
});
/**
 * Resolve the configured `minChars`: `undefined` falls back to the default,
 * anything else must be a positive integer. Throws on violation so the caller
 * decides (boot logs it, then falls back to the default) — deliberately the
 * same shape as {@link resolveMaxBytes}.
 */
export function resolveMinChars(raw) {
    if (raw === undefined)
        return MIN_CHARS_DEFAULT;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        throw new Error(`minChars must be an integer (got ${JSON.stringify(raw)})`);
    }
    if (raw <= 0) {
        throw new Error(`minChars must be positive (got ${raw})`);
    }
    return raw;
}
/**
 * Combine the two layers: a usable stored value wins, otherwise the deployment
 * value. An unusable value on either side is ignored rather than trusted — the
 * schema already refuses one at the document boundary, but this function stays
 * total so a hand-edited document can never break the paste path.
 */
export function effectiveMinChars(stored, deployment) {
    const usable = (value) => typeof value === 'number' && Number.isInteger(value) && value > 0;
    if (usable(stored))
        return { minChars: stored, source: 'user' };
    return { minChars: usable(deployment) ? deployment : MIN_CHARS_DEFAULT, source: 'deployment' };
}
/**
 * Guard against oversized pastes (resource-exhaustion vector): the web client
 * applies its own char floor (the host's effective `minChars`), but the RPC and
 * the model tool can be called with arbitrary text, so the server rejects
 * anything above `maxBytes` BEFORE any file is created. Throws on violation.
 */
export function assertPasteSize(text, maxBytes = MAX_PASTE_BYTES) {
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > maxBytes) {
        throw new Error(`paste too large: ${bytes} bytes exceeds the ${maxBytes}-byte limit; refusing to write`);
    }
}
/**
 * Write one paste under `<workspaceDir>/pastes/<timestamp>[-<label>].txt`.
 * Pure standalone function — unit-testable without a booted harness.
 * Same-second collisions append `-<n>` AFTER the label (see the loop below).
 */
export async function savePasteTo(workspaceDir, text, now = new Date(), maxBytes = MAX_PASTE_BYTES, label) {
    assertPasteSize(text, maxBytes);
    const rel = join('pastes', pasteFilename(now, label));
    const base = join(workspaceDir, rel);
    // Private by default: a paste can hold anything the user copied. 0700/0600 are
    // the POSIX answer (Windows ignores `mode`, where the per-user profile ACL
    // already scopes access, so this is additive rather than a behaviour change).
    await mkdir(dirname(base), { recursive: true, mode: 0o700 });
    // Atomic exclusive create: EEXIST means another writer (concurrent
    // same-timestamp save, or an existing file) claimed this name first —
    // bump the -n suffix and retry. No check-then-write race window.
    let target = base;
    for (let n = 0;; n += 1) {
        const candidate = n === 0 ? base : join(workspaceDir, 'pastes', `${basename(rel, '.txt')}-${n}.txt`);
        try {
            await writeFile(candidate, text, { flag: 'wx', mode: 0o600 });
            target = candidate;
            break;
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
    }
    return {
        path: relative(workspaceDir, target).split('\\').join('/'),
        absolutePath: target,
        bytes: Buffer.byteLength(text, 'utf8'),
        chars: text.length,
    };
}
/** The registered workspaces, or undefined when the host exposes no registry. */
function registeredWorkspaces(ctx) {
    const registry = ctx.get('workspaceRegistry');
    return registry?.list();
}
/**
 * Build the refusal error. Deliberately actionable — it states WHY the write was
 * refused, WHICH session was involved, EVERY workspace currently registered, and
 * HOW to recover. It never offers a fallback: silently writing into the wrong
 * workspace is worse than a visible failure.
 */
function workspaceRefusal(reason, workspaces, sessionId) {
    const who = sessionId === undefined ? 'this call carried no session id' : `session "${sessionId}"`;
    const list = workspaces
        .map((workspace) => {
        const n = workspace.sessionIds.length;
        return `  - ${workspace.path}  (${n} session${n === 1 ? '' : 's'})`;
    })
        .join('\n');
    return new Error(`[dsh-auto-paste] refusing to save the paste: ${reason} (${who}).\n` +
        `Registered workspaces (${workspaces.length}):\n${list}\n` +
        'How to fix: paste from a session that belongs to one of those workspaces (a session is ' +
        'registered to the workspace it was started in), or start a session for the workspace you ' +
        'want and paste again. Nothing was written.');
}
/**
 * Resolve the workspace directory a session belongs to. STRICT by design:
 *   - session matched to a workspace       → that path
 *   - session given but registered nowhere → throws (refuses to guess)
 *   - no session id, exactly one workspace → that path (unambiguous)
 *   - no session id, several workspaces    → throws (ambiguous)
 *   - no registry / no workspaces          → undefined (nothing to route into)
 * `undefined` therefore means "there is genuinely no workspace to write into";
 * every "could pick the wrong one" case fails loudly with a recovery hint.
 */
export function resolveWorkspaceDir(ctx, sessionId) {
    const workspaces = registeredWorkspaces(ctx);
    if (workspaces === undefined || workspaces.length === 0)
        return undefined;
    if (sessionId !== undefined) {
        const owned = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
        if (owned !== undefined)
            return owned.path;
        throw workspaceRefusal('this session is not registered to any workspace, and guessing one could write the paste into the wrong project', workspaces, sessionId);
    }
    if (workspaces.length > 1) {
        throw workspaceRefusal('no session id was available, so the target workspace is ambiguous', workspaces);
    }
    return workspaces[0]?.path;
}
/** True when `dir` matches one of the registered workspace paths (platform-aware). */
export function isRegisteredWorkspace(dir, workspaces) {
    const norm = (p) => {
        const cleaned = p.replace(/[\\/]+$/, '').replace(/\\/g, '/');
        return process.platform === 'win32' ? cleaned.toLowerCase() : cleaned;
    };
    const target = norm(dir);
    return workspaces.some((workspace) => norm(workspace.path) === target);
}
/** Host service the web client calls via the connection RPC (`/api`). */
class PasteStoreService extends TypertRemoteService {
    /** Deployment default char threshold, from the loader row config (cordis.patch.yml). */
    deploymentMinChars;
    /** Effective byte ceiling for one paste (resolved once at boot). */
    maxBytes;
    constructor(ctx, deploymentMinChars, maxBytes) {
        super(ctx, 'pasteStore');
        this.deploymentMinChars = deploymentMinChars;
        this.maxBytes = maxBytes;
    }
    /** The settings service for this context, or undefined without a provider. */
    settings() {
        return this.ctx.get('settings');
    }
    /** The effective threshold right now, together with the layer it came from. */
    effective() {
        const stored = this.settingsValue();
        return effectiveMinChars(stored?.[MIN_CHARS_FIELD], this.deploymentMinChars);
    }
    /** The user layer as stored, or undefined when nothing is stored (or no provider). */
    settingsValue() {
        const value = this.settings()?.get(PASTE_SETTINGS_NAMESPACE);
        return typeof value === 'object' && value !== null
            ? value
            : undefined;
    }
    /** Build the wire payload the browser reads (and re-reads after every write). */
    config() {
        const { minChars, source } = this.effective();
        return {
            minChars,
            maxBytes: this.maxBytes,
            minCharsSource: source,
            deploymentMinChars: this.deploymentMinChars,
            canConfigure: this.settings() !== undefined,
        };
    }
    /**
     * The effective configuration, for the web client. This is the ONLY way the
     * threshold reaches the browser: a client bundle never receives the loader row
     * config, so without this call the client would be stuck on its own built-in
     * default and the documented knob would be silently inert. Re-read on every
     * call, so a preference saved in Settings applies without a restart.
     */
    getConfig() {
        return this.config();
    }
    /**
     * Store the user's threshold, or clear it (`null`). Clearing is a path-addressed
     * `unset` of OUR OWN field: `replace(ns, {})` resets the whole namespace (and
     * would silently drop any field this plugin does not own), while a merge
     * `update` cannot express removal at all. `mutate` is the precise way back to
     * the deployment default.
     */
    async setMinChars(value) {
        const settings = this.settings();
        if (settings === undefined) {
            throw new Error('pasteStore.setMinChars: this deployment has no settings provider, so the preference cannot be stored — set minChars in cordis.patch.yml and restart dsh instead');
        }
        if (value === null) {
            await settings.mutate(PASTE_SETTINGS_NAMESPACE, [{ op: 'unset', path: [MIN_CHARS_FIELD] }]);
        }
        else {
            // Same validation as the row config, so both entry points reject identically.
            await settings.update(PASTE_SETTINGS_NAMESPACE, { [MIN_CHARS_FIELD]: resolveMinChars(value) });
        }
        return this.config();
    }
    /** Save one pasted text chunk into the session workspace's pastes/ dir. */
    async savePaste(text, sessionId) {
        // Runtime guard: the wire validates its own callers, but this is a public
        // service — a direct (in-process) caller can hand us anything, and the value
        // would otherwise travel to a filesystem write. Refuse it by name.
        if (typeof text !== 'string') {
            throw new Error(`pasteStore.savePaste: text must be a string (got ${typeof text})`);
        }
        const dir = resolveWorkspaceDir(this.ctx, sessionId);
        if (dir === undefined)
            throw new Error('pasteStore: no workspace available to save the paste into');
        // The absolute path never crosses the wire (see SavedPasteRef).
        return publicPasteRef(await savePasteTo(dir, text, new Date(), this.maxBytes));
    }
}
// Wait until the host's tool registry (ctx.tools) is ready before running.
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    // An invalid value must never pass silently: log it, then fall back to the
    // default, so a typo in the row config stays visible instead of taking the
    // plugin down. Same shape for both knobs.
    let minChars = MIN_CHARS_DEFAULT;
    try {
        minChars = resolveMinChars(config.minChars);
    }
    catch (error) {
        console.error(`[dsh-auto-paste] invalid minChars in config — falling back to ${MIN_CHARS_DEFAULT} chars:`, error);
    }
    let maxBytes = MAX_PASTE_BYTES;
    try {
        maxBytes = resolveMaxBytes(config.maxBytes);
    }
    catch (error) {
        console.error(`[dsh-auto-paste] invalid maxBytes in config — falling back to ${MAX_PASTE_BYTES} bytes:`, error);
    }
    // Declare the user-preference namespace when this deployment has a settings
    // provider. Deliberately optional: a profile without settings still gets the
    // plugin, it just keeps the cordis.patch.yml value (and the General row says so
    // instead of failing).
    ctx.inject(['settings'], (settingsCtx) => {
        // `settings` is provided by the composition, so the Cordis Context type does
        // not carry it; the cast only names the slice we call (SettingsServiceLike).
        const settings = settingsCtx.settings;
        settings.register(PASTE_SETTINGS_NAMESPACE, PasteSettingsSchema, { applies: 'live' });
    });
    new PasteStoreService(ctx, minChars, maxBytes);
    ctx.tools.register(defineTool({
        // The name the model uses to call this tool.
        name: 'save_paste',
        // Discipline fallback: the model persists big user pastes and references
        // the file path instead of echoing the whole chunk back.
        description: `Persist a large pasted text chunk to pastes/<timestamp>.txt in the current session workspace, and return the workspace-relative path to reference in the reply. Use this whenever the user pastes a big block of text (roughly ${minChars}+ characters): save it, then work against the file instead of echoing the raw text.`,
        parameters: {
            text: {
                type: 'string',
                required: true,
                description: 'The full pasted text chunk to persist verbatim.',
            },
            label: {
                type: 'string',
                description: 'Optional short label appended after the timestamp in the filename: pastes/<timestamp>-<label>.txt. ASCII [A-Za-z0-9_-], max 32 chars; an invalid label fails the call.',
            },
        },
        output: {
            // Boundary shape (SavedPasteRef): the absolute path is deliberately absent —
            // the tool result is what lands in the model's context.
            schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', required: true, description: 'Workspace-relative file path (pastes/<timestamp>.txt).' },
                    bytes: { type: 'integer', required: true, description: 'UTF-8 bytes written.' },
                    chars: { type: 'integer', required: true, description: 'Length in UTF-16 code units (an emoji counts as 2).' },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Saved paste to ${value.path} (${value.bytes} bytes). Reference this file path in your reply.`,
                }],
        },
        // The tool call executes in the calling agent's session; its header cwd
        // is the session workspace directory (same source dsh-tool-pwsh uses).
        async execute(args, exec) {
            const headerCwd = exec.agent?.session?.header?.cwd;
            const dir = typeof headerCwd === 'string' && headerCwd.length > 0
                ? headerCwd
                : resolveWorkspaceDir(ctx);
            if (dir === undefined)
                throw new Error('save_paste: cannot resolve the session workspace directory');
            // Defense: only write inside a registered workspace (header.cwd is
            // dsh-controlled in practice, but never trust it blindly).
            const registered = registeredWorkspaces(ctx) ?? [];
            if (!isRegisteredWorkspace(dir, registered)) {
                throw new Error(`save_paste: refusing to write outside a registered workspace (${dir})`);
            }
            return publicPasteRef(await savePasteTo(dir, args.text, new Date(), maxBytes, args.label));
        },
    }));
    // Self-check (spike-proven): confirm the tool actually landed in the registry.
    console.log(`[dsh-auto-paste] host ready — pasteStore service + save_paste tool listed=${ctx.tools.get('save_paste') !== undefined} (minChars=${minChars}, maxBytes=${maxBytes})`);
}
