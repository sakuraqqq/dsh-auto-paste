# dsh-auto-paste 发布检查清单（Release Checklist）

> 状态：E2E 已通过（2026-08-15）；许可切换 ✅（2026-08-16）；**0.3.2 待发布**（2026-10-26；paste 误拒修复 + 0.2.1-rc.2/rc.3 兼容声明 + 简介精简）。
> 当前线上：`latest = next = 0.3.1`（0.3.2 发布后转正；0.3.1 于 2026-10-24 发布，PR #20）。
> 历史：0.1.4 于 2026-09-15 转正 `latest`；0.2.2（2026-10-01）；0.3.0（2026-10-17，next；运行时依赖归零）；0.3.1（2026-10-24，latest/next；0.2.1-rc.1 适配）。
> 提交链：47ad2d8 → 3a832c3 → aa59f46 → 343cbf6 → 25c4a2a → db4333b（许可切换 MIT）→ e4e8b1f（记录 v0.1.0 发布）
> 发布标准：**全自动 E2E 通过**。半自动方案（save_paste 兜底）不发布。
> **已发布**：dsh-auto-paste@0.1.0（2026-08-16，官方源 registry.npmjs.org，dist-tag `next`，GitHub 源仓库 https://github.com/sakuraqqq/dsh-auto-paste tag v0.1.0）。
> **0.1.2 已发布**（2026-08-17，官方源，`latest: 0.1.2`、`next: 0.1.1`）——README latest 安装方式、repository/homepage 元数据。剩余：release notes（网页补）、阶段 A 正式验收、awesome-dsh-plugin 提交、观察期第 3 天汇总。
> **0.1.3 已发布**（2026-09-10，官方源）——适配 **dsh 0.1.5-rc.1**：composer 由 `<textarea>` 改为 Lexical `contenteditable` 导致大段粘贴静默失效，已修 client 判定与插入路径；依赖线升 `0.1.5-rc.1`；首落 P1/P2/P3 质量门（eslint+prettier · `tools/metrics.mjs` 复杂度硬门禁 · GitHub Actions CI）。发布后核验：`versions` 含 `0.1.3`、shasum `a7831365fec080ca02c1bfc31614ecd37285bea9`（与本地打包一致）、tag `v0.1.3` → commit `d8c5a60`。
> **0.1.3 转正 + GitHub Release（2026-09-12 完成）**：`latest` 已由 0.1.2 → **0.1.3**（线上实测 `{"latest":"0.1.3","next":"0.1.3"}`）；Release **v0.1.3** 已建并标 `Latest`（notes 源 = `RELEASE-NOTES-v0.1.3.md`）。⚠️ 「≥3 天观察期」由用户拍板**跳过**（9/10 发、9/12 转），记录在案以备复盘。
> 注：`dist-tag add` 不支持 OIDC（npm 限制），转正必须人工带 2FA；**发版**已由 `.github/workflows/publish.yml`（OIDC）自动化。
> **0.1.4 已发布并转正**（2026-09-13 发到 `next` → 2026-09-15 转 `latest`）——四批审查修复已入 `main`：`5a0dd2f`（A/B）· `875f3cd`（C）· `e3ded0d`（D）· `437be21`（D2）。
> 内容：发布链路修正（顺序 commit → tag → push，发布交给 OIDC）· wire 去掉字符上限（host 字节校验唯一权威）· 保存失败如实回报 ·
> 药丸按会话绑定 · ✕「移除引用」改派发 `beforeinput`（`execCommand('delete')` 实测被 Lexical 还原）·
> 侧栏「查看」改传绝对路径（相对路径被 `requireAbsolute` 拒 → 400）· 粘贴文件 0700/0600 · `savePaste` 运行时类型守卫 ·
> toast 定时器随卸载清理 · `smoke` 遍历全部 invocation · `setMinChars(null)` 改路径寻址 `unset` ·
> `chars` 口径冻结为 UTF-16 code units（仅文档化）· 模型侧工具输出收窄为 `path/bytes/chars`（RPC 结果保留绝对路径，侧栏保存需要）。
> 发布前审查（2026-09-13）：隐私 **0 真命中** / 版权通过 / 70 项测试 + 四门禁全绿；完整记录见 `.私档/REVIEW-20260913-推送前审查.md`（含本机路径，故留私档）。
> 发布后核验（2026-09-13 实测 registry.npmjs.org）：`versions` 含 `0.1.4`、发布时间 `2026-09-12T16:44:22Z`、
> 发布者 **GitHub Actions（OIDC trusted publisher + provenance attestation）**、`gitHead=5f4afda`（= 本地 release 提交）、
> `fileCount=10`、`shasum=b67b992b0503884d7fc45d1d3889ffb90520f6e9`；发布时 `dist-tags: next=0.1.4 / latest=0.1.3`。
> **0.1.4 转正（2026-09-15）**：`npm dist-tag add dsh-auto-paste@0.1.4 latest` → 线上实测 `{"latest":"0.1.4","next":"0.1.4"}`。
> ⚠️ 「≥3 天观察期」由用户拍板**跳过**（9/13 发、9/15 转，与 0.1.3 同样处置），记录在案以备复盘。
> ⚠️ 转正踩过的坑（2026-09-15 首次失败）：报 **E401 unknown token** —— 原因是 `~/.npmrc` 里残留的
> `//registry.npmjs.org/:_authToken`（旧 granular token，已失效/被撤销）覆盖了交互登录态。修法：**先
> `npm config delete //registry.npmjs.org/:_authToken`，再 `npm login`**，然后重跑 `dist-tag add`；
> 转正完成后本地 token 可以删掉（发版已全走 OIDC，本地只需这一次人工 2FA）。
> GitHub Release `v0.1.4` 由 `release.mjs` 阶段 7 自动创建并标 `Latest`；但其 notes 是脚本生成的 commit 列表、
> 不是 `RELEASE-NOTES-v0.1.4.md`（0.1.3 用的是后者）→ **0.1.5 改进项**：阶段 7 优先采用仓库里的 `RELEASE-NOTES-v<版本>.md`。

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

