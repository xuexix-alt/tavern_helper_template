const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('auto update character script targets the xuexix-alt dist prefix', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');

  assert.match(
    source,
    /const BASE_URL = 'https:\/\/cdn\.jsdelivr\.net\/gh\/xuexix-alt\/tavern_helper_template@20260211\/dist\/寒冬末日';/,
  );
  assert.doesNotMatch(source, /StageDog\/tavern_helper_template@20260211\/dist\/寒冬末日/);
});
