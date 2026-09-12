// Generated-style Typert host artifact for dsh-auto-paste (hand-written,
// mirroring the @deepseek-ai/dsh-typert-generator output shape; see
// @deepseek-ai/dsh-host-plugin-inventory/lib/typert.host.js for the in-box
// reference). The typert-loader scans Loader entries for this `./typert`
// export, validates it, and registers the invocation so the host api-gateway
// dispatches `pasteStore/savePaste` RPC calls from the web client.
import { z } from 'zod'

// No character cap on the wire: zod's `.max` counts UTF-16 code units, while the
// host owns the authoritative limit as UTF-8 BYTES (MAX_PASTE_BYTES = 1 MiB,
// applied in savePasteTo before anything hits disk). Keeping a second, char-based
// cap here means the wrong authority rejects first — and the two disagree by
// design (one emoji is 1 char but 4 bytes). The host is the only cap.
const savePasteText$schema = z.string()
const savePasteSessionId$schema = z.string()
const savePasteResult$schema = z.object({
  path: z.string(),
  absolutePath: z.string(),
  bytes: z.number(),
  chars: z.number(),
})

// The web client's ONLY source for the effective threshold/cap: it cannot read
// the loader row config (dsh hands a client bundle no config at all), so it
// asks for the resolved values at startup — and again after every write, so a
// preference saved in Settings applies without a restart. No parameters.
const getConfigResult$schema = z.object({
  minChars: z.number(),
  maxBytes: z.number(),
  minCharsSource: z.string(),
  deploymentMinChars: z.number(),
  canConfigure: z.boolean(),
})

// One number, or null to clear the override and fall back to the deployment
// default. Deliberately permissive rather than `.min(1)`: the plugin's own
// rejection message (the same one the row config produces) should reach the
// settings row, not a wire-level zod error.
const setMinCharsValue$schema = z.number().nullable()

export const TYPERT = {
  package: 'dsh-auto-paste',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: 'dsh-auto-paste#pasteStore/savePaste',
      service: 'pasteStore',
      namespace: 'pasteStore',
      method: 'savePaste',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'text',
          wire: 'text',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-auto-paste/types#SavePasteText', schema: savePasteText$schema },
        },
        {
          name: 'sessionId',
          wire: 'sessionId',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-auto-paste/types#SavePasteSessionId', schema: savePasteSessionId$schema },
        },
      ],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-auto-paste/types#SavePasteResult',
        schema: savePasteResult$schema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 1 },
    },
    {
      id: 'dsh-auto-paste#pasteStore/getConfig',
      service: 'pasteStore',
      namespace: 'pasteStore',
      method: 'getConfig',
      invocation: { kind: 'direct' },
      // No parameters: the effective config is host state, not client input.
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-auto-paste/types#PasteStoreConfig',
        schema: getConfigResult$schema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 1 },
    },
    {
      id: 'dsh-auto-paste#pasteStore/setMinChars',
      service: 'pasteStore',
      namespace: 'pasteStore',
      method: 'setMinChars',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'value',
          wire: 'value',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'dsh-auto-paste/types#SetMinCharsValue', schema: setMinCharsValue$schema },
        },
      ],
      // The write returns the NEW effective config, so one round trip refreshes
      // the row and the live paste threshold together.
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-auto-paste/types#PasteStoreConfig',
        schema: getConfigResult$schema,
      },
      sourceLocation: { file: 'src/index.ts', line: 1, column: 1 },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