- [x] `dsh --profile autopaste-a`（headless 等价）启动日志出现 `[dsh-auto-paste] host ready — ... listed=true`（2026-08-17，registry 0.1.2）
- [x] 浏览器 F12 listener：主 web 真实使用中每次大粘贴均自动落盘（2026-08-16~17 多次 pastes/ 产物即证据；独立第二 web 实例沙箱无法启动，环境限制）
- [x] 粘贴 500+ 字符 → `[已保存大段粘贴为附件: ...]` 引用：主 web 真实使用多次出现（同上）
- [x] 工作区生成 pastes/ 文件且内容一致：本会话多份 pastes/ 文件逐一读回验证
- [x] 卸载验证：`dsh plugin remove dsh-auto-paste` → 再 probe → `host ready` 日志消失（2026-08-17）

## 2. 阶段 B — 发布前静态检查

```sh
cd workspace/dsh-auto-paste
pnpm run typecheck     # 通过
pnpm test              # 70 项全绿（node:test）—— 2026-09-13 复核
npm pack --dry-run     # 10 文件（2026-09-13 复核：仍为 10）：README + LICENSE + cordis.patch.yml + dist/{client,index,typert.host}.js + src/{index.ts,client.js,typert.host.ts} + package.json
```

- [x] **许可切换（✅ 2026-08-16，commit db4333b）**
  - [x] LICENSE 文件：已替换为 MIT 全文（Copyright (c) 2026 misakamaster）
  - [x] package.json `license` = "MIT"、description 移除评估版字样、author = misakamaster
  - [x] README 顶部「使用条款（测试评估版）」改写为 MIT 许可表述
  - [x] `author` 字段与完整 git 历史保留（原创证据不丢）
  - [x] `npm pack --dry-run` 确认 tarball 含 LICENSE（MIT 全文）+ src/（源码随包可审查，共 10 文件）
  - [x] git 提交留痕：db4333b "license: switch to MIT for public release (author misakamaster, files include src for source transparency)"
  - [ ] 发布后补一条 npm 版本备注（release notes）说明许可变更（0.1.1 发布时补）
