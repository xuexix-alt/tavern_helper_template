const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('TranscriptList compact mobile removes the scroll-fab gutter and hides the persistent rail', () => {
  const source = read('../components/TranscriptList.vue');

  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.transcript-card\.layout-compact \.transcript-scroller\s*\{[\s\S]*?padding-right:\s*0;/,
    'compact mobile should return the right prose gutter to the transcript instead of reserving FAB space',
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.transcript-card\.layout-compact \.transcript-fab-stack\s*\{[\s\S]*?display:\s*none;/,
    'compact mobile should not keep the persistent top/bottom FAB rail visible over the reading edge',
  );
});

test('TranscriptList compact mobile keeps the per-message image FAB visible for chatu8 actions', () => {
  const source = read('../components/TranscriptList.vue');

  assert.doesNotMatch(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.transcript-card\.layout-compact \.transcript-image-fab\s*\{[\s\S]*?display:\s*none;/,
    'compact mobile should not hide the 🎨/📷 trigger because it is the same-layer chatu8 entry point',
  );
});
