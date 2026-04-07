const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('debug trace runtime exposes component activity summary helpers for console inspection', () => {
  const source = readSource('debugTrace.ts');

  assert.equal(
    source.includes('summarizeComponentActivity'),
    true,
    'debugTrace runtime should expose summarizeComponentActivity()',
  );
  assert.equal(
    source.includes('printComponentActivity'),
    true,
    'debugTrace runtime should expose printComponentActivity() for console.table output',
  );
});

test('TranscriptMessageCard records mount, update, hydrate, and bind traces', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    source.includes("scope: 'TranscriptMessageCard'"),
    true,
    'TranscriptMessageCard should emit component trace events',
  );
  assert.equal(source.includes("recordComponentTrace('mount'"), true, 'TranscriptMessageCard should trace mount');
  assert.equal(source.includes("recordComponentTrace('update'"), true, 'TranscriptMessageCard should trace update');
  assert.equal(
    source.includes("recordComponentTrace('hydrate_images'"),
    true,
    'TranscriptMessageCard should trace image hydration',
  );
  assert.equal(
    source.includes("recordComponentTrace('bind_interactions'"),
    true,
    'TranscriptMessageCard should trace interaction rebinding',
  );
});

test('GeneratedImageAsset and galleryGroups record component activity traces', () => {
  const assetSource = readSource('components/GeneratedImageAsset.vue');
  const demoSource = readSource('useStreamingDemo.ts');

  assert.equal(
    assetSource.includes("scope: 'GeneratedImageAsset'"),
    true,
    'GeneratedImageAsset should emit component trace events',
  );
  assert.equal(
    assetSource.includes("recordComponentTrace('resolve_source'"),
    true,
    'GeneratedImageAsset should trace source resolution',
  );
  assert.equal(demoSource.includes("scope: 'galleryGroups'"), true, 'galleryGroups recompute should be traced');
  assert.equal(demoSource.includes("event: 'recompute'"), true, 'galleryGroups should record recompute events');
});
