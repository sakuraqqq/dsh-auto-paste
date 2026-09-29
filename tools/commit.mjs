#!/usr/bin/env node
/**
 * commit.mjs —— 走门禁的提交通道（**不依赖 sh**）
 *
 * 为什么需要它：
 *   Git 在 Windows 上执行钩子必经 `sh.exe`，而 **sh.exe 在 DSH 沙箱里起不来**
 *   （`couldn't create signal pipe, Win32 error 5`）。
 *   ⇒ 装了 `core.hooksPath` 之后，沙箱内的裸 `git commit` 会以一条 Cygwin 报错失败。
 *   ⇒ 那会把 agent 逼去用 `--no-verify` —— **"退化成装饰的最短路径"**。
 *
 * 本脚本给出**不用 sh 的正规通道**：先跑门禁，过了才提交，且**显式跳过钩子**
 * （钩子已经由本脚本等价执行过，不是绕过）。
 *
 * 用法：
 *   node tools/commit.mjs -m "docs: ..."
 *   node tools/commit.mjs -m "docs: ..." -- <paths>
 *
 * 退出码：0 = 已提交 · 1 = 被门禁拦下 · 2 = 环境/参数错误
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GATE = join(HERE, 'privacy-gate.mjs')

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('用法: node tools/commit.mjs -m "<提交信息>" [-- <paths>]')
  process.exit(2)
}

// 1) 先过门禁（等价于 pre-commit 钩子做的事）
console.log('[commit.mjs] 先跑隐私门禁（--staged）…')
const gate = spawnSync('node', [GATE, '--staged'], { stdio: 'inherit' })
if (gate.error) {
  console.error(`[commit.mjs] 门禁无法启动：${gate.error} ⇒ fail-closed，不提交。`)
  process.exit(2)
}
if (gate.status !== 0) {
  console.error('\n[commit.mjs] 门禁未通过 ⇒ 拒绝提交。')
  console.error('             请按上面的「类别 + 位置」去改；**不要把命中值抄进任何文档**。')
  process.exit(1)
}

// 2) 过了才提交；显式清空 hooksPath（钩子内容已由上面等价执行，不是绕过）
console.log('[commit.mjs] 门禁通过，提交中…')
const commit = spawnSync('git', ['-c', 'core.hooksPath=', 'commit', ...argv], { stdio: 'inherit' })
if (commit.error) {
  console.error(`[commit.mjs] git 无法启动：${commit.error}`)
  process.exit(2)
}
process.exit(commit.status ?? 1)
