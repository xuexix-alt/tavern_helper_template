const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('StoryPage ordinary send wiring should stop owning the submit path directly', () => {
  const source = read('../pages/StoryPage.vue');

  assert.doesNotMatch(
    source,
    /@submit="runDemo"/,
    'StoryPage should not directly own the ordinary send submit handler',
  );
});
