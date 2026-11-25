# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-11-25T18:55:26.075Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：6；函数总数：127；**超限函数数：0**
- 圈复杂度最高：9；认知复杂度最高：9

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | callPasteStore | 802 | 9 | 9 |
| src/client.js | SettingsMinCharsRow | 966 | 9 | 8 |
| src/client.js | onPaste | 1301 | 9 | 8 |
| src/client.js | insertTextAtCaret | 358 | 7 | 6 |
| src/client.js | SidebarHint | 704 | 7 | 6 |
| src/client.js | apply | 1215 | 7 | 6 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| src/client.js | isComposerTarget | 300 | 6 | 5 |
| src/client.js | needsBoundarySpace | 496 | 6 | 5 |
| src/client.js | insertReferenceChip | 533 | 6 | 5 |
| src/client.js | isHostUnavailable | 869 | 6 | 5 |
| src/client.js | thresholdHint | 954 | 5 | 5 |
| src/client.js | publishSidebar | 135 | 5 | 4 |
| src/client.js | insertIntoContentEditable | 314 | 5 | 4 |
| src/client.js | composerInsertion | 459 | 5 | 4 |
| src/client.js | ownsSidebarHint | 685 | 5 | 4 |
| src/client.js | (anonymous) | 715 | 5 | 4 |
| src/client.js | describeRpcError | 888 | 5 | 4 |
| src/client.js | pasteFailureMessage | 876 | 4 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 265 | 4 | 3 |
| src/client.js | mountSidebarHint | 768 | 4 | 3 |
| src/client.js | applyRemoteConfig | 839 | 4 | 3 |
| src/client.js | (anonymous) | 914 | 4 | 3 |
| src/client.js | mountSettingsRow | 1152 | 4 | 3 |
| src/client.js | (anonymous) | 1367 | 4 | 3 |
| src/client.js | readSidebarHint | 96 | 3 | 3 |
| src/client.js | markSidebarHintSeen | 114 | 3 | 2 |
| src/client.js | sessionKey | 694 | 3 | 2 |
| src/client.js | onError | 1010 | 3 | 2 |
| src/client.js | (anonymous) | 1031 | 3 | 2 |
| src/client.js | submit | 1045 | 3 | 2 |
| src/client.js | adoptBetterSidebar | 1205 | 3 | 2 |
| src/client.js | scheduleHostProbe | 1248 | 3 | 2 |
| scripts/release.mjs | incVersion | 232 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 184 | 2 | 1 |
| src/client.js | showToast | 196 | 2 | 1 |
| src/client.js | ToastHost | 229 | 2 | 1 |
| src/client.js | (anonymous) | 235 | 2 | 1 |
| src/client.js | insertViaExecCommand | 342 | 2 | 1 |
| src/client.js | referenceChipOf | 432 | 2 | 1 |
| src/client.js | miss | 464 | 2 | 1 |
| src/client.js | currentSessionId | 616 | 2 | 1 |
| src/client.js | shouldOfferSidebarHint | 650 | 2 | 1 |
| src/client.js | offerSidebarHint | 659 | 2 | 1 |
| src/client.js | (anonymous) | 736 | 2 | 1 |
| src/client.js | savePaste | 826 | 2 | 1 |
| src/client.js | (anonymous) | 911 | 2 | 1 |
| src/client.js | (anonymous) | 925 | 2 | 1 |
| src/client.js | (anonymous) | 989 | 2 | 1 |
| src/client.js | onValue | 1005 | 2 | 1 |
| src/client.js | write | 1026 | 2 | 1 |
| src/client.js | (anonymous) | 1035 | 2 | 1 |
| src/client.js | (anonymous) | 1039 | 2 | 1 |
| src/client.js | onKeyDown | 1082 | 2 | 1 |
| src/client.js | SettingsSidebarRow | 1132 | 2 | 1 |
| src/client.js | (anonymous) | 1221 | 2 | 1 |
| src/client.js | clearHostProbe | 1230 | 2 | 1 |
| src/client.js | probeHost | 1235 | 2 | 1 |
| src/client.js | (anonymous) | 1282 | 2 | 1 |
| src/client.js | (anonymous) | 1343 | 2 | 1 |
| scripts/bundle.mjs | (anonymous) | 30 | 2 | 1 |
| scripts/release.mjs | gitOk | 88 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| src/client.js | subscribeSidebar | 147 | 1 | 0 |
| src/client.js | (anonymous) | 149 | 1 | 0 |
| src/client.js | readSidebar | 153 | 1 | 0 |
| src/client.js | subscribeToasts | 187 | 1 | 0 |
| src/client.js | (anonymous) | 189 | 1 | 0 |
| src/client.js | readToasts | 193 | 1 | 0 |
| src/client.js | (anonymous) | 200 | 1 | 0 |
| src/client.js | (anonymous) | 202 | 1 | 0 |
| src/client.js | (anonymous) | 269 | 1 | 0 |
| src/client.js | (anonymous) | 273 | 1 | 0 |
| src/client.js | (anonymous) | 275 | 1 | 0 |
| src/client.js | (anonymous) | 276 | 1 | 0 |
| src/client.js | pasteReference | 413 | 1 | 0 |
| src/client.js | (anonymous) | 550 | 1 | 0 |
| src/client.js | (anonymous) | 551 | 1 | 0 |
| src/client.js | consumeSidebarHint | 672 | 1 | 0 |
| src/client.js | onClick | 757 | 1 | 0 |
| src/client.js | (anonymous) | 772 | 1 | 0 |
| src/client.js | (anonymous) | 776 | 1 | 0 |
| src/client.js | (anonymous) | 778 | 1 | 0 |
| src/client.js | (anonymous) | 779 | 1 | 0 |
| src/client.js | (anonymous) | 804 | 1 | 0 |
| src/client.js | onOuterAbort | 808 | 1 | 0 |
| src/client.js | fetchHostConfig | 864 | 1 | 0 |
| src/client.js | loadHostConfig | 903 | 1 | 0 |
| src/client.js | run | 908 | 1 | 0 |
| src/client.js | (anonymous) | 982 | 1 | 0 |
| src/client.js | (anonymous) | 994 | 1 | 0 |
| src/client.js | (anonymous) | 1020 | 1 | 0 |
| src/client.js | onChange | 1081 | 1 | 0 |
| src/client.js | onClick | 1093 | 1 | 0 |
| src/client.js | (anonymous) | 1093 | 1 | 0 |
| src/client.js | onClick | 1115 | 1 | 0 |
| src/client.js | (anonymous) | 1156 | 1 | 0 |
| src/client.js | (anonymous) | 1160 | 1 | 0 |
| src/client.js | (anonymous) | 1162 | 1 | 0 |
| src/client.js | (anonymous) | 1163 | 1 | 0 |
| src/client.js | (anonymous) | 1177 | 1 | 0 |
| src/client.js | (anonymous) | 1178 | 1 | 0 |
| src/client.js | (anonymous) | 1223 | 1 | 0 |
| src/client.js | (anonymous) | 1238 | 1 | 0 |
| src/client.js | (anonymous) | 1243 | 1 | 0 |
| src/client.js | (anonymous) | 1250 | 1 | 0 |
| src/client.js | (anonymous) | 1261 | 1 | 0 |
| src/client.js | (anonymous) | 1265 | 1 | 0 |
| src/client.js | (anonymous) | 1282 | 1 | 0 |
| src/client.js | (anonymous) | 1393 | 1 | 0 |
| src/client.js | (anonymous) | 1393 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 52 | 1 | 0 |
| scripts/release.mjs | log | 65 | 1 | 0 |
| scripts/release.mjs | ok | 66 | 1 | 0 |
| scripts/release.mjs | fail | 67 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 297 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 312 | 1 | 0 |
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
