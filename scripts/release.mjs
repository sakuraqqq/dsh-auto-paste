#!/usr/bin/env node
// release.mjs — dsh-auto-paste 一键发版脚本（B 方案：手动控版本号 + tag）
//
// 用法（在插件目录、你自己的终端跑）：
//   npm run release -- patch          # 0.1.2 → 0.1.3（修 bug）
//   npm run release -- minor          # 0.1.2 → 0.2.0（加功能）
//   npm run release -- major          # 0.1.2 → 1.0.0（大版本）
//   npm run release -- 0.4.0          # 直接指定版本号
//   npm run release -- patch --force  # 跳过 git 干净检查（不推荐）
//
// 流水线（每步失败即停，绝不带着坏包往下走）：
//   0. git 干净检查
//   1. 版本已发布检查（npm view，存在即停）← 最高优先守卫
//   2. 更新 package.json 版本号（--no-git-tag-version 手动控）
//   3. build:all（tsc + lib 同步 + client）
//   4. test（质量门）
//   5. npm pack --dry-run（核对发布清单）
//   6. git commit → tag → push（顺序不能反：tag 必须指向 bump 提交）
//   7. gh release（gh 已登录则发，附 changelog）
//   8. 发布状态提示（发布在 CI，异步完成；核验命令见输出）
//
// ⚠️ 本脚本**不发布**：推 tag 会触发 .github/workflows/publish.yml
//    （npm Trusted Publisher / OIDC）完成发布，dist-tag 由那个 workflow 决定（next）。
//    脚本只负责「造出指向 bump 提交的 tag 并推上去」。
// ⚠️ 设计约束：必须在用户自己的 shell 跑（沙箱内 git push/token 不可用）。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = 'dsh-auto-paste'
const DRY = process.argv.includes('--dry-run')

// ── 参数解析 ─────────────────────────────────────────────
const argv = process.argv.slice(2)
const force = argv.includes('--force')
const bump = argv.find((a) => !a.startsWith('--'))
if (!bump) {
  console.error('用法: npm run release -- [patch|minor|major|<版本号>] [--force]')
  process.exit(1)
}
const VERSION_RE = /^\d+\.\d+\.\d+$/

// ── 工具函数 ─────────────────────────────────────────────
const log = (m) => console.log(`\n◆ ${m}`)
const ok = (m) => console.log(`  ✓ ${m}`)
const fail = (m) => {
  console.error(`  ✗ ${m}`)
  process.exit(1)
}

function sh(cmd, { silent = false } = {}) {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
      stdio: silent ? 'pipe' : 'inherit',
    })
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
console.log(`  发版 ${PKG_NAME}: ${current} → ${target}`)
console.log(`  npm dist-tag: next（由 publish.yml 决定）${force ? '  (--force)' : ''}`)
console.log(`══════════════════════════════════════════`)

// ── 阶段 0: git 干净检查 ────────────────────────────────
log('阶段 0/8  git 工作区检查')
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
log('阶段 1/8  目标版本是否已发布')
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
log(`阶段 2/8  更新版本号 ${current} → ${target}`)
pkg.version = target
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
ok(`package.json 版本已更新为 ${target}（先不打 tag：等构建/测试/清单核对都过了再 commit→tag）`)

// ── 阶段 3: 构建 ────────────────────────────────────────
log('阶段 3/8  构建 build:all（tsc + lib 同步 + client）')
sh('npm run build:all')
ok('构建完成')

// ── 阶段 4: 测试质量门 ──────────────────────────────────
log('阶段 4/8  测试 npm test')
sh('npm test')
ok('测试全绿')

