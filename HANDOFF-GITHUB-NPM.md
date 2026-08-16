# dsh-auto-paste 发布交接（HANDOFF-GITHUB-NPM）

> 2026-08-16 建立。上一对话在做「GitHub 上传 + npm 发布」，因上下文膨胀开新对话。
> 新对话开工前必读，几秒接上，无需翻历史。

## 1. 当前进度（一句话）

插件**开发已全部完成、许可已切 MIT、npm 发布准备就绪**。正卡在「提交 GitHub + 发布 npm」两步，均已摸清路数，按下面执行即可收尾。

## 2. 项目位置与账号

- **插件目录**：`C:\Users\测试\Documents\Codex\2026-08-13\deepseekharness-https-www-npmjs-com-package\work\dsh-trial\dsh-auto-paste`
  （独立 git 仓库；在会话工作区 `chajian\` 的兄弟目录，**改文件需越界写权限**）
- **npm 账号**：`misakamaster`（已注册，邮箱已验证）
- **GitHub 账号**：`misakamaster`（同名；**仓库是否已建需向用户确认**）
- **作者署名**：`misakamaster` · **版本**：保持 `0.1.0`

## 3. 已完成（别重做）

- ✅ 测试：typecheck / build / test 18/18 / smoke（SMOKE-OK）全绿
- ✅ 许可切换：LICENSE 换 MIT，package.json 多处（license/author/description/files 含 src）、README 条款改 MIT，三笔 commit 留痕：
  - `db4333b` license 切换 MIT
  - `2cbe0c3` RELEASE.md 勾选
  - `4aab47f` DEV-NOTES 同步
- ✅ npm pack --dry-run 验证：10 文件（LICENSE + README + dist/ + src/ + cordis.patch.yml + package.json），无评估版残留
- ✅ 网络：Watt Toolkit v3.1.0（`C:\Steam  _v3.1.0_win_x64`）加速 GitHub 已生效——**浏览器可上 github.com**（命令行网络验证仍不可靠，见坑）
- ✅ 顺手实测：23 万字符超长粘贴 auto-paste 插件正常（1MiB 上限内）

## 4. 剩下的步骤

### A. 先确认 GitHub 仓库状态
问用户：**仓库是否已在 https://github.com/misakamaster/dsh-auto-paste 建好？**
- 建好了 → 拿到地址 `https://github.com/misakamaster/dsh-auto-paste.git`，转 B
- 没建 → 让用户去 https://github.com/new：name=`dsh-auto-paste`、Public、三勾选框全不勾、**Create repository**

### B. 推送 GitHub（用户在终端执行 push，把命令套给用户）
本地仓库已就绪、无 remote、无 tag。**关键：push 前先打 tag 反映发布版本。**
```sh
# 可选先打 v0.1.0 tag（推荐，Release 用）
cd .../dsh-auto-paste
git tag v0.1.0
git push origin main --tags

# 添加 remote 并推送（首次需 git config 校验 GitHub 登录；无梯子靠 Watt Toolkit 加速）
git remote add origin https://github.com/misakamaster/dsh-auto-paste.git
git push -u origin main --tags
```
- push 报证书错 → 让用户在 GitHub 建 **Personal Access Token（Fine-grained, 只勾 Contents 读写）**，用 `https://<TOKEN>@github.com/remotest.git` 或 git 密钥存 token
- 重点验收：GitHub 仓库能看到源码、LICENSE(MIT)、README、tag v0.1.0

### C. npm 发布（用户在终端登录，发布命令我来跑）
```sh
npm login            # 用户自己敲，输 misakamaster 账号 + 密码（+ 一次性邮箱码）
# 登录成功后，发布保守走 --tag next 观察，再升 latest：
cd .../dsh-auto-paste
npm publish --tag next
# 确认无误后升 latest：
npm dist-tag add dsh-auto-paste@0.1.0 latest
```
- 发布前提：阶段 A 干净环境试装（RELEASE.md 第 1 节）可选做——第三方 2026-08-16 已做等价验证
- 发布时机：观察期（QQ 群测试）第 3 天汇总 ≈ 2026-08-17 通过后再正式发 latest（用户不急）
- 备注：npm 发布后国内镜像（npmmirror）同步有几分钟延迟，群里说明

## 5. 环境坑（本会话踩过，新对话别踩）

| 坑 | 解法 |
|---|---|
| 插件在工作区外 | 编辑/写/git 需 `danger-full-access` 越界权限（编辑器会自动要求审批） |
| git 写 .git/ 被拦 | 升级权限重试；npm 写用户 AppData 缓存被拦 → 加 `--cache <工作区内路径>` |
| 测试沙箱拦子进程 | `npm test` 报 spawn EPERM → 用 `node --test --test-isolation=none tests/release.test.js` |
| 沙箱 node 禁管道 | 命令避开 `2>&1`/`\|`，要输出用重定向文件或单独命令 |
| **命令行网络全失败是沙箱假象** | curl/PowerShell/git 在此沙箱报 TLS/凭据/管道错误 ≠ 真断网；**判定标准是浏览器能开 github.com**（Watt Toolkit 加速生效） |
| 我的沙箱跑不通 git push | git push/ls-remote 需沙箱外 → **把命令给用户在系统终端执行** |

## 6. 相关文档索引

- `DEV-NOTES.md` — 插件开发全记录（架构/历史/测试状态）
- `RELEASE.md` — 发布检查清单（阶段 A/B/C，B 已勾完）
- `TESTING.md` — 独立测试任务书
- `README.md` — 使用/安装/坑（已改 MIT 许可）

## 7. 待用户确认/决定

1. GitHub 仓库是否已建（-> 转 4-B）
2. 打包版本 tag：默认 `v0.1.0`
3. 发布节奏：立即发布 npm next，还是等 08-17 观察期汇总通过
