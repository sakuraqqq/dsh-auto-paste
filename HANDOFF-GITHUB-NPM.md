# dsh-auto-paste 发布交接（HANDOFF-GITHUB-NPM）— ✅ 已归档

> **状态：已完成归档（2026-08-18 核对线上确认）**。本文件为发布流程留档，不再有未办事项。
> 如需继续开发，看 `DEV-NOTES.md` / `README.md`。

## 1. 最终状态（一句话）

插件**已开发完成、已发布线上、两处均已核实**：

| 渠道 | 状态 | 详情 |
|---|---|---|
| npm | ✅ 已发布 | `dsh-auto-paste`，latest = **0.1.2**（另有 next = 0.1.1，共 0.1.0 / 0.1.1 / 0.1.2 三版），author `misakamaster`，MIT |
| GitHub | ✅ 已推送 | **sakuraqqq/dsh-auto-paste**（Public，含 LICENSE / README / 源码） |

> ⚠️ 更正历史记录：早期交接文档写「GitHub 账号 misakamaster / 仓库未建」——核对后实际仓库在 **sakuraqqq** 名下，与 package.json 的 `repository`/`homepage` 一致；npm 侧署名确为 `misakamaster`。旧的「待确认/待发布」描述全部作废。

## 2. 项目与账号（留档）

- 插件目录：`...\work\dsh-trial\dsh-auto-paste`（独立 git 仓库，在工作区 `chajian\` 兄弟目录，编辑需越界写权限）
- npm 包：`dsh-auto-paste`（maintainer: misakamaster <38662110@qq.com>）
- GitHub 仓库：https://github.com/sakuraqqq/dsh-auto-paste
- 许可：MIT · node `^22.19.0 || >=24.0.0`

## 3. 已完成的发布动作（别重做）

- ✅ 开发 + 测试全绿（typecheck / build / test 18/18 / smoke）
- ✅ 许可切换 MIT（LICENSE / package.json / README 三处落实，commit 留痕）
- ✅ npm pack 产物验证（10 文件，无评估版残留）
- ✅ npm 发布：`0.1.0` → `next` 观察 → 升 `latest`；后续迭代 `0.1.1`、`0.1.2`
- ✅ GitHub 推送：remote `https://github.com/sakuraqqq/dsh-auto-paste.git`，main 分支 + 版本 tag

## 4. 可选后续（非必须）

- **收录进 DSH 插件市场**：向 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提 PR（README 加一行条目：repo + 分类 + 一行描述），合并后自动出现在 [dsh-market](https://github.com/dsh-market/dsh-market) 与 [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)，用户即可 `dsh plugin add dsh-auto-paste` 一键安装。
- **推广**：QQ 群观察期汇总、README 增截图。

## 5. 环境坑（留档）

| 坑 | 解法 |
|---|---|
| 插件在工作区外 | 编辑/写/git 需越界权限（编辑器自动要求审批） |
| 测试沙箱拦子进程 | `node --test --test-isolation=none tests/release.test.js` |
| 沙箱 node 禁管道 | 命令避开 `2>&1`/`\|`，要输出用重定向文件或单独命令 |
| 沙箱内 git push 不稳 | 系统终端执行 |

## 6. 相关文档索引

- `DEV-NOTES.md` — 开发全记录 ・ `RELEASE.md` — 发布检查清单 ・ `TESTING.md` — 测试任务书 ・ `README.md` — 使用/安装