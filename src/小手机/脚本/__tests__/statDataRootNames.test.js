require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { STAT_DATA_MACRO, parseStatDataRootNames, loadStatDataRootNames } = require('../聊天APP/statDataRootNames.ts');

test('parses root names from YAML, JSON, and complete outer fences', () => {
  const cases = [
    ['角色甲:\n  好感: 1\n角色乙: {}', ['角色甲', '角色乙']],
    ['{"角色甲":{},"角色乙":{}}', ['角色甲', '角色乙']],
    ['```yaml\n角色甲: {}\n角色乙: {}\n```', ['角色甲', '角色乙']],
    ['  ```yml\r\n角色甲: {}\r\n角色乙: {}\r\n```  ', ['角色甲', '角色乙']],
    ['```json\n{"角色甲":{}}\n```', ['角色甲']],
    ['```\n角色甲: {}\n```', ['角色甲']],
  ];
  for (const [input, names] of cases) {
    assert.deepEqual(parseStatDataRootNames(input), { ok: true, names });
  }
  assert.deepEqual(parseStatDataRootNames('"甲": {}\n" 甲 ": {}\n乙: {}'), { ok: true, names: ['甲', '乙'] });
});

test('returns exact failure reasons in precedence order', () => {
  assert.deepEqual(parseStatDataRootNames('  '), { ok: false, reason: 'macro-unexpanded' });
  assert.deepEqual(parseStatDataRootNames(`prefix ${STAT_DATA_MACRO}`), { ok: false, reason: 'macro-unexpanded' });
  assert.deepEqual(parseStatDataRootNames('```yaml\n角色甲: {}\n``` trailing'), { ok: false, reason: 'parse-error' });
  assert.deepEqual(parseStatDataRootNames('foo: ['), { ok: false, reason: 'parse-error' });
  for (const input of ['[]', 'null', '123', '文本']) {
    assert.deepEqual(parseStatDataRootNames(input), { ok: false, reason: 'not-object' });
  }
  assert.deepEqual(parseStatDataRootNames('{}'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseStatDataRootNames('"   ": {}'), { ok: false, reason: 'empty' });
});

test('macro adapter calls the exact macro and maps only source exceptions', () => {
  let received = '';
  const success = loadStatDataRootNames(source => { received = source; return '角色甲: {}'; });
  assert.equal(received, '{{format_message_variable::stat_data}}');
  assert.deepEqual(success, { ok: true, names: ['角色甲'] });
  assert.deepEqual(loadStatDataRootNames(() => { throw new Error('macro failed'); }), { ok: false, reason: 'source-error' });
});
