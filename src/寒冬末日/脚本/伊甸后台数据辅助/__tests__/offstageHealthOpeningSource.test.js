const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSource() {
  return fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');
}

test('Eden helper reads opening world mode for offstage health settlement', () => {
  const source = readSource();

  assert.match(
    source,
    /function readOpeningWorldModeIdFromChat\(\)[\s\S]*stream_demo\.opening\.world_mode_id/,
    'Eden helper should read the selected opening world mode from chat variables',
  );
  assert.match(
    source,
    /const worldModeId = readOpeningWorldModeIdFromChat\(\);/,
    'offstage bundle should resolve the opening world mode once for the settlement pass',
  );
  assert.match(
    source,
    /computeOffstageHealthDelta\(deltaHours, sheltered, rules, \{ worldModeId \}\)/,
    'offstage health settlement should pass the opening world mode into the health algorithm',
  );
});
