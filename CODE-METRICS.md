# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-09-12T14:46:43.776Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：5；函数总数：93；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 760 | 8 | 7 |
| src/client.js | insertTextAtCaret | 262 | 7 | 6 |
| src/client.js | removeCapture | 338 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 557 | 7 | 6 |
| scripts/release.mjs | sh | 53 | 6 | 6 |
| src/client.js | isComposerTarget | 207 | 6 | 5 |
| src/client.js | callPasteStore | 471 | 6 | 5 |
| src/client.js | apply | 719 | 6 | 5 |
| src/client.js | insertIntoContentEditable | 221 | 5 | 4 |
| src/client.js | textRangeOf | 297 | 5 | 4 |
| smoke.mjs | refuses | 57 | 4 | 4 |
| src/client.js | mountToastSurface | 172 | 4 | 3 |
| src/client.js | refreshCapture | 329 | 4 | 3 |
| src/client.js | CaptureBar | 388 | 4 | 3 |
| src/client.js | mountCaptureBar | 437 | 4 | 3 |
| src/client.js | applyRemoteConfig | 495 | 4 | 3 |
| src/client.js | thresholdHint | 545 | 4 | 3 |
| src/client.js | mountSettingsRow | 673 | 4 | 3 |
| src/client.js | adoptBetterSidebar | 707 | 4 | 3 |
| src/client.js | locate | 307 | 3 | 3 |
| src/client.js | openCapture | 365 | 3 | 2 |
| src/client.js | submit | 601 | 3 | 2 |
| scripts/release.mjs | incVersion | 72 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishCapture | 56 | 2 | 1 |
| src/client.js | publishToasts | 93 | 2 | 1 |
| src/client.js | showToast | 105 | 2 | 1 |
| src/client.js | ToastHost | 136 | 2 | 1 |
| src/client.js | (anonymous) | 142 | 2 | 1 |
| src/client.js | insertViaExecCommand | 249 | 2 | 1 |
| src/client.js | (anonymous) | 570 | 2 | 1 |
| src/client.js | (anonymous) | 577 | 2 | 1 |
| src/client.js | (anonymous) | 580 | 2 | 1 |
| src/client.js | write | 588 | 2 | 1 |
| src/client.js | (anonymous) | 593 | 2 | 1 |
| src/client.js | onKeyDown | 638 | 2 | 1 |
| src/client.js | (anonymous) | 724 | 2 | 1 |
| smoke.mjs | get | 45 | 2 | 1 |
| src/client.js | subscribeCapture | 60 | 1 | 0 |
| src/client.js | (anonymous) | 62 | 1 | 0 |
| src/client.js | readCapture | 66 | 1 | 0 |
| src/client.js | subscribeToasts | 96 | 1 | 0 |
| src/client.js | (anonymous) | 98 | 1 | 0 |
| src/client.js | readToasts | 102 | 1 | 0 |
| src/client.js | (anonymous) | 109 | 1 | 0 |
| src/client.js | (anonymous) | 110 | 1 | 0 |
| src/client.js | (anonymous) | 176 | 1 | 0 |
| src/client.js | (anonymous) | 180 | 1 | 0 |
| src/client.js | (anonymous) | 182 | 1 | 0 |
| src/client.js | (anonymous) | 183 | 1 | 0 |
| src/client.js | pasteReference | 282 | 1 | 0 |
| src/client.js | composerElement | 287 | 1 | 0 |
| src/client.js | (anonymous) | 441 | 1 | 0 |
| src/client.js | (anonymous) | 445 | 1 | 0 |
| src/client.js | (anonymous) | 447 | 1 | 0 |
| src/client.js | (anonymous) | 448 | 1 | 0 |
| src/client.js | (anonymous) | 473 | 1 | 0 |
| src/client.js | savePaste | 486 | 1 | 0 |
| src/client.js | fetchHostConfig | 519 | 1 | 0 |
| src/client.js | (anonymous) | 563 | 1 | 0 |
| src/client.js | (anonymous) | 583 | 1 | 0 |
| src/client.js | (anonymous) | 596 | 1 | 0 |
| src/client.js | (anonymous) | 597 | 1 | 0 |
| src/client.js | onChange | 637 | 1 | 0 |
| src/client.js | onClick | 659 | 1 | 0 |
| src/client.js | (anonymous) | 677 | 1 | 0 |
| src/client.js | (anonymous) | 681 | 1 | 0 |
| src/client.js | (anonymous) | 683 | 1 | 0 |
| src/client.js | (anonymous) | 684 | 1 | 0 |
| src/client.js | (anonymous) | 726 | 1 | 0 |
| src/client.js | (anonymous) | 734 | 1 | 0 |
| src/client.js | (anonymous) | 735 | 1 | 0 |
| src/client.js | (anonymous) | 789 | 1 | 0 |
| src/client.js | (anonymous) | 801 | 1 | 0 |
| src/client.js | (anonymous) | 810 | 1 | 0 |
| src/client.js | (anonymous) | 810 | 1 | 0 |
| src/client.js | onComposerInput | 813 | 1 | 0 |
| src/client.js | (anonymous) | 815 | 1 | 0 |
| src/client.js | (anonymous) | 815 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 38 | 1 | 0 |
| scripts/release.mjs | log | 46 | 1 | 0 |
| scripts/release.mjs | ok | 47 | 1 | 0 |
| scripts/release.mjs | fail | 48 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 137 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 152 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 196 | 1 | 0 |
| smoke.mjs | fail | 9 | 1 | 0 |
| smoke.mjs | list | 48 | 1 | 0 |
| smoke.mjs | (anonymous) | 68 | 1 | 0 |
| smoke.mjs | (anonymous) | 69 | 1 | 0 |
| smoke.mjs | get | 70 | 1 | 0 |
| smoke.mjs | list | 70 | 1 | 0 |
| smoke.mjs | get | 73 | 1 | 0 |

## 4. 口径与说明

- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \|\| ??）；阈值 ≤10。
- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤15——数值与官方可能差 1-2 分。
- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。
- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。
