const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
}

const page = read('pages/StoryPagePre.vue');
const appleHistory = read('components/PreAppleHistoryOverlay.vue');

test('normal PRE toolbar renders the shared floor slider', () => {
  assert.match(page, /import PreTranscriptFloorSlider from/);
  assert.match(page, /<PreTranscriptFloorSlider/);
  assert.match(page, /:minimum="transcriptDisplayMinimum"/);
  assert.match(page, /:maximum="transcriptTotalCount"/);
  assert.match(page, /@change="commitTranscriptFloorCount"/);
});

test('Apple history renders the same shared floor slider', () => {
  assert.match(appleHistory, /import PreTranscriptFloorSlider from/);
  assert.match(appleHistory, /<PreTranscriptFloorSlider/);
  assert.match(appleHistory, /emit\('floor-change', value\)/);
  assert.match(page, /@floor-change="commitTranscriptFloorCount"/);
});

test('MVU remains six-floor isolated and gallery receives no transcript floor prop', () => {
  assert.match(page, /<MvuRolePanel[\s\S]*:transcript-items="mvuTranscriptItems"/);
  const galleryTag = page.match(/<PreGalleryPanel[\s\S]*?\/>/)?.[0] ?? '';
  assert.doesNotMatch(galleryTag, /transcript|floor|display-count/);
});

test('the inert latest/all label menu is removed', () => {
  assert.doesNotMatch(page, /const transcriptWindowPages/);
  assert.doesNotMatch(page, /function selectTranscriptWindowPage/);
  assert.doesNotMatch(page, /transcriptWindowLabel/);
});
