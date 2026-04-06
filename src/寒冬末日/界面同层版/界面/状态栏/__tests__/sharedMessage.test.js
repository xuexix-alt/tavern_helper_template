const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStreamDemoMessage, extractStreamDemoContent } = require('../../../shared/message.ts');

test('extractStreamDemoContent keeps the full wrapped payload when inner model output also contains <content> blocks', () => {
  const raw = [
    '<thinking>分析过程</thinking>',
    '<criteria>约束检查</criteria>',
    '<content>第一句。第二句。第三句。第四句。第五句。第六句。</content>',
    '<option>A. 继续观察</option>',
    '<UpdateVariable>{"op":"replace"}</UpdateVariable>',
  ].join('\n');

  const wrapped = buildStreamDemoMessage(raw, 'done');

  assert.equal(extractStreamDemoContent(wrapped), raw);
});
