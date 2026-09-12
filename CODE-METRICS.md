# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-09-12T16:01:24.179Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：5；函数总数：102；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 855 | 8 | 7 |
| src/client.js | insertTextAtCaret | 274 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 645 | 7 | 6 |
| src/client.js | apply | 807 | 7 | 6 |
| scripts/release.mjs | sh | 53 | 6 | 6 |
| src/client.js | isComposerTarget | 216 | 6 | 5 |
| src/client.js | callPasteStore | 559 | 6 | 5 |
| src/client.js | insertIntoContentEditable | 230 | 5 | 4 |
| src/client.js | textRangeOf | 315 | 5 | 4 |
| src/client.js | refreshCapture | 364 | 5 | 4 |
| src/client.js | removeCapture | 420 | 5 | 4 |
| src/client.js | (anonymous) | 435 | 5 | 4 |
| src/client.js | CaptureBar | 474 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 181 | 4 | 3 |
| src/client.js | mountCaptureBar | 525 | 4 | 3 |
| src/client.js | applyRemoteConfig | 583 | 4 | 3 |
| src/client.js | thresholdHint | 633 | 4 | 3 |
| src/client.js | mountSettingsRow | 761 | 4 | 3 |
| src/client.js | adoptBetterSidebar | 795 | 4 | 3 |
| src/client.js | locate | 325 | 3 | 3 |
| src/client.js | requestRangeDeletion | 401 | 3 | 2 |
| src/client.js | openCapture | 451 | 3 | 2 |
| src/client.js | submit | 689 | 3 | 2 |
| scripts/release.mjs | incVersion | 72 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishCapture | 59 | 2 | 1 |
| src/client.js | publishToasts | 100 | 2 | 1 |
| src/client.js | showToast | 112 | 2 | 1 |
| src/client.js | ToastHost | 145 | 2 | 1 |
| src/client.js | (anonymous) | 151 | 2 | 1 |
| src/client.js | insertViaExecCommand | 258 | 2 | 1 |
| src/client.js | currentSessionId | 343 | 2 | 1 |
| src/client.js | captureBelongsToCurrentSession | 354 | 2 | 1 |
| src/client.js | selectRange | 377 | 2 | 1 |
| src/client.js | (anonymous) | 658 | 2 | 1 |
| src/client.js | (anonymous) | 665 | 2 | 1 |
| src/client.js | (anonymous) | 668 | 2 | 1 |
| src/client.js | write | 676 | 2 | 1 |
| src/client.js | (anonymous) | 681 | 2 | 1 |
| src/client.js | onKeyDown | 726 | 2 | 1 |
| src/client.js | (anonymous) | 813 | 2 | 1 |
| src/client.js | (anonymous) | 839 | 2 | 1 |
| src/client.js | (anonymous) | 896 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| src/client.js | subscribeCapture | 63 | 1 | 0 |
| src/client.js | (anonymous) | 65 | 1 | 0 |
| src/client.js | readCapture | 69 | 1 | 0 |
| src/client.js | subscribeToasts | 103 | 1 | 0 |
| src/client.js | (anonymous) | 105 | 1 | 0 |
| src/client.js | readToasts | 109 | 1 | 0 |
| src/client.js | (anonymous) | 116 | 1 | 0 |
| src/client.js | (anonymous) | 118 | 1 | 0 |
| src/client.js | (anonymous) | 185 | 1 | 0 |
| src/client.js | (anonymous) | 189 | 1 | 0 |
| src/client.js | (anonymous) | 191 | 1 | 0 |
| src/client.js | (anonymous) | 192 | 1 | 0 |
| src/client.js | pasteReference | 300 | 1 | 0 |
| src/client.js | composerElement | 305 | 1 | 0 |
| src/client.js | value | 411 | 1 | 0 |
| src/client.js | (anonymous) | 529 | 1 | 0 |
| src/client.js | (anonymous) | 533 | 1 | 0 |
| src/client.js | (anonymous) | 535 | 1 | 0 |
| src/client.js | (anonymous) | 536 | 1 | 0 |
| src/client.js | (anonymous) | 561 | 1 | 0 |
| src/client.js | savePaste | 574 | 1 | 0 |
| src/client.js | fetchHostConfig | 607 | 1 | 0 |
| src/client.js | (anonymous) | 651 | 1 | 0 |
| src/client.js | (anonymous) | 671 | 1 | 0 |
| src/client.js | (anonymous) | 684 | 1 | 0 |
| src/client.js | (anonymous) | 685 | 1 | 0 |
| src/client.js | onChange | 725 | 1 | 0 |
| src/client.js | onClick | 747 | 1 | 0 |
| src/client.js | (anonymous) | 765 | 1 | 0 |
| src/client.js | (anonymous) | 769 | 1 | 0 |
| src/client.js | (anonymous) | 771 | 1 | 0 |
| src/client.js | (anonymous) | 772 | 1 | 0 |
| src/client.js | (anonymous) | 815 | 1 | 0 |
| src/client.js | (anonymous) | 823 | 1 | 0 |
| src/client.js | (anonymous) | 824 | 1 | 0 |
| src/client.js | (anonymous) | 839 | 1 | 0 |
| src/client.js | (anonymous) | 884 | 1 | 0 |
| src/client.js | (anonymous) | 911 | 1 | 0 |
| src/client.js | (anonymous) | 911 | 1 | 0 |
| src/client.js | onComposerInput | 914 | 1 | 0 |
| src/client.js | (anonymous) | 916 | 1 | 0 |
| src/client.js | (anonymous) | 916 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 38 | 1 | 0 |
| scripts/release.mjs | log | 46 | 1 | 0 |
| scripts/release.mjs | ok | 47 | 1 | 0 |
| scripts/release.mjs | fail | 48 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 137 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 152 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 184 | 1 | 0 |
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
