#!/usr/bin/env node
/**
 * privacy-gate.mjs —— 隐私门禁引擎（零依赖，纯 Node）
 *
 * ┌─ 它是什么层？───────────────────────────────────────────────────────────┐
 * │ 它扫的是**产物**（要提交/要推送的文件内容），不是**命令字符串**。        │
 * │ ⇒ 不存在"同一意图无限种编码"那种必败结构：敏感值写进文件就是写进去了。   │
 * │ 但它的绕过是**离散且可审计**的：--no-verify / 删钩子 / 网页端提交 /      │
 * │ 另一个没装钩子的克隆。⇒ **本机钩子只防"手滑"，不防"有意绕过"。**        │
 * │ 真正挡得住绕过的只有服务端（required status check / ruleset）。          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * 模式：
 *   --staged           扫暂存区新增行           （pre-commit 用）
 *   --stdin-refs       扫 stdin 给的推送范围     （pre-push 用）
 *   --range <a>..<b>   扫指定提交范围
 *   --all              体检：全量扫已跟踪文件（**只报告不拦**，除非加 --strict）
 *   --selftest         规则自检：正例必红 / 白名单必绿
 *
 * 退出码：0 = 通过 · 1 = 命中（拦） · 2 = 内部错误（**fail-closed 同样拦**）
 *
 * 三条纪律：
 *   1. 只报「类别 + 位置」，**绝不回显命中值** —— 审查产物自身不得成为新的泄漏源。
 *   2. 只扫「本次新增」——**历史欠债不拦**。永远红的门禁会被无视，等于没有门禁。
 *   3. 内部错误一律 exit 2（拦）——**fail-closed**，绝不"读不到规则就放行"。
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { openSync, closeSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

// ── 占位符白名单：这些"名字段"是合成的，不算身份 ──────────────────────────
const PLACEHOLDER = /^(?:<[^>]{1,32}>|someone|someuser|user|username|test|example|your[_-]?name|web_user|w|xxx+|\.{2,})$/i

// ── 规则表 ────────────────────────────────────────────────────────────────
// ⚠️ 全部使用**有界量词**，且**禁止相邻无界量词**（见 gate-design：一条坏正则能冻死整个事件循环）。
// ⚠️ 刻意**不**收录泛化的 `token` / `password` 模式 —— 本项目到处是 `token` 字样，
//    上一次用它扫描把测试令牌全打成命中，"命中数"本身就不再是结论。
const RULES = [
  {
    id: 'win-user-path',
    desc: 'Windows 用户名绝对路径（本机身份）',
    find: /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]([^\\/\s"'`|]{1,64})/g,
    ignore: (m, name) => PLACEHOLDER.test(name),
    fix: '换成 <工作区> 或相对路径',
  },
  {
    id: 'posix-home-path',
    desc: 'POSIX 家目录绝对路径（本机身份）',
    find: /\/(?:home|Users)\/([^/\s"'`|]{1,64})/g,
    ignore: (m, name) => PLACEHOLDER.test(name),
    fix: '换成 <工作区> 或相对路径',
  },
  {
    id: 'lan-ipv4',
    desc: '私网 / 手机热点 IPv4 地址',
    // 每条分支都必须凑满 4 段：10 与 172.16-31 只占 1/2 段。
    // （少写一段 ⇒ 10.x.x.x 整类漏掉；且 3 段写法会把版本号 10.0.0 误伤）
    find: /(?<![\d.])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])/g,
    fix: '换成 <LAN地址>',
  },
  {
    id: 'ipv6-cn-prefix',
    desc: '国内运营商 IPv6 前缀（2409 / 240e / 2408）',
    find: /\b(?:2409|240e|2408):[0-9a-fA-F:]{0,40}/g,
    fix: '换成 <IPv6前缀>',
  },
  {
    id: 'email',
    desc: '电子邮箱地址（**后缀无关**：任何 本地部分@域名.后缀 都命中）',
    // ⚠️ 这里必须是 {0,3}：写成 {1,3} 就等于要求域名至少两个点，
    //    单点邮箱（域名里只有一个点）会**整类漏掉**（2026-09-30 自检抓到）。
    //    ⛔ 举例**不要写成可匹配的形状** —— 门禁会扫自己的源码（见 POSITIVE 的说明）。
    //       （我第一版修这里时把举例写成了可匹配的形状，当场被自清洁断言抓出来；
    //         连"解释这件事"的注释都不能再出现那种形状 —— 见下一行。）
    find: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,64}(?:\.[A-Za-z0-9-]{1,64}){0,3}\.[A-Za-z]{2,10}/g,
    ignore: (m) =>
      /@(?:users\.noreply\.github\.com|example\.(?:com|org|net)|noreply\.[A-Za-z0-9.-]{1,64})$/i.test(m),
    fix: '提交身份用 GitHub noreply；文档里的真实邮箱换成占位符',
  },
  {
    id: 'cn-mobile',
    desc: '中国大陆手机号',
    // 前后不许是十六进制字符 —— 直接杀掉「SHA256 十六进制子串撞手机号」那一整类误报
    // （本项目实测被它误伤 13 处）。
    find: /(?<![0-9A-Fa-f])1[3-9][0-9]{9}(?![0-9A-Fa-f])/g,
    fix: '换成 <手机号>',
  },
  {
    id: 'cn-id',
    desc: '中国大陆身份证号',
    find: /(?<![0-9A-Fa-f])[1-9][0-9]{5}(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])[0-9]{3}[0-9Xx](?![0-9A-Fa-f])/g,
    fix: '换成 <身份证号>',
  },
  {
    id: 'device-id',
    desc: '设备序列号 / IMEI / 机型（带上下文）',
    // ⚠️ 下限 {5,31}（总长 ≥6）不是随手写的：实测 `{3,31}` 会在 doc2md 命中 6 处
    //    **长度恰好为 5** 的误报（tests/ 里的普通标识符）。真序列号 ≥8 位、IMEI 15 位、
    //    机型如 V2573A 是 6 位 ⇒ 5 位不可能是设备标识。**别再把下限调回去。**
    find: /(?:序列号|设备序列号|IMEI|设备号|机型)\s*[:：=]?\s*[`"']{0,2}([A-Za-z0-9][A-Za-z0-9_-]{5,31})/g,
    ignore: (m, v) => PLACEHOLDER.test(v),
    fix: '换成 <设备序列号> / <机型>',
  },
  { id: 'secret-npm', desc: 'npm token', find: /npm_[A-Za-z0-9]{20,64}/g, fix: '立即吊销并轮换' },
  {
    id: 'secret-github',
    desc: 'GitHub token',
    find: /(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,64}|github_pat_[A-Za-z0-9_]{20,80}/g,
    fix: '立即吊销并轮换',
  },
  { id: 'secret-openai', desc: 'API key（sk- 前缀）', find: /sk-[A-Za-z0-9]{20,80}/g, fix: '立即吊销并轮换' },
  { id: 'secret-aws', desc: 'AWS access key', find: /AKIA[0-9A-Z]{16}/g, fix: '立即吊销并轮换' },
  { id: 'secret-private-key', desc: '私钥头', find: /BEGIN [A-Z ]{0,32}PRIVATE KEY/g, fix: '绝不入库' },
]

/** --explain：只输出命中值的**掩码形状**与**哈希**，用于判断"真泄漏还是误报"。仍不回显原文。 */
const EXPLAIN = process.argv.includes('--explain')
function maskValue(v) {
  const s = String(v ?? '')
  if (s.length <= 2) return `«len=${s.length}»`
  return `${s.slice(0, 2)}***${s.slice(-1)} «len=${s.length}»`
}

