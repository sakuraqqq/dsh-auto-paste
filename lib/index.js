// src/index.ts
import { join, dirname, basename, normalize, relative } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import z from "@deepseek-ai/schemastery";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { defineTool } from "@deepseek-ai/dsh-tools";
var name = "dsh-auto-paste";
function publicPasteRef(result) {
  return { path: result.path, bytes: result.bytes, chars: result.chars };
}
function wirePasteRef(result) {
  return { ...publicPasteRef(result), absolutePath: result.absolutePath };
}
var MAX_LABEL_CHARS = 32;
var LABEL_PATTERN = /^[A-Za-z0-9_-]+$/;
function sanitizeLabel(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`label must be a non-empty ASCII string (got ${JSON.stringify(raw)})`);
  }
  if (raw.length > MAX_LABEL_CHARS) {
    throw new Error(
      `label too long: ${raw.length} chars exceeds the ${MAX_LABEL_CHARS}-char limit (got ${JSON.stringify(raw)})`
    );
  }
  if (!LABEL_PATTERN.test(raw)) {
    throw new Error(`label may only contain [A-Za-z0-9_-] (got ${JSON.stringify(raw)})`);
  }
  return raw;
}
function pasteFilename(now = /* @__PURE__ */ new Date(), label) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, "0")}`;
  return label === void 0 ? `${d}-${t}.txt` : `${d}-${t}-${sanitizeLabel(label)}.txt`;
}
var MAX_PASTE_BYTES = 1024 * 1024;
var MAX_PASTE_BYTES_CAP = 64 * 1024 * 1024;
function resolveMaxBytes(raw) {
  if (raw === void 0) return MAX_PASTE_BYTES;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
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
var MIN_CHARS_DEFAULT = 500;
var schemaVolatileCapable = typeof z.number().volatile === "function";
function liveNumber(defaultValue) {
  const schema = z.number().default(defaultValue);
  const box = schema;
  return typeof box.volatile === "function" ? box.volatile() : schema;
}
var Config = z.object({
  minChars: liveNumber(MIN_CHARS_DEFAULT),
  maxBytes: z.number().default(MAX_PASTE_BYTES)
});
function readLiveValue(raw) {
  if (raw !== null && typeof raw === "object" && typeof raw.get === "function") {
    return raw.get();
  }
  return raw;
}
function readSettings(service, ns) {
  if (service === void 0) return void 0;
  if (typeof service.get === "function") {
    const value = service.get(ns);
    if (typeof value === "object" && value !== null) return value;
  }
  if (typeof service.describe === "function") {
    const row = service.describe().find((candidate) => candidate?.ns === ns);
    const user = row?.user;
    if (typeof user === "object" && user !== null) return user;
  }
  return void 0;
}
var PASTE_SETTINGS_NAMESPACE = "dsh-auto-paste";
var MIN_CHARS_FIELD = "minChars";
var PasteSettingsSchema = z.object({
  [MIN_CHARS_FIELD]: z.natural().min(1).required(false)
});
function resolveMinChars(raw) {
  if (raw === void 0) return MIN_CHARS_DEFAULT;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error(`minChars must be an integer (got ${JSON.stringify(raw)})`);
  }
  if (raw <= 0) {
    throw new Error(`minChars must be positive (got ${raw})`);
  }
  return raw;
}
function effectiveMinChars(stored, deployment) {
  const usable = (value) => typeof value === "number" && Number.isInteger(value) && value > 0;
  if (usable(stored)) return { minChars: stored, source: "user" };
  return { minChars: usable(deployment) ? deployment : MIN_CHARS_DEFAULT, source: "deployment" };
}
function assertPasteSize(text, maxBytes = MAX_PASTE_BYTES) {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) {
    throw new Error(`paste too large: ${bytes} bytes exceeds the ${maxBytes}-byte limit; refusing to write`);
  }
}
var MAX_COLLISION_ATTEMPTS = 1e3;
async function savePasteTo(workspaceDir, text, now = /* @__PURE__ */ new Date(), maxBytes = MAX_PASTE_BYTES, label) {
  assertPasteSize(text, maxBytes);
  const rel = join("pastes", pasteFilename(now, label));
  const base = join(workspaceDir, rel);
  await mkdir(dirname(base), { recursive: true, mode: 448 });
  let target;
  for (let n = 0; n < MAX_COLLISION_ATTEMPTS; n += 1) {
    const candidate = n === 0 ? base : join(workspaceDir, "pastes", `${basename(rel, ".txt")}-${n}.txt`);
    try {
      await writeFile(candidate, text, { flag: "wx", mode: 384 });
      target = candidate;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  if (target === void 0) {
    throw new Error(
      `paste: gave up after ${MAX_COLLISION_ATTEMPTS} name collisions for ${rel}; remove or rename the squatters under pastes/ and retry`
    );
  }
  return {
    path: relative(workspaceDir, target).split("\\").join("/"),
    absolutePath: target,
    bytes: Buffer.byteLength(text, "utf8"),
    chars: text.length
  };
}
function registeredWorkspaces(ctx) {
  const registry = ctx.get("workspaceRegistry");
  return registry?.list();
}
function workspaceRefusal(reason, workspaces, sessionId) {
  const who = sessionId === void 0 ? "this call carried no session id" : `session "${sessionId}"`;
  const list = workspaces.map((workspace) => {
    const n = workspace.sessionIds.length;
    return `  - ${basename(workspace.path)}  (${n} session${n === 1 ? "" : "s"})`;
  }).join("\n");
  return new Error(
    `[dsh-auto-paste] refusing to save the paste: ${reason} (${who}).
