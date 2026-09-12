# dsh-auto-paste 开发交接文档（DEV-NOTES）

> 新对话开工前必读。本文档汇总插件开发全过程（源自两个历史会话 + 环境维护记录），
> 让新对话快速了解全部上下文，无需翻历史会话。

## 1. 插件是什么

dsh 插件：**Web 输入框粘贴大段文本（>500 字符）时，自动保存为工作区 `pastes/<时间戳>.txt`** 并在消息里引用路径（效果参考 Chatbox 的"贴一大段 → 自动生成附件文件"）。另有 `save_paste` 工具兜底（模型主动调用）。

- 版本 0.1.0，dsh 0.1.0-rc.6
- 位置：`<旧实验环境>\dsh-auto-paste`
- git：独立仓库（从 workspace 仓库迁出，历史见 workspace 仓库 25c4a2a 等提交）

## 2. 技术架构

- **客户端粘贴钩子（主路径）**：`dsh.client.platform: web`，client inject [sessions, connection]。粘贴超阈值 → 客户端拦截 → 通过 connection RPC（Typert gateway）调用宿主 `pasteStore/savePaste` → 写入 `pastes/<时间戳>.txt` → 插入文件路径引用；保存失败回退普通粘贴不丢数据。
- **文件名**：`YYYYMMDD-HHMMSSmmm.txt`（毫秒后缀 = collision-safe，同秒多次粘贴不撞名）。
- **save_paste 工具（兜底）**：宿主注册，模型主动调用。
- 入口：`dsh/index.js`（手写插件入口）+ `dist/main.js`（CLI 引擎）。
- 相关文件：`src/`（TS 源码）、`dist/`（构建产物）、`cordis.patch.yml`、`tests/release.test.js`、`smoke.mjs`、`RELEASE.md`（发布清单）、`TESTING.md`（独立测试任务书）、`LICENSE`（测试评估许可）。

## 3. 开发历史（两个会话）

- **会话 A（创造模式）**：创建插件。用户需求原文："在输入框粘贴大段文本时，自动保存为 txt 文件"。中途 API 没钱中断过，插件最终完成。
- **会话 B（PTC 修 bug）**：排查"插件不生效"（F12 控制台错误）→ 修复 → 方案 A/B 决策（A=全自动 E2E，B=半自动兜底不发布）→ 多 AI 交叉验证（Chatbox/Codex）→ 统一 LICENSE（评估许可）→ smoke 毫秒文件名同步 → 发布准备（QQ 群测试计划、打包到桌面、插件介绍）。
- **会话 C（2026-08-15 状态同步）**：QQ 群测试已发出（观察期进行中）、插件介绍已定稿但未落盘、全自动 E2E 已通过（RELEASE.md 状态行）。
- **会话 D（2026-08-16 独立测试 + 修复）**：独立第三方测试报告结论「有条件发布」（无 P0，8/8 边界用例通过）；处理后三个阻断项——P1 交付目录环境损坏（node_modules 悬空 junction，删装重建修复）✅、P2 缺文本大小上限（savePasteTo/assertPasteSize 加 1MiB 字节校验 + RPC schema 粗校验）✅、P3 本文档与 TESTING.md 同步 ✅。
- **会话 E（2026-08-16 发布）**：许可切换 MIT（db4333b，files 含 src 源码随包可审查）→ GitHub 源仓库推送（sakuraqqq/dsh-auto-paste，tag v0.1.0）→ npm publish v0.1.0（官方源 registry.npmjs.org，dist-tag `next`）→ README 加发布状态段（e4e8b1f 记录）。
- **会话 F（2026-08-16 0.1.1 准备）**：README 补 npm 安装方式 + 1MiB 上限说明；version 升 0.1.1；RELEASE.md 阶段 C 勾选 + 0.1.1 待办；发布版验证（tarball 含最新 dist maxBytes ✅、LICENSE/README/package.json 三处 MIT 同步 ✅）。
- **会话 G（2026-08-17~18 发布收尾）**：0.1.2 发布（latest，metadata 元数据 + README latest 安装方式）、阶段 A 验收通过（registry 安装 + 独立 profile + host ready + 卸载，commit 7699427）、npm 页面渲染核对、release notes 跳过（新版 UI 无入口）；**GitHub 2FA 已启用**（2026-08-18，Android Aegis TOTP + 恢复码已存）——后续 GitHub 操作不受限。
- **会话 H（2026-08-18 上架 + 热装攻坚）**：确认 npm 0.1.2 已发布、GitHub 0.1.2+v0.1.2 tag 已同步，废弃 HANDOFF-GITHUB-NPM.md 归档；上架 PR **#1688** 已提（收录三件套：YAML 条目 + 两份 README 用官方脚本同款逻辑生成到「与线上只差一行」精度；dsh-plugin topic 已加；两个自动检查全绿「Entries look good」，等维护者 Merged）；**从 GitHub 源安装成功**（dsh plugin add）；**免重启热装攻坚成功且重启持久**（详见 §8 坑）；实测粘贴 12442 字符自动落盘 ✅。

