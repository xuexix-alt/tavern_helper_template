const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('BottomComposer keeps the send button at least 44x44 in narrow layouts', () => {
  const source = read('../components/BottomComposer.vue');

  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.send-btn\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
  );
});

test('BottomComposer turns the busy send button into a cancel action', () => {
  const source = read('../components/BottomComposer.vue');

  assert.match(
    source,
    /type="button"[\s\S]{0,220}:disabled="!busy && !modelValue\.trim\(\)"[\s\S]{0,220}@click="busy \? cancelGeneration\(\) : submitFromComposer\(\)"/,
    'the primary button should remain clickable while busy so users can cancel a silent same-layer generation',
  );
  assert.match(
    source,
    /\(event: 'cancel-generation'\): void;/,
    'BottomComposer should emit a dedicated cancel event instead of overloading submit',
  );
  assert.match(source, /\{\{ busy \? '取消' : '发送' \}\}/, 'busy state should present a clear cancel label');
});
