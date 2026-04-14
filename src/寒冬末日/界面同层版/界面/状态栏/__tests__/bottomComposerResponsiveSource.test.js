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
