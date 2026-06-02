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
  assert.match(source, /appendUnanchoredToEnd: renderMode !== 'plugin-native-data'/);
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
    /function collectPluginImageGenerationHandoffProgress\(messageId: number\)[\s\S]*requestCount[\s\S]*promptButtonCount[\s\S]*promptPlaceholderCount[\s\S]*complete/,
    'plugin handoff wait should track all prompt buttons/placeholders instead of releasing after the first request',
  );
  assert.match(
    streamingSource,
    /const expectedRequestCount = Math\.max\(promptButtonCount, promptPlaceholderCount\);[\s\S]*requestCount >= expectedRequestCount/,
    'plugin handoff should wait until request binding catches up with the inserted prompt placeholders',
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
  assert.match(streamingSource, /const GALLERY_RECENT_NATIVE_SCAN_BATCH_SIZE = 48;/);
  assert.match(streamingSource, /async function loadOlderGalleryImages\(\)/);
  assert.match(
    streamingSource,
    /function discoverRecentNativeGalleryImages\(reason = 'gallery\.native_recent_scan', messageIds: number\[\] = \[\]\)/,
    'gallery should actively harvest native/plugin images from recent non-visible assistant messages',
  );
  assert.match(
    streamingSource,
    /window\.setTimeout\(\(\) => discoverRecentNativeGalleryImages\('mounted\.native_recent_gallery_scan'\), 700\);/,
    'same-layer boot should recover images generated while the UI was closed',
  );
  assert.match(
    streamingSource,
    /scheduleHostImageDataReconcile[\s\S]*discoverRecentNativeGalleryImages\(`\$\{reason\}:delay_\$\{delayMs\}`, normalizedMessageIds\);/,
    'successful plugin responses should harvest non-latest native gallery images during delayed host-data reconcile',
  );
  assert.match(streamingSource, /hostDomArtifacts: \[\],/);
  assert.match(
    streamingSource,
    /const galleryEntries = computed<GeneratedImageRef\[\]>\(\(\) => flattenGalleryGroupsForEntries\(mergedGalleryGroups\.value\)\);/,
  );
});

test('gallery and transcript image readers share native-first diagnostic probes', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(streamingSource, /scope: 'imageSourceResolver'[\s\S]*event: 'build_refs'/);
  assert.match(streamingSource, /variant: 'native-first'/);
  assert.match(streamingSource, /variant: 'host-dom-fallback'/);
  assert.match(streamingSource, /promptTokenCount: promptTokens\.length/);
  assert.match(streamingSource, /extraRecordCount: extraRecords\.length/);
  assert.match(streamingSource, /mesTagEntryCount: mesTagEntries\.length/);
  assert.match(streamingSource, /cacheEntryCount: cacheEntries\.length/);
  assert.match(streamingSource, /readyEntityCount: readyEntities\.length/);
  assert.match(streamingSource, /refCount: refs\.length/);
  assert.match(streamingSource, /scope: 'inlineImageHydration'[\s\S]*event: 'append_artifacts'/);
  assert.match(streamingSource, /dedupedInjectCount: dedupedImages\.length/);
  assert.match(streamingSource, /renderMode,/);
});

