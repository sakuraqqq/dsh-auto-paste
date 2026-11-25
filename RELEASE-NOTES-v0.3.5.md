# dsh-auto-paste v0.3.5

Two client-side resilience fixes: a paste is no longer swallowed when the host is gone, and the threshold row no longer deadlocks after one failed read.

## UX-2 — never intercept a paste when the host is known gone

`onPaste` used to call `preventDefault()` before anything had confirmed the host was alive. A stale client bundle — plugin disabled, host restarted, or an upgrade/rollback without a page reload — kept the listener attached, so a large paste was taken over, the `savePaste` RPC waited out the whole timeout (**15 s**), and the fallback then reported "save failed" for a request that never reached anything.

- The listener now reads a cached tri-state `hostOk` (`null` not probed / `true` last RPC reached the host / `false` known gone). Every `pasteStore` RPC updates it, and `preventDefault()` only runs when it is not `false`.
- While the host is known down, a cheap `getConfig` probe (2 s budget, every 10 s) decides when it is safe to intercept again — no page reload needed.
- `RPC_TIMEOUT_MS` 15 s → **5 s**, so even the first paste after the host dies is bounded.

## UX-1 — "host is gone" and "the save was refused" now read differently

Both failures used to land on the same "大段粘贴保存失败" toast, implying a file was written and then failed. They now report:

- host unreachable → `插件后台未运行，已按普通粘贴处理` (the text was pasted natively);
- the host refused the save → the original "保存失败" copy.

## Settings row — no more deadlock after one failed read

The threshold row fetched the config once, with a 5 s timeout, and kept `remote = null` forever when that one call failed (`读取 host 配置失败：signal is aborted without reason`); only remounting it — switching sessions — recovered.

- It seeds itself from the last validated startup config, so a failed re-read cannot blank the row;
- bounded retry (1 s / 3 s) and a readable message instead of the raw `DOMException`;
- a manual **重试** button on the failure state;
- unmount cancels the retry timer and aborts the in-flight request, with `cancelled` + `aliveRef` guards so a late response can never overwrite a newer run.

## Verification

- `tests/paste-host-unavailable.test.js` guards both properties (red before the fix: 2 failures).
- `npm test` 123/123, typecheck, build, lint, metrics and smoke green.
- Reproduced on the Android shell (WebView + local Termux host): after disabling the plugin without a reload, a large paste now goes straight into the composer — no stall, no "save failed".
