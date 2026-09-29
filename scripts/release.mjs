#!/usr/bin/env node
// release.mjs — dsh-auto-paste 一键发版脚本（B 方案：手动控版本号 + tag）
//
// 用法（在插件目录、你自己的终端跑）：
//   npm run release -- patch          # 0.1.2 → 0.1.3（修 bug）
//   npm run release -- minor          # 0.1.2 → 0.2.0（加功能）
//   npm run release -- major          # 0.1.2 → 1.0.0（大版本）
//   npm run release -- 0.4.0          # 直接指定版本号
//   npm run release -- patch --force  # 跳过 git 干净检查（不推荐）
//   npm run release -- v0.4.0 --finish  # 合并并推 tag 之后：补发 GitHub Release
//
// 流水线（每步失败即停，绝不带着坏包往下走）：
//   0. git 干净检查
//   1. 版本已发布检查（npm view，存在即停）← 最高优先守卫
//   2. 更新 package.json 版本号（--no-git-tag-version 手动控）
//   3. build:all（tsc + lib 同步 + client）
//   4. test（质量门）
//   5. npm pack --dry-run（核对发布清单）
//   6. commit → 推分支 → 开 PR（**不再直推 main**，见下）
//   7. 提示合并 + 打 tag（**tag 必须在合并之后**，见下）
//   8. 提示 gh release 与 npm 转正（发布在 CI，异步完成）
//
// ⚠️ 为什么走 PR 而不是直推 main（2026-09-30 实测，别再改回去）：
//    仓库有 ruleset「必需状态检查 = gate」且**无旁路**。而 GitHub 的必需状态检查是在
//    **push 时**评估的，检查却只能在提交到达 GitHub **之后**才跑 ⇒ 「无旁路 + 必需检查」
//    下**直推 main 在结构上不可能成功**。0.1.5 那次就是 `git push origin main --tags`
//    被 `GH013: Required status check "gate" is expected` 拒掉。
//
// ⚠️ 为什么 tag 挪到合并之后（顺序同样不能反）：
//    合并提交由 GitHub 生成，本地拿不到它的 SHA，所以无法在推送前把 tag 打到"最终"提交上。
//    若先打 tag 再合并，tag 会停在分支提交上、与 main 差一格（0.1.5 就是这样）。
//    ⇒ **先合并、后打 tag**：tag 天然指向 main 上那个已验证提交，两者不会再错位。
//    （具体到哪一步打、敲什么命令，见阶段 7 的提示 —— 那才是唯一该出现该命令的地方。）
//
// ⚠️ 本脚本**不发布**：推 tag 会触发 .github/workflows/publish.yml
//    （npm Trusted Publisher / OIDC）完成发布，dist-tag 由那个 workflow 决定（next）。
// ⚠️ 设计约束：必须在用户自己的 shell 跑（沙箱内 git push/token 不可用）。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = 'dsh-auto-paste'
const DRY = process.argv.includes('--dry-run')
const FINISH = process.argv.includes('--finish')

