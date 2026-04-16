const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('useStreamingDemo ties followLatest to readingMode so streaming tokens do not force-bottom-lock after the reader scrolls up', () => {
  const source = read('../useStreamingDemo.ts');

  assert.match(
    source,
    /const followLatest = computed\([\s\S]*transcriptWindowMode\.value === 'latest' && readingMode\.value === 'following_latest'[\s\S]*\);/,
    'followLatest should require both the latest transcript window and the reader scroll-follow mode',
  );
  assert.doesNotMatch(
    source,
    /const followLatest = computed\(\(\) => transcriptWindowMode\.value === 'latest'\);/,
    'latest transcript window mode should not keep auto-locking the viewport during streaming after the reader scrolls away',
  );
});

test('useStreamingDemo derives the reading-mode label from readingMode so the UI matches the actual scroll-follow state', () => {
  const source = read('../useStreamingDemo.ts');

  assert.doesNotMatch(source, /const readingModeLabel = computed\(\(\) => \(transcriptWindowMode\.value === 'latest'/);
  assert.match(source, /const readingModeLabel = computed\(\(\) => \(followLatest\.value \? '跟随最新' : '浏览历史'\)\);/);
});
