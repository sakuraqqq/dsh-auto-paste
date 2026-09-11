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

### 8.5 给用户终端命令一律单行（2026-09-12）
- **现象**：给用户的 `gh release create ... \` 用了 **bash 的 `\` 续行**，而对面是 PowerShell（不认 `\` 续行）→ gh 只收到半条命令、转入交互提问，落单的 `\` 还被当成附件路径去上传 → `read \: Incorrect function` 失败。
- **根因**：跨 shell 的续行符不通用（bash `\` / PowerShell 反引号 `` ` ``）。
- **防再犯**：给用户的命令**一律写成单行**再贴；确需换行时按对方 shell 选续行符，并说明「整条复制」。

