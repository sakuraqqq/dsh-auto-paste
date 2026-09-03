# 转接：dsh-auto-paste 与 dsh 0.1.1-rc.2 版本兼容性测试

> 本文件是「方案方 → 执行方」的转接说明书。方案方只出方案与判据，执行方在**同一工作区的新对话**里按本文件执行，结果回填到本文档末尾的「执行记录」。
> 执行方仅按本文件操作，不自行扩大范围；发现问题只记录不擅自修复（除非直行到「方案 B」且已授权）。

## 一、三要素（磁盘实测回读，不凭记忆）

| 项 | 值 | 实测方式 |
|---|---|---|
| 项目名 | dsh-auto-paste | 当前工作区根即为项目 |
| 插件版本 | 0.1.2 | `package.json` `version` |
| 插件 dsh 依赖线 | 0.1.0-rc.6（dsh-tools 0.1.0-rc.6 exact；dsh-typert-protocol ^0.1.0-rc.6；dev dsh-session 0.1.0-rc.6） | `package.json` |
| 基线 SHA | `18abcb507100a69063283929d7ac60424e53ab90` | `git rev-parse HEAD`（2026-08-23） |

## 二、背景与问题

- 环境里 dsh 运行时已整体迁到 **0.1.1-rc.x** 版线（`@deepseek-ai/dsh` 及其全部内部 `@deepseek-ai/dsh-*` 依赖均为 `^0.1.1-rc.2`）。
- 而插件仍锁在 **0.1.0-rc.6** 版线。
- 按项目开发笔记硬性规则：**所有 `@deepseek-ai/dsh-*` 必须锁同一版线（exact），否则 pnpm 会装出两份模块副本**，导致版本线不一致 + API 漂移风险。
- 目标：在**独立测试环境**（rc8 实验）里实测，确认到底有没有冲突，再决定是否升级。

## 三、执行环境（注意：DSH_HOME 必须显式设置）

| 项 | 值 |
|---|---|
| 插件目录 | `C:\Users\测试\dsh-workspace\dsh-auto-paste` |
| rc8 实验 dsh CLI | `C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\node_modules\.bin\dsh.cmd` |
| rc8 实验 DSH_HOME | `C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\.dsh-sophnet` |
| rc8 内 dsh 版本 | **0.1.1-rc.2**（`…\dsh-rc8\node_modules\@deepseek-ai\dsh\package.json` `version`；`rc8` 只是实验目录名，并非更新版本） |
| 测试 profile | `autopaste-test`（全新，自动创建；**绝不装进 sophnet / 主 web）** |

> ⚠️ 关键：rc8 实验环境的启动器脚本正是靠设置 `$env:DSH_HOME = …\dsh-rc8\.dsh-sophnet` 来定位 profile 的。**不设置 DSH_HOME 就会落回全局 `$DSH_HOME`（~/.dsh），装错地方。**

## 四、方案（步骤 + 命令 + 判据）

### 步骤 0：前置确认（只读）
```powershell
git -C "C:\Users\测试\dsh-workspace\dsh-auto-paste" rev-parse HEAD   # 期望 = 基线 18abcb5…
# 读 rc8 内 dsh 版本，期望 0.1.1-rc.2
Get-Content "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\node_modules\@deepseek-ai\dsh\package.json"
```

### 步骤 1：构建插件（确保 dist/ 最新）
```powershell
Set-Location "C:\Users\测试\dsh-workspace\dsh-auto-paste"
npm run typecheck   # exit 0
npm run build       # tsc → dist/ + sync lib/；dist/ 更新
```
> 沙箱若拦子进程/管道，测试用 `--test-isolation=none`，命令避免 `2>&1`/`|`。

### 步骤 2：用 rc8 的 dsh 建独立测试 profile 并装插件
```powershell
$env:DSH_HOME = "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\.dsh-sophnet"
& "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\node_modules\.bin\dsh.cmd" plugin --profile autopaste-test add file:"C:\Users\测试\dsh-workspace\dsh-auto-paste"
```
> 用绝对 `file:` 路径，规避「相对路径锚定调用目录」的坑。

### 步骤 3：dump-config 检查配置层（证明插件被 dsh 识别）
```powershell
$env:DSH_HOME = "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\.dsh-sophnet"
& "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\node_modules\.bin\dsh.cmd" --profile autopaste-test --dump-config
# 期望：输出里出现 dsh-auto-paste 相关配置行
```

### 步骤 4：核心判据 —— 版本线是否冲突（两�份 dsh-tools？）
```powershell
$env:DSH_HOME = "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\.dsh-sophnet"
Set-Location "$env:DSH_HOME\profiles\autopaste-test"
pnpm why @deepseek-ai/dsh-tools
pnpm ls @deepseek-ai/dsh-tools
# 期望：看到 0.1.0-rc.6 与 0.1.1-rc.2 是否同时存在
```
- **出现两份（0.1.0-rc.6 + 0.1.1-rc.2）** → 冲突坐实，转「方案 B」。
- **只解析到 0.1.1-rc.2 一份**（pnpm 去重）→ 运行时无冲突，升级属卫生问题（可选，见下文）。

