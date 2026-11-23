# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-11-23T18:50:27.260Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：6；函数总数：119；**超限函数数：0**
- 圈复杂度最高：9；认知复杂度最高：9

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | callPasteStore | 789 | 9 | 9 |
| src/client.js | SettingsMinCharsRow | 934 | 9 | 8 |
| src/client.js | onPaste | 1233 | 8 | 7 |
| src/client.js | insertTextAtCaret | 345 | 7 | 6 |
| src/client.js | SidebarHint | 691 | 7 | 6 |
| src/client.js | apply | 1183 | 7 | 6 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| src/client.js | isComposerTarget | 287 | 6 | 5 |
| src/client.js | needsBoundarySpace | 483 | 6 | 5 |
| src/client.js | insertReferenceChip | 520 | 6 | 5 |
| src/client.js | thresholdHint | 922 | 5 | 5 |
| src/client.js | publishSidebar | 122 | 5 | 4 |
| src/client.js | insertIntoContentEditable | 301 | 5 | 4 |
| src/client.js | composerInsertion | 446 | 5 | 4 |
| src/client.js | ownsSidebarHint | 672 | 5 | 4 |
| src/client.js | (anonymous) | 702 | 5 | 4 |
| src/client.js | describeRpcError | 856 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 252 | 4 | 3 |
| src/client.js | mountSidebarHint | 755 | 4 | 3 |
| src/client.js | applyRemoteConfig | 826 | 4 | 3 |
| src/client.js | (anonymous) | 882 | 4 | 3 |
| src/client.js | mountSettingsRow | 1120 | 4 | 3 |
| src/client.js | (anonymous) | 1294 | 4 | 3 |
| src/client.js | readSidebarHint | 83 | 3 | 3 |
| src/client.js | markSidebarHintSeen | 101 | 3 | 2 |
| src/client.js | sessionKey | 681 | 3 | 2 |
| src/client.js | onError | 978 | 3 | 2 |
| src/client.js | (anonymous) | 999 | 3 | 2 |
| src/client.js | submit | 1013 | 3 | 2 |
| src/client.js | adoptBetterSidebar | 1173 | 3 | 2 |
| scripts/release.mjs | incVersion | 226 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 171 | 2 | 1 |
| src/client.js | showToast | 183 | 2 | 1 |
| src/client.js | ToastHost | 216 | 2 | 1 |
| src/client.js | (anonymous) | 222 | 2 | 1 |
| src/client.js | insertViaExecCommand | 329 | 2 | 1 |
| src/client.js | referenceChipOf | 419 | 2 | 1 |
| src/client.js | miss | 451 | 2 | 1 |
| src/client.js | currentSessionId | 603 | 2 | 1 |
| src/client.js | shouldOfferSidebarHint | 637 | 2 | 1 |
| src/client.js | offerSidebarHint | 646 | 2 | 1 |
| src/client.js | (anonymous) | 723 | 2 | 1 |
| src/client.js | savePaste | 813 | 2 | 1 |
| src/client.js | (anonymous) | 879 | 2 | 1 |
| src/client.js | (anonymous) | 893 | 2 | 1 |
| src/client.js | (anonymous) | 957 | 2 | 1 |
| src/client.js | onValue | 973 | 2 | 1 |
| src/client.js | write | 994 | 2 | 1 |
| src/client.js | (anonymous) | 1003 | 2 | 1 |
| src/client.js | (anonymous) | 1007 | 2 | 1 |
| src/client.js | onKeyDown | 1050 | 2 | 1 |
| src/client.js | SettingsSidebarRow | 1100 | 2 | 1 |
| src/client.js | (anonymous) | 1189 | 2 | 1 |
| src/client.js | (anonymous) | 1215 | 2 | 1 |
| src/client.js | (anonymous) | 1271 | 2 | 1 |
| scripts/bundle.mjs | (anonymous) | 30 | 2 | 1 |
| scripts/release.mjs | gitOk | 88 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| src/client.js | subscribeSidebar | 134 | 1 | 0 |
| src/client.js | (anonymous) | 136 | 1 | 0 |
| src/client.js | readSidebar | 140 | 1 | 0 |
| src/client.js | subscribeToasts | 174 | 1 | 0 |
| src/client.js | (anonymous) | 176 | 1 | 0 |
| src/client.js | readToasts | 180 | 1 | 0 |
| src/client.js | (anonymous) | 187 | 1 | 0 |
| src/client.js | (anonymous) | 189 | 1 | 0 |
| src/client.js | (anonymous) | 256 | 1 | 0 |
| src/client.js | (anonymous) | 260 | 1 | 0 |
| src/client.js | (anonymous) | 262 | 1 | 0 |
| src/client.js | (anonymous) | 263 | 1 | 0 |
| src/client.js | pasteReference | 400 | 1 | 0 |
| src/client.js | (anonymous) | 537 | 1 | 0 |
| src/client.js | (anonymous) | 538 | 1 | 0 |
| src/client.js | consumeSidebarHint | 659 | 1 | 0 |
| src/client.js | onClick | 744 | 1 | 0 |
| src/client.js | (anonymous) | 759 | 1 | 0 |
| src/client.js | (anonymous) | 763 | 1 | 0 |
| src/client.js | (anonymous) | 765 | 1 | 0 |
| src/client.js | (anonymous) | 766 | 1 | 0 |
| src/client.js | (anonymous) | 791 | 1 | 0 |
| src/client.js | onOuterAbort | 795 | 1 | 0 |
| src/client.js | fetchHostConfig | 851 | 1 | 0 |
| src/client.js | loadHostConfig | 871 | 1 | 0 |
| src/client.js | run | 876 | 1 | 0 |
| src/client.js | (anonymous) | 950 | 1 | 0 |
| src/client.js | (anonymous) | 962 | 1 | 0 |
| src/client.js | (anonymous) | 988 | 1 | 0 |
| src/client.js | onChange | 1049 | 1 | 0 |
| src/client.js | onClick | 1061 | 1 | 0 |
| src/client.js | (anonymous) | 1061 | 1 | 0 |
| src/client.js | onClick | 1083 | 1 | 0 |
| src/client.js | (anonymous) | 1124 | 1 | 0 |
| src/client.js | (anonymous) | 1128 | 1 | 0 |
| src/client.js | (anonymous) | 1130 | 1 | 0 |
| src/client.js | (anonymous) | 1131 | 1 | 0 |
| src/client.js | (anonymous) | 1145 | 1 | 0 |
| src/client.js | (anonymous) | 1146 | 1 | 0 |
| src/client.js | (anonymous) | 1191 | 1 | 0 |
| src/client.js | (anonymous) | 1199 | 1 | 0 |
| src/client.js | (anonymous) | 1200 | 1 | 0 |
| src/client.js | (anonymous) | 1215 | 1 | 0 |
| src/client.js | (anonymous) | 1318 | 1 | 0 |
| src/client.js | (anonymous) | 1318 | 1 | 0 |
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
