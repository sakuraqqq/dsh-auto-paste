// Generated-style Typert host artifact for dsh-auto-paste (hand-written,
// mirroring the @deepseek-ai/dsh-typert-generator output shape; see
// @deepseek-ai/dsh-host-plugin-inventory/lib/typert.host.js for the in-box
// reference). The typert-loader scans Loader entries for this `./typert`
// export, validates it, and registers the invocation so the host api-gateway
// dispatches `pasteStore/savePaste` RPC calls from the web client.
import { z } from 'zod';
// Coarse character-level cap on the RPC wire (zod .max counts chars);
// the host's savePasteTo applies the authoritative UTF-8 byte cap
// (MAX_PASTE_BYTES = 1 MiB) before anything hits disk.
const savePasteText$schema = z.string().max(1024 * 1024);
const savePasteSessionId$schema = z.string();
const savePasteResult$schema = z.object({
    path: z.string(),
    absolutePath: z.string(),
    bytes: z.number(),
    chars: z.number(),
});
// The web client's ONLY source for the effective threshold/cap: it cannot read
// the loader row config (dsh hands a client bundle no config at all), so it
// asks for the resolved values at startup. No parameters.
const getConfigResult$schema = z.object({
    minChars: z.number(),
    maxBytes: z.number(),
});
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
    ],
    model: {
        services: [],
        events: [],
        objects: [],
    },
};
export default TYPERT;
