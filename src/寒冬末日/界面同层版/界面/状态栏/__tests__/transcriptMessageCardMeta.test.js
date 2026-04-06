const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const componentPath = path.resolve(
  __dirname,
  '../components/TranscriptMessageCard.vue',
);

test('TranscriptMessageCard no longer exposes SHOW_META meta-debug toggle or panel markup', () => {
  const source = fs.readFileSync(componentPath, 'utf8');

  assert.equal(source.includes('SHOW_META'), false);
  assert.equal(source.includes('HIDE_META'), false);
  assert.equal(source.includes('assistant-meta-panel'), false);
  assert.equal(source.includes('SHOW_DIAGNOSTICS'), false);
  assert.equal(source.includes('正文和剧情'), false);
  assert.equal(source.includes('ID: MSG-'), false);
});
