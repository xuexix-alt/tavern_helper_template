const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveHostMessageRole } = require('../hostMessageRole.ts');

test('resolveHostMessageRole does not treat string false-like system hints as a real system reply', () => {
  assert.equal(
    resolveHostMessageRole({
      role: 'assistant',
      is_user: false,
      is_system: 'false',
    }),
    'assistant',
  );
});

test('resolveHostMessageRole still keeps real system messages as system', () => {
  assert.equal(
    resolveHostMessageRole({
      role: 'system',
      is_system: true,
    }),
    'system',
  );
});

test('resolveHostMessageRole keeps user messages as user', () => {
  assert.equal(
    resolveHostMessageRole({
      role: 'user',
      is_user: true,
    }),
    'user',
  );
});

test('resolveHostMessageRole treats character-named non-user replies as assistant even if host marks is_system=true', () => {
  assert.equal(
    resolveHostMessageRole({
      name: '末世寒冬 - 星穹秩序',
      is_user: false,
      is_system: true,
      mes: '[metacognition] 明月靠在软垫上……',
      extra: {
        api: 'custom',
        model: '假流式-gemini-3-flash-preview',
      },
    }),
    'assistant',
  );
});

test('resolveHostMessageRole keeps small system messages as system', () => {
  assert.equal(
    resolveHostMessageRole({
      name: 'System',
      is_user: false,
      is_system: true,
      extra: {
        isSmallSys: true,
      },
    }),
    'system',
  );
});

test('resolveHostMessageRole keeps typed system comments as system', () => {
  assert.equal(
    resolveHostMessageRole({
      name: 'System',
      is_user: false,
      is_system: true,
      extra: {
        type: 'comment',
      },
    }),
    'system',
  );
});
