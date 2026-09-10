// eslint.config.js — dsh-auto-paste ESLint 9 flat config（防屎山 P1 守门）
//
// 范围（白名单策略）：
//   src/client.js   —— web client 半身（浏览器端 plain JS，bundle 自包含）
//   scripts/**/*.mjs —— 构建/同步脚本（Node 端）
//   smoke.mjs        —— 冒烟自检（Node 端）
// 不 lint：
//   src/*.ts         —— host 半身由 `tsc --noEmit`（npm run typecheck）守门，避免再引入 typescript-eslint
//   tests/**         —— node:test 契约/回归测试自证，不受 lint 约束（与 doc2md 口径一致）
//   dist/ lib/       —— 构建产物（tools/metrics.mjs 同样不度量）
//
// 规则：@eslint/js recommended + 核心复杂度守门（warn）。
//   硬门禁（超限函数必须为 0，exit 1）由 `npm run metrics`（tools/metrics.mjs）承担——
//   与 doc2md 同一分工：lint 报静态错误，metrics 做复杂度红名单门禁。
import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

const COMMON = {
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    ...js.configs.recommended.rules,
    complexity: ['warn', { max: 10 }],
  },
}

/** 浏览器端（client bundle） */
const CLIENT = {
  files: ['src/client.js'],
  ...COMMON,
  languageOptions: { ...COMMON.languageOptions, globals: globals.browser },
}

/** Node 端（构建脚本 / 冒烟自检） */
const NODE = {
  files: ['scripts/**/*.mjs', 'smoke.mjs'],
  ...COMMON,
  languageOptions: { ...COMMON.languageOptions, globals: globals.node },
}

export default [
  { ignores: ['node_modules/**', 'dist/**', 'lib/**', 'pastes/**', '*.tgz'] },
  CLIENT,
  NODE,
  prettier, // 关闭与 Prettier 冲突的规则（必须置尾）
]
