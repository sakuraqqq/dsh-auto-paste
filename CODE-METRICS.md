# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-10-17T06:43:56.245Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：6；函数总数：108；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 1120 | 8 | 7 |
| src/client.js | insertTextAtCaret | 338 | 7 | 6 |
| src/client.js | SidebarHint | 684 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 868 | 7 | 6 |
| src/client.js | apply | 1070 | 7 | 6 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| src/client.js | isComposerTarget | 280 | 6 | 5 |
| src/client.js | needsBoundarySpace | 476 | 6 | 5 |
| src/client.js | insertReferenceChip | 513 | 6 | 5 |
| src/client.js | callPasteStore | 782 | 6 | 5 |
| src/client.js | publishSidebar | 115 | 5 | 4 |
| src/client.js | insertIntoContentEditable | 294 | 5 | 4 |
| src/client.js | composerInsertion | 439 | 5 | 4 |
| src/client.js | ownsSidebarHint | 665 | 5 | 4 |
| src/client.js | (anonymous) | 695 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 245 | 4 | 3 |
| src/client.js | mountSidebarHint | 748 | 4 | 3 |
| src/client.js | applyRemoteConfig | 806 | 4 | 3 |
| src/client.js | thresholdHint | 856 | 4 | 3 |
| src/client.js | mountSettingsRow | 1007 | 4 | 3 |
| src/client.js | (anonymous) | 1177 | 4 | 3 |
| src/client.js | readSidebarHint | 76 | 3 | 3 |
| src/client.js | markSidebarHintSeen | 94 | 3 | 2 |
| src/client.js | sessionKey | 674 | 3 | 2 |
| src/client.js | submit | 912 | 3 | 2 |
| src/client.js | adoptBetterSidebar | 1060 | 3 | 2 |
| scripts/release.mjs | incVersion | 226 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 164 | 2 | 1 |
| src/client.js | showToast | 176 | 2 | 1 |
| src/client.js | ToastHost | 209 | 2 | 1 |
| src/client.js | (anonymous) | 215 | 2 | 1 |
| src/client.js | insertViaExecCommand | 322 | 2 | 1 |
| src/client.js | referenceChipOf | 412 | 2 | 1 |
| src/client.js | miss | 444 | 2 | 1 |
| src/client.js | currentSessionId | 596 | 2 | 1 |
| src/client.js | shouldOfferSidebarHint | 630 | 2 | 1 |
| src/client.js | offerSidebarHint | 639 | 2 | 1 |
| src/client.js | (anonymous) | 716 | 2 | 1 |
| src/client.js | (anonymous) | 881 | 2 | 1 |
| src/client.js | (anonymous) | 888 | 2 | 1 |
| src/client.js | (anonymous) | 891 | 2 | 1 |
| src/client.js | write | 899 | 2 | 1 |
| src/client.js | (anonymous) | 904 | 2 | 1 |
| src/client.js | onKeyDown | 949 | 2 | 1 |
| src/client.js | SettingsSidebarRow | 987 | 2 | 1 |
| src/client.js | (anonymous) | 1076 | 2 | 1 |
| src/client.js | (anonymous) | 1102 | 2 | 1 |
| src/client.js | (anonymous) | 1154 | 2 | 1 |
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
| src/client.js | (anonymous) | 530 | 1 | 0 |
| src/client.js | (anonymous) | 531 | 1 | 0 |
| src/client.js | consumeSidebarHint | 652 | 1 | 0 |
| src/client.js | onClick | 737 | 1 | 0 |
| src/client.js | (anonymous) | 752 | 1 | 0 |
| src/client.js | (anonymous) | 756 | 1 | 0 |
| src/client.js | (anonymous) | 758 | 1 | 0 |
| src/client.js | (anonymous) | 759 | 1 | 0 |
| src/client.js | (anonymous) | 784 | 1 | 0 |
| src/client.js | savePaste | 797 | 1 | 0 |
| src/client.js | fetchHostConfig | 830 | 1 | 0 |
| src/client.js | (anonymous) | 874 | 1 | 0 |
| src/client.js | (anonymous) | 894 | 1 | 0 |
| src/client.js | (anonymous) | 907 | 1 | 0 |
| src/client.js | (anonymous) | 908 | 1 | 0 |
| src/client.js | onChange | 948 | 1 | 0 |
| src/client.js | onClick | 970 | 1 | 0 |
| src/client.js | (anonymous) | 1011 | 1 | 0 |
| src/client.js | (anonymous) | 1015 | 1 | 0 |
| src/client.js | (anonymous) | 1017 | 1 | 0 |
| src/client.js | (anonymous) | 1018 | 1 | 0 |
| src/client.js | (anonymous) | 1032 | 1 | 0 |
| src/client.js | (anonymous) | 1033 | 1 | 0 |
| src/client.js | (anonymous) | 1078 | 1 | 0 |
| src/client.js | (anonymous) | 1086 | 1 | 0 |
| src/client.js | (anonymous) | 1087 | 1 | 0 |
| src/client.js | (anonymous) | 1102 | 1 | 0 |
| src/client.js | (anonymous) | 1201 | 1 | 0 |
| src/client.js | (anonymous) | 1201 | 1 | 0 |
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
