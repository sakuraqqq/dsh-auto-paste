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
import { join, dirname, basename, relative } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import z from '@deepseek-ai/schemastery'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

// Plugin display name, shown in loader diagnostics.
export const name = 'dsh-auto-paste'

/**
 * Internal result of one saved paste, exactly as `savePasteTo` produces it. It
 * carries the absolute path for the host's own bookkeeping; everything crossing a
 * boundary is narrowed first — {@link publicPasteRef} for the model-facing tool
 * output, {@link wirePasteRef} for the browser's RPC result.
 */
export interface SavePasteResult {
  /** Workspace-relative path, forward slashes: pastes/20260815-103000.txt */
  path: string
  /** Absolute filesystem path the file was written to. Host-side only. */
  absolutePath: string
  /** UTF-8 byte length of the written text. */
  bytes: number
  /**
   * Length in UTF-16 code units (`String.prototype.length`) — NOT bytes, NOT
   * grapheme clusters: one emoji (a surrogate pair) counts as 2, one CJK char as 1.
   * The unit is frozen on purpose: this number is rendered into reference lines
   * that already sit in old messages, so changing it would silently restate them.
   */
  chars: number
}

/**
 * The MODEL-facing boundary shape (the `save_paste` tool output). The absolute path
 * stays host-side here: it embeds the machine's user name and directory layout, and
 * the model only needs something it can reference — which is exactly the
 * workspace-relative path the reference line already shows.
 */
export interface SavedPasteRef {
  /** Workspace-relative path, forward slashes: pastes/20260815-103000.txt */
  path: string
  /** UTF-8 byte length of the written text. */
  bytes: number
  /** Length in UTF-16 code units — see {@link SavePasteResult.chars}. */
  chars: number
}

/** Narrow an internal write result to the model-facing shape ({@link SavedPasteRef}). */
export function publicPasteRef(result: SavePasteResult): SavedPasteRef {
  return { path: result.path, bytes: result.bytes, chars: result.chars }
}

/**
 * The BROWSER-facing RPC shape: the boundary fields plus the absolute path, which
 * the client must pass to third-party file APIs. The sidebar's editor refuses
 * relative paths (`requireAbsolute` → 400 "… is not an absolute path"), so a
 * capture opened via [查看] could be READ but never saved back. Deliberately kept
 * out of {@link SavedPasteRef}: this path reaches our own browser half only, never
 * the model's context.
 */
export interface SavedPasteWireRef extends SavedPasteRef {
  /** Absolute filesystem path of the written file (browser half only). */
  absolutePath: string
}

/** Widen a write result to the RPC shape ({@link SavedPasteWireRef}). */
export function wirePasteRef(result: SavePasteResult): SavedPasteWireRef {
  return { ...publicPasteRef(result), absolutePath: result.absolutePath }
}

/** Longest accepted `label` (chars) — keeps names far below path limits. */
export const MAX_LABEL_CHARS = 32

/** `label` charset: ASCII word chars, dash and underscore only (filename-safe). */
const LABEL_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Validate a paste `label` for use inside a filename. Whitelist-only, so a label
 * can never inject a path separator, a drive letter, a dot-directory or an
 * extension. Throws a descriptive error on any violation; never rewrites
 * silently, so the caller always sees the bad input.
 */
export function sanitizeLabel(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`label must be a non-empty ASCII string (got ${JSON.stringify(raw)})`)
  }
  if (raw.length > MAX_LABEL_CHARS) {
    throw new Error(
      `label too long: ${raw.length} chars exceeds the ${MAX_LABEL_CHARS}-char limit (got ${JSON.stringify(raw)})`,
    )
  }
  if (!LABEL_PATTERN.test(raw)) {
    throw new Error(`label may only contain [A-Za-z0-9_-] (got ${JSON.stringify(raw)})`)
  }
  return raw
}

/**
 * Windows-safe timestamp filename: `20260815-103000.txt`, or
 * `20260815-103000-<label>.txt` when a label is given. The label is
 * re-validated here — the write path never trusts an upstream check alone.
 */
