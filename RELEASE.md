# dsh-auto-paste 发布检查清单（Release Checklist）

> 状态：E2E 已通过（2026-08-15），用户自用观察期进行中。
> 提交链：47ad2d8 → 3a832c3 → aa59f46 → 343cbf6 → 25c4a2a
> 发布标准：**全自动 E2E 通过**。半自动方案（save_paste 兜底）不发布。

## 0. 观察期并行检查（自用期间顺手做，第 3 天汇总）

- [ ] 日常大段粘贴是否每次都能落盘（pastes/ 下文件数与粘贴次数大致一致）
- [ ] F12 控制台是否出现任何 `[dsh-auto-paste]` 报错（正常路径只有两条 log：listener ready / saved paste）
- [ ] 多工作区切换后粘贴，文件落在当前会话对应的工作区（不是旧工作区）
- [ ] 快速连续粘贴两次 → 生成两个不同文件（25c4a2a 修复点）
- 汇总后回来反馈：通过 / 异常（附 F12 报错原文）

## 1. 阶段 A — 干净环境试装（模拟真实用户，脱离 link）

目的：证明 tarball/registry 安装路径完整可用，而非只在 link 依赖下工作。

```sh
# 1) 在插件目录打 tarball
cd workspace/dsh-auto-paste
npm pack                       # → dsh-auto-paste-0.1.0.tgz（内容先看 npm pack --dry-run）

# 2) 建临时 profile（命令以你本机 dsh CLI 为准；README 用的是 --profile 参数）
#    dsh profile create clean-test   ⚠️ 若无此子命令：用现有 profile 复制，或 dsh --help 核对

# 3) 用 tarball 安装（走与 registry 相同的解析路径）
dsh plugin --profile clean-test add ./dsh-auto-paste-0.1.0.tgz
#    ⚠️ 若 plugin add 不支持 tgz：先在 profile 里 pnpm add file:...tgz，再 add

# 4) 配置层确认
dsh --profile clean-test --dump-config | grep dsh-auto-paste

# 5) host 半身（无需浏览器）
dsh plugin --profile headless add ./dsh-auto-paste
dsh --profile headless "run a probe"   # 无 API key 时模型调用报 MISSING_CREDENTIAL 属预期；
                                       # 重点：加载无报错、工具列表可见
```

### 阶段 A 验收（web，核心）

- [ ] `dsh --profile clean-test`（web）启动日志出现 `[dsh-auto-paste] host ready — ... listed=true`
- [ ] 浏览器 F12 出现 `[dsh-auto-paste] client paste listener ready (minChars=500)`
- [ ] 粘贴 500+ 字符 → 输入框被替换为 `[已保存大段粘贴为附件: pastes/....txt]`
- [ ] 工作区生成 pastes/ 文件且内容与粘贴一致（读回校验）
- [ ] 卸载验证：移除插件 → 重启 → 无报错、listener 不再出现

## 2. 阶段 B — 发布前静态检查

```sh
cd workspace/dsh-auto-paste
pnpm run typecheck     # 通过
pnpm test              # 11 项全绿（node:test）
npm pack --dry-run     # 6 文件：README + cordis.patch.yml + dist/{client,index,typert.host}.js + package.json
```

- [ ] **许可切换（公开发布前必须完成；三处同步 + git 提交留痕）**
  - [ ] LICENSE 文件：当前是「测试评估许可 v1.0」（2026-08-15，含严禁再分发/商用条款），替换为 MIT 全文（版权行保留作者名；`[作者名]` 占位符替换为真实作者）
  - [ ] package.json `license` 字段保持 "MIT"（当前已是 "MIT"，但与 LICENSE 文件不一致——三处真正同步后才算完成）
  - [ ] README 顶部「⚖️ 使用条款（测试评估版）」（第 6-11 行）删除或改写为 MIT 许可表述，移除「仅限个人本地测试 / 严禁再分发 / 商用」等评估版限制
  - [ ] 切换时保留 `author` 字段与完整 git 历史（原创证据不丢；不得在重写中移除作者信息）
  - [ ] 三处同步后 `npm pack --dry-run` 确认 tarball 含 LICENSE（MIT 全文）
  - [ ] git 提交留痕（提交信息注明许可变更，如 "license: switch to MIT for public release"）
  - [ ] 发布后补一条 npm 版本备注（release notes）说明许可变更
- [ ] version 定版（当前 0.1.0；如要 1.0.0 在此步改）
- [ ] 准入两问复核：① 公开源码/文档 ✓（npm 页 + README）② 不外发数据/无额外权限 ✓（代码复核：无 fetch/网络，只写本地 pastes/）
- [ ] registry 包名确认未被占用（dsh-auto-paste 404 ✓，2026-08-15 查过）

## 3. 阶段 C — 发布与发布后验证

```sh
npm publish --dry-run          # 完整校验（文件/元数据）
npm publish                    # ⚠️ dist-tag 注意：README 记录过 @deepseek-ai/dsh-tools latest 是 stale 的坑；
                               # 想保守可先 --tag next 观察，确认无误再 --tag latest
```

- [ ] 发布后从 registry 装到新 profile 重跑阶段 A 验收（不再用 tarball/link）
- [ ] npm 页面描述/README 渲染正常

## 4. 已知边界用例（观察期 / 阶段 A 顺手测）

| 场景 | 操作 | 预期 |
|---|---|---|
| 无工作区粘贴 | 未选工作区时粘 500+ 字符 | 原样粘贴，无报错 |
| <500 字符 | 粘短文本 | 原样粘贴（不拦截） |
| 同秒两次 | 快速连粘两段 | 两个不同文件（-1 后缀），内容各自完整 |
| 服务端重启瞬间 | 重启时粘贴 | RPC 失败 → 回退原样粘贴，不丢数据（console 有 fallback 日志） |
| 多标签页 | 两个页面同时粘贴 | 各自独立落盘 |