## 4. 测试状态（已验证）

| 项 | 结果 |
|---|---|
| typecheck | ✅ exit 0 |
| build | ✅ exit 0 |
| smoke（导出面/文件名/读写往返/工作区解析/Typert 清单） | ✅ SMOKE-OK |
| release.test.js（18 项，含历史 bug 回归 + maxBytes 上限） | ✅ 18 pass |
| 实测粘贴 | ✅ 自动存 pastes/（多个粘贴文件证明工作正常） |
| 全自动 E2E | ✅ 通过（2026-08-15，RELEASE.md 状态行） |
| 独立第三方测试（2026-08-16） | ✅ 有条件发布：无 P0，8/8 边界用例；P1 环境/P2 上限已修复 |
| 阶段 A 验收（2026-08-17，registry 0.1.2） | ✅ npm i 安装 + 独立 profile 包名 add + host ready/save_paste listed + 卸载验证；GUI 由主 web 真实使用证明 |

## 5. 许可与发布状态

- **LICENSE = MIT**（2026-08-16 由评估许可切换，commit db4333b；Copyright (c) 2026 misakamaster）
- package.json：`license: MIT`、author: misakamaster、files 含 src（源码随包可审查）
- README 顶部为 MIT 许可表述
- **发布状态**：**已发布 dsh-auto-paste@0.1.0**（2026-08-16，官方源 registry.npmjs.org，dist-tag `next`，GitHub 源仓库 sakuraqqq/dsh-auto-paste tag v0.1.0）——QQ 群测试改用 `npm i dsh-auto-paste`（原评估许可 zip 包已过时）
- **独立测试**（2026-08-16）：有条件发布；阻断项 P1（交付目录）/P2（大小上限）已处理，P3（文档同步）已完成
- **0.1.2 已发布**（2026-08-17，官方源，`latest: 0.1.2`；`next: 0.1.1`）——repository/homepage 元数据 + README latest 安装方式；1MiB 上限自 0.1.0 起已有（0.1.1 仅更新 README）
- **npm 发布认证坑**（踩过）：账户 2FA = `auth-and-writes` 时，发布必须用**勾选了 bypass 2FA 的 granular token**（网页勾选易被表单报错重置——先填完其他项、最后勾选并立即 Generate）；旧式/无 bypass token 发布报 403。npm 官方正逐步限制 bypass-2FA token（见 gh.io/npm-gat-bypass2fa-deprecation），长期需关注迁移
- **观察期**：汇总未落盘（RELEASE.md 第 0 节四项检查待补，标准「第 3 天 ≈ 2026-08-17」已过，随时可补）
- **上架**：awesome-dsh-plugin PR **#1688**（2026-08-18，全绿待合并；dsh-plugin topic 已加）

## 6. 遗留事项（新对话可继续；2026-08-15 状态更新）

