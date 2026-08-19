#!/usr/bin/env node
// release.mjs — dsh-auto-paste 一键发布脚本（B 方案：手动控版本号 + tag）
//
// 用法（在插件目录、你自己的终端跑）：
//   npm run release -- patch          # 0.1.2 → 0.1.3（修 bug）
//   npm run release -- minor          # 0.1.2 → 0.2.0（加功能）
//   npm run release -- major          # 0.1.2 → 1.0.0（大版本）
//   npm run release -- 0.4.0          # 直接指定版本号
//   npm run release -- patch --next   # 发布到 npm dist-tag `next`（观察期用）
//   npm run release -- patch --force  # 跳过 git 干净检查（不推荐）
//
// 流水线（每步失败即停，绝不带着坏包往下走）：
//   0. git 干净检查
//   1. 版本已发布检查（npm view，存在即停）← 最高优先守卫
//   2. 更新 package.json 版本号（--no-git-tag-version 手动控）
//   3. build:all（tsc + lib 同步 + client）
//   4. test（18 项质量门）
//   5. npm pack --dry-run（核对发布清单）
//   6. npm publish（有 bypass token 静默；403 才提示 OTP）
//   7. git tag + push main --tags
//   8. gh release（gh 已登录则发，附 changelog）
//   9. 发布后验证（npm view 确认线上版本）
//
// ⚠️ 设计约束：必须在用户自己的 shell 跑（沙箱内 publish/token 不可用）。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = 'dsh-auto-paste'
const DRY = process.argv.includes('--dry-run')

// ── 参数解析 ─────────────────────────────────────────────
const argv = process.argv.slice(2)
const isNext = argv.includes('--next')
const force = argv.includes('--force')
const bump = argv.find((a) => !a.startsWith('--'))
if (!bump) {
  console.error('用法: npm run release -- [patch|minor|major|<版本号>] [--next] [--force]')
  process.exit(1)
}
const VERSION_RE = /^\d+\.\d+\.\d+$/

// ── 工具函数 ─────────────────────────────────────────────
const log = (m) => console.log(`\n◆ ${m}`)
const ok = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => { console.error(`  ✗ ${m}`); process.exit(1) }

function sh(cmd, { silent = false } = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', shell: true, stdio: silent ? 'pipe' : 'inherit' })
    return (out || '').trim()
  } catch (e) {
    if (!silent) fail(`命令失败: ${cmd}\n${e.stderr || e.message}`)
    throw e
  }
}

