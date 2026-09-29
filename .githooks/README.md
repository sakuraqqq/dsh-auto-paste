# 隐私门禁（privacy gate）

> **一句话**：它扫的是**产物**（要提交/要推送的文件内容），不是**命令字符串**。
> 敏感值写进文件就是写进去了 —— 没有"同一意图无限种编码"那种必败结构。
> 但它的绕过是**离散且可审计**的，所以**本机钩子只防手滑，不防有意绕过**。

---

## 一、四层各自挡谁（**照这个表读，别高估任何一层**）

| 层 | 手段 | 挡得住 | **挡不住** |
|---|---|---|---|
| **L0 源头** | 审查/交接文档只写「类别 + 位置 + 命中数」 | 自指泄漏（**你这次事故的主因**） | 靠人记 ⇒ 迟早复发 |
| **L1 本机**（本目录） | `pre-commit` + `pre-push` 调本引擎 | **手滑**：写文档时顺手贴了本机路径 / 邮箱 / 序列号 | `--no-verify` · 删钩子 · 网页端提交 · 另一个没装钩子的克隆 · **沙箱内 sh 起不来**（见 §四） |
| **L2 服务端** ⭐ | CI 的 privacy job 设成 **required status check** + 禁止直接 push `main` | **上面全部绕过路径** —— 本机绕不过去 | 需要你去 GitHub 设置一次 |
| **L3 检测** | `--all` 定期体检（只报告不拦） | 历史欠债的可见性 | 它不阻断，也不清理 |

⭐ **真正拦得住"有意绕过"的只有 L2。** L1 是"让它别发生"，L2 是"发生了也进不去"。

---

## 二、装（三步，约 2 分钟）

```powershell
# 1) 把这三个文件放进仓库
#    privacy-gate.mjs  -> <repo>/tools/privacy-gate.mjs
#    commit.mjs        -> <repo>/tools/commit.mjs
#    githooks/*        -> <repo>/.githooks/{pre-commit,pre-push}

# 2) 挂上（幂等，可回滚）
node tools/install-hooks.mjs

# 3) 回滚（任何时候）
node tools/install-hooks.mjs --uninstall
```

POSIX 克隆若钩子不生效：`git update-index --chmod=+x .githooks/pre-commit .githooks/pre-push`

### L2 怎么配（这步才是真闸门，必须做）

1. 仓库加一个 CI job：`node tools/privacy-gate.mjs --staged`（PR 场景用 `--range origin/main...HEAD`）
2. GitHub → Settings → Rules → **Require status checks to pass**，把这个 job 勾上
3. 同时勾 **Do not allow bypassing the above settings**（否则你自己也能推）
4. 可选：Settings → Code security → 开 **push protection**（只挡前缀型密钥，**不挡本机路径/PII**，别指望它）

---

## 三、规则与白名单

| id | 拦什么 | 白名单（不拦） |
|---|---|---|
| `win-user-path` | `C:\Users\<真名>\…` | `<用户名>` / `someone` / `user` / `test` / `example` 等占位符；**光写 `C:\Users` 不算**（没有身份信息） |
| `posix-home-path` | `/home/<真名>/` · `/Users/<真名>/` | `web_user`（Emscripten 虚拟路径）、`w` |
| `lan-ipv4` | `10.x.x.x` · `192.168.x.x` · `172.16-31.x.x`（**必须四段**） | 版本号 `10.0.0`（三段不匹配，天然不误伤）、WHATWG 章节号 `13.2.5.81` |
| `ipv6-cn-prefix` | `2409` / `240e` / `2408` 三个前缀（**后接冒号**） | — |
| `email` | 真实邮箱 | `*@users.noreply.github.com` · `*@example.com` · `*@noreply.*` |
| `cn-mobile` | 11 位手机号 | **前后不许是十六进制字符** ⇒ 直接杀掉「SHA256 子串撞手机号」那一整类误报 |
| `cn-id` | 18 位身份证 | 同上 |
| `device-id` | `序列号`/`IMEI`/`机型` + 值 | `<设备序列号>` 等占位符 |
| `secret-*` | npm / GitHub / `sk-` / AKIA / 私钥头 | — |

