// Generated-style Typert host artifact for dsh-auto-paste (hand-written,
// mirroring the @deepseek-ai/dsh-typert-generator output shape; see
// @deepseek-ai/dsh-host-plugin-inventory/lib/typert.host.js for the in-box
// reference). The typert-loader scans Loader entries for this `./typert`
// export, validates it, and registers the invocation so the host api-gateway
// dispatches `pasteStore/savePaste` RPC calls from the web client.
import { z } from 'zod'

const savePasteText$schema = z.string()
const savePasteSessionId$schema = z.string()
const savePasteResult$schema = z.object({
  path: z.string(),
  absolutePath: z.string(),
  bytes: z.number(),
  chars: z.number(),
})

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
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
