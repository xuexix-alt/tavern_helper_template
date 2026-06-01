const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

function extractFunctionBody(text, functionName) {
  const start = text.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const parenStart = text.indexOf('(', start);
  assert.notEqual(parenStart, -1, `${functionName} should have a parameter list`);
  let parenDepth = 0;
  let searchStart = parenStart;
  for (let index = parenStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        searchStart = index + 1;
        break;
      }
    }
  }
  const braceStart = text.indexOf('{', searchStart);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart + 1, index);
    }
  }
  throw new Error(`${functionName} body not found`);
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
    /appendUnanchoredToEnd: renderMode !== 'plugin-native-data'/,
  );
  assert.match(source, /buildFinalHtml\(artifactRenderSource, input\.id, artifactRenderSource\)/);
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
  const transcriptImageBody = extractFunctionBody(storyPageSource, 'handleTranscriptGenerateImage');

  assert.match(transcriptListSource, /@click="handleImageButtonClick\(item\.message_id, \$event\)"/);
  assert.match(transcriptListSource, /type TranscriptImageGenerateRequest = \{/);
  assert.match(transcriptListSource, /\(event: 'generate-image', payload: TranscriptImageGenerateRequest\): void;/);
  assert.match(transcriptListSource, /emit\('generate-image', \{ messageId, triggerEvent: event \}\);/);
  assert.doesNotMatch(transcriptListSource, /emit\('open-gallery', messageId\);/);
  assert.match(
    storyPageSource,
    /async function handleTranscriptGenerateImage\(request: TranscriptImageGenerateRequest \| number\)/,
  );
  assert.match(
    transcriptImageBody,
    /await triggerImageGenerationForMessage\(messageId, \{[\s\S]*hostPoint,[\s\S]*afterPrimaryTrigger: async \(\) => \{[\s\S]*await clickPluginImageGenerationMenuItem\(\)/,
  );
  assert.match(streamingSource, /type ImageGenerationTriggerOptions = \{/);
  assert.match(streamingSource, /afterPrimaryTrigger\?: \(\) => Promise<boolean \| void> \| boolean \| void;/);
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

test('transcript image generation leases a recent host window before dispatching plugin gestures', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(streamingSource, /const IMAGE_GENERATION_HANDOFF_TIMEOUT_MS = 4500;/);
  assert.match(streamingSource, /const PLUGIN_NATIVE_HOST_WINDOW_MESSAGE_COUNT = 3;/);
  assert.match(streamingSource, /function collectPluginNativeHostWindowMessageIds\(messageId: number\): number\[\]/);
  assert.match(
    streamingSource,
    /async function waitForPluginImageGenerationHandoff\(messageId: number\): Promise<boolean>/,
  );
  assert.match(
    streamingSource,
    /waitForPluginImageGenerationHandoff[\s\S]*syncPendingRequestHintsFromDom\(\)[\s\S]*imagePendingTaskManager\.getDebugState\(\)/,
  );
  assert.match(
    streamingSource,
    /const handoffSelector = `\$\{CHATU8_IMAGE_BUTTON_SELECTOR\}, \$\{CHATU8_IMAGE_SPAN_SELECTOR\}, \$\{CHATU8_IMAGE_CONTAINER_SELECTOR\}`;/,
  );
  assert.match(
    streamingSource,
    /const CHATU8_IMAGE_CONTAINER_SELECTOR = '\.ai-image-container';/,
    'same-layer should treat st-chatu8 ai-image-container as a native handoff marker too',
  );
  assert.match(
    streamingSource,
    /async function withPluginNativeMessageLease<T>\(\s*messageId: number,[\s\S]*const leaseMessageIds = collectPluginNativeHostWindowMessageIds\(normalizedId\);[\s\S]*hostVisualHideController\.leaseMessageIdsForPluginNativeHandoff\(\s*leaseMessageIds/,
  );
  assert.match(
    streamingSource,
    /withPluginNativeMessageLease[\s\S]*await setChatMessages\(\s*hiddenLeaseIds\.map\(id => \(\{ message_id: id, is_hidden: false \}\)\),\s*\{ refresh: 'affected' \},\s*\);/,
    'plugin handoff should materialize a bounded real host chat window instead of only toggling target data',
  );
  assert.match(
    streamingSource,
    /withPluginNativeMessageLease[\s\S]*await setChatMessages\(\s*hiddenLeaseIds\.map\(id => \(\{ message_id: id, is_hidden: true \}\)\),\s*\{ refresh: 'none' \},\s*\);/,
    'plugin handoff should keep the materialized host DOM in place when re-hiding it so st-chatu8 async tasks can continue',
  );
  assert.match(
    streamingSource,
    /await options\.beforeRelease\?\.\(\);[\s\S]*releasePluginNativeLease\(\);[\s\S]*queueHidePolicy\('plugin_native_bridge_resume'\);/,
  );
  assert.match(
    streamingSource,
    /beforeRelease: async \(\) => \{[\s\S]*await waitForPluginImageGenerationHandoff\(normalizedId\);/,
  );
  assert.match(
    streamingSource,
    /async function triggerImageGenerationForMessage[\s\S]*await withPluginNativeMessageLease\(\s*normalizedId,\s*async \(\) => \{/,
  );
  assert.match(
    streamingSource,
    /withPluginNativeMessageLease[\s\S]*dispatchHostPrimaryTrigger\(mesText, \{ hostPoint: options\.hostPoint \?\? null \}\)/,
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

test('generated image regenerate uses the plugin image click bridge instead of mes_text dblclick', () => {
  const storyPageSource = readSource('pages/StoryPage.vue');
  const targetSource = readSource('generatedImageTriggerTarget.ts');

  assert.match(storyPageSource, /function dispatchHostImageRegenerateTrigger\(target: HTMLElement\): boolean/);
  assert.match(storyPageSource, /target\.matches\?\.\('\.st-chatu8-image-button, button\.image-tag-button'\)/);
  assert.match(
    storyPageSource,
    /dispatchHostImageRegenerateTrigger\(targetNode\)/,
    'existing image regeneration should use the plugin generation.js click chain, not the mes_text trigger',
  );
  assert.doesNotMatch(storyPageSource, /dispatchHostDoubleClick\(targetNode, null, 'dblclick'\)/);
  assert.match(
    targetSource,
    /return input\.hostButton \?\? input\.hostImage \?\? null;/,
    'regenerate should only target host plugin image/button nodes and must not re-enter same-layer iframe nodes',
  );
  assert.match(
    targetSource,
    /return input\.hostImage \?\? input\.iframeImage \?\? input\.hostButton \?\? input\.iframeButton \?\? null;/,
    'preview should only target plugin image/button nodes and must not fall back to the whole mes_text root',
  );
  assert.doesNotMatch(
    targetSource,
    /hostMessageRoot \?\? input\.iframe/,
    'generated image actions should not prefer the host message root before iframe image targets',
  );
});

test('generated image tag gestures use the native image long-press bridge instead of a same-layer toast', () => {
  const storyPageSource = readSource('pages/StoryPage.vue');
  const tagBody = extractFunctionBody(storyPageSource, 'activateGeneratedImageTag');

  assert.match(storyPageSource, /function dispatchHostImageTagTrigger\(target: HTMLElement\): boolean/);
  assert.match(
    tagBody,
    /resolveGeneratedImageTriggerTarget\([\s\S]*'open'[\s\S]*\)/,
    'tag gestures should resolve the same exact plugin image/button target used by preview',
  );
  assert.match(
    tagBody,
    /dispatchHostImageTagTrigger\(targetNode\)/,
    'tag gestures should dispatch a native long-press/context-menu style gesture to the host image target',
  );
  assert.doesNotMatch(
    tagBody,
    /toastr\?\.info\?\.\(tagText, '图片 prompt tag'/,
    'long-press should not be consumed by a same-layer prompt toast',
  );
});
