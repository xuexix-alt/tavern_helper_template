const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(rel) {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
}

test('system store reads the physical latest floor before JS-Slash-Runner latest alias', () => {
  const storeSource = read('../mvuRoleStore.ts');

  assert.match(
    storeSource,
    /message_id:\s*'latest'[\s\S]*?latest non-system|latest non-system[\s\S]*?message_id:\s*'latest'/,
    'document why message_id:"latest" alone can miss system floors',
  );
  assert.match(storeSource, /function readLatestMvuStatData\(/);
  assert.match(storeSource, /readMvuStatData\(-1,\s*options\)/);
  assert.match(storeSource, /if \(physicalLatest\.ok\) return physicalLatest;/);
  assert.match(storeSource, /return readMvuStatData\('latest',\s*options\);/);
  assert.match(storeSource, /const current = readLatestMvuStatData\(\{ allowSystemOnly: true \}\);/);
  assert.doesNotMatch(
    storeSource,
    /const current = readMvuStatData\('latest',\s*\{ allowSystemOnly: true \}\);/,
    'system store must not rely solely on latest alias because it skips system messages in JS-Slash-Runner',
  );
});
