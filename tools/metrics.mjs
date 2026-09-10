// tools/metrics.mjs — 复杂度度量报告 + 硬门禁（防屎山 P2）
//
// 运行：npm run metrics（或 node tools/metrics.mjs）
// 产出：CODE-METRICS.md（每次运行覆盖写：基线 + 全量函数清单 + 超限红名单）
// 度量对象：src/**/*.js（web client 半身）+ scripts/**/*.mjs + smoke.mjs ——
//           与 eslint.config.js 的白名单一致；src/*.ts 由 tsc 守门、tests/ 自证、
//           dist/ 与 lib/ 是构建产物，均不度量。
//
// 复杂度口径（与 eslint.config.js 的 `complexity` warn 规则对齐）：
//   - 圈复杂度（cyclomatic）：1 + 分支点（if/for/while/do/switch-case/catch/三元 + 逻辑运算符 && || ??）；
//     阈值 ≤10。
//   - 认知复杂度（cognitive）：近似 Sonar 口径——控制流结构 1+嵌套深度、break/continue +1、逻辑运算符 +1；
//     阈值 ≤15。⚠️ 近似实现，与 sonarjs 官方数值可能差 1-2 分。
//   - **嵌套函数体不计入外层函数**（标准口径）：每个函数独立度量——否则 `__ModuleLoader__`
//     的 factory 包装函数会把整包内层分支算到自己头上（假阳性）。
//
// 门禁：超限函数数 > 0，或存在解析失败文件（度量不可信）→ exit 1。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as espree from 'espree'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CYC_MAX = 10
const COG_MAX = 15

/* ---------- AST 工具 ---------- */
const isNode = (v) => !!v && typeof v === 'object' && !!v.type

function childNodes(n) {
  const out = []
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) out.push(...v.filter(isNode))
    else if (isNode(v)) out.push(v)
  }
  return out
}

function walkFiles(dir, exts, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

const isFunctionNode = (n) =>
  n.type === 'FunctionDeclaration' ||
  n.type === 'FunctionExpression' ||
  n.type === 'ArrowFunctionExpression'

const identName = (n) => (n && n.type === 'Identifier' ? n.name : null)
const namedKey = (k) => (k && k.name ? k.name : null)
const PARENT_NAME_OF = {
  VariableDeclarator: (p) => identName(p.id),
  Property: (p) => namedKey(p.key),
  MethodDefinition: (p) => namedKey(p.key),
  AssignmentExpression: (p) => namedKey(p.left),
}

function fnName(node, parent) {
  if (node.type === 'FunctionDeclaration' && node.id) return node.id.name
  if (!parent) return '(anonymous)'
  const pick = PARENT_NAME_OF[parent.type]
  return (pick && pick(parent)) || '(anonymous)'
}

/* ---------- 圈复杂度：1 + 分支点 ---------- */
const CYC_POINT_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
  'ConditionalExpression',
])
const LOGICAL_OPS = new Set(['&&', '||', '??'])

function countCycPoints(n) {
  let c = 0
  if (CYC_POINT_TYPES.has(n.type)) c += 1
  if (n.type === 'SwitchCase' && n.test) c += 1
  if (n.type === 'LogicalExpression' && LOGICAL_OPS.has(n.operator)) c += 1
  for (const x of childNodes(n)) {
    // 嵌套函数体是独立度量单元，不计入外层函数的分（标准圈复杂度口径）。
    if (isFunctionNode(x)) continue
    c += countCycPoints(x)
  }
  return c
}
const cyclomatic = (node) => 1 + countCycPoints(node)

/* ---------- 认知复杂度（近似 Sonar） ---------- */
const COG_STRUCT = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'CatchClause',
  'ConditionalExpression',
])
const COG_JUMP = new Set(['BreakStatement', 'ContinueStatement'])

function nodeCogPoints(n, nesting) {
  let total = 0
  if (COG_STRUCT.has(n.type)) total += 1 + nesting
  if (COG_JUMP.has(n.type)) total += 1
  if (n.type === 'LogicalExpression' && LOGICAL_OPS.has(n.operator)) total += 1
  return total
}

/** else-if 链不递增嵌套深度（Sonar 口径）。 */
function childNesting(parent, child, nextNest, nesting) {
  const isElseIf =
    child === parent.alternate && parent.type === 'IfStatement' && child.type === 'IfStatement'
  return isElseIf ? nesting : nextNest
}

function cogVisit(n, nesting) {
  let total = nodeCogPoints(n, nesting)
  const nextNest = COG_STRUCT.has(n.type) ? nesting + 1 : nesting
  for (const c of childNodes(n)) {
    // 嵌套函数体是独立度量单元，不计入外层函数的分（与圈复杂度口径一致）。
    if (isFunctionNode(c)) continue
    total += cogVisit(c, childNesting(n, c, nextNest, nesting))
  }
  return total
}
const cognitive = (node) => cogVisit(node, 0)