export function pasteFilename(now: Date = new Date(), label?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
  return label === undefined ? `${d}-${t}.txt` : `${d}-${t}-${sanitizeLabel(label)}.txt`
}

/** Default max UTF-8 bytes a single paste may occupy (1 MiB). */
export const MAX_PASTE_BYTES = 1024 * 1024

/** Hard ceiling for the configurable `maxBytes` (64 MiB). */
export const MAX_PASTE_BYTES_CAP = 64 * 1024 * 1024

/**
 * Resolve the configured `maxBytes`: `undefined` falls back to the default,
 * anything else must be a positive integer within the hard ceiling. Throws on
 * violation so the caller decides (boot logs it, then falls back to default).
 */
export function resolveMaxBytes(raw: unknown): number {
  if (raw === undefined) return MAX_PASTE_BYTES
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new Error(`maxBytes must be an integer (got ${JSON.stringify(raw)})`)
  }
  if (raw <= 0) {
    throw new Error(`maxBytes must be positive (got ${raw})`)
  }
  if (raw > MAX_PASTE_BYTES_CAP) {
    throw new Error(`maxBytes ${raw} exceeds the ${MAX_PASTE_BYTES_CAP}-byte hard ceiling`)
  }
  return raw
}

/**
 * Default large-paste threshold (chars). The HOST owns this number: the web
 * client cannot read the loader row config (dsh never hands a client bundle
 * one — `dsh.client` accepts only platform/inject/external/immediately, and the
 * boot graph carries no config), so it fetches the effective value from us over
 * the RPC instead. One authority, no second default to drift.
 */
export const MIN_CHARS_DEFAULT = 500

/**
 * Whether THIS schemastery build knows `.volatile()`.
 *
 * dsh 0.1.7 projects plugin settings out of the plugin's own Config, and only a
 * field marked volatile becomes editable there; dsh 0.1.5 ships schemastery 3.18.2,
 * which has no such method at all. Calling it unconditionally would therefore throw
 * while this module LOADS — taking the whole plugin down on the older line. Probe,
 * never assume: the same rule the settings service itself taught us.
 */
const schemaVolatileCapable =
  typeof (z.number() as unknown as { volatile?: unknown }).volatile === 'function'

/** A live-editable number where the running line supports it, an ordinary one where not. */
function liveNumber(defaultValue: number) {
  const schema = z.number().default(defaultValue)
  const box = schema as unknown as { volatile?: () => typeof schema }
  return typeof box.volatile === 'function' ? box.volatile() : schema
}

/**
 * The plugin's own Config — and, on dsh 0.1.7, its settings surface.
 *
 * 0.1.5 let a plugin DECLARE a namespace (`settings.register`) and kept the user's
 * value in dsh's own settings document. 0.1.7 deleted that: it projects a form out
 * of THIS schema, writes the edited field back into the profile patch, and hands
 * the plugin a LIVE box it reads with `.get()`. `minChars` is the knob the General
 * row edits, so it is the volatile one; `maxBytes` stays ordinary config (row file
 * plus restart).
 */
export const Config = z.object({
  minChars: liveNumber(MIN_CHARS_DEFAULT),
  maxBytes: z.number().default(MAX_PASTE_BYTES),
})

/**
 * Unwrap one config value as it stands right now.
 *
 * A volatile field arrives as a LIVE BOX (`{ get() }`) — that is exactly what makes
 * it editable without remounting the plugin — while 0.1.5 and non-volatile fields
 * arrive as plain values. One unwrapper, so every reader agrees on what it holds.
 */
export function readLiveValue(raw: unknown): unknown {
  if (
    raw !== null &&
    typeof raw === 'object' &&
    typeof (raw as { get?: unknown }).get === 'function'
  ) {
    return (raw as { get: () => unknown }).get()
  }
  return raw
}

