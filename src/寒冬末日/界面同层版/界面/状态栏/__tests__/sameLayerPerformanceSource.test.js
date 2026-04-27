const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

function assertNoConsoleLog(relativePath) {
  const source = readSource(relativePath);
  assert.equal(source.includes('console.log('), false, `${relativePath} should not log in UI hot paths`);
}

test('image gesture hot paths do not emit console.log noise', () => {
  assertNoConsoleLog('generatedImageGestureController.ts');
  assertNoConsoleLog('components/GeneratedImageAsset.vue');
  assertNoConsoleLog('components/TranscriptMessageCard.vue');
});

test('gallery and transcript images share the generated image gesture controller', () => {
  const gallerySource = readSource('components/GeneratedImageAsset.vue');
  const transcriptSource = readSource('components/TranscriptMessageCard.vue');

  for (const [name, source] of [
    ['GeneratedImageAsset', gallerySource],
    ['TranscriptMessageCard', transcriptSource],
  ]) {
    assert.equal(
      source.includes('createGeneratedImageGestureController'),
      true,
      `${name} should use the shared controller for click, double click and touch gestures`,
    );
    assert.equal(source.includes('handleTouchStart'), true, `${name} should support mobile touch start`);
    assert.equal(source.includes('handleTouchEnd'), true, `${name} should support mobile touch end`);
    assert.equal(source.includes('handleDoubleClick'), true, `${name} should support desktop double click`);
  }
});

test('TranscriptList pre-aggregates gallery image counts by message id', () => {
  const source = readSource('components/TranscriptList.vue');

  assert.equal(
    source.includes('const imageCountsByMessageId = computed'),
    true,
    'gallery image counts should be aggregated once per galleryEntries change',
  );

  const filterCount = (source.match(/\.filter\(e => e\.messageId === messageId\)/g) ?? []).length;
  assert.equal(filterCount, 0, 'messageImageCount should not scan galleryEntries for every template read');
});

test('TranscriptMessageCard only hydrates and rebinds assistant body when body html changes', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    source.includes('const assistantBodySignature = computed'),
    true,
    'assistant body work should be keyed by a stable html signature',
  );
  assert.equal(
    source.includes('watch(assistantBodySignature'),
    true,
    'assistant body work should be driven by signature changes',
  );
  assert.equal(
    source.includes('onUpdated(() =>'),
    false,
    'unrelated prop updates should not rescan and rebind assistant body DOM',
  );
});

test('StoryPage lazy mounts the image gallery drawer content while closed', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('<ImageGalleryPanel\n            v-if="galleryDrawerOpen"'),
    true,
    'closed gallery drawer should not mount gallery grouping and image asset components',
  );
});

test('StoryPage lets mobile mes-path touch events reach the native plugin after prewarming data', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('async function prepareTranscriptHostImageProxy'),
    true,
    'mobile transcript double tap should prewarm host mes_text without synthetic dispatch',
  );
  assert.equal(
    source.includes('void prepareTranscriptHostImageProxy(messageId);'),
    true,
    'mobile transcript double tap should register the pending image task before native plugin handling',
  );
  assert.equal(
    /void prepareTranscriptHostImageProxy\(messageId\);[\s\S]{0,220}touchStartTime = 0;[\s\S]{0,80}return;/.test(
      source,
    ),
    true,
    'mobile transcript double tap should return before calling preventDefault or stopPropagation',
  );
});

test('StoryPage keeps a lightweight role data provider and lazy mounts the full role panel', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('const roleProviderStore = useMvuRoleStore'),
    true,
    'StoryPage should keep role data available without mounting the full role panel',
  );
  assert.equal(
    source.includes('<MvuRolePanel\n            v-if="roleDrawerOpen"'),
    true,
    'closed role drawer should not mount the full role panel UI',
  );
  assert.equal(
    source.includes('function buildRoleTabItemsFromProvider'),
    true,
    'bottom role shortcuts should be derived from the lightweight provider',
  );
});