**刻意不收录**泛化的 `token` / `password` 模式：本项目到处是 `token` 字样，上一次用它扫描把测试令牌全打成命中 —— **"命中数"本身就不再是结论**。

---

## 四、⚠️ 沙箱边界（**必须知道，否则会以为门禁坏了**）

**`sh.exe` 在 DSH 沙箱里起不来**（`couldn't create signal pipe, Win32 error 5`），
而 **Git 在 Windows 上执行钩子必经 `sh`** ⇒ **装了钩子之后，沙箱内的裸 `git commit` 会直接失败**（一条 Cygwin 报错）。

⇒ 这条会把 agent 逼去用 `--no-verify` —— 那正是"门禁退化成装饰"的最短路径。**所以提供了 `commit.mjs`**：

```powershell
node tools/commit.mjs -m "docs: ..."        # 先过门禁，过了才提交，不需要 sh
```

它是**等价执行**（门禁先跑，过了才提交，并显式跳过钩子），**不是绕过通道** —— 实测：泄漏暂存时它 `exit 1` 拒绝提交。

| 场景 | 用什么 |
|---|---|
| 你自己的终端 | 裸 `git commit` / `git push`（钩子正常，sh 可用） |
| DSH 沙箱内 | `node tools/commit.mjs -m "..."` |

---

## 五、自测（改规则后必跑）

```powershell
node privacy-gate.mjs --selftest     # 规则级：正例必红 / 白名单必绿
node selftest-e2e.mjs                # 端到端：安装器 / --staged / --range / --stdin-refs / --all / shim
```

`selftest-e2e.mjs` 的**两条纪律**（都是被真实事故教出来的）：

1. **失败必须留证据** —— 第一版只报 `exit=1`，把被调命令的输出吞了，白跑一轮。
2. **假绿比红更糟** —— 曾有一条「✅ 推送被拦住」，其实是 `sh` 崩溃的 exit 66，不是门禁拦的。
   ⇒ 凡是不能证明"是门禁拦的"，一律标 **SKIP**，不标 ✅。

**自测确实红过三次**（不是自证绿）：

| # | 症状 | 根因 |
|---|---|---|
| 1 | `10.x.x.x` 整类漏掉 | LAN 正则只匹配三段（`10` 只占一段，需再补三段） |
| 2 | 单点邮箱（域名里只有一个点）不命中 | email 正则写成 `{1,3}` ⇒ 要求域名至少两个点，整类漏掉 |
| 3 | 测试"失败却零证据" | `spawnSync` 的 `stdio` 传了文件**路径字符串**，Node 只认 fd/pipe/ignore/inherit ⇒ 输出被静默丢弃 |

---

## 六、已知不覆盖（**不许当"扫过了就安全"**）

- ❌ **真实姓名 / 学号 / 单位**：无法可靠正则。这类只能靠评审 + `.私档/` 隔离。
- ❌ **图片 / PDF / 二进制**：`--all` 跳过含 NUL 的文件。截图里的路径它看不见。
- ❌ **已提交的历史**：`--all` 只报告、不阻断、不清理。清史是另一件事（P1，排投稿后）。
- ❌ **凭据的"已泄露"后果**：门禁只拦新写入；**已经推上去的 token 必须轮换**，改历史不算补救。

---

## 七、设计依据（为什么长这样）

- **扫产物 vs 扫命令**：退役的 `dsh-danger-guard` 扫命令字符串，实测变异 51/118 漏拦、14 类绕过 —— 那是**抽象选错了**，不是规则不全。
- **只拦新增，不拦历史**：永远红的门禁会被无视，等于没有。历史欠债走 `--all` 报告。
- **fail-closed**：读不到暂存区/范围 ⇒ `exit 2` 阻断，绝不"读不到规则就放行"。
- **绝不回显命中值**：审查产物自身不得成为新的泄漏源 —— 这正是 2026-09-23 那条规则的机器化。
- **量词全部有界**：一条相邻无界量词的正则实测能把 21KB 输入卡 7.5 秒、600KB 卡 81 秒，**冻死整个 DSH 事件循环**（超时插件救不了）。

*落盘：2026-09-30 · pc 工作区 `_privacy-gate/`*