1. **插件介绍**：✅ 已定稿（对话内），**文字未落盘**——需向用户要定稿文字后补录到 README 顶部
2. **QQ 群测试**：✅ 已发出（zip 含 LICENSE/README），观察期进行中（开始日期待确认，≈2026-08-15）
3. **观察期第 3 天汇总**：待做（≈2026-08-17；按 RELEASE.md 第 0 节四项检查：落盘一致性 / F12 报错 / 多工作区 / 同秒两次）
4. **上架 PR #1688**（2026-08-18）：⏳ 等维护者 Merged（行情 1-3 天）——合并即进 awesome 市场，届时同步「已上架」状态
5. **观察期第 3 天汇总**：待补（按 RELEASE.md 第 0 节四项：落盘一致性 / F12 报错 / 多工作区 / 同秒两次）
6. 可选：npm dist-tag 迁移关注（npm 正逐步限制 bypass-2FA token，正式版发布前核对）

## 7. 环境注意

- 插件在 `dsh-trial\dsh-auto-paste`（与 workspace 平级），工作区已注册（侧边栏 dsh-auto-paste）
- pastes/ 已加入 workspace .gitignore（粘贴数据不入库）；dsh-auto-paste 自己的 git 只跟踪源码
- 改插件代码后：`npm run build` → 重启 web（无注入器，重启是最快的验证方式）
- 全局规则：装插件前跑 preflight、dsh 内部状态不手改（见记忆）
## 8. 技术坑（会话 H 硬核攻坚，防呆）

### 8.1 super-injector 免重启热装的 loader 坑
- **现象**：热装失败，dsh 插件 loaded 后行为异常/不生效。
- **根因**：super-injector 的 loader 解析的是 **profile 副本**而非插件源码——改的是源码但 loader 读的还是旧副本，自然不对。
- **破案**：先发现「loader 读副本而非源码」→ 改对文件 → 但仍不对 → 进一步发现 **产线差异**：本插件 src 是 **tsc 产线**（tsc → dist/），而注入器/热装管线认 **tsdown 产线**，两者产物结构/入口不一致。
- **解法**：用 **相对路径补丁 + pnpm link: 直连源码** 绕过产线差异；免重启热装成功且重启后依然 active。
- **教训**：热装类工具对插件构建产线有隐含要求；若插件用 tsc 而非 tsdown，先对齐产线再谈热装，别在 loader/副本层面打转。

### 8.2 GitHub 源安装 & pnpm approve-builds
- `dsh plugin add <github-url>` 从 GitHub 装插件时，若 pnpm 因脚本拒绝构建（approve-builds 机制），需先放行对应包名再继续，否则构建被拒。

### 8.3 上架 awesome-dsh-plugin 的「收录三件套」精度
- 提交 PR 前用**官方脚本同款逻辑**重新生成 README（中英两份）+ YAML 条目，验证到「与线上只差自己那一条目」的精度，CI（Entries look good）即一次通过。

### 8.4 PowerShell 写文本默认 ANSI —— .gitignore 中文 pattern 失效（2026-09-12）
- **现象**：`Add-Content .gitignore "TASK-20260910-功能批次1-AB.md"` 之后，`git check-ignore -v` **无输出**、`git status` 仍把该文件列为未跟踪；`.gitignore` 变成**非法 UTF-8**（`read` 工具直接报 `invalid UTF-8 text`）。
- **根因**：Windows PowerShell 的 `Add-Content`/`Set-Content` **默认按 ANSI(GBK) 写**，中文文件名被落成 8 个 GBK 字节（`B9 A6 C4 DC C5 FA B4 CE` = 「功能批次」），而真实文件名是 UTF-8 —— pattern 与文件名不相等，忽略规则自然不生效。
- **防再犯**：
  1. 配置/文本文件里的 pattern/键名**能 ASCII 就 ASCII**（写 `TASK-*.md` 通配，而不是把中文文件名原样写进 `.gitignore`）；
  2. 必须写非 ASCII 时**别用裸 `Add-Content`/`Set-Content`**：改用文件编辑工具，或 `[System.IO.File]::AppendAllText($p,$t,(New-Object System.Text.UTF8Encoding($false)))`（显式 UTF-8 **无 BOM**；PS 5.1 的 `-Encoding utf8` 会带 BOM，可能反过来弄坏首行 pattern）；
  3. 写完**必须回读校验**：`git check-ignore -v <file>` 命中 + UTF-8 合法（`read` 工具能读即合法）。
