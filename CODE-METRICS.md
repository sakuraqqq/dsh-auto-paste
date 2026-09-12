# CODE-METRICS.md — dsh-auto-paste 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-09-12T13:35:15.343Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：5；函数总数：45；**超限函数数：0**
- 圈复杂度最高：8；认知复杂度最高：7

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| src/client.js | onPaste | 275 | 8 | 7 |
| src/client.js | insertTextAtCaret | 227 | 7 | 6 |
| scripts/release.mjs | sh | 53 | 6 | 6 |
| src/client.js | isComposerTarget | 172 | 6 | 5 |
| src/client.js | savePaste | 242 | 6 | 5 |
| src/client.js | insertIntoContentEditable | 186 | 5 | 4 |
| smoke.mjs | refuses | 57 | 4 | 4 |
| src/client.js | mountToastSurface | 137 | 4 | 3 |
| src/client.js | apply | 261 | 4 | 3 |
| scripts/release.mjs | incVersion | 72 | 3 | 2 |
| src/client.js | factory | 23 | 2 | 1 |
| src/client.js | publishToasts | 58 | 2 | 1 |
| src/client.js | showToast | 70 | 2 | 1 |
| src/client.js | ToastHost | 101 | 2 | 1 |
| src/client.js | (anonymous) | 107 | 2 | 1 |
| src/client.js | insertViaExecCommand | 214 | 2 | 1 |
| smoke.mjs | get | 45 | 2 | 1 |
| src/client.js | subscribeToasts | 61 | 1 | 0 |
| src/client.js | (anonymous) | 63 | 1 | 0 |
| src/client.js | readToasts | 67 | 1 | 0 |
| src/client.js | (anonymous) | 74 | 1 | 0 |
| src/client.js | (anonymous) | 75 | 1 | 0 |
| src/client.js | (anonymous) | 141 | 1 | 0 |
| src/client.js | (anonymous) | 145 | 1 | 0 |
| src/client.js | (anonymous) | 147 | 1 | 0 |
| src/client.js | (anonymous) | 148 | 1 | 0 |
| src/client.js | (anonymous) | 244 | 1 | 0 |
| src/client.js | (anonymous) | 304 | 1 | 0 |
| src/client.js | (anonymous) | 310 | 1 | 0 |
| src/client.js | (anonymous) | 319 | 1 | 0 |
| src/client.js | (anonymous) | 319 | 1 | 0 |
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