/** Effective configuration handed to the web client (`pasteStore/getConfig`). */
export interface PasteStoreConfig {
  /** Char threshold at or above which a paste is captured into a file. */
  minChars: number
  /** UTF-8 byte ceiling for one paste (host-enforced before anything is written). */
  maxBytes: number
  /** Which layer the effective `minChars` came from. */
  minCharsSource: 'user' | 'deployment'
  /** The deployment default, so the row can say what "reset" returns to. */
  deploymentMinChars: number
  /** False when this deployment has no settings provider, so nothing can be stored. */
  canConfigure: boolean
}

/**
 * One path-addressed edit for `settings.mutate` — the write path that can REMOVE
 * a field (`unset`), which neither a merge `update` nor a wholesale `replace`
 * expresses without collateral damage.
 */
type SettingsPathOpLike =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }

/**
 * The slice of dsh's settings service this plugin uses, typed structurally
 * because `@deepseek-ai/dsh-settings` is not a dependency of this package: the
 * service arrives through the composition, so we only describe what we call.
 *
 * TWO LINES, TWO SHAPES (measured: 0.1.5-rc.x vs 0.1.7-rc.2):
 *   - 0.1.5 — the plugin DECLARES a namespace (`register`) and reads it back (`get`).
 *   - 0.1.7 — `SettingsForms` dropped BOTH: settings are now projected from each
 *     plugin's own Config (fields marked `.volatile()`), and its docs say
 *     "Business plugins read their Config references directly". `update`/`mutate`
 *     survive, with an extra optional `expectedRevision`.
 * Hence `register` and `get` are OPTIONAL, and every call site probes for them.
 * Calling without the probe is a hard TypeError on 0.1.7 — measured, and it took
 * the whole web-client config path down with it.
 */
interface SettingsServiceLike {
  register?(ns: string, schema: unknown, options?: { applies?: 'live' | 'restart' }): unknown
  get?(ns: string): unknown
  /** 0.1.7 only: per-instance settings-page policy (declining the generated page). */
  configure?(presentation: { auto?: boolean }, owner?: unknown): () => void
  update(ns: string, patch: Record<string, unknown>): Promise<void>
  mutate(ns: string, ops: readonly SettingsPathOpLike[]): Promise<void>
}

/**
 * Read one namespace back through a settings service, or undefined when this
 * deployment cannot read it back at all.
 *
 * The service's mere presence proves nothing: dsh 0.1.7 keeps `SettingsForms`
 * but drops `get` (values are projected out of each plugin's own Config instead),
 * so calling it is a TypeError — measured, and it took `getConfig`, hence the web
 * client's whole config path, down with it.
 */
export function readSettings(
  service: SettingsServiceLike | undefined,
  ns: string,
): Record<string, unknown> | undefined {
  if (service === undefined || typeof service.get !== 'function') return undefined
  const value = service.get(ns)
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

/**
 * Settings namespace this plugin owns (`settings.register` requires a lowercase
 * hyphenated identifier). The browser side backs it with a row in dsh's General
 * settings section (`settings.general.item`).
 */
export const PASTE_SETTINGS_NAMESPACE = 'dsh-auto-paste'

/** Field inside {@link PASTE_SETTINGS_NAMESPACE} carrying the user's threshold. */
export const MIN_CHARS_FIELD = 'minChars'

/**
 * Durable user layer, deliberately `required(false)`: an absent field means "the
 * user never overrode this", which is exactly what keeps `cordis.patch.yml` the
 * deployment default instead of being shadowed by a schema default.
 */
export const PasteSettingsSchema = z.object({
  [MIN_CHARS_FIELD]: z.natural().min(1).required(false),
})

/**
 * Resolve the configured `minChars`: `undefined` falls back to the default,
 * anything else must be a positive integer. Throws on violation so the caller
 * decides (boot logs it, then falls back to the default) — deliberately the
 * same shape as {@link resolveMaxBytes}.
 */
export function resolveMinChars(raw: unknown): number {
  if (raw === undefined) return MIN_CHARS_DEFAULT
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new Error(`minChars must be an integer (got ${JSON.stringify(raw)})`)
  }
  if (raw <= 0) {
    throw new Error(`minChars must be positive (got ${raw})`)
  }
  return raw
}