- **亲缘**：与「改 `.ps1` 丢 BOM 炸启动器」**同族** —— PowerShell 的默认编码不可信；凡涉及非 ASCII 的读写，都要**显式指定编码 + 回读校验**。
- **状态更新（2026-09-12，主链路迁 PowerShell 7 之后）**：已装 PS 7.6.6（`pwsh`）。**字节级探针实测**：PS7 的 `Set-Content`（无论是否带 `-Encoding utf8`）**默认就写 UTF-8 无 BOM**（拿到 `E6 B5 8B E8 AF 95…`= 「测试」的 UTF-8，而非 GBK `B2 E2 CA D4`）→ **本条的 ANSI 坑在主链路消失**。**但保留三条纪律**：① 写**仓库文本仍走文件工具**——PS 写文件默认 **CRLF**（探针末尾 `0D 0A`），会给 LF 仓库制造 diff 噪音；② `.cmd`/`.bat` 必须**无 BOM**（别用 `-Encoding utf8BOM`）；③ 读**遗留** ANSI/GBK 文件仍需显式 `-Encoding`（PS7 默认按 UTF-8 读）。

### 8.5 给用户终端命令一律单行（2026-09-12）
- **现象**：给用户的 `gh release create ... \` 用了 **bash 的 `\` 续行**，而对面是 PowerShell（不认 `\` 续行）→ gh 只收到半条命令、转入交互提问，落单的 `\` 还被当成附件路径去上传 → `read \: Incorrect function` 失败。
- **根因**：跨 shell 的续行符不通用（bash `\` / PowerShell 反引号 `` ` ``）。
- **防再犯**：给用户的命令**一律写成单行**再贴；确需换行时按对方 shell 选续行符，并说明「整条复制」。

### 8.6 PS7 下「捕获原生命令输出」会整条失败（2026-09-12）
- **现象**：`$x = & git -c … rev-parse HEAD`、或 `"HEAD: " + (git … rev-parse HEAD)` 这类**捕获**写法报
  `ResourceUnavailable: 程序'git.exe'运行失败： StandardOutputEncoding is only supported when standard output is redirected.`
  —— 变量拿到空值，后面所有拼接/判断全错（危险：看起来像"命令没错，只是没输出"）。
- **根因**：PS7 在**重定向/捕获**原生命令输出时会设置 `ProcessStartInfo.StandardOutputEncoding`；在当前宿主（DSH 的 pwsh 通道）下这个组合不被允许，于是原生命令**整个启动失败**（不是 git 的问题）。
- **防再犯**：
  1. 在 AI 侧跑 git 等原生命令时**不要捕获** —— 让输出直连控制台。查同步状态用 `git status -sb` 一行即可（`## main...origin/main` 无 `[ahead N]` 即同步），不需要 `rev-parse` + 比较。
  2. 确需取值时，别反复试同一种写法 —— 改走不吃 `StandardOutputEncoding` 的路径（读文件、或写临时文件再 `read`）。
  3. 看到这个报错**不要误判成"仓库/命令有问题"**：它纯粹是宿主与 PS7 的交互限制。

### 8.7 插槽只管层级、不管位置：`shell.overlay` 里必须自己定位；dsh 自带 toast 的落点是 composer 卡内的 `conversation.input.overlay`（2026-09-12）
- **现象**：给「保存成功」加的 toast 注册进 `shell.overlay`（槽目录里明写「a badge, **a toast stack** or a status pill all belong here」，`replaceRisk:"none"`），渲染出来却在**屏幕中上方**，不在输入框旁边。
- **根因**：`shell.overlay` 的容器 CSS 只有两条规则 ——
  `.pI_x6G_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}` 与 `.pI_x6G_overlayLayer>*{pointer-events:auto}`
  —— **没有任何布局**。它是 `inset:0` 的块级盒子，于是 `display:flex;align-items:center` 的子元素就成了「整宽 + 水平居中 + 贴层顶」＝ 屏幕中上方。**「座位对」不等于「位置对」：这个槽只保证层级与点击穿透，落点由占用方自己负责。**
