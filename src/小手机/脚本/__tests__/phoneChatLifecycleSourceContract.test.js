const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');

const source = readSource('../小手机主程序/index.ts');

test('handleChatChanged follows the exact non-destructive sequence', () => {
  const body = extractFunctionBody(source, 'handleChatChanged');
  const tokens = [
    'if (chatId === currentChatId) return',
    'contextGeneration += 1',
    "bus.emit('chat-context-changed', { chatId, generation: contextGeneration })",
    'ChatCore?.abort?.()',
    'ChatSync?.cancelPending?.()',
    'goHome()',
    'phoneIframe?.hide()',
  ];
  let previous = -1;
  for (const token of tokens) {
    const index = body.indexOf(token);
    assert.ok(index > previous, `expected ordered ${token}`);
    previous = index;
  }
  assert.doesNotMatch(body, /destroy\(|\.remove\(|\.unmount\(|\$entry\.remove/);
});

test('destroy stops and clears the exact CHAT_CHANGED handle', () => {
  assert.match(source, /chatChangedHandle\s*=\s*eventOn\(tavern_events\.CHAT_CHANGED,\s*handleChatChanged\)/);
  const body = extractFunctionBody(source, 'destroy');
  assert.ok(body.indexOf('chatChangedHandle?.stop()') < body.indexOf('chatChangedHandle = null'));
});

test('PhoneSystem exports getContextGeneration', () => {
  const object = source.match(/const PhoneSystem\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(object);
  assert.match(object[1], /\bgetContextGeneration\b/);
});
