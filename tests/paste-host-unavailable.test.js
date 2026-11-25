// 宿主不可用时的粘贴拦截 —— 两条性质守卫（UX-1 / UX-2）
//
// 缘起：2026-11-26 手机侧实测。在插件目录禁用 dsh-auto-paste 后**不刷新页面**，
// 再长按粘贴一段长文本：
//   · 文本被 preventDefault 拦下，没进输入框
//   · 白等一次 RPC 超时（当时 RPC_TIMEOUT_MS = 15000）
//   · 然后报「大段粘贴保存失败，已按原样粘贴回输入框」
//   · 但 pastes/ 里**没有新文件** ⇒ 一次有效保存都没发生（宿主侧服务已不存在）
// 刷新页面后现象消失（陈旧客户端 bundle 被卸载）。
//
// 两条性质：
//   UX-2：preventDefault() 之前必须已有「宿主是否可用」的判据（宿主不可用不接管粘贴）
//   UX-1：必须区分「宿主服务不存在」与「保存被服务端拒绝」两种失败文案
//
// ⚠️ 静态结构守卫，不是运行时复现；只把关"修好之后不得退化"。
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CLIENT_PATH = fileURLToPath(new URL('../src/client.js', import.meta.url))
const CLIENT_SRC = readFileSync(CLIENT_PATH, 'utf8')

/** 从 `const onPaste =` 起截一段（足够覆盖到 preventDefault）。 */
function onPasteBody(src) {
  const start = src.indexOf('onPaste = ')
  assert.ok(start >= 0, 'onPaste 必须存在')
  return src.slice(start, start + 4000)
}

describe('宿主不可用时的粘贴拦截（UX-1 / UX-2）', () => {
  test('环境：能定位到 client.js', () => {
    assert.ok(CLIENT_PATH.length > 0)
    console.log(`  被测文件：${CLIENT_PATH}`)
  })

  test('UX-2 — preventDefault() 之前必须存在宿主可用性判据', () => {
    const body = onPasteBody(CLIENT_SRC)
    const pd = body.indexOf('event.preventDefault()')
    assert.ok(pd >= 0, 'onPaste 内必须有 event.preventDefault()')
    const before = body.slice(0, pd)

    assert.match(
      before,
      /\bhostOk\b|\bhostAvailable\b|\bbackendOk\b|\bisHostReady\b|\bhostReady\b/,
      'preventDefault() 之前没有任何"宿主是否可用"的判据 ⇒ 宿主被卸载后仍会拦截，' +
        '用户要等满 RPC 超时才看到兜底，而这次保存从未真正发生',
    )
  })

  test('UX-1 — 必须为「宿主不可用」提供独立文案（不得与「保存失败」混用）', () => {
    assert.match(
      CLIENT_SRC,
      /后台未运行|宿主未运行|插件后台|host (?:is )?not (?:running|available)|backend unavailable/i,
      '只有「保存失败」一种文案：把"服务不存在"报成"保存失败"，属于归因错误',
    )
  })
})