- **正确座位＝dsh 自带 toast 的落点**：自带 toast 是 `jsx(Toast,{ text, anchor: cardRef.current })`，`anchor` 指向 **composer 卡片**（`<div ref={cardRef} className={InputBar.card} data-composer-card>`，`ui-conversation/lib/client.js:16051-16068`）；而卡内第一个子元素就是锚点槽：
  ```jsx
  <div className={InputBar.overlayAnchor}>{renderSlot('conversation.input.overlay', {})}</div>
  ```
  该锚条 CSS 为 `.uV2eYG_overlayAnchor{height:0;position:absolute;inset:0 0 auto}` ＝ **卡片顶边的零高度全宽锚条**。所以「走 dsh 既有 toast 位置」的具体做法是：注册进 `conversation.input.overlay`，再在锚条内 `position:absolute;left:0;right:0;bottom:8px` + `flex-direction:column` 向上生长（`bottom:8px` 相对零高度锚条＝卡片顶边上方 8px）。
- **session 作用域不挡插件注册**：该槽是 `scope:"session"`，但**绑定来自渲染方** —— renderer 仅在「session 槽被无绑定地渲染」时才抛 `scope 'session' rendered without a standard-source binding`（`ui-renderer/lib/client.js:558`），而 composer 侧 `renderSlot(..., {})` **不做任何过滤/select**。因此 root fiber 直接
  `slots.inject('conversation.input.overlay', () => slots.register({ name, id, order, label }, Comp))`
  即可：`inject` 会等声明、按声明生命周期重跑、collapse 时 dispose（不会重复占用）。
- **防再犯**：给 dsh 加浮层前，先用 `cordis_inspect_query`（Slots.listSubTree 看占用方与注册契约）**再读该槽容器的真实 CSS**；「目录说这槽是给 toast 的」只能证明**座位**对，证不了**落点**对。
- **一句话教训**：插槽决定**层级**，占用方决定**位置**；想「和 dsh 一样」，就去找它渲染那件东西的**同一行 JSX**，别找一个听起来像的槽。

### 8.8 客户端半身拿不到 row config —— 配置旋钮会「静静地不生效」（2026-09-12）
- **现象**：`cordis.patch.yml` 的 row config **只有 host 半身收得到**。客户端 `apply(ctx, config)` 的 `config` 恒为空对象，于是读到本地配置那几行是**死代码**：把 `minChars` 改成 2000，浏览器侧照旧按 500 拦截，host 只在启动日志里打出 2000 —— 看起来「配置生效了」，实际没有。
- **证据（dsh 0.1.5-rc.1，三处源码）**：
  1. `dsh-client-modules/lib/index.js:139-149`（`parseDshClient`）—— `dsh.client` 只接受 `platform` / `inject` / `external` / `immediately`，**没有 config 字段**；
  2. 同文件 `bootInjections():387-432` —— 发给浏览器的启动图只含 batch URL 与 `__DSH_BOOT__` 图，**没有任何 per-row config**；
  3. 同目录 `client.js:362` —— 客户端模块系统自己 apply 插件半身，不传 config。