test('gallery records zero-hit cross-floor scans and explicit message-id scans', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(
    streamingSource,
    /const scanMode = explicitIds\.size > 0 \? 'explicit-message-ids' : 'recent-cross-floor';/,
  );
  assert.match(streamingSource, /recordLifecycleTrace\('galleryNativeRecentScan', 'probe'/);
  assert.match(streamingSource, /skippedReason: 'empty-chat'/);
  assert.match(streamingSource, /candidateCount: candidates\.length/);
  assert.match(streamingSource, /sampled: sampled\.slice\(0, 12\)/);
  assert.match(streamingSource, /knownCurrent: true/);
  assert.match(streamingSource, /imageCount: images\.length/);
  assert.match(
    streamingSource,
    /discoverRecentNativeGalleryImages\('host\.plugin_native_response_success:immediate', targetMessageIds\);/,
    'successful plugin responses should immediately probe explicit target message ids before delayed reconcile',
  );
  assert.match(streamingSource, /logImageBridge\('host-data-reconcile-probe'/);
  assert.match(streamingSource, /recordLifecycleTrace\('galleryHistoryScan', 'load_older_probe'/);
});

test('gallery history paging returns at most three image-bearing floors and reports zero-hit batches', () => {
  const streamingSource = readSource('useStreamingDemo.ts');
  const storyPageSource = readSource('pages/StoryPage.vue');
  const panelSource = readSource('components/ImageGalleryPanel.vue');

  assert.match(streamingSource, /const GALLERY_HISTORY_MAX_GROUPS_PER_LOAD = 3;/);
  assert.match(streamingSource, /const galleryOlderLastScanHadNoImages = ref\(false\);/);
  assert.match(
    streamingSource,
    /galleryOlderLastScanHadNoImages\.value = nextGroups\.length === 0 && scanned > 0 && !galleryHistoryExhausted\.value;/,
  );
  assert.match(streamingSource, /olderZeroHit: galleryOlderLastScanHadNoImages\.value,/);
  assert.match(storyPageSource, /:older-zero-hit="galleryOlderLastScanHadNoImages"/);
  assert.match(panelSource, /olderZeroHit\?: boolean;/);
  assert.match(panelSource, /这批历史楼层没有找到图片，可以继续往前查找。/);
  assert.match(panelSource, /props\.olderZeroHit \? '继续往前查找' : '继续加载历史图片'/);
});

test('gallery drawer starts an initial cache session before showing an empty state', () => {
  const streamingSource = readSource('useStreamingDemo.ts');
  const storyPageSource = readSource('pages/StoryPage.vue');
  const panelSource = readSource('components/ImageGalleryPanel.vue');

  assert.match(streamingSource, /const loadingInitialGalleryImages = ref\(false\);/);
  assert.match(streamingSource, /function startGalleryImageCacheSession\(reason = 'gallery\.drawer_open'\)/);
  assert.match(
    streamingSource,
    /const GALLERY_INITIAL_CACHE_RESCAN_DELAYS_MS = \[0, 300, 1200, 3000, 6000, 9000\] as const;/,
  );
  assert.match(streamingSource, /scanSelectedGalleryWindow\(`\$\{reason\}:initial_cache_\$\{delayMs\}`\);/);
  assert.match(storyPageSource, /startGalleryImageCacheSession\('gallery\.drawer_open'\);/);
  assert.match(storyPageSource, /:loading-initial="loadingInitialGalleryImages"/);
  assert.match(panelSource, /loadingInitial\?: boolean;/);
  assert.match(panelSource, /正在缓存当前图片/);
});

test('gallery uses a transcript-style single-select floor window instead of multi-select rescans', () => {
  const streamingSource = readSource('useStreamingDemo.ts');
  const storyPageSource = readSource('pages/StoryPage.vue');
  const panelSource = readSource('components/ImageGalleryPanel.vue');
  const doc = fs.readFileSync(
    path.resolve(statusBarDir, '../../../../..', 'docs/同层UI图片读取与画廊正文统一规范-v1.0.0.md'),
    'utf8',
  );

  assert.match(streamingSource, /const selectedGalleryWindowKey = ref<string>\(''\);/);
  assert.match(streamingSource, /const galleryWindowOptions = computed\(\(\) => transcriptWindowPages\.value\);/);
  assert.match(streamingSource, /function resolveDefaultGalleryWindowKey\(\): string/);
  assert.match(streamingSource, /function scanSelectedGalleryWindow\(reason = 'gallery\.window_selection'\)/);
  assert.match(streamingSource, /discoverRecentNativeGalleryImages\(reason, selectedGalleryWindowMessageIds\.value\);/);
  assert.match(streamingSource, /const galleryVisibleEntries = computed<GeneratedImageRef\[\]>/);
  assert.match(streamingSource, /recordLifecycleTrace\('galleryWindowSelection', 'scan'/);
  assert.match(storyPageSource, /:window-options="galleryWindowOptions"/);
  assert.match(storyPageSource, /:selected-window-key="selectedGalleryWindowKey"/);
  assert.match(storyPageSource, /@select-window="selectGalleryWindow"/);
  assert.match(panelSource, /windowOptions: TranscriptWindowPageOption\[\];/);
  assert.match(panelSource, /selectedWindowKey: string;/);
  assert.match(panelSource, /<select/);
  assert.doesNotMatch(panelSource, /type="checkbox"/);
  assert.match(panelSource, /楼层范围/);
  assert.match(doc, /画廊楼层选择采用正文同款窗口/);
  assert.match(doc, /单选/);
});

test('gallery selected floor window hydrates host-native plugin images once per selected window', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(streamingSource, /const GALLERY_WINDOW_NATIVE_HYDRATION_CHUNK_SIZE = 4;/);
  assert.match(streamingSource, /let galleryWindowHydrationSessionId = 0;/);
  assert.match(streamingSource, /let lastGalleryWindowHydrationSignature = '';/);
  assert.match(
    streamingSource,
    /async function hydrateSelectedGalleryWindowMessages\(reason: string, messageIds: number\[\]\): Promise<void>/,
  );
  assert.match(
    streamingSource,
    /function maybeHydrateSelectedGalleryWindowMessages\(reason: string, messageIds: number\[\]\)/,
  );
  assert.match(
    streamingSource,
    /const hydrationSignature = `\$\{selectedGalleryWindowKey\.value\}:\$\{hydrationIds\.join\(','\)\}`;/,
  );
  assert.match(streamingSource, /if \(hydrationSignature === lastGalleryWindowHydrationSignature\) return;/);
  assert.match(
    streamingSource,
    /hostVisualHideController\.leaseMessageIdsForPluginNativeHandoff\(\s*chunkIds,[\s\S]*gallery_window_native_hydration/,
  );
  assert.match(
    streamingSource,
    /await setChatMessages\(\s*hiddenChunkIds\.map\(id => \(\{ message_id: id, is_hidden: false \}\)\),\s*\{ refresh: 'affected' \},\s*\);/,
  );
  assert.match(streamingSource, /discoverRecentNativeGalleryImages\(`\$\{reason\}:native_host_hydration`, chunkIds\);/);
  assert.match(streamingSource, /queueGeneratedImageEntityRefresh\(chunkIds, `\$\{reason\}:native_host_hydration`\);/);
  assert.match(
    streamingSource,
    /await setChatMessages\(\s*hiddenChunkIds\.map\(id => \(\{ message_id: id, is_hidden: true \}\)\),\s*\{ refresh: 'none' \},\s*\);/,
  );
  assert.match(
    streamingSource,
    /maybeHydrateSelectedGalleryWindowMessages\(reason, selectedGalleryWindowMessageIds\.value\);/,
  );
  assert.doesNotMatch(
    streamingSource,
    /hydrateSelectedGalleryWindowMessages[\s\S]*selectTranscriptWindowPage\(/,
    'gallery hydration should not mutate the current transcript window selection',
  );
});

test('gallery retains current-window images after transient plugin rerenders clear computed groups', () => {
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.match(
    streamingSource,
    /const currentGroupsById = new Map\(galleryGroups\.value\.map\(group => \[group\.messageId, group\]\)\);/,
  );
  assert.match(streamingSource, /let retainedCurrent = 0;/);
  assert.match(
    streamingSource,
    /const currentGroup = currentGroupsById\.get\(messageId\);[\s\S]*historicalById\.set\(messageId, currentGroup\);[\s\S]*retainedCurrent \+= 1;/,
    'current window image groups should be retained before plugin rerenders can make galleryGroups temporarily empty',
  );
  assert.match(streamingSource, /imageCount: currentGroup\?\.images\.length \?\? 0,/);
  assert.match(streamingSource, /retainedCurrent,/);
  assert.match(streamingSource, /if \(discovered <= 0 && retainedCurrent <= 0\) return;/);
  assert.match(
    streamingSource,
    /const discoveryReason = retainedCurrent > 0 && discovered <= 0 \? `\$\{reason\}:retained_current` : reason;/,
    'retained current-page images should be traceable separately from newly discovered historical groups',
  );
  assert.match(streamingSource, /reason: discoveryReason,/);
});

test('gallery window picker stays compact and hides raw dataset labels from primary titles', () => {
  const panelSource = readSource('components/ImageGalleryPanel.vue');
  const assetSource = readSource('components/GeneratedImageAsset.vue');

  assert.match(panelSource, /grid-template-rows: auto auto minmax\(0, 1fr\);/);
  assert.match(panelSource, /function isRawGalleryLabel\(value: unknown\): boolean/);
  assert.match(panelSource, /function buildGalleryGroupTitle\(entry: ReaderGalleryEntry\)/);
  assert.match(
    panelSource,
    /function buildGalleryGroupSubtitle\(entry: ReaderGalleryEntry \| undefined, imageCount: number\)/,
  );
  assert.match(panelSource, /title: buildGalleryGroupTitle\(entry\),/);
  assert.match(panelSource, /subtitle: buildGalleryGroupSubtitle\(group\.entries\[0\], group\.entries\.length\),/);
  assert.match(panelSource, /\.gallery-window-picker\s*\{[\s\S]*border-radius: 14px;/);
  assert.match(panelSource, /\.gallery-window-select select\s*\{[\s\S]*width: 100%;/);
  assert.match(panelSource, /selectedWindowLabel/);
  assert.match(assetSource, /function isRawGalleryLabel\(value: unknown\): boolean/);
  assert.match(assetSource, /function buildCaptionPrimaryText\(\)/);
  assert.match(
    assetSource,
    /if \(props\.variant === 'gallery' && isRawGalleryLabel\(primary\)\) return `楼层 #\$\{props\.entry\.messageId\}`;/,
  );
});

test('image gallery and inline image handoff contract is documented', () => {
  const docPath = path.resolve(statusBarDir, '../../../../..', 'docs/同层UI图片读取与画廊正文统一规范-v1.0.0.md');
  const doc = fs.readFileSync(docPath, 'utf8');

  assert.match(doc, /统一入口是 `buildGeneratedImageRefsForMessage\(\)`/);
  assert.match(doc, /画廊必须支持跨当前楼层取图/);
  assert.match(doc, /`explicit-message-ids`/);
  assert.match(doc, /`recent-cross-floor`/);
  assert.match(doc, /`galleryNativeRecentScan \/ probe`/);
  assert.match(doc, /`inlineImageHydration \/ append_artifacts`/);
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