Registered workspaces (${workspaces.length}):
${list}
How to fix: paste from a session that belongs to one of those workspaces (a session is registered to the workspace it was started in), or start a session for the workspace you want and paste again. Nothing was written.`
  );
}
function resolveWorkspaceDir(ctx, sessionId) {
  const workspaces = registeredWorkspaces(ctx);
  if (workspaces === void 0 || workspaces.length === 0) return void 0;
  if (sessionId !== void 0) {
    const owned = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
    if (owned !== void 0) return owned.path;
    throw workspaceRefusal(
      "this session is not registered to any workspace, and guessing one could write the paste into the wrong project",
      workspaces,
      sessionId
    );
  }
  if (workspaces.length > 1) {
    throw workspaceRefusal(
      "no session id was available, so the target workspace is ambiguous",
      workspaces
    );
  }
  return workspaces[0]?.path;
}
function isRegisteredWorkspace(dir, workspaces) {
  const norm = (p) => {
    const cleaned = normalize(p).replace(/[\\/]+$/, "").replace(/\\/g, "/");
    return process.platform === "win32" ? cleaned.toLowerCase() : cleaned;
  };
  const target = norm(dir);
  return workspaces.some((workspace) => norm(workspace.path) === target);
}
var PasteStoreService = class extends TypertRemoteService {
  /**
   * The activation config, kept as a REFERENCE on purpose.
   *
   * On 0.1.7 these fields are volatile, so a Settings write reaches us as a new
   * value inside the same box. Resolving a number once at boot is exactly what would
   * make a freshly saved value invisible until the next restart.
   */
  pluginConfig;
  constructor(ctx, config) {
    super(ctx, "pasteStore");
    this.pluginConfig = config;
  }
  /**
   * One numeric knob for THIS call, falling back to the documented default.
   *
   * Silent on purpose: a bad value was already reported once at boot (see `apply`),
   * and this runs on every config read — repeating it there would be spam rather
   * than transparency.
   */
  knob(raw, resolve, fallback) {
    try {
      return resolve(readLiveValue(raw));
    } catch {
      return fallback;
    }
  }
  /** The deployment default threshold, as configured right now. */
  deploymentMinChars() {
    return this.knob(this.pluginConfig.minChars, resolveMinChars, MIN_CHARS_DEFAULT);
  }
  /** The byte ceiling for one paste, as configured right now. */
  maxBytes() {
    return this.knob(this.pluginConfig.maxBytes, resolveMaxBytes, MAX_PASTE_BYTES);
  }
  /** The settings service for this context, or undefined without a provider. */
  settings() {
    return this.ctx.get("settings");
  }
  /** The effective threshold right now, together with the layer it came from. */
  effective() {
    const stored = this.settingsValue();
    return effectiveMinChars(stored?.[MIN_CHARS_FIELD], this.deploymentMinChars());
  }
  /**
   * The user layer as stored, or undefined when nothing is stored, no provider
   * exists, or the running line has no `get` to read it back with (see
   * `readSettings`). Falling back to the deployment default keeps every paste
   * feature working; the General row reports the situation instead of failing.
   */
  settingsValue() {
    return readSettings(this.settings(), PASTE_SETTINGS_NAMESPACE);
  }
  /**
   * Whether the user can store a preference from the UI — this is what the General
   * row renders as an editable field.
   *
   * A WRITE PATH, not a service: the service's mere presence once made the row
   * promise a save that could never be read back. The two lines close the loop
   * DIFFERENTLY, so the capability they require differs too —
   *   - 0.1.5 keeps the user's value in dsh's own settings document: it reads back
   *     with `get` and writes with `update`. `.volatile()` does not exist on that
   *     line at all (schemastery 3.18.2) and is not needed there.
   *   - 0.1.7+ has no `get`: the field is written into this plugin's own Config and
   *     read back through `describe().user`. That write only lands because the field
   *     is declared volatile — so volatile is required on THIS path, not in general.
   * Anything else (no provider, no `update`) leaves the row in its honest
   * "edit cordis.patch.yml" state.
   */
  canConfigure() {
    const settings = this.settings();
    if (typeof settings?.update !== "function") return false;
    if (typeof settings.get === "function") return true;
    return typeof settings.describe === "function" && schemaVolatileCapable;
  }
  /** Build the wire payload the browser reads (and re-reads after every write). */
  config() {
    const { minChars, source } = this.effective();
    return {
      minChars,
      maxBytes: this.maxBytes(),
      minCharsSource: source,
      deploymentMinChars: this.deploymentMinChars(),
      canConfigure: this.canConfigure()
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
    if (settings === void 0) {
      throw new Error(
        "pasteStore.setMinChars: this deployment has no settings provider, so the preference cannot be stored \u2014 set minChars in cordis.patch.yml and restart dsh instead"
      );
    }
    if (value === null) {
      await settings.mutate(PASTE_SETTINGS_NAMESPACE, [{ op: "unset", path: [MIN_CHARS_FIELD] }]);
    } else {
      await settings.update(PASTE_SETTINGS_NAMESPACE, { [MIN_CHARS_FIELD]: resolveMinChars(value) });
    }
    return this.config();
  }
  /** Save one pasted text chunk into the session workspace's pastes/ dir. */
  async savePaste(text, sessionId) {
    if (typeof text !== "string") {
      throw new Error(`pasteStore.savePaste: text must be a string (got ${typeof text})`);
    }
    if (typeof sessionId !== "string") {
      throw new Error(`pasteStore.savePaste: sessionId must be a string (got ${typeof sessionId})`);
    }
    const dir = resolveWorkspaceDir(this.ctx, sessionId);
    if (dir === void 0) throw new Error("pasteStore: no workspace available to save the paste into");
    return wirePasteRef(await savePasteTo(dir, text, /* @__PURE__ */ new Date(), this.maxBytes()));
  }
};
var inject = ["tools"];
function apply(ctx, config = {}) {
  let minChars = MIN_CHARS_DEFAULT;
  try {
    minChars = resolveMinChars(readLiveValue(config.minChars));
  } catch (error) {
    console.error(
      `[dsh-auto-paste] invalid minChars in config \u2014 falling back to ${MIN_CHARS_DEFAULT} chars:`,
      error
    );
  }
  let maxBytes = MAX_PASTE_BYTES;
  try {
    maxBytes = resolveMaxBytes(readLiveValue(config.maxBytes));
  } catch (error) {
    console.error(
      `[dsh-auto-paste] invalid maxBytes in config \u2014 falling back to ${MAX_PASTE_BYTES} bytes:`,
      error
    );
  }
  ctx.inject(["settings"], (settingsCtx) => {
    const settings = settingsCtx.settings;
    if (typeof settings.register === "function") {
      settings.register(PASTE_SETTINGS_NAMESPACE, PasteSettingsSchema, { applies: "live" });
    }
    const configure = settings.configure?.bind(settings);
    if (configure !== void 0) {
      settingsCtx.effect(() => configure({ auto: false }, ctx.fiber));
    }
  });
  new PasteStoreService(ctx, config);
  ctx.tools.register(defineTool({
    // The name the model uses to call this tool.
    name: "save_paste",
    // Discipline fallback: the model persists big user pastes and references
    // the file path instead of echoing the whole chunk back.
    description: `Persist a large pasted text chunk to pastes/<timestamp>.txt in the current session workspace, and return the workspace-relative path to reference in the reply. Use this whenever the user pastes a big block of text (roughly ${minChars}+ characters): save it, then work against the file instead of echoing the raw text.`,
    parameters: {
      text: {
        type: "string",
        required: true,
        description: "The full pasted text chunk to persist verbatim."
      },
      label: {
        type: "string",
        description: "Optional short label appended after the timestamp in the filename: pastes/<timestamp>-<label>.txt. ASCII [A-Za-z0-9_-], max 32 chars; an invalid label fails the call."
      }
    },
    output: {
      // Boundary shape (SavedPasteRef): the absolute path is deliberately absent —
      // the tool result is what lands in the model's context.
      schema: {
        type: "object",
        properties: {
          path: { type: "string", required: true, description: "Workspace-relative file path (pastes/<timestamp>.txt)." },
          bytes: { type: "integer", required: true, description: "UTF-8 bytes written." },
          chars: { type: "integer", required: true, description: "Length in UTF-16 code units (an emoji counts as 2)." }
        },
        additionalProperties: false
      },
      render: (_args, value) => [{
        type: "text",
        text: `Saved paste to ${value.path} (${value.bytes} bytes). Reference this file path in your reply.`
      }]
    },
    // The tool call executes in the calling agent's session; its header cwd
    // is the session workspace directory (same source dsh-tool-pwsh uses).
    async execute(args, exec) {
      const headerCwd = exec.agent?.session?.header?.cwd;
      const dir = typeof headerCwd === "string" && headerCwd.length > 0 ? headerCwd : resolveWorkspaceDir(ctx);
      if (dir === void 0) throw new Error("save_paste: cannot resolve the session workspace directory");
      const registered = registeredWorkspaces(ctx) ?? [];
      if (!isRegisteredWorkspace(dir, registered)) {
        throw new Error(
          `save_paste: refusing to write outside a registered workspace (${basename(dir)})`
        );
      }
      let liveMaxBytes;
      try {
        liveMaxBytes = resolveMaxBytes(readLiveValue(config.maxBytes));
      } catch {
        liveMaxBytes = MAX_PASTE_BYTES;
      }
      return publicPasteRef(await savePasteTo(dir, args.text, /* @__PURE__ */ new Date(), liveMaxBytes, args.label));
    }
  }));
  console.log(
    `[dsh-auto-paste] host ready \u2014 pasteStore service + save_paste tool listed=${ctx.tools.get("save_paste") !== void 0} (minChars=${minChars}, maxBytes=${maxBytes})`
  );
}
export {
  Config,
  MAX_COLLISION_ATTEMPTS,
  MAX_LABEL_CHARS,
  MAX_PASTE_BYTES,
  MAX_PASTE_BYTES_CAP,
  MIN_CHARS_DEFAULT,
  MIN_CHARS_FIELD,
  PASTE_SETTINGS_NAMESPACE,
  PasteSettingsSchema,
  apply,
  assertPasteSize,
  effectiveMinChars,
  inject,
  isRegisteredWorkspace,
  name,
  pasteFilename,
  publicPasteRef,
  readLiveValue,
  readSettings,
  resolveMaxBytes,
  resolveMinChars,
  resolveWorkspaceDir,
  sanitizeLabel,
  savePasteTo,
  wirePasteRef
};
