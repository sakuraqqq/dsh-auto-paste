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
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { defineTool } from '@deepseek-ai/dsh-tools';
// Plugin display name, shown in loader diagnostics.
export const name = 'dsh-auto-paste';
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
 * Guard against oversized pastes (resource-exhaustion vector): the web client
 * applies its own 500-char floor, but the RPC and the model tool can be called
 * with arbitrary text, so the server rejects anything above `maxBytes` BEFORE
 * any file is created. Throws on violation.
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
    await mkdir(dirname(base), { recursive: true });
    // Atomic exclusive create: EEXIST means another writer (concurrent
    // same-timestamp save, or an existing file) claimed this name first —
    // bump the -n suffix and retry. No check-then-write race window.
    let target = base;
    for (let n = 0;; n += 1) {
        const candidate = n === 0 ? base : join(workspaceDir, 'pastes', `${basename(rel, '.txt')}-${n}.txt`);
        try {
            await writeFile(candidate, text, { flag: 'wx' });
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
/**
 * Resolve the workspace directory a session belongs to (header-validated
 * membership), falling back to the first registered workspace.
 */
export function resolveWorkspaceDir(ctx, sessionId) {
    const registry = ctx.get('workspaceRegistry');
    if (registry === undefined)
        return undefined;
    const workspaces = registry.list();
    if (workspaces.length === 0)
        return undefined;
    if (sessionId !== undefined) {
        const owned = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
        if (owned !== undefined)
            return owned.path;
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
    /** Effective byte ceiling for one paste (resolved once at boot). */
    maxBytes;
    constructor(ctx, maxBytes) {
        super(ctx, 'pasteStore');
        this.maxBytes = maxBytes;
    }
    /** Save one pasted text chunk into the session workspace's pastes/ dir. */
    async savePaste(text, sessionId) {
        const dir = resolveWorkspaceDir(this.ctx, sessionId);
        if (dir === undefined)
            throw new Error('pasteStore: no workspace available to save the paste into');
        return savePasteTo(dir, text, new Date(), this.maxBytes);
    }
}
// Wait until the host's tool registry (ctx.tools) is ready before running.
export const inject = ['tools'];
export function apply(ctx, config = {}) {
    const minChars = typeof config.minChars === 'number' && config.minChars > 0 ? config.minChars : 500;
    // An invalid maxBytes must never pass silently: log it, then fall back to the default.
    let maxBytes = MAX_PASTE_BYTES;
    try {
        maxBytes = resolveMaxBytes(config.maxBytes);
    }
    catch (error) {
        console.error(`[dsh-auto-paste] invalid maxBytes in config — falling back to ${MAX_PASTE_BYTES} bytes:`, error);
    }
    new PasteStoreService(ctx, maxBytes);
    ctx.tools.register(defineTool({
        // The name the model uses to call this tool.
        name: 'save_paste',
        // Discipline fallback: the model persists big user pastes and references
        // the file path instead of echoing the whole chunk back.
        description: 'Persist a large pasted text chunk to pastes/<timestamp>.txt in the current session workspace, and return the workspace-relative path to reference in the reply. Use this whenever the user pastes a big block of text (roughly 500+ characters): save it, then work against the file instead of echoing the raw text.',
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
            schema: {
                type: 'object',
                properties: {
                    path: { type: 'string', required: true, description: 'Workspace-relative file path (pastes/<timestamp>.txt).' },
                    absolutePath: { type: 'string', required: true, description: 'Absolute filesystem path written.' },
                    bytes: { type: 'integer', required: true, description: 'UTF-8 bytes written.' },
                    chars: { type: 'integer', required: true, description: 'Character count written.' },
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
            const registered = ctx.get('workspaceRegistry')?.list() ?? [];
            if (!isRegisteredWorkspace(dir, registered)) {
                throw new Error(`save_paste: refusing to write outside a registered workspace (${dir})`);
            }
            return savePasteTo(dir, args.text, new Date(), maxBytes, args.label);
        },
    }));
    // Self-check (spike-proven): confirm the tool actually landed in the registry.
    console.log(`[dsh-auto-paste] host ready — pasteStore service + save_paste tool listed=${ctx.tools.get('save_paste') !== undefined} (minChars=${minChars}, maxBytes=${maxBytes})`);
}
