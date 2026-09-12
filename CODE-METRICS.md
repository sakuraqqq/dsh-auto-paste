# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-09-12T16:23:02.343Z
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
| src/client.js | onPaste | 859 | 8 | 7 |
| src/client.js | insertTextAtCaret | 274 | 7 | 6 |
| src/client.js | SettingsMinCharsRow | 649 | 7 | 6 |
| src/client.js | apply | 811 | 7 | 6 |
| scripts/release.mjs | sh | 53 | 6 | 6 |
| src/client.js | isComposerTarget | 216 | 6 | 5 |
| src/client.js | callPasteStore | 563 | 6 | 5 |
| src/client.js | insertIntoContentEditable | 230 | 5 | 4 |
| src/client.js | textRangeOf | 315 | 5 | 4 |
| src/client.js | refreshCapture | 364 | 5 | 4 |
| src/client.js | removeCapture | 420 | 5 | 4 |
| src/client.js | (anonymous) | 435 | 5 | 4 |
| src/client.js | CaptureBar | 478 | 5 | 4 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| src/client.js | mountToastSurface | 181 | 4 | 3 |
| src/client.js | openCapture | 451 | 4 | 3 |
| src/client.js | mountCaptureBar | 529 | 4 | 3 |
| src/client.js | applyRemoteConfig | 587 | 4 | 3 |
| src/client.js | thresholdHint | 637 | 4 | 3 |
| src/client.js | mountSettingsRow | 765 | 4 | 3 |
| src/client.js | adoptBetterSidebar | 799 | 4 | 3 |
| src/client.js | locate | 325 | 3 | 3 |
| src/client.js | requestRangeDeletion | 401 | 3 | 2 |
| src/client.js | submit | 693 | 3 | 2 |
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
| src/client.js | (anonymous) | 662 | 2 | 1 |
| src/client.js | (anonymous) | 669 | 2 | 1 |
| src/client.js | (anonymous) | 672 | 2 | 1 |
| src/client.js | write | 680 | 2 | 1 |
| src/client.js | (anonymous) | 685 | 2 | 1 |
| src/client.js | onKeyDown | 730 | 2 | 1 |
| src/client.js | (anonymous) | 817 | 2 | 1 |
| src/client.js | (anonymous) | 843 | 2 | 1 |
| src/client.js | (anonymous) | 906 | 2 | 1 |
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
| src/client.js | (anonymous) | 533 | 1 | 0 |
| src/client.js | (anonymous) | 537 | 1 | 0 |
| src/client.js | (anonymous) | 539 | 1 | 0 |
| src/client.js | (anonymous) | 540 | 1 | 0 |
| src/client.js | (anonymous) | 565 | 1 | 0 |
| src/client.js | savePaste | 578 | 1 | 0 |
| src/client.js | fetchHostConfig | 611 | 1 | 0 |
| src/client.js | (anonymous) | 655 | 1 | 0 |
| src/client.js | (anonymous) | 675 | 1 | 0 |
| src/client.js | (anonymous) | 688 | 1 | 0 |
| src/client.js | (anonymous) | 689 | 1 | 0 |
| src/client.js | onChange | 729 | 1 | 0 |
| src/client.js | onClick | 751 | 1 | 0 |
| src/client.js | (anonymous) | 769 | 1 | 0 |
| src/client.js | (anonymous) | 773 | 1 | 0 |
| src/client.js | (anonymous) | 775 | 1 | 0 |
| src/client.js | (anonymous) | 776 | 1 | 0 |
| src/client.js | (anonymous) | 819 | 1 | 0 |
| src/client.js | (anonymous) | 827 | 1 | 0 |
| src/client.js | (anonymous) | 828 | 1 | 0 |
| src/client.js | (anonymous) | 843 | 1 | 0 |
| src/client.js | (anonymous) | 888 | 1 | 0 |
| src/client.js | (anonymous) | 921 | 1 | 0 |
| src/client.js | (anonymous) | 921 | 1 | 0 |
| src/client.js | onComposerInput | 924 | 1 | 0 |
| src/client.js | (anonymous) | 926 | 1 | 0 |
| src/client.js | (anonymous) | 926 | 1 | 0 |
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
