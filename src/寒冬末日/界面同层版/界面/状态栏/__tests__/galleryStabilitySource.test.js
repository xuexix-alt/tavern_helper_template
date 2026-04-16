const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('gallery refs are built from native-first membership instead of raw prompt tokens only', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(source, /import \{ buildGeneratedImageMembership \} from '\.\/generatedImageMembership';/);
  assert.match(source, /const nativeRenderableImages = readNativeFirstRenderableImagesForMessage\(\{/);
  assert.match(source, /const persistedMembershipEntries = readNativeFirstMembershipForMessage\(\{/);
  assert.match(source, /const memberships = buildGeneratedImageMembership\(\{/);
  assert.match(source, /for \(const membership of memberships\)/);
  assert.doesNotMatch(source, /for \(let i = 0; i < promptTokens\.length; i\+\+\)/);
});

test('transcript image FAB restores the historical direct trigger path instead of reusing the proxy chain', () => {
  const transcriptListSource = readSource('components/TranscriptList.vue');
  const storyPageSource = readSource('pages/StoryPage.vue');

  assert.match(transcriptListSource, /@click="handleImageButtonClick\(item\.message_id, \$event\)"/);
  assert.match(transcriptListSource, /\(event: 'generate-image', messageId: number\): void;/);
  assert.match(transcriptListSource, /emit\('generate-image', messageId\);/);
  assert.match(storyPageSource, /async function handleTranscriptGenerateImage\(messageId: number\)/);
  assert.match(storyPageSource, /await triggerImageGenerationForMessage\(messageId\);/);
});

test('mobile transcript double-tap keeps the proxy chain and forwards the second touch event through the mobile path', () => {
  const storyPageSource = readSource('pages/StoryPage.vue');
  const dispatchPlanSource = readSource('hostCoordinateTarget.ts');

  assert.match(dispatchPlanSource, /preferPointFallback\?: boolean;/);
  assert.match(storyPageSource, /void startTranscriptHostImageProxy\(messageId, event, \{ preferPointTarget: true \}\);/);
});