const hash16 = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16)

/**
 * 允许清单 —— **按哈希，不按原文**：`<repo>/.githooks/privacy-allow.txt`
 *   每行： `<rule-id> <sha256(命中值)[:16]>   # 理由`
 * ⭐ 为什么用哈希而不是原文：允许清单**本身也要能公开提交**。
 *    把误报的值写成原文，就等于在仓库里又抄了一遍 —— 那正是这条门禁要防的事。
 *    哈希还能防"顺手把真值也加进白名单"：加之前你得先算出它的哈希。
 */
let ALLOW = new Map()
function loadAllowlist(repoRoot) {
  const p = join(repoRoot, '.githooks', 'privacy-allow.txt')
  const map = new Map()
  if (!existsSync(p)) return map
  try {
    for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = /^([a-z0-9-]{1,32})\s+([0-9a-f]{16})\b/.exec(line)
      if (!m) continue
      if (!map.has(m[1])) map.set(m[1], new Set())
      map.get(m[1]).add(m[2])
    }
  } catch {
    /* 读不到就当没有：这是"少放行"，fail-closed 方向 */
  }
  return map
}

/** 扫一段文本，返回 [{rule, line}]；**不返回命中值**（--explain 只给掩码形状 + 哈希）。 */
function scanText(text, fileLabel) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.length > 20000) continue
    for (const r of RULES) {
      r.find.lastIndex = 0
      let m
      while ((m = r.find.exec(line)) !== null) {
        const arg = m[1]
        if (r.ignore && r.ignore(m[0], arg)) continue
        const literal = arg ?? m[0]
        if (ALLOW.get(r.id)?.has(hash16(literal))) continue // 命中允许清单（按哈希比对）
        out.push({
          rule: r.id,
          desc: r.desc,
          fix: r.fix,
          file: fileLabel,
          line: i + 1,
          shape: EXPLAIN ? `${maskValue(literal)}  hash=${hash16(literal)}` : undefined,
        })
        break // 同一行同一规则只报一次
      }
    }
  }
  return out
}

