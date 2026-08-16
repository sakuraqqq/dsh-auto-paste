# dsh-auto-paste 开发交接文档（DEV-NOTES）

> 新对话开工前必读。本文档汇总插件开发全过程（源自两个历史会话 + 环境维护记录），
> 让新对话快速了解全部上下文，无需翻历史会话。

## 1. 插件是什么

dsh 插件：**Web 输入框粘贴大段文本（>500 字符）时，自动保存为工作区 `pastes/<时间戳>.txt`** 并在消息里引用路径（效果参考 Chatbox 的"贴一大段 → 自动生成附件文件"）。另有 `save_paste` 工具兜底（模型主动调用）。

- 版本 0.1.0，dsh 0.1.0-rc.6
- 位置：`C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-trial\dsh-auto-paste`
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

## 5. 许可与发布状态

- **LICENSE = MIT**（2026-08-16 由评估许可切换，commit db4333b；Copyright (c) 2026 misakamaster）
- package.json：`license: MIT`、author: misakamaster、files 含 src（源码随包可审查）
- README 顶部为 MIT 许可表述
- **发布状态**：**已发布 dsh-auto-paste@0.1.0**（2026-08-16，官方源 registry.npmjs.org，dist-tag `next`，GitHub 源仓库 sakuraqqq/dsh-auto-paste tag v0.1.0）——QQ 群测试改用 `npm i dsh-auto-paste`（原评估许可 zip 包已过时）
- **独立测试**（2026-08-16）：有条件发布；阻断项 P1（交付目录）/P2（大小上限）已处理，P3（文档同步）已完成
- **0.1.2 已发布**（2026-08-17，官方源，`latest: 0.1.2`；`next: 0.1.1`）——repository/homepage 元数据 + README latest 安装方式；1MiB 上限自 0.1.0 起已有（0.1.1 仅更新 README）
- **npm 发布认证坑**（踩过）：账户 2FA = `auth-and-writes` 时，发布必须用**勾选了 bypass 2FA 的 granular token**（网页勾选易被表单报错重置——先填完其他项、最后勾选并立即 Generate）；旧式/无 bypass token 发布报 403。npm 官方正逐步限制 bypass-2FA token（见 gh.io/npm-gat-bypass2fa-deprecation），长期需关注迁移
- **观察期**：进行中（第 3 天汇总 ≈ 2026-08-17）

## 6. 遗留事项（新对话可继续；2026-08-15 状态更新）

1. **插件介绍**：✅ 已定稿（对话内），**文字未落盘**——需向用户要定稿文字后补录到 README 顶部
2. **QQ 群测试**：✅ 已发出（zip 含 LICENSE/README），观察期进行中（开始日期待确认，≈2026-08-15）
3. **观察期第 3 天汇总**：待做（≈2026-08-17；按 RELEASE.md 第 0 节四项检查：落盘一致性 / F12 报错 / 多工作区 / 同秒两次）
4. **0.1.2 已发布（latest）**，剩余收尾：① release notes（npm 网页 Versions → 0.1.2，文案：「0.1.2（latest）：补 repository/homepage 元数据（npm 页面可跳 GitHub 源码）；README 安装示例更新为 latest 方式。1 MiB 文本大小上限自 0.1.0 起已有；0.1.1 更新 README（npm 安装说明）。许可：MIT」）② 阶段 A 验收（`npm i dsh-auto-paste` 装新 profile 实测）③ npm 页面渲染/链接核对 ④ **awesome-dsh-plugin 提交**：fork awesome-dsh-plugin/awesome-dsh-plugin → README.md + README.zh.md 各加条目 → PR（标题 `Add sakuraqqq/dsh-auto-paste (<分类>)`；条目：「- [dsh-auto-paste](https://github.com/sakuraqqq/dsh-auto-paste) — Auto-save large pasted text (500+ chars) into pastes/<timestamp>.txt with a path reference. Install: npm i dsh-auto-paste」/中文版）⑤ 观察期第 3 天汇总（≈2026-08-17）
5. 可选：进 awesome-dsh-plugin 注册表（稳定后）

## 7. 环境注意

- 插件在 `dsh-trial\dsh-auto-paste`（与 workspace 平级），工作区已注册（侧边栏 dsh-auto-paste）
- pastes/ 已加入 workspace .gitignore（粘贴数据不入库）；dsh-auto-paste 自己的 git 只跟踪源码
- 改插件代码后：`npm run build` → 重启 web（无注入器，重启是最快的验证方式）
- 全局规则：装插件前跑 preflight、dsh 内部状态不手改（见记忆）
