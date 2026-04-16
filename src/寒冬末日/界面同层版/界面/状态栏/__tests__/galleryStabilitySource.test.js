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

test('mobile transcript image FAB forwards the click event to the host-point proxy path', () => {
  const transcriptListSource = readSource('components/TranscriptList.vue');
  const storyPageSource = readSource('pages/StoryPage.vue');

  assert.match(transcriptListSource, /@click="handleImageButtonClick\(item\.message_id, \$event\)"/);
  assert.match(
    transcriptListSource,
    /\(event: 'generate-image', payload: \{ messageId: number; triggerEvent\?: MouseEvent \}\): void;/,
  );
  assert.match(transcriptListSource, /emit\('generate-image', \{ messageId, triggerEvent: event \}\);/);
  assert.match(
    storyPageSource,
    /async function handleTranscriptGenerateImage\(input: number \| \{ messageId: number; triggerEvent\?: MouseEvent \}\)/,
  );
  assert.match(storyPageSource, /await startTranscriptHostImageProxy\(messageId, triggerEvent \?\? null\);/);
  assert.doesNotMatch(storyPageSource, /await triggerImageGenerationForMessage\(messageId\);/);
});