/**
 * Combine the two layers: a usable stored value wins, otherwise the deployment
 * value. An unusable value on either side is ignored rather than trusted — the
 * schema already refuses one at the document boundary, but this function stays
 * total so a hand-edited document can never break the paste path.
 */
export function effectiveMinChars(
  stored: unknown,
  deployment: unknown,
): { minChars: number; source: 'user' | 'deployment' } {
  const usable = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0
  if (usable(stored)) return { minChars: stored, source: 'user' }
  return { minChars: usable(deployment) ? deployment : MIN_CHARS_DEFAULT, source: 'deployment' }
}

/**
 * Guard against oversized pastes (resource-exhaustion vector): the web client
 * applies its own char floor (the host's effective `minChars`), but the RPC and
 * the model tool can be called with arbitrary text, so the server rejects
 * anything above `maxBytes` BEFORE any file is created. Throws on violation.
 */
export function assertPasteSize(text: string, maxBytes: number = MAX_PASTE_BYTES): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > maxBytes) {
    throw new Error(`paste too large: ${bytes} bytes exceeds the ${maxBytes}-byte limit; refusing to write`)
  }
}

/**
 * Write one paste under `<workspaceDir>/pastes/<timestamp>[-<label>].txt`.
 * Pure standalone function — unit-testable without a booted harness.
 * Same-second collisions append `-<n>` AFTER the label (see the loop below).
 */
