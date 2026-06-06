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

test('host plugin-native shadow window stays viewport-visible for mobile st-chatu8 scans', () => {
  const source = fs.readFileSync(helperPath, 'utf8');
  const shadowRule =
    source.match(/\[\$\{HOST_PLUGIN_NATIVE_SHADOW_ATTR\}="true"\] \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.notEqual(shadowRule, '', 'shadow window style rule should be present');
  assert.match(shadowRule, /visibility: visible !important;/);
  assert.match(shadowRule, /opacity: 0\.001 !important;/);
  assert.match(shadowRule, /min-height: 1px !important;/);
  assert.match(shadowRule, /max-height: 1px !important;/);
  assert.match(shadowRule, /height: auto !important;/);
  assert.match(shadowRule, /overflow: visible !important;/);
  assert.match(shadowRule, /transform: none !important;/);
  assert.doesNotMatch(
    shadowRule,
    /translateX\(-200vw\)|opacity: 0 !important|max-height: none !important/,
    'durable native shadow roots must stay in the viewport because st-chatu8 gates scans with getBoundingClientRect',
  );
});
