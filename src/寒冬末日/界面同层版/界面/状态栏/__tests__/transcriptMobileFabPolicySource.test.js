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

test('TranscriptList keeps the per-message image FAB out of the assistant footer controls at every width', () => {
  const source = read('../components/TranscriptList.vue');
  const imageFabRule = source.match(/^\.transcript-image-fab\s*\{([^}]*)\}/m)?.[1] ?? '';

  assert.match(imageFabRule, /position:\s*relative;/);
  assert.match(imageFabRule, /bottom:\s*auto;/);
  assert.match(imageFabRule, /right:\s*auto;/);
  assert.match(imageFabRule, /align-self:\s*flex-end;/);
  assert.doesNotMatch(
    imageFabRule,
    /position:\s*absolute;/,
    'the image FAB should stay in normal flow below the card instead of overlaying collapse/detail controls',
  );
});