- [x] version 定版：0.1.0（2026-08-16 用户确认保持）
- [x] 准入两问复核：① 公开源码/文档 ✓（npm 页 + README + 包内 src/）② 不外发数据/无额外权限 ✓（代码复核：无 fetch/网络，只写本地 pastes/）——发布即证明复核通过
- [x] registry 包名确认未被占用（dsh-auto-paste 404 ✓，2026-08-15 查过；0.1.0 发布成功即未被占用）

## 3. 阶段 C — 发布与发布后验证

```sh
npm publish --dry-run          # 完整校验（文件/元数据）
npm publish                    # ⚠️ dist-tag 注意：README 记录过 @deepseek-ai/dsh-tools latest 是 stale 的坑；
                               # 想保守可先 --tag next 观察，确认无误再 --tag latest
```

- [x] `npm publish`（2026-08-16，v0.1.0，官方源 registry.npmjs.org，dist-tag `next`，commit e4e8b1f 记录）
- [ ] 发布后从 registry 装到新 profile 重跑阶段 A 验收（不再用 tarball/link）——0.1.1 发布后执行
- [ ] npm 页面描述/README 渲染正常——0.1.1 发布后核对

### 0.2.0 发布记录（2026-10-01）

大改动版本：输入框改为 dsh 原生**原子引用卡片**（文件名 + 字符数、一键删除、点击在侧栏打开），并**删除 capture bar（药丸）**；同时补齐编码/形态压力测试（CRLF、超长单行、空行、BOM、UTF-8 字节级）。

