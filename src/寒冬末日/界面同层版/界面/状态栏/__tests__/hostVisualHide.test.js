const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');
const helperPath = path.resolve(statusBarDir, 'hostVisualHide.ts');

test('host visual hide helper should keep host .mes nodes in the DOM and avoid default display:none', () => {
  assert.equal(
    fs.existsSync(helperPath),
    true,
    'host visual hide should live in a dedicated helper surface before the old host transcript visibility shim is removed',
  );

  const source = fs.readFileSync(helperPath, 'utf8');

  assert.match(source, /\.mes/);
  assert.doesNotMatch(source, /display\s*:\s*none/i);
  assert.match(source, /keepMesNodesInDom|preserveMesNodesInDom|retainMesNodesInDom/);
});