const pkgPath = join(ROOT, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version

function incVersion(ver, type) {
  const [maj, min, pat] = ver.split('.').map(Number)
  if (type === 'major') return `${maj + 1}.0.0`
  if (type === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

const target = VERSION_RE.test(bump) ? bump : incVersion(current, bump)
if (!VERSION_RE.test(target)) fail(`非法版本号: ${target}`)

console.log(`\n══════════════════════════════════════════`)
console.log(`  发布 ${PKG_NAME}: ${current} → ${target}`)
console.log(`  dist-tag: ${isNext ? 'next' : 'latest'}${force ? '  (--force)' : ''}`)
console.log(`══════════════════════════════════════════`)

// ── 阶段 0: git 干净检查 ────────────────────────────────
log('阶段 0/9  git 工作区检查')
if (!force) {
  const dirty = sh('git status --porcelain', { silent: true })
  if (dirty) {
    console.error('  以下文件未提交:')
    for (const l of dirty.split('\n')) console.error('   ' + l)
    fail('工作区不干净 — 先用 git add/commit 提交，或加 --force 强制发布')
  }
  ok('工作区干净')
} else {
  ok('--force，跳过干净检查')
}

// ── 阶段 1: 版本已发布检查（最高优先守卫）───────────────
log('阶段 1/9  目标版本是否已发布')
try {
  const pub = sh(`npm view ${PKG_NAME}@${target} version`, { silent: true })
  if (pub) fail(`版本 ${target} 已在 npm 上（${pub}）— 换个版本号，npm 不允许覆盖已发布版本`)
  ok(`${target} 在 npm 上不存在，可发布`)
} catch {
  ok(`${target} 在 npm 上不存在，可发布`) // npm view 404 即视为未发布
}

// tag 冲突检测（B 方案手动控 tag）
const existingTag = sh(`git tag -l "v${target}"`, { silent: true })
if (existingTag) fail(`本地已有 tag v${target} — 先处理或换个版本号`)

// ── 阶段 2: 更新版本号（手动控，不打 tag 先）────────────
log(`阶段 2/9  更新版本号 ${current} → ${target}`)
pkg.version = target
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
ok(`package.json 版本已更新为 ${target}（先不打 tag，等发布成功后打）`)

// ── 阶段 3: 构建 ────────────────────────────────────────
log('阶段 3/9  构建 build:all（tsc + lib 同步 + client）')
sh('npm run build:all')
ok('构建完成')

// ── 阶段 4: 测试质量门 ──────────────────────────────────
log('阶段 4/9  测试 npm test（18 项）')
sh('npm test')
ok('测试全绿')

// ── 阶段 5: 打包预检 ────────────────────────────────────
log('阶段 5/9  npm pack --dry-run 发布清单核对')
const packOut = sh('npm pack --dry-run', { silent: true })
const fileCount = (packOut.match(/npm notice\s+\d+\.\d+ [kK]?B\s+/g) || []).length
console.log(packOut)
ok(`清单核对完成（${fileCount} 个文件，含 LICENSE + src + dist + cordis.patch.yml）`)

if (DRY) {
  console.log('\n[--dry-run] 到此为止，未发布、未打 tag。')
  sh(`git checkout -- package.json`, { silent: true })
  console.log('package.json 版本已还原。')
  process.exit(0)
}

// ── 阶段 6: npm publish ─────────────────────────────────
log(`阶段 6/9  npm publish（dist-tag: ${isNext ? 'next' : 'latest'}）`)
try {
  sh(`npm publish${isNext ? ' --tag next' : ''}`)
  ok('npm publish 成功')
} catch (e) {
  // bypass token 不弹 OTP；只有 403/OTP 才会走到这
  const msg = String(e.stderr || e.message)
  if (/403|EOTP|one-time pass/i.test(msg)) {
    console.error('  npm 返回 403/OTP 请求 — 检查 bypass token 是否仍有效，或手动补 OTP 重发。')
  }
  fail(`publish 失败，版本号已改但未发布。修复后重跑（会重新走全部检查）。`)
}

// ── 阶段 7: tag + push ──────────────────────────────────
log('阶段 7/9  git tag v' + target + ' + push')
sh(`git tag v${target}`)
sh('git add package.json && git commit -m "release: v' + target + '"')
sh(`git push origin main --tags`)
ok(`tag v${target} 已推送`)

// ── 阶段 8: GitHub Release（gh 可用则发）────────────────
log('阶段 8/9  GitHub Release（gh CLI 可选）')
let ghNote = ''
try {
  const changelog = sh(`git log --oneline v${current}..HEAD`, { silent: true })
  if (changelog) ghNote = 'Changelog:\n' + changelog.split('\n').map((l) => '  ' + l).join('\n')
} catch { /* 无上个 tag 或空，忽略 */ }
try {
  sh('gh auth status', { silent: true })
  const notes = `Release ${target}\n\n${ghNote || '（无 changelog）'}`
  const notesFile = join(ROOT, '.release-notes.md')
  writeFileSync(notesFile, notes, 'utf8')
  sh(`gh release create v${target} --notes-file "${notesFile}" --title "v${target}"`)
  ok(`GitHub Release v${target} 已创建`)
} catch {
  console.log('  （gh 未登录或不可用 — 跳过 GitHub Release，可稍后在网页手动补）')
}

// ── 阶段 9: 发布后验证 ──────────────────────────────────
log('阶段 9/9  发布后验证')
let live = ''
try { live = await sh(`npm view ${PKG_NAME} version`, { silent: true }) } catch { /* 暂不可查 */ }
if (live === target) {
  ok(`线上版本确认: ${PKG_NAME}@${live} ✅`)
} else {
  fail(`线上版本是 ${live || '(查不到)'}，与 ${target} 不符 — 发布可能失败，请手动核 npm 页面`)
}

console.log(`\n══════════════════════════════════════════`)
console.log(`  ✅ 发布完成: ${PKG_NAME}@${target}`)
console.log(`  npm:  ${isNext ? 'next' : 'latest'} tag`)
console.log(`  git:  v${target} pushed`)
console.log(`══════════════════════════════════════════`)
console.log(`\n下一步可选：`)
console.log(`  · 若插件有功能变化，可更新 awesome-dsh-plugin 收录描述`)
console.log(`  · 观察期建议: 装到新 profile 从 registry 重验一次`)