- [x] 发布通道改为 **CI 发布**：打 tag → `.github/workflows/publish.yml`（npm Trusted Publisher / OIDC）→ dist-tag `next`（不再用本机 token 手动 publish）
- [x] PR [#7](https://github.com/sakuraqqq/dsh-auto-paste/pull/7) 合并提交 `6949542`；tag `v0.2.0` **指向该合并提交**（`publish.yml` 第一步守卫要求 tag 与 tag 内 `package.json` 版本一致——0.1.5 / 0.1.6 两次都栽在 tag 打在合并前的分支提交上）
- [x] publish 工作流 SUCCESS；npm `next` = `0.2.0`
- [x] GitHub Release：https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.2.0 （notes 源 = `RELEASE-NOTES-v0.2.0.md`；回读校验无乱码）
- [x] **隐私 / 版权审查（发布前强制）结论：通过**
  - 隐私：源码面 grep（绝对路径 / 邮箱 / 手机号）4 处命中**全部是 `tools/` 下扫描器自身的测试夹具**（样例字符串），而 `tools/` **不进 npm 包**；**包面**（`npm pack` 解包后 10 个文件逐个扫）**零命中**；提交身份为 GitHub **noreply** 地址（按门禁口径，此处不写字面值；功能与 release 两个提交均如此）；无 token / OTP / `.npmrc` 入库（发布走 OIDC）
  - 版权：本包 MIT（LICENSE 保留版权行）；无第三方代码内联、无 vendor 目录；本版本**未新增依赖**；无新增图片/字体/示例数据
  - 远程门禁：PR 的 `checks`(ci) 与 `gate`(privacy-gate) 均 SUCCESS；CI 内 `dist/ + lib/ 必须与源码一致` 一步亦绿
- [x] 从 registry 拉真包复验：`npm pack dsh-auto-paste@0.2.0` → 10 文件；`dist/client.js`（51846 B）含卡片 size 后缀与新提示组件，**不含** `CaptureBar`、**不含**药丸 CSS
- [x] **转正 `latest`（2026-10-05 完成）** —— 实际转正的是 **0.2.1**（含 0.2.0 全部内容 + 两项引用修复 + 门禁口径对齐，见下节），0.2.0 不再单独转正。方式：**npm 网页端 Tags 管理**（CLI `npm dist-tag add` 报 **E401**：本机旧 bypass-2FA token 随 npm 账号侧收紧失效；页头横幅原文：tokens that bypass 2FA are being restricted —— **account changes (Aug 2026) / direct publishing (Jan 2027)**）。核验：`dist-tags = { latest: 0.2.1, next: 0.2.1 }` ✓
- [ ] 转正前：在一个**新 profile** 里从 registry 安装并重跑阶段 A 验收（不再用 link / tarball）—— ⚠️ **仍未做**（转正已先完成）
- [ ] awesome-dsh-plugin 条目描述更新（本版本有功能变化）—— ⚠️ **仍未做**

### 0.2.1 发布记录（2026-10-05）

两项引用缺陷修复（用户实测上报）+ 一条门禁口径对齐；走与 0.2.0 相同的 CI 发布通道。

- [x] PR [#8](https://github.com/sakuraqqq/dsh-auto-paste/pull/8) → 合并提交 `f22e166`；tag `v0.2.1` **指向该合并提交**（`--tag` 自查：在 main / 版本一致 / 未落后 三项全过）
- [x] publish 工作流 SUCCESS；`npm publish` 日志确认 `Publishing … with tag next` + provenance 已签名 + `+ dsh-auto-paste@0.2.1`
  - ⚠️ 记录一条误判陷阱：发布后 npm **读侧有数分钟传播窗口**，期间 `npm view …@0.2.1` 会 404 —— **这不是失败**（当时我据此判"矛盾"，实际只是没等够）
- [x] GitHub Release：https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.2.1 （notes 源 = `RELEASE-NOTES-v0.2.1.md`）
- [x] **转正 `latest` = 0.2.1**（2026-10-05，npm 网页 Tags；`latest`/`next` 均指向 0.2.1 ✓）
- 修复内容（细节见 `RELEASE-NOTES-v0.2.1.md` 与 `.私档/BACKLOG-0.1.5.md` §六）：
  - **#2 卡片前导空格边界**：dsh 两处引用扫描都要求 `(^|\s)`，紧贴文字粘贴会让 mention 渲染成死文本 ⇒ 插入前补一个**真实空格字符**（**不能**放进卡片 span：发送时该 span 会被 `serializeReference` 的裸 mention 替换）
  - **#1 的 C 项**：卡片 `clipboardText` 带字符数 ⇒ 会话切换退化后仍显示 `(N 字符)`
  - **门禁口径对齐**：`tools/privacy-scan.mjs` 的 email 规则补齐钩子已有的 noreply 白名单 —— 修掉"本机钩子说通过、CI 说红"的陷阱（起因：本次提交把 noreply **字面值**写进了本文件）
- [x] 测试 **100/100**（两条新守卫均**先红后绿**）；eslint / prettier / privacy / metrics 全绿；`dist/`+`lib/` 与源码逐字节一致（CI 同项亦绿）
- [ ] 待办：新 profile 从 registry 复验；awesome-dsh-plugin 描述更新；better-sidebar **发版后**重测保存路线并撤掉 README 的 caveat（上游已在 `main` 修好、带 `fs-write-relative-path.spec`，但 latest 仍 0.24.1）

### 0.2.2 发布记录（2026-10-08）

修复「侧边栏一次性提示泄漏到其他会话」（手机实测上报）；测试 100 → 107，并补上**负例能力**验证。走与 0.2.0 / 0.2.1 相同的 CI 发布通道。

- [x] 四个提交：修复 `2fd2a0a` → 测试加固 `b1d552e` → notes 修正 `bfd31c1` → 已知限制 `8e5d120`；PR [#10](https://github.com/sakuraqqq/dsh-auto-paste/pull/10) 合并提交 `f6adb4f`
- [x] tag `v0.2.2` **指向合并提交 `f6adb4f`**（`--tag` 自查三项全过：在 main / 版本一致 / 未落后 origin）
- [x] publish 工作流 **SUCCESS**（run [`37653466154`](https://github.com/sakuraqqq/dsh-auto-paste/actions/runs/37653466154)，`head_branch: v0.2.2`）
- [x] npm 侧核验（拉真包复算，不只看 CI 结论）：`shasum=18341f32…` 与 registry 元数据**逐字一致**；10 文件；`unpackedSize=201919`；**SLSA provenance 已签名**
- [x] 包内 `dist/client.js` 含全部修复符号（`hintSessionId` / `consumeSidebarHint` / `ownsSidebarHint`）；与工作区产物 `git diff --ignore-cr-at-eol` 逐字节一致（唯一差异是 Windows 检出的 CRLF vs CI 的 LF）
- [x] GitHub Release：<https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.2.2>（notes 源 = `RELEASE-NOTES-v0.2.2.md`）
- [x] **转正 `latest` = 0.2.2**（2026-10-08，CLI `dist-tag add`）—— 实测 `dist-tags = { latest: 0.2.2, next: 0.2.2 }`；转正后已删除本地 token（发版全走 OIDC，本地不留长期凭据）
- [x] 测试 **107/107**；eslint / prettier / privacy / metrics 全绿；`dist/` + `lib/` 与源码一致
- **发布前独立审查**（对抗性，第二个模型）结论：修复成立（无 blocker / high）。其指出的**三条断言缺陷在发布前修掉**（一条恒真、一条锚点过宽、一条负例过窄），并补了运行期真值表 + 四项变异验证（**4/4 被点名用例捕获**）。审查发现的两条**明确未修**项，已如实写入 `RELEASE-NOTES-v0.2.2.md` 的 Known limitations 与 `.私档/BACKLOG-0.1.5.md` §七（该节原编号为「四」，2026-10-14 因与「四、dsh 0.1.7 兼容线」重号而改）
- ⚠️ 本次两次踩坑（均为环境 / 账号侧，与代码无关）：
  1. **首选 DNS 对单域名不应答**：列表第一台 `114.114.114.114` 对 `registry.npmjs.org` 返回**空应答**（同机对照：`www.baidu.com` 正常），而 Windows 采信首选、**不 fallback** 到能解析的备用服务器 ⇒ npm 报 `getaddrinfo ENOTFOUND`。修法：把首选换成列表里实测可用的那台（`Set-DnsClientServerAddress -InterfaceAlias WLAN -ServerAddresses …`）后 `Clear-DnsClientCache`
  2. **CLI 转正 E401**：`~/.npmrc` 里旧的 bypass-2FA token 失效，且**覆盖交互登录态**（与 0.1.4 那次同款）。修法：`npm config delete '//registry.npmjs.org/:_authToken'` → `npm login` → `npm dist-tag add`
- [ ] 待办：新 profile 从 registry 复验；awesome-dsh-plugin 描述更新；**手机端**实测这次修复


### 0.2.3 发布记录（2026-10-09）

补上 DSH STORE 要读的 `dsh.compatibility` 声明。条目被 `unlisted` 的原因是「最新三个 DSH 版本都没有 compatible 记录」，而 manifest 里从来没有这个块，所以无从读取。**无运行行为变化。**

- [x] 两个提交：兼容声明 `a75dcc1` → notes `7866e69`；PR [#12](https://github.com/sakuraqqq/dsh-auto-paste/pull/12) 合并提交 `bb27a15`
- [x] tag `v0.2.3` **指向合并提交 `bb27a15`**（`--tag` 自查三项全过）
- [x] publish 工作流 **SUCCESS**（run [`37866079279`](https://github.com/sakuraqqq/dsh-auto-paste/actions/runs/37866079279)，`head_branch: v0.2.3`）
- [x] npm 侧核验（拉 registry 元数据，不只看 CI 结论）：`gitHead=bb27a15…`；`fileCount=10`；`unpackedSize=202173`；**SLSA provenance 已签名**；`dsh.compatibility` 确实在包里
- [x] GitHub Release：<https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.2.3>（notes 源 = `RELEASE-NOTES-v0.2.3.md`）
- [x] 测试 **107/107**
- ⚠️ **有意未转正 `latest`**：商店读的是 git 里的 manifest，不读 dist-tag，所以 0.2.2 留在 `latest` 不影响任何事
- ⚠️ 本次踩坑（0.2.2 那条 DNS 记录的延伸版）：首选 DNS 不应答之外，**本机还有一层 DNS 接管** —— 解析 `registry.npmjs.org` 会拿到一个不提供 npm registry 的地址，表现为 `npm view` 长时间挂起（TCP 能连、TLS 谈不拢）。修法：在 hosts 里钉 `104.16.0.34 registry.npmjs.org`（hosts 优先级高于任何 DNS 接管）；WSL 里要单独再钉一次（它有自己的 `/etc/hosts`）
- ⚠️ 另记：DSH STORE 的条目仍 `unlisted`，且 pin 在历史重写前的提交 `69b8c6b…`（该提交已不存在）⇒ 已按它的投稿流程重新提交（issue #1373，预检已通过）

### 0.2.4 发布记录（2026-10-14）

十项缺陷修复（外部独立审查产出，**全部先红后绿**）；测试 107 → **117**。

- [x] 修复提交 `a066146`（10 条 + 红例并入 + 3 条断言更新 + 门禁脚本注释清理）；PR [#13](https://github.com/sakuraqqq/dsh-auto-paste/pull/13) 合并提交 `9f27f39`
- [x] notes 提交 `c0775d5`；PR [#14](https://github.com/sakuraqqq/dsh-auto-paste/pull/14) 合并提交 `5fab0ff`
- [x] tag `v0.2.4` **指向合并提交 `5fab0ff`**（`--tag` 自查三项全过：在 main / 版本一致 / 未落后 origin）
- [x] publish 工作流 **SUCCESS**（run [`38580473975`](https://github.com/sakuraqqq/dsh-auto-paste/actions/runs/38580473975)，`head_branch: v0.2.4`，37 秒）
- [x] npm 侧核验：`gitHead=5fab0ff…`；`shasum=360ab2eb…`；`fileCount=10`；`unpackedSize=215133`（与本地 `pack --dry-run` 逐字一致）；**SLSA provenance 已签名**；OIDC trusted publisher
- [x] GitHub Release：<https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.2.4>（notes 源 = `RELEASE-NOTES-v0.2.4.md`）
- [x] 测试 **117/117**（其中新增 10 条守卫：D1–D3 + HD4a/HD4b/HD5–HD9）；eslint / prettier / privacy / metrics 全绿
- [x] 全程四次 push（修复分支 / release 分支 / tag）**均经 pre-push 隐私门禁**通过 —— 该门禁已装为 `core.hooksPath = .githooks`
- ⚠️ **改断言说明**：3 条既有断言固定的是**被修掉的旧形状**（`minCharsSource: z.string()` / 单路径探测 / 旧 `canConfigure`），按原意就地更新；同时给新增的 `describe()` 读路径补了同等的「先探测再调用」断言，纪律覆盖两条路径
- ⚠️ **有意未转正 `latest`**（同 0.2.3 处置）：当前 `latest = 0.2.2` / `next = 0.2.4`
- [ ] 待办：商店条目状态复看（等它那轮八小时扫描看到新 commit `5fab0ff`）


### 0.3.0 发布记录（2026-10-17）

**运行时依赖归零** —— zod 内联进 bundle，`dependencies` 从 manifest 中彻底消失；外加两项复核缺陷修复。测试保持 117。

- [x] 修复+改造提交 `2548be7`（R1/R2 + bundle 化 + 依赖清零 + 兼容声明），PR [#17](https://github.com/sakuraqqq/dsh-auto-paste/pull/17)
- [x] lockfile 同步提交 `0f43ee3` —— CI 首轮红在 `ERR_PNPM_OUTDATED_LOCKFILE`：删了 `dependencies.zod` 却没同步 lock（我漏了；`pnpm install` 在 agent 沙箱里跑不了）。修法 `pnpm install --lockfile-only`，只改 lock 不动 `node_modules`
- [x] PR #17 合并提交 `0527542`
- [x] tag `v0.3.0` **指向合并提交 `0527542`**（`--tag` 自查三项全过：在 main / 版本一致 / 未落后 origin）
- [x] publish 工作流 **SUCCESS**（run [`39011280029`](https://github.com/sakuraqqq/dsh-auto-paste/actions/runs/39011280029)，`head_branch: v0.3.0`，36 秒）
- [x] npm 侧核验：`gitHead=0527542…`；`shasum=a5c03a06…`；**`fileCount=11`**（+`THIRD_PARTY_NOTICES.md`）；`unpackedSize=747667`（与 `pack --dry-run` 逐字一致）；**registry 元数据里 `dependencies` 字段完全不存在**；**SLSA provenance 已签名**；OIDC trusted publisher
- [x] GitHub Release：<https://github.com/sakuraqqq/dsh-auto-paste/releases/tag/v0.3.0>（notes 源 = `RELEASE-NOTES-v0.3.0.md`）
- [x] 测试 **117/117**；eslint / prettier / privacy / metrics 全绿（privacy 报 11 files ship）
- ⭐ **为什么升 minor**：依赖形态变了（`dependencies` 从有到无、产物从 tsc 单文件变成 bundle 单文件）——0.x 语义下该走 minor，不是 patch
- ⭐ **为什么内联而不是精确 pin**：DSH STORE 的 `automaticApproval.allowRuntimeDependencies` 为 `false`，且目录里 **27/27 个已上架插件都没有声明任何 `dependencies`**。精确 pin 解决不了 —— 它反对的是**依赖边本身**，不是版本范围
- ⚠️ **许可合规交代**：`THIRD_PARTY_NOTICES.md` 载 zod 完整 MIT 全文；`scripts/bundle.mjs` 在 `dist/typert.host.js` 顶部发 `banner` 带版权行 —— esbuild 的 `legalComments` 抓不到 zod 的声明，因为它的源文件用普通 `//` 注释而非 `/*! … */`
- ⚠️ **顺带纠正一处旧判断**：`^0.2.0-rc.2` **本来就覆盖** `0.2.1-alpha.5` —— dsh 校验 peer 时带 `includePrerelease`（`README.md:105` 早就写着，我此前按标准 semver 推断为不覆盖，是错的）
- ⚠️ **有意未转正 `latest`**（同 0.2.3/0.2.4 处置）：当前 `latest = 0.2.2` / `next = 0.3.0`
- [ ] 待办：商店条目状态复看 —— 等下一轮扫描读到 `0527542`。SUPPLY001 与 COMPAT001 的解除条件都已满足，但**按它第 13 条联系规则不能主动再发消息**（一个人只有一次初始联系名额，已用掉）


### 0.1.1 发布待办（2026-08-16 新增）

- [x] README 安装说明加 npm 方式 + 1MiB 上限说明（commit 20d1d46）
- [x] `npm publish`（2026-08-16 21:38 成功，dist-tag `next`；bypass-2FA granular token 生成后发布）
- [x] `npm publish` 0.1.2（2026-08-17 00:27 成功，`latest` tag；`next` 保持 0.1.1 未动；release notes 文案见 DEV-NOTES §6）
- [x] release notes：**跳过**——npm 新版 UI 已无编辑入口（旧版才有 Add release notes），纯装饰项不影响功能/README/搜索
- [ ] 发布后从 registry 安装重跑阶段 A 验收（`npm i dsh-auto-paste`）
- [ ] npm 页面 README 渲染 + repository/homepage 链接核对
- [ ] awesome-dsh-plugin 提交（条目文案见 DEV-NOTES §6）
- [ ] 观察期第 3 天汇总（≈2026-08-17）

## 4. 已知边界用例（观察期 / 阶段 A 顺手测）

| 场景 | 操作 | 预期 |
|---|---|---|
| 无工作区粘贴 | 未选工作区时粘 500+ 字符 | 原样粘贴，无报错 |
| <500 字符 | 粘短文本 | 原样粘贴（不拦截） |
| 同秒两次 | 快速连粘两段 | 两个不同文件（-1 后缀），内容各自完整 |
| 服务端重启瞬间 | 重启时粘贴 | RPC 失败 → 回退原样粘贴，不丢数据（console 有 fallback 日志） |
| 多标签页 | 两个页面同时粘贴 | 各自独立落盘 |