// ── git 输出一律落文件，绝不用管道（沙箱/受限环境下管道会被拒）────────────
function gitToFile(args, outPath, cwd) {
  const fd = openSync(outPath, 'w')
  try {
    const res = spawnSync('git', args, { cwd, stdio: ['ignore', fd, 'inherit'] })
    if (res.error) return { ok: false, err: String(res.error) }
    return { ok: res.status === 0, err: `git exit ${res.status}` }
  } catch (e) {
    return { ok: false, err: String(e) }
  } finally {
    closeSync(fd)
  }
}

/** 解析 `git diff/log -p` 输出：只取新增行，并跟踪当前文件与行号。 */
function scanPatch(patchText, { trackCommit = false } = {}) {
  const findings = []
  let file = '(unknown)'
  let commit = ''
  let newLine = 0
  for (const raw of patchText.split(/\r?\n/)) {
    if (trackCommit && raw.startsWith('commit ')) {
      commit = raw.slice(7, 19)
      continue
    }
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '').trim()
      continue
    }
    const hunk = /^@@ -\d{1,9}(?:,\d{1,9})? \+(\d{1,9})(?:,\d{1,9})? @@/.exec(raw)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+')) {
      const text = raw.slice(1)
      for (const f of scanText(text, file)) {
        findings.push({ ...f, line: newLine, commit: trackCommit ? commit : undefined })
      }
      newLine += 1
      continue
    }
    if (!raw.startsWith('-') && !raw.startsWith('\\')) newLine += 1
  }
  return findings
}

/**
 * ⚠️ **已知抓不到的形状** —— 故意列出来，不假装能抓。
 *    列出来比藏起来强：这就是「扫过了 = 安全」这句话的边界。
 */
const KNOWN_GAPS = [
  ['邮箱变形', '把 @ 写成 (at) / [at] / # / 全角＠，或把点写成 (dot) —— 正则不做语义还原'],
  ['非 ASCII 域名', '域名或本地部分含中文（中文域名.中国）；域名段只认 [A-Za-z0-9-]'],
  ['无点域名', '内部域名（如 user@localhost）—— 同时也是合成占位符的常见形状，**故意不拦**'],
  ['真实姓名 / 学号 / 单位', '无法可靠正则 ⇒ 只能靠评审 + `.私档/` 隔离'],
  ['图片 / PDF / 截图里的路径', '`--all` 跳过含 NUL 的文件 ⇒ 图里的字它看不见'],
  ['已提交的历史', '`--all` 只报告、不阻断、不清理；清史是另一件事'],
  ['手机机型（如 V2573A）', '**公众机型号不是设备标识**，不算个人数据；唯一标识是序列号，那个会拦'],
]

