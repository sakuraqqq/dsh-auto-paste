# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-10-07T16:17:05.018Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：5；函数总数：105；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 1078 | 8 | 7 |
| src/client.js | insertTextAtCaret | 331 | 7 | 6 |
| src/client.js | SidebarHint | 642 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 826 | 7 | 6 |
| src/client.js | apply | 1028 | 7 | 6 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| src/client.js | isComposerTarget | 273 | 6 | 5 |
| src/client.js | needsBoundarySpace | 456 | 6 | 5 |
| src/client.js | insertReferenceChip | 493 | 6 | 5 |
| src/client.js | callPasteStore | 740 | 6 | 5 |
| src/client.js | publishSidebar | 108 | 5 | 4 |
| src/client.js | insertIntoContentEditable | 287 | 5 | 4 |
| src/client.js | composerInsertion | 432 | 5 | 4 |
| src/client.js | ownsSidebarHint | 623 | 5 | 4 |
| src/client.js | (anonymous) | 653 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 238 | 4 | 3 |
| src/client.js | mountSidebarHint | 706 | 4 | 3 |
| src/client.js | applyRemoteConfig | 764 | 4 | 3 |
| src/client.js | thresholdHint | 814 | 4 | 3 |
| src/client.js | mountSettingsRow | 965 | 4 | 3 |
| src/client.js | readSidebarHint | 69 | 3 | 3 |
| src/client.js | markSidebarHintSeen | 87 | 3 | 2 |
| src/client.js | sessionKey | 632 | 3 | 2 |
| src/client.js | submit | 870 | 3 | 2 |
| src/client.js | adoptBetterSidebar | 1018 | 3 | 2 |
| scripts/release.mjs | incVersion | 226 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 157 | 2 | 1 |
| src/client.js | showToast | 169 | 2 | 1 |
| src/client.js | ToastHost | 202 | 2 | 1 |
| src/client.js | (anonymous) | 208 | 2 | 1 |
| src/client.js | insertViaExecCommand | 315 | 2 | 1 |
| src/client.js | referenceChipOf | 405 | 2 | 1 |
| src/client.js | currentSessionId | 554 | 2 | 1 |
| src/client.js | shouldOfferSidebarHint | 588 | 2 | 1 |
| src/client.js | offerSidebarHint | 597 | 2 | 1 |
| src/client.js | (anonymous) | 674 | 2 | 1 |
| src/client.js | (anonymous) | 839 | 2 | 1 |
| src/client.js | (anonymous) | 846 | 2 | 1 |
| src/client.js | (anonymous) | 849 | 2 | 1 |
| src/client.js | write | 857 | 2 | 1 |
| src/client.js | (anonymous) | 862 | 2 | 1 |
| src/client.js | onKeyDown | 907 | 2 | 1 |
| src/client.js | SettingsSidebarRow | 945 | 2 | 1 |
| src/client.js | (anonymous) | 1034 | 2 | 1 |
| src/client.js | (anonymous) | 1060 | 2 | 1 |
| src/client.js | (anonymous) | 1109 | 2 | 1 |
| src/client.js | (anonymous) | 1130 | 2 | 1 |
| scripts/release.mjs | gitOk | 88 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| src/client.js | subscribeSidebar | 120 | 1 | 0 |
| src/client.js | (anonymous) | 122 | 1 | 0 |
| src/client.js | readSidebar | 126 | 1 | 0 |
| src/client.js | subscribeToasts | 160 | 1 | 0 |
| src/client.js | (anonymous) | 162 | 1 | 0 |
| src/client.js | readToasts | 166 | 1 | 0 |
| src/client.js | (anonymous) | 173 | 1 | 0 |
| src/client.js | (anonymous) | 175 | 1 | 0 |
| src/client.js | (anonymous) | 242 | 1 | 0 |
| src/client.js | (anonymous) | 246 | 1 | 0 |
| src/client.js | (anonymous) | 248 | 1 | 0 |
| src/client.js | (anonymous) | 249 | 1 | 0 |
| src/client.js | pasteReference | 386 | 1 | 0 |
| src/client.js | consumeSidebarHint | 610 | 1 | 0 |
| src/client.js | onClick | 695 | 1 | 0 |
| src/client.js | (anonymous) | 710 | 1 | 0 |
| src/client.js | (anonymous) | 714 | 1 | 0 |
| src/client.js | (anonymous) | 716 | 1 | 0 |
| src/client.js | (anonymous) | 717 | 1 | 0 |
| src/client.js | (anonymous) | 742 | 1 | 0 |
| src/client.js | savePaste | 755 | 1 | 0 |
| src/client.js | fetchHostConfig | 788 | 1 | 0 |
| src/client.js | (anonymous) | 832 | 1 | 0 |
| src/client.js | (anonymous) | 852 | 1 | 0 |
| src/client.js | (anonymous) | 865 | 1 | 0 |
| src/client.js | (anonymous) | 866 | 1 | 0 |
| src/client.js | onChange | 906 | 1 | 0 |
| src/client.js | onClick | 928 | 1 | 0 |
| src/client.js | (anonymous) | 969 | 1 | 0 |
| src/client.js | (anonymous) | 973 | 1 | 0 |
| src/client.js | (anonymous) | 975 | 1 | 0 |
| src/client.js | (anonymous) | 976 | 1 | 0 |
| src/client.js | (anonymous) | 990 | 1 | 0 |
| src/client.js | (anonymous) | 991 | 1 | 0 |
| src/client.js | (anonymous) | 1036 | 1 | 0 |
| src/client.js | (anonymous) | 1044 | 1 | 0 |
| src/client.js | (anonymous) | 1045 | 1 | 0 |
| src/client.js | (anonymous) | 1060 | 1 | 0 |
| src/client.js | (anonymous) | 1145 | 1 | 0 |
| src/client.js | (anonymous) | 1145 | 1 | 0 |
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
