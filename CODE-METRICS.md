# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-10-14T14:03:22.480Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：5；函数总数：107；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 1110 | 8 | 7 |
| src/client.js | insertTextAtCaret | 338 | 7 | 6 |
| src/client.js | SidebarHint | 674 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 858 | 7 | 6 |
| src/client.js | apply | 1060 | 7 | 6 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| src/client.js | isComposerTarget | 280 | 6 | 5 |
| src/client.js | needsBoundarySpace | 476 | 6 | 5 |
| src/client.js | insertReferenceChip | 513 | 6 | 5 |
| src/client.js | callPasteStore | 772 | 6 | 5 |
| src/client.js | publishSidebar | 115 | 5 | 4 |
| src/client.js | insertIntoContentEditable | 294 | 5 | 4 |
| src/client.js | composerInsertion | 439 | 5 | 4 |
| src/client.js | ownsSidebarHint | 655 | 5 | 4 |
| src/client.js | (anonymous) | 685 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 245 | 4 | 3 |
| src/client.js | mountSidebarHint | 738 | 4 | 3 |
| src/client.js | applyRemoteConfig | 796 | 4 | 3 |
| src/client.js | thresholdHint | 846 | 4 | 3 |
| src/client.js | mountSettingsRow | 997 | 4 | 3 |
| src/client.js | (anonymous) | 1167 | 4 | 3 |
| src/client.js | readSidebarHint | 76 | 3 | 3 |
| src/client.js | markSidebarHintSeen | 94 | 3 | 2 |
| src/client.js | sessionKey | 664 | 3 | 2 |
| src/client.js | submit | 902 | 3 | 2 |
| src/client.js | adoptBetterSidebar | 1050 | 3 | 2 |
| scripts/release.mjs | incVersion | 226 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 164 | 2 | 1 |
| src/client.js | showToast | 176 | 2 | 1 |
| src/client.js | ToastHost | 209 | 2 | 1 |
| src/client.js | (anonymous) | 215 | 2 | 1 |
| src/client.js | insertViaExecCommand | 322 | 2 | 1 |
| src/client.js | referenceChipOf | 412 | 2 | 1 |
| src/client.js | miss | 444 | 2 | 1 |
| src/client.js | currentSessionId | 586 | 2 | 1 |
| src/client.js | shouldOfferSidebarHint | 620 | 2 | 1 |
| src/client.js | offerSidebarHint | 629 | 2 | 1 |
| src/client.js | (anonymous) | 706 | 2 | 1 |
| src/client.js | (anonymous) | 871 | 2 | 1 |
| src/client.js | (anonymous) | 878 | 2 | 1 |
| src/client.js | (anonymous) | 881 | 2 | 1 |
| src/client.js | write | 889 | 2 | 1 |
| src/client.js | (anonymous) | 894 | 2 | 1 |
| src/client.js | onKeyDown | 939 | 2 | 1 |
| src/client.js | SettingsSidebarRow | 977 | 2 | 1 |
| src/client.js | (anonymous) | 1066 | 2 | 1 |
| src/client.js | (anonymous) | 1092 | 2 | 1 |
| src/client.js | (anonymous) | 1144 | 2 | 1 |
| scripts/release.mjs | gitOk | 88 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| src/client.js | subscribeSidebar | 127 | 1 | 0 |
| src/client.js | (anonymous) | 129 | 1 | 0 |
| src/client.js | readSidebar | 133 | 1 | 0 |
| src/client.js | subscribeToasts | 167 | 1 | 0 |
| src/client.js | (anonymous) | 169 | 1 | 0 |
| src/client.js | readToasts | 173 | 1 | 0 |
| src/client.js | (anonymous) | 180 | 1 | 0 |
| src/client.js | (anonymous) | 182 | 1 | 0 |
| src/client.js | (anonymous) | 249 | 1 | 0 |
| src/client.js | (anonymous) | 253 | 1 | 0 |
| src/client.js | (anonymous) | 255 | 1 | 0 |
| src/client.js | (anonymous) | 256 | 1 | 0 |
| src/client.js | pasteReference | 393 | 1 | 0 |
| src/client.js | (anonymous) | 528 | 1 | 0 |
| src/client.js | consumeSidebarHint | 642 | 1 | 0 |
| src/client.js | onClick | 727 | 1 | 0 |
| src/client.js | (anonymous) | 742 | 1 | 0 |
| src/client.js | (anonymous) | 746 | 1 | 0 |
| src/client.js | (anonymous) | 748 | 1 | 0 |
| src/client.js | (anonymous) | 749 | 1 | 0 |
| src/client.js | (anonymous) | 774 | 1 | 0 |
| src/client.js | savePaste | 787 | 1 | 0 |
| src/client.js | fetchHostConfig | 820 | 1 | 0 |
| src/client.js | (anonymous) | 864 | 1 | 0 |
| src/client.js | (anonymous) | 884 | 1 | 0 |
| src/client.js | (anonymous) | 897 | 1 | 0 |
| src/client.js | (anonymous) | 898 | 1 | 0 |
| src/client.js | onChange | 938 | 1 | 0 |
| src/client.js | onClick | 960 | 1 | 0 |
| src/client.js | (anonymous) | 1001 | 1 | 0 |
| src/client.js | (anonymous) | 1005 | 1 | 0 |
| src/client.js | (anonymous) | 1007 | 1 | 0 |
| src/client.js | (anonymous) | 1008 | 1 | 0 |
| src/client.js | (anonymous) | 1022 | 1 | 0 |
| src/client.js | (anonymous) | 1023 | 1 | 0 |
| src/client.js | (anonymous) | 1068 | 1 | 0 |
| src/client.js | (anonymous) | 1076 | 1 | 0 |
| src/client.js | (anonymous) | 1077 | 1 | 0 |
| src/client.js | (anonymous) | 1092 | 1 | 0 |
| src/client.js | (anonymous) | 1191 | 1 | 0 |
| src/client.js | (anonymous) | 1191 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 52 | 1 | 0 |
| scripts/release.mjs | log | 65 | 1 | 0 |
| scripts/release.mjs | ok | 66 | 1 | 0 |
| scripts/release.mjs | fail | 67 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 291 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 306 | 1 | 0 |
| smoke.mjs | fail | 10 | 1 | 0 |
| smoke.mjs | list | 49 | 1 | 0 |
| smoke.mjs | (anonymous) | 69 | 1 | 0 |
| smoke.mjs | (anonymous) | 70 | 1 | 0 |
| smoke.mjs | get | 71 | 1 | 0 |
| smoke.mjs | list | 71 | 1 | 0 |
| smoke.mjs | get | 74 | 1 | 0 |
| smoke.mjs | (anonymous) | 118 | 1 | 0 |

## 4. 口径与说明

- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \|\| ??）；阈值 ≤10。
- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤15——数值与官方可能差 1-2 分。
- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。
- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。
