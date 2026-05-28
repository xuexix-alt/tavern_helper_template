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

test('host visual hide helper has a plugin-native handoff lease that does not collapse the target mes', () => {
  const source = fs.readFileSync(helperPath, 'utf8');

  assert.match(source, /HOST_PLUGIN_NATIVE_LEASE_ATTR/);
  assert.match(source, /leaseMessageIdsForPluginNativeHandoff\(messageIds: number\[\]/);
  assert.match(source, /\[.*HOST_PLUGIN_NATIVE_LEASE_ATTR.*="true"\][\s\S]*visibility: visible !important;/);
  assert.match(source, /\[.*HOST_PLUGIN_NATIVE_LEASE_ATTR.*="true"\][\s\S]*height: auto !important;/);
  assert.match(source, /\[.*HOST_PLUGIN_NATIVE_LEASE_ATTR.*="true"\][\s\S]*max-height: none !important;/);
  assert.match(source, /root\.setAttribute\(HOST_PLUGIN_NATIVE_LEASE_ATTR, 'true'\);/);
  assert.match(source, /root\.removeAttribute\(HOST_PLUGIN_NATIVE_LEASE_ATTR\);/);
});