export async function savePasteTo(workspaceDir: string, text: string, now: Date = new Date(), maxBytes: number = MAX_PASTE_BYTES, label?: string): Promise<SavePasteResult> {
  assertPasteSize(text, maxBytes)
  const rel = join('pastes', pasteFilename(now, label))
  const base = join(workspaceDir, rel)
  // Private by default: a paste can hold anything the user copied. 0700/0600 are
  // the POSIX answer (Windows ignores `mode`, where the per-user profile ACL
  // already scopes access, so this is additive rather than a behaviour change).
  await mkdir(dirname(base), { recursive: true, mode: 0o700 })
  // Atomic exclusive create: EEXIST means another writer (concurrent
  // same-timestamp save, or an existing file) claimed this name first —
  // bump the -n suffix and retry. No check-then-write race window.
  let target = base
  for (let n = 0; ; n += 1) {
    const candidate = n === 0 ? base : join(workspaceDir, 'pastes', `${basename(rel, '.txt')}-${n}.txt`)
    try {
      await writeFile(candidate, text, { flag: 'wx', mode: 0o600 })
      target = candidate
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  return {
    path: relative(workspaceDir, target).split('\\').join('/'),
    absolutePath: target,
    bytes: Buffer.byteLength(text, 'utf8'),
    chars: text.length,
  }
}

/** Structural view of the host workspace registry (no dependency needed). */
interface WorkspaceLike {
  path: string
  sessionIds: readonly string[]
}

interface WorkspaceRegistryLike {
  list(): WorkspaceLike[]
}

/** The registered workspaces, or undefined when the host exposes no registry. */
function registeredWorkspaces(ctx: Context): WorkspaceLike[] | undefined {
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  return registry?.list()
}

/**
 * Build the refusal error. Deliberately actionable — it states WHY the write was
 * refused, WHICH session was involved, WHICH workspaces are currently registered,
 * and HOW to recover. It never offers a fallback: silently writing into the wrong
 * workspace is worse than a visible failure.
 *
 * The workspaces are named by FOLDER, never by absolute path: this text lands in
 * session output, and a user who pastes it into a public issue would otherwise
 * publish their own machine layout (re-specified 2026-09-29 after the independent
 * privacy review; the folder names still tell the candidates apart).
 */
function workspaceRefusal(reason: string, workspaces: WorkspaceLike[], sessionId?: string): Error {
  const who =
    sessionId === undefined ? 'this call carried no session id' : `session "${sessionId}"`
  const list = workspaces
    .map((workspace) => {
      const n = workspace.sessionIds.length
      return `  - ${basename(workspace.path)}  (${n} session${n === 1 ? '' : 's'})`
    })
    .join('\n')
  return new Error(
    `[dsh-auto-paste] refusing to save the paste: ${reason} (${who}).\n` +
      `Registered workspaces (${workspaces.length}):\n${list}\n` +
      'How to fix: paste from a session that belongs to one of those workspaces (a session is ' +
      'registered to the workspace it was started in), or start a session for the workspace you ' +
      'want and paste again. Nothing was written.',
  )
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
export function resolveWorkspaceDir(ctx: Context, sessionId?: string): string | undefined {
  const workspaces = registeredWorkspaces(ctx)
  if (workspaces === undefined || workspaces.length === 0) return undefined
  if (sessionId !== undefined) {
    const owned = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))
    if (owned !== undefined) return owned.path
    throw workspaceRefusal(
      'this session is not registered to any workspace, and guessing one could write the paste into the wrong project',
      workspaces,
      sessionId,
    )
  }
  if (workspaces.length > 1) {
    throw workspaceRefusal(
      'no session id was available, so the target workspace is ambiguous',
      workspaces,
    )
  }
  return workspaces[0]?.path
}

/** True when `dir` matches one of the registered workspace paths (platform-aware). */
export function isRegisteredWorkspace(dir: string, workspaces: WorkspaceLike[]): boolean {
  const norm = (p: string) => {
    const cleaned = p.replace(/[\\/]+$/, '').replace(/\\/g, '/')
    return process.platform === 'win32' ? cleaned.toLowerCase() : cleaned
  }
  const target = norm(dir)
  return workspaces.some((workspace) => norm(workspace.path) === target)
}

/** The activation Config this plugin was handed; every field read live, never cached. */
interface PluginConfigLike {
  minChars?: unknown
  maxBytes?: unknown
}

/** Host service the web client calls via the connection RPC (`/api`). */
class PasteStoreService extends TypertRemoteService {
  /**
   * The activation config, kept as a REFERENCE on purpose.
   *
   * On 0.1.7 these fields are volatile, so a Settings write reaches us as a new
   * value inside the same box. Resolving a number once at boot is exactly what would
   * make a freshly saved value invisible until the next restart.
   */
  private readonly pluginConfig: PluginConfigLike

  constructor(ctx: Context, config: PluginConfigLike) {
    super(ctx, 'pasteStore')
    this.pluginConfig = config
  }

  /**
   * One numeric knob for THIS call, falling back to the documented default.
   *
   * Silent on purpose: a bad value was already reported once at boot (see `apply`),
   * and this runs on every config read — repeating it there would be spam rather
   * than transparency.
   */
  private knob(raw: unknown, resolve: (value: unknown) => number, fallback: number): number {
    try {
      return resolve(readLiveValue(raw))
    } catch {
      return fallback
    }
  }

  /** The deployment default threshold, as configured right now. */
  private deploymentMinChars(): number {
    return this.knob(this.pluginConfig.minChars, resolveMinChars, MIN_CHARS_DEFAULT)
  }

  /** The byte ceiling for one paste, as configured right now. */
  private maxBytes(): number {
    return this.knob(this.pluginConfig.maxBytes, resolveMaxBytes, MAX_PASTE_BYTES)
  }

  /** The settings service for this context, or undefined without a provider. */
  private settings(): SettingsServiceLike | undefined {
    return this.ctx.get('settings') as SettingsServiceLike | undefined
  }

  /** The effective threshold right now, together with the layer it came from. */
  private effective(): { minChars: number; source: 'user' | 'deployment' } {
    const stored = this.settingsValue()
    return effectiveMinChars(stored?.[MIN_CHARS_FIELD], this.deploymentMinChars())
  }

  /**
   * The user layer as stored, or undefined when nothing is stored, no provider
   * exists, or the running line has no `get` to read it back with (see
   * `readSettings`). Falling back to the deployment default keeps every paste
   * feature working; the General row reports the situation instead of failing.
   */
  private settingsValue(): Record<string, unknown> | undefined {
    return readSettings(this.settings(), PASTE_SETTINGS_NAMESPACE)
  }

  /**
   * Whether the user can store a preference from the UI — this is what the General
   * row renders as an editable field.
   *
   * A WRITE PATH, not a service: the service's mere presence once made the row
   * promise a save that could never be read back. Which write path counts differs
   * by line —
   *   - 0.1.5 keeps the user's value and reads it back with `get`, closing the loop;
   *   - 0.1.7 has no `get` at all: the field is written into this plugin's own
   *     Config, and that write only lands because the field is declared volatile.
   * Anything else (no provider, no `update`, a line whose schema cannot be marked
   * volatile) leaves the row in its honest "edit cordis.patch.yml" state.
   */
  private canConfigure(): boolean {
    const settings = this.settings()
    if (typeof settings?.update !== 'function') return false
    return typeof settings.get === 'function' || schemaVolatileCapable
  }

  /** Build the wire payload the browser reads (and re-reads after every write). */
  private config(): PasteStoreConfig {
    const { minChars, source } = this.effective()
    return {
      minChars,
      maxBytes: this.maxBytes(),
      minCharsSource: source,
      deploymentMinChars: this.deploymentMinChars(),
      canConfigure: this.canConfigure(),
    }
  }

  /**
   * The effective configuration, for the web client. This is the ONLY way the
   * threshold reaches the browser: a client bundle never receives the loader row
   * config, so without this call the client would be stuck on its own built-in
   * default and the documented knob would be silently inert. Re-read on every
   * call, so a preference saved in Settings applies without a restart.
   */
  getConfig(): PasteStoreConfig {
    return this.config()
  }

  /**
   * Store the user's threshold, or clear it (`null`). Clearing is a path-addressed
   * `unset` of OUR OWN field: `replace(ns, {})` resets the whole namespace (and
   * would silently drop any field this plugin does not own), while a merge
   * `update` cannot express removal at all. `mutate` is the precise way back to
   * the deployment default.
   */
  async setMinChars(value: number | null): Promise<PasteStoreConfig> {
    const settings = this.settings()
    if (settings === undefined) {
      throw new Error(
        'pasteStore.setMinChars: this deployment has no settings provider, so the preference cannot be stored — set minChars in cordis.patch.yml and restart dsh instead',
      )
    }
    if (value === null) {
      await settings.mutate(PASTE_SETTINGS_NAMESPACE, [{ op: 'unset', path: [MIN_CHARS_FIELD] }])
    } else {
      // Same validation as the row config, so both entry points reject identically.
      await settings.update(PASTE_SETTINGS_NAMESPACE, { [MIN_CHARS_FIELD]: resolveMinChars(value) })
    }
    return this.config()
  }

  /** Save one pasted text chunk into the session workspace's pastes/ dir. */
  async savePaste(text: string, sessionId: string): Promise<SavedPasteWireRef> {
    // Runtime guard: the wire validates its own callers, but this is a public
    // service — a direct (in-process) caller can hand us anything, and the value
    // would otherwise travel to a filesystem write. Refuse it by name.
    if (typeof text !== 'string') {
      throw new Error(`pasteStore.savePaste: text must be a string (got ${typeof text})`)
    }
    const dir = resolveWorkspaceDir(this.ctx, sessionId)
    if (dir === undefined) throw new Error('pasteStore: no workspace available to save the paste into')
    // The browser half also gets the absolute path: the sidebar's file API refuses
    // relative ones, so [查看] would open a file it could never save back.
    return wirePasteRef(await savePasteTo(dir, text, new Date(), this.maxBytes()))
  }
}

// Wait until the host's tool registry (ctx.tools) is ready before running.
export const inject = ['tools']

export function apply(ctx: Context, config: PluginConfigLike = {}) {
  // An invalid value must never pass silently: log it, then fall back to the
  // default, so a typo in the row config stays visible instead of taking the
  // plugin down. Same shape for both knobs.
  //
  // These two locals are the BOOT-TIME REPORT only (this log line, the tool
  // description below). What the service enforces is re-read from `config` on every
  // call — see PasteStoreService.knob — because on 0.1.7 a Settings write lands in
  // that same config while dsh keeps running.
  let minChars = MIN_CHARS_DEFAULT
  try {
    minChars = resolveMinChars(readLiveValue(config.minChars))
  } catch (error) {
    console.error(
      `[dsh-auto-paste] invalid minChars in config — falling back to ${MIN_CHARS_DEFAULT} chars:`,
      error,
    )
  }
  let maxBytes = MAX_PASTE_BYTES
  try {
    maxBytes = resolveMaxBytes(readLiveValue(config.maxBytes))
  } catch (error) {
    console.error(
      `[dsh-auto-paste] invalid maxBytes in config — falling back to ${MAX_PASTE_BYTES} bytes:`,
      error,
    )
  }
  // Declare the user-preference namespace when this deployment has a settings
  // provider. Deliberately optional: a profile without settings still gets the
  // plugin, it just keeps the cordis.patch.yml value (and the General row says so
  // instead of failing).
  ctx.inject(['settings'], (settingsCtx) => {
    // `settings` is provided by the composition, so the Cordis Context type does
    // not carry it; the cast only names the slice we call (SettingsServiceLike).
    const settings = (settingsCtx as unknown as { settings: SettingsServiceLike }).settings
    // dsh 0.1.7 dropped `register`: it projects settings from each plugin's own
    // Config instead, so there is nothing left to declare here. Probe, never assume.
    if (typeof settings.register === 'function') {
      settings.register(PASTE_SETTINGS_NAMESPACE, PasteSettingsSchema, { applies: 'live' })
    }
    // 0.1.7 generates a settings page for every entry that HAS volatile fields.
    // Ours has its own General row (which writes through this very service), so it
    // declines the generated duplicate. The disposer rides the child's effects —
    // the official shape.
    const configure = settings.configure?.bind(settings)
    if (configure !== undefined) {
      settingsCtx.effect(() => configure({ auto: false }, ctx.fiber))
    }
  })

  new PasteStoreService(ctx, config)

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
      render: (_args: unknown, value: SavedPasteRef) => [{
        type: 'text',
        text: `Saved paste to ${value.path} (${value.bytes} bytes). Reference this file path in your reply.`,
      }],
    },

    // The tool call executes in the calling agent's session; its header cwd
    // is the session workspace directory (same source dsh-tool-pwsh uses).
    async execute(args: { text: string; label?: string }, exec: ToolExecution) {
      const headerCwd: unknown = exec.agent?.session?.header?.cwd
      const dir = typeof headerCwd === 'string' && headerCwd.length > 0
        ? headerCwd
        : resolveWorkspaceDir(ctx)
      if (dir === undefined) throw new Error('save_paste: cannot resolve the session workspace directory')
      // Defense: only write inside a registered workspace (header.cwd is
      // dsh-controlled in practice, but never trust it blindly).
      const registered = registeredWorkspaces(ctx) ?? []
      if (!isRegisteredWorkspace(dir, registered)) {
        // Folder name only — same privacy rule as workspaceRefusal above.
        throw new Error(
          `save_paste: refusing to write outside a registered workspace (${basename(dir)})`,
        )
      }
      return publicPasteRef(await savePasteTo(dir, args.text, new Date(), maxBytes, args.label))
    },
  }))

  // Self-check (spike-proven): confirm the tool actually landed in the registry.
  console.log(
    `[dsh-auto-paste] host ready — pasteStore service + save_paste tool listed=${ctx.tools.get('save_paste') !== undefined} (minChars=${minChars}, maxBytes=${maxBytes})`,
  )
}
