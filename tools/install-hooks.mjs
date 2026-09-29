#!/usr/bin/env node
/**
 * install-hooks.mjs —— 一键挂上隐私门禁钩子（幂等，可回滚）
 *
 * 做的事只有三件（**不改任何被跟踪文件的内容**）：
 *   1. 校验 tools/privacy-gate.mjs 与 .githooks/{pre-commit,pre-push} 都在位
 *   2. `git config core.hooksPath .githooks`
 *   3. 回读验证 + 跑一次引擎自检当冒烟
 *
 * 用法：node tools/install-hooks.mjs [--repo <路径>] [--uninstall]
 */

import { spawnSync } from 'node:child_process'
import { openSync, closeSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'

const argv = process.argv.slice(2)
const opt = (f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const uninstall = argv.includes('--uninstall')

/** 跑 git，stdout 落文件（不用管道——受限环境下管道会被拒）。 */
function git(args, cwd) {
  const tmp = mkdtempSync(join(tmpdir(), 'install-hooks-'))
  const out = join(tmp, 'out.txt')
  const fd = openSync(out, 'w')
  let res
  try {
    res = spawnSync('git', args, { cwd, stdio: ['ignore', fd, 'inherit'] })
  } finally {
    closeSync(fd)
  }
  const text = existsSync(out) ? readFileSync(out, 'utf8') : ''
  rmSync(tmp, { recursive: true, force: true })
  return { status: res.error ? -1 : res.status, text: text.trim(), err: res.error ? String(res.error) : '' }
}

const start = opt('--repo') ?? process.cwd()
const cwd = isAbsolute(start) ? start : join(process.cwd(), start)

const root = git(['rev-parse', '--show-toplevel'], cwd)
if (root.status !== 0) {
  console.error(`✗ 这里不是 git 仓库：${cwd}`)
  process.exit(2)
}
const repo = root.text
console.log(`仓库: ${repo}`)

if (uninstall) {
  const r = git(['config', '--unset', 'core.hooksPath'], repo)
  console.log(r.status === 0 ? '✅ 已卸载（core.hooksPath 已移除，钩子不再生效）' : `⚠️ 卸载返回 ${r.status}（可能本来就没设）`)
  process.exit(0)
}

// 1) 校验在位
const need = ['tools/privacy-gate.mjs', '.githooks/pre-commit', '.githooks/pre-push']
let missing = 0
for (const rel of need) {
  const ok = existsSync(join(repo, rel))
  if (!ok) missing += 1
  console.log(`  ${ok ? '✓' : '✗'} ${rel}`)
}
if (missing > 0) {
  console.error(`\n✗ 缺 ${missing} 个文件 ⇒ 拒绝安装（fail-closed）。请先把它们放进仓库。`)
  process.exit(2)
}

// 2) 设 core.hooksPath
const cur = git(['config', '--get', 'core.hooksPath'], repo)
if (cur.status === 0 && cur.text === '.githooks') {
  console.log('  ✓ core.hooksPath 已是 .githooks（幂等，无需改动）')
} else {
  const set = git(['config', 'core.hooksPath', '.githooks'], repo)
  if (set.status !== 0) {
    console.error(`✗ 写 core.hooksPath 失败：${set.err || set.status}`)
    process.exit(2)
  }
  console.log(`  ✓ core.hooksPath: ${cur.text || '(未设)'} → .githooks`)
}

// 3) 回读验证
const back = git(['config', '--get', 'core.hooksPath'], repo)
if (back.status !== 0 || back.text !== '.githooks') {
  console.error(`✗ 回读不符（读到 "${back.text}"）⇒ 门禁未生效，请手工确认。`)
  process.exit(2)
}
console.log('  ✓ 回读验证通过')

// 4) 冒烟：跑引擎自检（正例必红 / 白名单必绿）
const smoke = spawnSync('node', [join(repo, 'tools/privacy-gate.mjs'), '--selftest'], {
  cwd: repo,
  stdio: ['ignore', 'inherit', 'inherit'],
})
console.log(smoke.status === 0 ? '  ✓ 引擎自检全绿' : `  ✗ 引擎自检失败（exit ${smoke.status}）—— 门禁不可信，请先修`)

console.log(`
装好了。三层各自挡什么：

  L1 本机（本钩子）  防「手滑」—— 提交/推送前拦住新增的敏感内容
                     ⚠️ 挡不住 --no-verify / 删钩子 / 网页端提交 / 别的克隆
  L2 服务端          才是真闸门：把 CI 的 privacy job 设成 required status check，
                     并禁止直接 push main ⇒ **本机绕不过去**
  L3 源头            审查/交接文档只写「类别 + 位置 + 命中数」，不抄命中值

回滚：node tools/install-hooks.mjs --uninstall
      （或 git config --unset core.hooksPath）

POSIX 克隆注意（Windows 上 git 会自动处理）：
  git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push
`)
process.exit(smoke.status === 0 ? 0 : 1)