- **正解（3b 起）**：host 作唯一权威，客户端启动时经**既有 RPC** 取生效值（本项目 `pasteStore/getConfig`），取不到再用兜底值并在控制台**标出来源**。粘贴判据必须同步（`preventDefault` 得在事件里同步调用），所以配置**只能在启动时拉**，不能等粘贴瞬间再问。
- **零参数 invocation 合法（已实测）**：`dsh-typert-loader/lib/index.js:153-205` 只强校验 `id/service/namespace/method`（非空字符串）、receiver kind、result codec；`parameters` 是数组遍历 —— `parameters: []` 通过。
- **配套纪律（新增，防炸用户重启）**：**改 typert descriptor 后，先离线用 dsh 自己的校验器验一遍，再让用户重启** —— descriptor 被拒 = 插件整行加载失败，正好炸在用户重启那一刻。探针（已 `script_archive` 存档，id `mtyfv8ak7mqk`）：
  ```js
  const { validateTypertManifest } = await import(
    pathToFileURL(`${process.env.APPDATA}/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-typert-loader/lib/index.js`).href
  )
  validateTypertManifest('dsh-auto-paste', TYPERT)   // 抛错即会被 dsh 拒
  ```
  （`requireStrictCodec` 另有两条硬要求：`mode === 'strict'`，且 `schema` 必须是**裸 zod v4 对象** —— `'_zod' in schema && typeof schema.parse === 'function'`。）

### 8.9 给 dsh 加「设置项」的正确姿势：schemastery + `settings.general.item`（2026-09-12，C-2）
- **座位**：单行偏好用客户端槽 `settings.general.item`（list / root / `replaceRisk:"none"`），现有占用方 `permission(-20) / language(0) / appearance(10) / font-size(11) / transcript-view(12) / composer-enter(20)`。**独占一整页**才用 `settings.section`。
- **关键契约（别猜）**：该槽 doc 原文 —— 「a row draws its own internals, including its label: **nothing projects a `label` here and the owner passes no props at all** — copy, current value, and the write path are all yours」。`ownerProps` 确实是空接口。所以标签、取值、写回都要自己来。
- **host 侧 schema 是 schemastery，不是 zod**：`import z from '@deepseek-ai/schemastery'`（`dsh-settings` 的 peerDependency，范围 `^3.18.2`）。例：`dsh-client-ui-conversation/lib/index.js:13` 的 `z.object({ busyEnter: z.union([...]).default('queue') })`。
- **正整数写法**（库内通用）：`z.natural().min(1).default(N)`；**「未设置」语义**用 `z.natural().min(1).required(false)`（范本 `dsh-client-locale:13` 就是这么写的）。**实测语义**：`schema({})` → `{}`（字段不存在＝未覆盖）；`0 / -1 / 1.5 / '2000'` 全部抛错且**不做类型强转**（字符串不会被悄悄转成数字）。
- **注册要走可选注入**：`ctx.inject(['settings'], (settingsCtx) => { settingsCtx.settings.register(NS, Schema, { applies: 'live' }) })`。**命名空间必须是小写连字符**（`dsh-auto-paste` ✓，否则 `TypeError`）。用 `ctx.inject` 而不是 `export const inject`：没装 settings 提供方的 profile 也要能加载（只是存不了偏好）。
- **TS 坑**：`@deepseek-ai/dsh-settings` 不是我们的依赖，所以 `Context` 上没有 `settings` —— 直接写 `settingsCtx.settings` 会 `TS2339`。正解：定义一个结构化接口（只写我们真正调用的 `register/get/update/replace`），在 `ctx.inject` 回调里 cast 一次。
- **写与清**：`update(ns, patch)` 合并；**清空/恢复默认必须用 `replace(ns, {})`** —— merge 语义表达不了"删除"，这是唯一回到部署默认值的路径。
- **`blur` 提醒**：不要用 `describe().user` 判"用户是否覆盖过"—— 只要 schema 里**不给 default**，`get(ns).<field> === undefined` 本身就是"未覆盖"，省掉一次 `describe()`。
- **依赖**：pnpm 隔离布局下 `.pnpm` store 里的包**解析不到**（`ERR_MODULE_NOT_FOUND`）；用 `@deepseek-ai/schemastery` 必须写进 `peerDependencies` + `devDependencies` 再 `pnpm install`。链接目标确认：`@deepseek-ai+schemastery@3.18.2`（与 `dsh-settings` 同版本，无跨副本风险）。