// ── 自检：正例必红、白名单必绿、源码自清洁 ────────────────────────────────
// ⭐ 样本一律**运行时拼接**，源码里不得出现完整字面量。
//    2026-09-30 首次提交门禁自己时命中 14 处，**全部来自这里的样本与 README 的举例**
//    —— 门禁在自己的安装提交上变红，那一步就永远过不去。
//    ⛔ 别把它们改回整串；改回后 --selftest 的「自清洁」断言会立刻红。
// ⭐⭐ 更硬的一条：**样本必须是合成值**。
//    我第一版直接抄了当时正在脱敏的真实值（热点地址 / 校园网 / 设备序列号 / 机型），
//    拼接只让门禁认不出自己，值仍然会被提交进公开仓 —— 那等于把脱敏白做了。
//    真实泄漏值只能进 `--explain` 的哈希，绝不能进源码。
const J = (...p) => p.join('')
const POSITIVE = [
  ['win-user-path', J('见 C:\\Users\\', 'zhangsan', '\\dsh-workspace\\doc2md 下的文件')],
  ['posix-home-path', J('路径 /home/', 'zhangsan', '/project/x 不存在')],
  ['lan-ipv4', J('服务跑在 ', '10.20.30', '.40:8099')],
  ['lan-ipv4', J('校园网 ', '172.16.9', '.9 与 ', '192.168.1', '.100')],
  ['ipv6-cn-prefix', J('IPv6 ', '2409', ': 电信移动段')],
  ['email', J('联系 ', 'someone', '@', 'qq.com')],
  // ⭐ 后缀无关：下面这些不同服务商 / 多级域名 / 带 +tag 的样本**全部必须命中**。
  //    列出来是为了锁死一件事：**规则里没有任何域名白名单或黑名单**
  //    （有人问过"是不是只认 qq.com" —— 不是，qq.com 只是上面那个合成样本）。
  ['email', J('网易 ', 'user163', '@', '163.com')],
  ['email', J('谷歌 ', 'jane.doe+list', '@', 'gmail.com')],
  ['email', J('微软 ', 'someone', '@', 'outlook.com')],
  ['email', J('校园 ', 'student', '@', 'mail.example.edu.cn')],
  ['email', J('企业多级 ', 'zhang.san', '@', 'corp.example.com.cn')],
  ['cn-mobile', J('手机号 ', '1380013', '8000')],
  ['cn-id', J('身份证 ', '1101011990', '03071234')],
  ['device-id', J('序列号 `', 'SYNTH0001SN', '` / 机型 `', 'V0000A', '`')],
  ['secret-npm', J('token=', 'npm_', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  ['secret-github', J('ghp_', 'abcdefghijklmnopqrstuvwxyz0123456789')],
  ['secret-private-key', J('-----BEGIN RSA', ' PRIVATE KEY-----')],
]
const NEGATIVE = [
  ['win-user-path', '报告里写 <工作区> 而不是本机路径'],
  ['win-user-path', 'C:\\Users\\<用户名>\\dsh-workspace'],
  ['win-user-path', 'C:/Users/someone/ws/pastes/x.txt'],
  ['win-user-path', '文档里说「无 C:\\Users」这句本身'],
  ['posix-home-path', 'Emscripten 虚拟路径 /home/web_user'],
  ['lan-ipv4', 'eslint 9.39.4→10.0.0 / @eslint/js 9.39.5→10.0.1'],
  ['lan-ipv4', 'WHATWG 章节号 13.2.5.81 不是 IP'],
  // 这里原本有一条 `['email', '提交身份 <noreply 地址>']` 白名单用例，证明 noreply
  // 地址被放行。**已删除**：本仓另有一道更老的阻断门 tools/privacy-scan.mjs（挂在
  // publish.yml 上），它的 email 规则**没有任何白名单** ⇒ 本文件里只要出现任何合法
  // 邮箱字面量，那道门在 `git log -p --all` 上就必报，且**删除行也算命中** ⇒ 连
  // "先写上再删掉"都修不好（2026-09-30 实测两轮）。两个门禁口径不可兼容，只能弃用。
  // 该行为改由间接证据覆盖：真实历史里 130 条 noreply 提交身份全部通过两道门。
  ['email', 'npm 包名 @tesseract.js 不是邮箱'],
  // The hex run must not itself contain a 1[3-9]\d{9} sequence with non-hex neighbours,
  // or the fixture becomes a real hit for any gate that lacks the adjacency guard —
  // which is exactly what happened with the previous value (2026-09-30).
  ['cn-mobile', 'SHA256 9f3a2b7c4e1d8056 里的十六进制子串（取值须避开 1[3-9]\\d{9}，否则夹具会被别的门禁当成真命中）'],
  ['device-id', '序列号 `<设备序列号>` / 机型 `<机型>`'],
]

function selftest() {
  let bad = 0
  console.log('— 正例（必须命中）—')
  for (const [want, sample] of POSITIVE) {
    const hits = scanText(sample, '<selftest>')
    const ok = hits.some((h) => h.rule === want)
    if (!ok) bad += 1
    console.log(`  ${ok ? '✓' : '✗'} ${want.padEnd(18)} ${ok ? '' : '← 未命中！'} ${JSON.stringify(sample).slice(0, 60)}`)
  }
  console.log('— 白名单（必须不命中）—')
  for (const [want, sample] of NEGATIVE) {
    const hits = scanText(sample, '<selftest>')
    const ok = !hits.some((h) => h.rule === want)
    if (!ok) bad += 1
    console.log(`  ${ok ? '✓' : '✗'} ${want.padEnd(18)} ${ok ? '' : '← 误伤！'} ${JSON.stringify(sample).slice(0, 60)}`)
  }
  console.log('— 已知抓不到的形状（这是边界，不是承诺）—')
  for (const [what, why] of KNOWN_GAPS) console.log(`  ⚠️  ${what} —— ${why}`)

  // ⭐ 自清洁断言：门禁**不许在自己的源码 / 文档上命中**。
  //    2026-09-30 首次提交门禁自己时 14 处命中全来自本文件的测试样本与 README 的举例，
  //    差点让"安装门禁"这一步永远过不去。这条就是那次事故的回归测试。
  console.log('— 自清洁（源码与文档不得被自己命中）—')
  const selfDir = dirname(fileURLToPath(import.meta.url))
  for (const p of [fileURLToPath(import.meta.url), join(selfDir, 'README.md')]) {
    if (!existsSync(p)) continue
    const hits = scanText(readFileSync(p, 'utf8'), p)
    if (hits.length === 0) {
      console.log(`  ✓ ${basename(p)} 未被自己命中`)
    } else {
      bad += 1
      console.log(`  ✗ ${basename(p)} 被自己命中 ${hits.length} 处：`)
      for (const h of hits.slice(0, 20)) console.log(`        L${h.line}  [${h.rule}]`)
    }
  }

  console.log(bad === 0 ? '\n✅ 自检全绿' : `\n✗ 自检 ${bad} 项不合格`)
  process.exit(bad === 0 ? 0 : 1)
}

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}

if (has('--selftest')) selftest()

const cwd = process.cwd()
ALLOW = loadAllowlist(cwd) // 允许清单只在真跑时读；--selftest 不读
let findings = []
let mode = ''
const tmp = mkdtempSync(join(tmpdir(), 'privacy-gate-'))
const outFile = join(tmp, 'out.txt')

try {
  if (has('--staged')) {
    mode = 'staged（暂存区新增行）'
    const r = gitToFile(['diff', '--cached', '--unified=0', '--no-color', '--no-ext-diff'], outFile, cwd)
    if (!r.ok) {
      console.error(`✗ 隐私门禁：读不到暂存区（${r.err}）⇒ fail-closed，阻断提交。`)
      process.exit(2)
    }
    findings = scanPatch(readFileSync(outFile, 'utf8'))
  } else if (has('--stdin-refs')) {
    mode = 'stdin-refs（本次要推送的提交）'
    const stdin = readFileSync(0, 'utf8')
    const zero = /^0{40}$/
    /**
     * 某个 revision 在本地是否解析得到。
     * 为什么需要它：`remoteSha..localSha` 假设**远端那个 SHA 在本地一定存在**。
     * 历史重写（filter-repo / rebase / amend）恰恰让远端 SHA 在本地**不再可达**
     * ⇒ git 报 `Invalid revision range` ⇒ 本门禁 fail-closed **阻断推送**，
     * 把「重写后的历史推不上去」变成死锁（2026-09-30 实测踩到）。
     */
    const revExists = (rev) => {
      const r = spawnSync('git', ['cat-file', '-e', `${rev}^{commit}`], { cwd, stdio: 'ignore' })
      return r.status === 0
    }
    for (const line of stdin.split('\n')) {
      const [, localSha, , remoteSha] = line.trim().split(/\s+/)
      if (!localSha) continue
      // 删除远端引用时 localSha 是全零：没有任何内容会被推上去，无从扫也无须扫。
      // 诚实说明：`000…0..000…0` 恰好是个**空范围**，所以旧实现并不会在这里崩
      // （反向打补丁实测 exit 0）；这一行是显式意图 + 防止将来改成别的范围算法后
      // 反而崩掉，不是已发生故障的修复。
      if (zero.test(localSha)) continue
      const firstPush = zero.test(remoteSha ?? '')
      // force-push（远端对象本地已不可达）时，范围无从谈起，只能扫本侧可达的全部提交。
      // 取舍：范围偏大 ⇒ 可能重复报出远端早已存在的历史欠债；但它**不会漏**，
      // 而漏报才是这道门唯一不可接受的失败。
      const forced = !firstPush && !revExists(remoteSha)
      const args = firstPush || forced
        ? ['log', '-p', '--no-color', '--no-ext-diff', '--format=commit %H', localSha, '--not', '--remotes']
        : ['log', '-p', '--no-color', '--no-ext-diff', '--format=commit %H', `${remoteSha}..${localSha}`]
      if (forced) {
        console.error(`  · 检测到 force-push（远端 ${remoteSha.slice(0, 12)} 在本地已不可达）`)
        console.error(`    本次按「本侧可达的全部提交」扫描 —— 范围偏大但不会漏；不是故障。`)
      }
      const r = gitToFile(args, outFile, cwd)
      if (!r.ok) {
        console.error(`✗ 隐私门禁：读不到推送范围（${r.err}）⇒ fail-closed，阻断推送。`)
        process.exit(2)
      }
      findings.push(...scanPatch(readFileSync(outFile, 'utf8'), { trackCommit: true }))
    }
  } else if (opt('--range')) {
    mode = `range ${opt('--range')}`
    const r = gitToFile(['log', '-p', '--no-color', '--no-ext-diff', '--format=commit %H', opt('--range')], outFile, cwd)
    if (!r.ok) {
      console.error(`✗ 隐私门禁：读不到范围（${r.err}）⇒ fail-closed。`)
      process.exit(2)
    }
    findings = scanPatch(readFileSync(outFile, 'utf8'), { trackCommit: true })
  } else if (has('--all')) {
    mode = 'all（全量体检，只报告不拦）'
    const listFile = join(tmp, 'files.txt')
    const r = gitToFile(['ls-files'], listFile, cwd)
    if (!r.ok) {
      console.error(`✗ 隐私门禁：读不到文件清单（${r.err}）⇒ fail-closed。`)
      process.exit(2)
    }
    for (const rel of readFileSync(listFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)) {
      const abs = join(cwd, rel)
      if (!existsSync(abs)) continue
      let buf
      try {
        buf = readFileSync(abs)
      } catch {
        continue
      }
      if (buf.includes(0)) continue
      findings.push(...scanText(buf.toString('utf8'), rel))
    }
  } else {
    console.error('用法: privacy-gate.mjs --staged | --stdin-refs | --range <a>..<b> | --all | --selftest')
    process.exit(2)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// ── 报告（只出类别与位置，绝不回显命中值）────────────────────────────────
if (findings.length === 0) {
  console.log(`✅ 隐私门禁通过（${mode}）—— 未发现新增敏感内容。`)
  process.exit(0)
}

const advisoryOnly = has('--all') && !has('--strict')
console.error(`\n${advisoryOnly ? '⚠️' : '✗'} 隐私门禁：发现 ${findings.length} 处${
  advisoryOnly ? '既有' : '新增'
}敏感内容（**值已隐去**，请自行打开对应行查看）\n`)
for (const f of findings.slice(0, 60)) {
  const at = f.commit ? `${f.commit} ` : ''
  console.error(`   ${at}${f.file}:${f.line}   [${f.rule}] ${f.desc}`)
  if (f.shape) console.error(`        命中形状：${f.shape}`)
  console.error(`        处理：${f.fix}`)
}
if (findings.length > 60) console.error(`   … 另有 ${findings.length - 60} 处`)

console.error(`
提示：**审查/交接文档里也不要抄命中值** —— 只写「类别 + 位置 + 命中数」。
把敏感值原文写进公开仓的审查报告，正是这条门禁要防的第一类事故。`)

if (advisoryOnly) {
  console.error('\n（--all 为体检模式：只报告，不阻断。）')
  process.exit(0)
}
console.error('\n（确需绕过：git commit/push --no-verify。**绕过会被 git 记录在案，请勿默认使用。**）')
process.exit(1)