/* ---------- 目标收集 ---------- */
const targets = []
const srcDir = path.join(ROOT, 'src')
const scriptsDir = path.join(ROOT, 'scripts')
const smokeFile = path.join(ROOT, 'smoke.mjs')
if (fs.existsSync(srcDir)) targets.push(...walkFiles(srcDir, ['.js'], []))
if (fs.existsSync(scriptsDir)) targets.push(...walkFiles(scriptsDir, ['.mjs'], []))
if (fs.existsSync(smokeFile)) targets.push(smokeFile)

function collectFunctions(node, parent, out) {
  if (isFunctionNode(node)) {
    out.push({
      name: fnName(node, parent),
      line: node.loc.start.line,
      cyclomatic: cyclomatic(node),
      cognitive: cognitive(node),
    })
    collectFunctions(node.body || node, node, out) // 内层函数同样计入（回调也是函数）
    return
  }
  for (const c of childNodes(node)) collectFunctions(c, node, out)
}

const funcs = []
const parseErrors = []
for (const file of targets) {
  const source = fs.readFileSync(file, 'utf8')
  let ast
  try {
    ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true })
  } catch (error) {
    parseErrors.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), error: error.message })
    continue
  }
  const fileFuncs = []
  collectFunctions(ast, null, fileFuncs)
  for (const f of fileFuncs) {
    f.file = path.relative(ROOT, file).split(path.sep).join('/')
    f.overCyc = f.cyclomatic > CYC_MAX
    f.overCog = f.cognitive > COG_MAX
    funcs.push(f)
  }
}

const over = funcs.filter((f) => f.overCyc || f.overCog)

/* ---------- 报告 ---------- */
const lines = []
lines.push('# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）')
lines.push('')
lines.push(`> 生成命令：\`npm run metrics\`（node tools/metrics.mjs）；生成时间：${new Date().toISOString()}`)
lines.push(
  '> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。',
)
lines.push(`> 阈值：圈复杂度 ≤${CYC_MAX}、认知复杂度 ≤${COG_MAX}（超限 = 红名单，metrics exit 1）。`)
lines.push('')
if (parseErrors.length > 0) {
  lines.push('## ⚠️ 解析失败文件（度量不可信，metrics 以 exit 1 失败）')
  lines.push('')
  for (const p of parseErrors) lines.push(`- ${p.file}：${p.error}`)
  lines.push('')
}
lines.push('## 1. 总览')
lines.push('')
lines.push(`- 度量文件数：${targets.length}；函数总数：${funcs.length}；**超限函数数：${over.length}**`)
lines.push(
  `- 圈复杂度最高：${funcs.length ? Math.max(...funcs.map((f) => f.cyclomatic)) : 0}；认知复杂度最高：${funcs.length ? Math.max(...funcs.map((f) => f.cognitive)) : 0}`,
)
lines.push('')
lines.push('## 2. 超限红名单（重构/拆分优先级）')
lines.push('')
if (over.length === 0) {
  lines.push('**无（当前基线健康）**')
} else {
  lines.push('| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |')
  lines.push('|---|---|---|---|---|')
  for (const f of over) {
    lines.push(
      `| ${f.file} | ${f.name} | ${f.line} | ${f.cyclomatic}${f.overCyc ? ' ⚠️' : ''} | ${f.cognitive}${f.overCog ? ' ⚠️' : ''} |`,
    )
  }
}
lines.push('')
lines.push('## 3. 全量函数清单')
lines.push('')
lines.push('| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |')
lines.push('|---|---|---|---|---|')
for (const f of [...funcs].sort((a, b) => b.cyclomatic - a.cyclomatic || b.cognitive - a.cognitive)) {
  lines.push(`| ${f.file} | ${f.name} | ${f.line} | ${f.cyclomatic} | ${f.cognitive} |`)
}
lines.push('')
lines.push('## 4. 口径与说明')
lines.push('')
lines.push(
  `- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \\|\\| ??）；阈值 ≤${CYC_MAX}。`,
)
lines.push(
  `- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤${COG_MAX}——数值与官方可能差 1-2 分。`,
)
lines.push('- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。')
lines.push('- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。')

const outPath = path.join(ROOT, 'CODE-METRICS.md')
fs.writeFileSync(outPath, lines.join('\n') + '\n')

console.log(`[metrics] 文件 ${targets.length}，函数 ${funcs.length}，超限 ${over.length}`)
for (const f of over) {
  console.log(`[metrics] OVER  ${f.file}:${f.line} ${f.name} cyc=${f.cyclomatic} cog=${f.cognitive}`)
}
console.log(`[metrics] 报告已写 ${path.relative(ROOT, outPath)}`)
if (over.length > 0) process.exitCode = 1
if (parseErrors.length > 0) {
  console.log(`[metrics] 解析失败 ${parseErrors.length} 个文件——度量不可信 → exit 1`)
  process.exitCode = 1
}