// ── 阶段 5: 打包预检 ────────────────────────────────────
log('阶段 5/8  npm pack --dry-run 发布清单核对')
// 用 --json 拿结构化清单（跨 npm 版本稳定；npm 11 的 plain 输出不含文件列表，
// 2026-08-19 实测只打一行 tgz 名——不能依赖 plain 文本）。
const packJson = sh('npm pack --dry-run --json', { silent: true })
const packMeta = JSON.parse(packJson)
const packed = packMeta?.[0]?.files?.map((f) => f.path) ?? []
console.log(
  `${packMeta?.[0]?.filename ?? '(unknown tgz)'} — ${packed.length} files, ${packMeta?.[0]?.unpackedSize ?? 0} bytes unpacked`,
)
// 校验关键文件是否出现在 tarball 清单里（缺失即失败）
const REQUIRED_IN_PACK = [
  'LICENSE', // MIT 许可必须随包
  'dist/index.js', // host 半身
  'dist/client.js', // web client 半身
  'dist/typert.host.js',
  'src/index.ts', // 源码随包（可审查）
  'src/client.js',
  'cordis.patch.yml', // dsh 装配 patch
  'package.json',
]
const missing = REQUIRED_IN_PACK.filter((f) => !packed.includes(f))
if (missing.length) {
  fail(`tarball 清单缺少关键文件: ${missing.join(', ')} — 检查 package.json files 字段`)
}
ok(`tarball 清单核对通过（${REQUIRED_IN_PACK.length}/${packed.length} 个关键文件全部包含）`)

if (DRY) {
  console.log('\n[--dry-run] 到此为止，未发布、未打 tag。')
  sh(`git checkout -- package.json`, { silent: true })
  console.log('package.json 版本已还原。')
  process.exit(0)
}

// ── 阶段 6: commit → tag → push ─────────────────────────
// 顺序不能反：tag 必须落在「已提交的 bump」上 —— publish.yml 会校验
// tag 号 == package.json version，错位的 tag 会在 CI 里直接失败。
log(`阶段 6/8  git commit → tag v${target} → push`)
sh('git add package.json && git commit -m "release: v' + target + '"')
sh(`git tag v${target}`)
sh(`git push origin main --tags`)
ok(`v${target} 已推送 — publish.yml（OIDC）据此发布，dist-tag: next`)

// ── 阶段 7: GitHub Release（gh 可用则发）────────────────
log('阶段 7/8  GitHub Release（gh CLI 可选）')
let ghNote = ''
try {
  const changelog = sh(`git log --oneline v${current}..HEAD`, { silent: true })
  if (changelog)
    ghNote =
      'Changelog:\n' +
      changelog
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n')
} catch {
  /* 无上个 tag 或空，忽略 */
}
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

// ── 阶段 8: 发布状态提示（发布在 CI，异步完成）──────────
// 这里**不能**硬校验 npm：推 tag 只是触发 publish.yml，runner 排队 + 构建通常要 1~2 分钟，
// 立刻 npm view 必然还是旧版本 —— 那会把「tag 已成功推上去」误报成发布失败。
log('阶段 8/8  发布状态（CI 异步）')
console.log(`  tag v${target} 已推送 → GitHub Actions 工作流 publish 正在用 OIDC 发布。`)
console.log('  核验（等 1~2 分钟）：')
console.log('    gh run list --workflow=publish.yml --limit 1')
console.log(`    npm view ${PKG_NAME}@${target} version`)
console.log('  转正为 latest（npm 的 dist-tag add 不支持 OIDC，必须人工带 2FA）：')
console.log(`    npm dist-tag add ${PKG_NAME}@${target} latest`)

console.log(`\n══════════════════════════════════════════`)
console.log(`  ✅ tag 已推送: v${target}（发布由 CI 完成）`)
console.log(`  npm:  publish.yml（OIDC）→ dist-tag next`)
console.log(`  git:  main + v${target} pushed`)
console.log(`══════════════════════════════════════════`)
console.log(`\n下一步可选：`)
console.log(`  · 观察期建议: 装到新 profile 从 registry 重验一次`)
console.log(`  · 若插件有功能变化，可更新 awesome-dsh-plugin 收录描述`)