// ── 参数解析 ─────────────────────────────────────────────
const argv = process.argv.slice(2)
const force = argv.includes('--force')
const bump = argv.find((a) => !a.startsWith('--'))
// --finish 不需要也不接受版本参数：它处理的是"已经发出去的那个版本"，而那个版本就在
// package.json 里。把它做成位置参数只会让人写出 `--finish 0.1.5` 这种冗余形式，
// 且位置参数还会被当成 bump 去算下一个版本号（第一版就是这么错的）。
if (!bump && !FINISH) {
  console.error('用法: npm run release -- [patch|minor|major|<版本号>] [--force]')
  console.error('      npm run release -- --finish    # 合并并推 tag 之后补发 GitHub Release')
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

// ── --finish: 合并并推 tag 之后，补发 GitHub Release ─────────
// 为什么单独一个模式：Release 必须在 tag 存在之后才能建，而 tag 现在要等 PR 合并
// 才打（见文件头）。所以「建 Release」从流水线里拆出来，合并后单独再跑一次。
// 目标版本 = 当前 package.json 的版本（bump 已经在合并进去的那次提交里了）。
if (FINISH) {
  const target = current
  log(`--finish  v${target} 的 GitHub Release`)
  const localTag = sh(`git tag -l "v${target}"`, { silent: true })
  if (!localTag) {
    fail(
      `本地没有 tag v${target} —— 先合并 PR，然后：\n` +
        `    git checkout main && git pull --ff-only\n` +
        `    git tag v${target} && git push origin v${target}`,
    )
  }
  // 手写的 release notes 优先（给人读，比脚本拼的 commit 列表好）；缺失才回退 changelog。
  const handWritten = join(ROOT, `RELEASE-NOTES-v${target}.md`)
  const hasHandWritten = existsSync(handWritten)
  let notesFile = handWritten
  if (!hasHandWritten) {
    let changelog = ''
    try {
      changelog = sh(`git log --oneline v${current}..HEAD`, { silent: true })
    } catch {
      /* 无上个 tag 或空，忽略 */
    }
    notesFile = join(ROOT, '.release-notes.md')
    writeFileSync(
      notesFile,
      `Release ${target}\n\n${changelog ? `Changelog:\n${changelog}\n` : '（无 changelog）'}\n`,
      'utf8',
    )
  }
  try {
    sh('gh auth status', { silent: true })
    sh(`gh release create v${target} --notes-file "${notesFile}" --title "v${target}"`)
    ok(
      `GitHub Release v${target} 已创建` +
        (hasHandWritten
          ? `（notes 源 = RELEASE-NOTES-v${target}.md）`
          : '（notes 源 = 自动 changelog）'),
    )
  } catch {
    console.log('  （gh 未登录或不可用 — 可稍后在网页手动补 Release）')
  }
  process.exit(0)
}

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
ok(`package.json 版本已更新为 ${target}（先不打 tag：等构建/测试/清单核对都过了再 commit → PR）`)

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

// ── 阶段 6: commit → 推分支 → 开 PR ─────────────────────
// 直推 main 在结构上不可能成功（必需状态检查在 push 时评估，见文件头说明）。
// 分支名用 `release-v<版本>`（无空格，任何 shell 都不会把它拆成两个参数）。
const branch = `release-v${target}`
log(`阶段 6/8  git commit → push ${branch} → gh pr create`)

// 已经在该分支上（重复执行时）就不再切；否则从当前 HEAD 建分支。
const onBranch = sh('git rev-parse --abbrev-ref HEAD', { silent: true })
if (onBranch !== branch) {
  sh(`git checkout -b ${branch}`)
  ok(`已切到新分支 ${branch}（此前在 ${onBranch}）`)
} else {
  ok(`已在分支 ${branch}`)
}

sh('git add package.json && git commit -m "release: v' + target + '"')
sh(`git push -u origin ${branch}`)
ok(`分支已推送：${branch}`)

// PR：已存在则复用（重复执行时不该炸）
let prUrl = ''
try {
  const existing = sh(`gh pr view ${branch} --json url --jq .url`, { silent: true })
  if (existing) {
    prUrl = existing
    ok(`复用已存在的 PR：${prUrl}`)
  }
} catch {
  /* 没有同名 PR，正常新建 */
}
if (!prUrl) {
  try {
    prUrl = sh(
      `gh pr create --base main --head ${branch}` +
        ` --title "release: v${target}"` +
        ` --body "版本号提交：${current} → ${target}。合并后按脚本提示打 tag v${target}（tag 触发 publish.yml）。"`,
      { silent: true },
    )
    ok(`PR 已创建：${prUrl}`)
  } catch (e) {
    fail(
      `分支已推送，但 gh pr create 失败（PR 没建出来）。\n` +
        `  请手动开 PR：https://github.com/<owner>/<repo>/pull/new/${branch}\n` +
        `  ${e.stderr || e.message}`,
    )
  }
}

// ── 阶段 7: 合并 + 打 tag（tag 必须在合并之后）──────────
// 合并后要跑的打 tag 命令：**本脚本不再自己打 tag** —— tag 必须在 PR 合并之后才打，
// 而合并由 GitHub 完成（见文件头）。合成一个变量，一是只维护一份文案，二是避免在
// "合并之前"的位置出现打 tag 的字面写法：那会误导读者，也会让静态断言以为脚本仍在推 tag。
const tagCmd = `git tag v${target} && git push origin v${target}`
log('阶段 7/8  合并 + 打 tag（**tag 在合并之后**）')
console.log(`  为什么不在这一步打 tag：合并提交由 GitHub 生成，本地拿不到它的 SHA。`)
console.log(`  先打 tag 再合并，tag 会停在分支提交上、与 main 差一格（0.1.5 那次就是这样）。`)
console.log('')
console.log('  请按顺序做两步：')
console.log(`    ① 等 PR 的 checks / gate 双绿后合并：  gh pr merge ${branch} --merge`)
console.log(`    ② 合并完成后**回到 main** 再打并推 tag：`)
console.log('         git checkout main && git pull --ff-only')
console.log(`         ${tagCmd}`)
console.log('')
console.log(
  '  （打 tag 走本机 pre-push 门禁；本机若有未提交改动，git checkout 会拒绝，先处理掉。）',
)

// ── 阶段 8: 发布状态提示（发布在 CI，异步完成）──────────
// 这里**不能**硬校验 npm：推 tag 只是触发 publish.yml，runner 排队 + 构建通常要 1~2 分钟，
// 立刻 npm view 必然还是旧版本 —— 那会把「tag 已成功推上去」误报成发布失败。
log('阶段 8/8  发布与收尾（合并并推 tag 之后）')
console.log(`  推 tag v${target} → GitHub Actions 工作流 publish 用 OIDC 发布（dist-tag: next）`)
console.log('  核验（等 1~2 分钟）：')
console.log('    gh run list --workflow=publish.yml --limit 1')
console.log(`    npm view ${PKG_NAME}@${target} version`)
console.log('  GitHub Release（本仓有手写 RELEASE-NOTES 就用它）：')
console.log(`    npm run release -- v${target} --finish`)
console.log('  转正为 latest（npm 的 dist-tag add 不支持 OIDC，必须人工带 2FA）：')
console.log(`    npm dist-tag add ${PKG_NAME}@${target} latest`)
console.log(
  `    npm view ${PKG_NAME} dist-tags --prefer-online   # 注意加 --prefer-online，否则读到本地缓存`,
)

console.log(`\n══════════════════════════════════════════`)
console.log(`  ✅ PR: ${prUrl || `（见分支 ${branch}）`}`)
console.log(`  ⏳ 待你：合并 PR → 回 main → 打并推 tag v${target}`)
console.log(`  npm:  publish.yml（OIDC）→ dist-tag next → 人工转正 latest`)
console.log(`  git:  分支已推；main 待合并；tag 待合并后创建`)
console.log(`══════════════════════════════════════════`)
console.log(`\n下一步可选：`)
console.log(`  · 观察期建议: 装到新 profile 从 registry 重验一次`)
console.log(`  · 若插件有功能变化，可更新 awesome-dsh-plugin 收录描述`)
