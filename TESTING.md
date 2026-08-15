# dsh-auto-paste 独立测试任务书（给第三方 AI 测试用）

> 你是独立测试员。按本任务书逐项执行，**只测不改**（发现问题报告即可，不要修改插件核心逻辑）。
> 插件是测试评估版（禁止再分发/商用，见 LICENSE），你的任务就是找 bug。

## 0. 背景

`dsh-auto-paste` 是 DeepSeek Harness (dsh) 插件：在 Web 输入框粘贴大段文本（阈值默认 500 字符）时，自动保存为工作区 `pastes/<时间戳>.txt` 并在消息里引用路径；另有 `save_paste` 工具兜底。当前版本 0.1.0，dsh 0.1.0-rc.6。

## 1. 环境信息（按实际路径替换）

- 插件目录：`C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-trial\dsh-auto-paste`
- dsh CLI：`C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-trial\node_modules\.bin\dsh.cmd`
- 体检脚本：`C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-trial\workspace\_tools\plugin-preflight.mjs`
- 注意：**不要装进主 web profile**（会干扰当前运行环境）。实测用独立 profile：`dsh plugin --profile <测试用profile名> add file:<插件目录>`（profile 不存在会自动建）

## 2. 测试阶段

### 阶段 A：静态体检（必做）
- 运行：`node <plugin-preflight.mjs> <插件目录>` → 应为 PASS 或 WARN（有 REJECT 即失败）
- 人工核对 package.json：`dsh.bundle`、`dsh.client.inject`（应含 sessions/connection）、main/exports、files、license（应为 "SEE LICENSE IN LICENSE"）

### 阶段 B：构建与自动化测试（必做）
在插件目录执行：
1. `npm run typecheck` → exit 0
2. `npm run build` → exit 0，dist/ 更新
3. `node smoke.mjs` → 输出 SMOKE-OK
4. `npm test` → 全部 pass（应有 18 项；沙箱拦子进程时加 `--test-isolation=none`）
任一步失败即 bug，记录错误信息。

### 阶段 C：独立 profile 实测（能做则做）
1. `dsh plugin --profile autopaste-test add file:<插件目录>` → 装成功
2. 启动 `dsh --profile autopaste-test`，在输入框粘贴 >500 字符文本 → 应自动出现 `[已保存大段粘贴为附件: pastes/....txt]`
3. 检查工作区 `pastes/` 下有对应文件、内容一致
4. 测试 `save_paste` 工具路径（若有条件）
（若无 GUI 环境，跳过本阶段，注明"未实测 GUI"）

### 阶段 D：边界用例（必做，报告结果）
用 `savePasteTo` / `pasteFilename` 逻辑或手工模拟：
- 空文本 / 恰好阈值 / 略超阈值
- 同一秒多次粘贴（文件名应不冲突——毫秒后缀）
- 特殊字符（中文、emoji、换行、`"`、`\`）
- 超长文本（100KB 应正常保存；**超过 1MiB 应报错且不落盘**——2026-08-16 新增上限）
- 保存失败（只读目录/磁盘满）→ 应回退不丢数据

### 阶段 E：代码审查（必做，找隐藏 bug）
通读 `src/` 源码，重点找：
- 路径注入/穿越（文件名是否可被恶意控制）
- 权限/边界（工作区外写入？）
- 并发/竞态（同时粘贴）
- 资源泄漏（未关闭的句柄/监听器）
- 与 dsh rc.6 的兼容隐患（API 用法是否过时）

## 3. 报告格式（完成时输出）

```
【测试报告 dsh-auto-paste v0.1.0】
A 静态体检: PASS/WARN/REJECT + 细节
B 构建测试: typecheck/build/smoke/release 各自结果
C GUI 实测: 通过/跳过 + 现象
D 边界用例: 逐项 通过/失败 + 证据
E 代码审查: 发现的隐患列表（严重度高/中/低）
结论: 可发布 / 有条件发布（列出阻断项）/ 不可发布（列出 P0）
```

## 4. 红线

- 不改插件源码（发现问题在报告里描述即可）
- 不装进主 web profile（用独立测试 profile）
- 不发布、不传播插件文件（测试评估版）
- 卡住先停手汇报，不反复试错
