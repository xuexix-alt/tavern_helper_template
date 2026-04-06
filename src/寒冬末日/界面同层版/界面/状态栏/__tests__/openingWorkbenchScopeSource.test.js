const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

test('useStreamingDemo no longer permanently pins opening workbench scope to the first container-id snapshot', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /const isOpeningWorkbenchHost = initialContainerMessageId === 0;/);
  assert.match(source, /function isOpeningWorkbenchHostActive\(\)/);
});
