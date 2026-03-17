require('ts-node/register/transpile-only');

const { mergePromptTokensIntoRawMessage } = require('../src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const raw = '<content>正文内容</content>';
const promptTokens = ['image###sfw\n人物与构图：测试###'];

const next = mergePromptTokensIntoRawMessage(raw, promptTokens);

assertEqual(next, raw, 'raw message should stay unchanged when prompt tokens are persisted');

console.log('no raw prompt writeback test passed');
