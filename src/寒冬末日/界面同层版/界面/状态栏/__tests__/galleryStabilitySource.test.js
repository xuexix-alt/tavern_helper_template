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
  assert.match(source, /const entities = buildGeneratedImageEntities\(\{[\s\S]*memberships,/);
  assert.match(source, /const readyEntities = filterReadyGeneratedImageEntities\(entities\);/);
  assert.doesNotMatch(source, /for \(let i = 0; i < promptTokens\.length; i\+\+\)/);
});

test('transcript image FAB restores the historical direct trigger path instead of reusing the proxy chain', () => {
  const transcriptListSource = readSource('components/TranscriptList.vue');
  const storyPageSource = readSource('pages/StoryPage.vue');
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(transcriptListSource, /@click="handleImageButtonClick\(item\.message_id, \$event\)"/);
  assert.match(transcriptListSource, /type TranscriptImageGenerateRequest = \{/);
  assert.match(transcriptListSource, /\(event: 'generate-image', payload: TranscriptImageGenerateRequest\): void;/);
  assert.match(transcriptListSource, /emit\('generate-image', \{ messageId, triggerEvent: event \}\);/);
  assert.doesNotMatch(transcriptListSource, /emit\('open-gallery', messageId\);/);
  assert.match(
    storyPageSource,
    /async function handleTranscriptGenerateImage\(request: TranscriptImageGenerateRequest \| number\)/,
  );
  assert.match(storyPageSource, /await triggerImageGenerationForMessage\(messageId, \{ hostPoint \}\);/);
  assert.match(streamingSource, /type ImageGenerationTriggerOptions = \{/);
  assert.match(streamingSource, /dispatchHostPrimaryTrigger\(mesText, \{ hostPoint: options\.hostPoint \?\? null \}\)/);
  assert.doesNotMatch(
    streamingSource,
    /dispatchHostPrimaryTrigger\(mesText, \{ strategy: 'dblclick', hostPoint: options\.hostPoint \?\? null \}\)/,
  );
});

test('transcript image FAB keeps existing-image clicks on the LLM image popup and guards plugin menu position', () => {
  const transcriptListSource = readSource('components/TranscriptList.vue');
  const storyPageSource = readSource('pages/StoryPage.vue');

  assert.match(transcriptListSource, /再次生成图片/);
  assert.match(transcriptListSource, /messageImageCount\(item\.message_id\) > 0 \? '📷' : '🎨'/);
  assert.doesNotMatch(transcriptListSource, /messageImageCount\(messageId\);[\s\S]*emit\('open-gallery'/);
  assert.match(storyPageSource, /function guardPluginMenuViewport\(\): void/);
  assert.match(storyPageSource, /clampPluginMenuIntoViewport\(node\);/);
  assert.match(storyPageSource, /guardPluginMenuViewport\(\);[\s\S]*await triggerImageGenerationForMessage/);
});

test('transcript image generation temporarily suspends host visual hide before dispatching plugin gestures', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(streamingSource, /const releaseVisualHide = hostVisualHideController\.suspend\('bridge_visible'\);/);
  assert.match(streamingSource, /releaseVisualHide\(\);[\s\S]*queueHidePolicy\('bridge_resume'\);/);
  assert.match(
    streamingSource,
    /async function triggerImageGenerationForMessage[\s\S]*await withHostTranscriptVisible\(async \(\) => \{/,
  );
  assert.match(
    streamingSource,
    /withHostTranscriptVisible[\s\S]*dispatchHostPrimaryTrigger\(mesText, \{ hostPoint: options\.hostPoint \?\? null \}\)/,
  );
});

test('gallery lazily discovers older assistant images without a same-layer manifest or full history render', () => {
  const storyPageSource = readSource('pages/StoryPage.vue');
  const galleryPanelSource = readSource('components/ImageGalleryPanel.vue');
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(storyPageSource, /:loading-older="loadingOlderGalleryImages"/);
  assert.match(storyPageSource, /:has-more-older="hasMoreOlderGalleryImages"/);
  assert.match(storyPageSource, /@load-older="loadOlderGalleryImages"/);
  assert.match(galleryPanelSource, /\(event: 'load-older'\): void;/);
  assert.match(galleryPanelSource, /@scroll\.passive="handleGalleryScroll"/);
  assert.match(streamingSource, /const historicalGalleryGroups = ref<GalleryGroup\[\]>\(\[\]\);/);
  assert.match(streamingSource, /const GALLERY_HISTORY_SCAN_BATCH_SIZE = 24;/);
  assert.match(streamingSource, /async function loadOlderGalleryImages\(\)/);
  assert.match(streamingSource, /hostDomArtifacts: \[\],/);
  assert.match(
    streamingSource,
    /const galleryEntries = computed<GeneratedImageRef\[\]>\(\(\) => flattenGalleryGroupsForEntries\(mergedGalleryGroups\.value\)\);/,
  );
});

test('mobile transcript double-tap keeps the proxy chain and forwards the second touch event through the mobile path', () => {
  const storyPageSource = readSource('pages/StoryPage.vue');
  const dispatchPlanSource = readSource('hostCoordinateTarget.ts');

  assert.match(dispatchPlanSource, /preferPointFallback\?: boolean;/);
  assert.match(
    storyPageSource,
    /function dispatchHostDoubleClick\([\s\S]*strategy: HostGestureDispatchStrategy = 'auto'/,
  );
  assert.match(
    storyPageSource,
    /void startTranscriptHostImageProxy\(messageId, event, \{ preferPointTarget: true \}\);/,
  );
});
