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
  assert.match(source, /const promptTokenCompareSet = new Set\(promptTokens\.map\(normalizePromptTokenForCompare\)/);
  assert.match(source, /!promptTokenCompareSet\.has\(normalizePromptTokenForCompare\(image\.promptToken\)\)/);
  assert.match(
    source,
    /appendUnanchoredToEnd: renderMode !== 'plugin-native-data' \|\| hasPluginNativeArtifacts !== true/,
  );
  assert.match(source, /buildFinalHtml\(displayRenderSource, input\.id, input\.raw\)/);
  assert.doesNotMatch(source, /for \(let i = 0; i < promptTokens\.length; i\+\+\)/);
});

test('gallery membership tolerates plugin prompt-token whitespace normalization', () => {
  const membershipSource = readSource('generatedImageMembership.ts');

  assert.match(membershipSource, /import \{ normalizePromptTokenForCompare \} from '\.\/pluginNativeImageArtifacts';/);
  assert.match(
    membershipSource,
    /normalizePromptTokenForCompare\(entry\.promptToken\) === normalizePromptTokenForCompare\(promptToken\)/,
  );
});

test('transcript card hydrates pending placeholders from ready gallery entries', () => {
  const listSource = readSource('components/TranscriptList.vue');
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(listSource, /:gallery-entries="messageGalleryEntries\(item\.message_id\)"/);
  assert.match(cardSource, /function hydratePendingImagesFromGalleryEntries\(\)/);
  assert.match(cardSource, /root\.querySelectorAll\('\[data-raw-image-tag="true"\]'\)/);
  assert.match(cardSource, /target\.replaceWith\(figure\)/);
  assert.match(cardSource, /watch\(\s*galleryEntrySignature,/);
});

test('transcript card hydrates newly ready gallery entries even when the message already has images', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(cardSource, /function collectExistingGalleryImageKeys\(root: HTMLElement\): Set<string>/);
  assert.match(cardSource, /function collectGalleryEntryKeys\(entry: ReaderGalleryEntry\): string\[\]/);
  assert.match(cardSource, /const missingEntries = entries\.filter\(entry => \{/);
  assert.doesNotMatch(
    cardSource,
    /root\.querySelector\(`\.\$\{fallbackImageClasses\.inline\} img, \.\$\{fallbackImageClasses\.item\} img`\)\) return;/,
  );
  assert.match(cardSource, /appendMissingGalleryFigure\(root, entry\)/);
  assert.match(cardSource, /missingEntryCount: missingEntries\.length/);
});

test('native image reader falls back to swipe_info images when extra images are transient placeholders', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(source, /function flattenChatu8ImageRecords\(input: unknown\): Record<string, any>\[\]/);
  assert.match(source, /_\.get\(message, 'extra\.images', null\)/);
  assert.match(source, /_\.get\(message, \['swipe_info', swipeId, 'images'\], null\)/);
  assert.match(source, /return collectSelectedChatu8ImageEntries\(message\);/);
});

test('host DOM image reader pairs st-chatu8 buttons with adjacent generated imgs', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(source, /function resolvePluginGeneratedImageForButton\(/);
  assert.match(source, /button\.nextElementSibling/);
  assert.match(source, /button\.getAttribute\('data-image-tag'\) \?\? button\.getAttribute\('data-link'\)/);
  assert.match(source, /button\.dataset\.requestId \?\? button\.getAttribute\('data-request-id'\)/);
  assert.match(source, /extractAnchorTextForImageNode\(image, root\)/);
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