### 步骤 5：host 加载 + 工具列出（可选，无 key 也可验加载/列表/事件）
```powershell
$env:DSH_HOME = "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\.dsh-sophnet"
& "C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-rc8\node_modules\.bin\dsh.cmd" --profile autopaste-test "run a probe"   # 观察 [dsh-auto-paste] host ready ... listed=true
```
> 若 GUI 不可用，跳过本步并在记录里注明「未实测 GUI」。核心deciding证据以步骤 4 为准。

## 五、分支决策（依据步骤 4 结果）

- **冲突坐实（两份 dsh-tools）→ 方案 B：升级依赖到 0.1.1-rc.2 线并回归**
  - 改项目 `package.json`：`@deepseek-ai/dsh-tools` → `0.1.1-rc.2`；`@deepseek-ai/dsh-typert-protocol` → `0.1.1-rc.2`；devDep `@deepseek-ai/dsh-session` → `0.1.1-rc.2`（`@deepseek-ai/cordis` 保持 `^4.0.1`，因为 dsh 0.1.1-rc.2 也依赖同等线）
  - `pnpm install` → `typecheck` / `build` / `npm test` 全绿 → 重跑步骤 2–4 确认只剩 0.1.1-rc.2 一份 → 独立 profile 实测
  - 发布：bump 版本到 `0.1.3`，`publish --tag next` 观察 ≥3 天 → 转正（发布动作由用户在终端执行，AI 只到 dry-run）
- **无冲突（pnpm 去重为一份）** → 当前可用，升级为卫生可选项；记录结论，暂不动依赖。

## 六、红线

- 不把插件装进**主 web profile** 或 **sophnet profile**；只用 `autopaste-test` 独立测试 profile。
- 不改插件源码（问题只在记录里描述）。
- AI 不执行 npm publish / git push（发布动作由用户终端执行）。
- 卡住即停、先汇报，不反复试错；默认只读，改动前先列出命令。

## 七、执行记录（执行方回填）

- [x] 步骤 0 基线 SHA 一致：`18abcb507100a69063283929d7ac60424e53ab90`（`git rev-parse HEAD` 实测）；插件版本 `0.1.2`；插件 dsh 依赖线 `0.1.0-rc.6`；rc8 内 dsh 版本 `0.1.1-rc.2`（`@deepseek-ai/dsh/package.json` 实测）。
- [x] 步骤 1 typecheck / build：`npm run typecheck` exit 0；`npm run build` exit 0（tsc + sync-lib：dist/index.js / dist/typert.host.js → lib/）；dist/ 含 `index.js / client.js / typert.host.js`。
- [x] 步骤 2 插件安装：`dsh plugin --profile autopaste-test add file:…` 成功，日志 `dsh: initialized profile autopaste-test at …\profiles\autopaste-test`（新建 profile，未触碰 sophnet / 主 web）。
- [x] 步骤 3 dump-config 含 dsh-auto-paste：`--dump-config` 输出出现独立段 `# == dsh-auto-paste`，`id: dsh-auto-paste`、`name: dsh-auto-paste`、`config: minChars: 500`。
- [x] 步骤 4 pnpm 依赖树结论：**profile 树内仅 0.1.0-rc.6 一份**（`pnpm why @deepseek-ai/dsh-tools` → `Found 1 version of @deepseek-ai/dsh-tools` = 0.1.0-rc.6；`pnpm ls` 空）。**但跨层冲突存在**：rc8 运行时树（0.1.1-rc.2）含 `dsh-tools@0.1.1-rc.2` 与 `dsh-tools@0.1.0-rc.8` 两份，`dsh-session@0.1.1-rc.2` 与 `dsh-session@0.1.0-rc.8` 两份；无 `dsh-typert-protocol`。→ 插件在 0.1.0-rc.6 线，运行时在 0.1.1-rc.2 线，版本线不一致（两个 dsh-tools 实例并存）。
- [x] 步骤 5 host ready（可选）：`[dsh-auto-paste] host ready — pasteStore service + save_paste tool listed=true (minChars=500)`（host 侧加载/注册成功）。LLM 步因无 API key 挂起未完成，**GUI/端到端未实测**（按文档注记）。

### 最终结论

- **版本线冲突坐实**：插件锁定 `@deepseek-ai/dsh-*` 0.1.0-rc.6 线，而 dsh 运行时已是 0.1.1-rc.2 线，二者各载一份 dsh-tools（0.1.0-rc.6 与 0.1.1-rc.2），违反「所有 @deepseek-ai/dsh-* 必须锁同一版线（exact）」硬规则 → 存在 API drift 风险。
- **但实测无崩溃**：host 加载、`save_paste` 工具注册、`pasteStore` 服务、`minChars=500` 一并成功；0.1.0-rc.6 → 0.1.1-rc.2 的插件所用 API 迄今兼容。即「冲突按规则成立，但工程上尚未炸」。
- 目标版本 `0.1.1-rc.2` 在 npm 上对 `dsh-tools / dsh-typert-protocol / dsh-session` 均存在（实测），方案 B 可行。
- **已拍板（执行方提请，用户确认）**：**方案 B——先不动依赖，作为已知风险记档留底**。不升级版本线，不改 `package.json`/源码，发布动作不发起。该冲突在「插件能正常加载/工具可注册」的实测前提下属于潜伏风险，故暂搁置；后续若升级，需重新进入本测试流程并回归（目标 0.1.1-rc.2 对三个包在 npm 均存在，方案 B 技术上可行）。

- 执行时间/人：2026-08-23 12:06 UTC · dsh-auto-paste 执行方（AI）
