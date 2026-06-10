const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const braceStart = source.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${functionName} should have a body`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, index);
    }
  }
  throw new Error(`${functionName} body was not closed`);
}

test('transcript list keeps stable entry keys instead of remounting on render revision bumps', () => {
  const source = readSource('components/TranscriptList.vue');

  assert.equal(
    source.includes(':key="item.message_id"'),
    true,
    'TranscriptList should key entries by stable message id',
  );
  assert.equal(
    source.includes(':key="buildTranscriptEntryKey(item.message_id, renderRevision)"'),
    false,
    'TranscriptList should not remount every entry when renderRevision changes',
  );
});

test('host plugin native image mutations refresh gallery and targeted transcript items without full rebuild', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("queueGeneratedImageEntityRefresh(affectedMessageIds, 'host.plugin_native_dom_mutation');"),
    true,
    'native image DOM mutations should enter the per-message image refresh queue',
  );
  assert.equal(
    source.includes("scheduleUiRefresh(['transcriptItems', 'gallery'], reason, [messageId]);"),
    true,
    'queued image refreshes should refresh only the affected transcript item and gallery with a targeted message id',
  );
  assert.equal(
    source.includes("rebuildTranscript('host.plugin_native_dom_mutation')"),
    false,
    'native image DOM mutations should not trigger a full transcript rebuild',
  );
  assert.equal(
    source.includes('const hasReadyNativeImageMutation = records.some(hasReadyChatu8Mutation);'),
    true,
    'native image DOM mutation refreshes should be gated behind ready-image mutations instead of button placeholders',
  );
  assert.match(
    source,
    /const CHATU8_MUTATION_ATTRIBUTE_FILTER = \[[\s\S]*'src'[\s\S]*'data-request-id'[\s\S]*'data-stable-id'[\s\S]*'data-prompt-token'[\s\S]*'data-image-id'[\s\S]*'data-image-tag'[\s\S]*'data-link'[\s\S]*\] as const;/,
    'plugin native observers should also watch late dataset updates that bind DOM hints to requests',
  );
  assert.equal(
    source.includes('attributeFilter: CHATU8_MUTATION_ATTRIBUTE_FILTER,'),
    true,
    'host and same-layer native image observers should share the plugin mutation attribute filter',
  );
});

test('same-layer asks the st-chatu8 iframe processor to claim visible image prompts before probing refs', () => {
  const source = readSource('useStreamingDemo.ts');
  const loadBody = extractFunctionBody(source, 'loadPluginNativeIframeProcessorModule');
  const resolveBody = extractFunctionBody(source, 'resolvePluginNativeSameLayerPromptScanRoot');
  const collectBody = extractFunctionBody(source, 'collectUnclaimedSameLayerChatu8PromptRoots');
  const scanBody = extractFunctionBody(source, 'runPluginNativeSameLayerPromptScan');
  const reconcileBody = extractFunctionBody(source, 'schedulePluginNativePromptPlaceholderReconcile');

  assert.equal(
    source.includes("'/scripts/extensions/third-party/st-chatu8/utils/iframe/index.js'"),
    true,
    'same-layer should import the live st-chatu8 iframe processor module that exports the direct element scanner',
  );
  assert.equal(
    source.includes("'/scripts/extensions/third-party/st-chatu8/utils/iframe.js'"),
    true,
    'same-layer should also try the st-chatu8 iframe re-export when folder index imports are not served',
  );
  assert.match(
    loadBody,
    /for \(const url of PLUGIN_NATIVE_IFRAME_PROCESSOR_MODULE_URLS\)[\s\S]*import\(\/\* @vite-ignore \*\/ url\)/,
    'same-layer should try every known st-chatu8 iframe processor URL before falling back',
  );
  assert.match(
    loadBody,
    /pluginNativeIframeProcessorModulePromise = null;/,
    'a failed st-chatu8 processor import should not be cached forever because the extension may become reachable later',
  );
  assert.match(
    source,
    /type PluginNativeIframeProcessorModule = \{[\s\S]*processImagePlaceholdersForElement\?: \(element: Element\)[\s\S]*processAllImagePlaceholders\?:/,
    'same-layer should accept the plugin direct element scanner export when it exists',
  );
  assert.match(
    scanBody,
    /collectUnclaimedSameLayerChatu8PromptRoots\(messageIds\)/,
    'same-layer scanner should only wake the plugin for unresolved visible prompt roots',
  );
  assert.match(
    source,
    /function resolvePluginNativeSameLayerPromptScanRoot\(root: HTMLElement\): HTMLElement/,
    'same-layer should resolve a plugin-visible ancestor before invoking the st-chatu8 direct scanner',
  );
  assert.match(
    resolveBody,
    /root\.closest\('\.assistant-card, \.assistant-message, \.transcript-entry, \.mes'\)/,
    'same-layer prompt scans should lift .mes_text bodies to a stable message/root container before plugin visibility checks',
  );
  assert.doesNotMatch(
    resolveBody,
    /\.mes_text/,
    'same-layer prompt scan root resolution must not return the fragile body node as the closest match',
  );
  assert.match(
    collectBody,
    /const scanRoot = resolvePluginNativeSameLayerPromptScanRoot\(root\);[\s\S]*seen\.add\(scanRoot\);[\s\S]*roots\.push\(scanRoot\);/,
    'unresolved assistant bodies should be claimed through the visible scan root the plugin will accept',
  );
  assert.match(
    scanBody,
    /await processor\.processImagePlaceholdersForElement\(scanRoot\)/,
    'same-layer should pass each plugin-visible scan root into the plugin native scanner',
  );
  assert.match(
    scanBody,
    /await processor\.processAllImagePlaceholders\(\)/,
    'same-layer should fall back to the plugin full scan when the direct element export is unavailable',
  );
  assert.match(
    scanBody,
    /await nudgePluginNativePromptProcessingForActiveIntent\(reason, normalizedMessageIds, roots\);/,
    'when the plugin scanner cannot be imported, same-layer should still wake the active floor so raw image prompts can become buttons',
  );
  assert.match(
    reconcileBody,
    /const promptScanMessageIds = resolveActivePluginNativePromptScanMessageIds\(normalizedMessageIds\);[\s\S]*void runPluginNativeSameLayerPromptScan\(reason, promptScanMessageIds\);[\s\S]*syncPendingRequestHintsFromDom\(\);/,
    'placeholder reconcile should wake the plugin scanner only for the active handoff target before reading DOM hints',
  );
});

test('missing st-chatu8 prompt scanner falls back to an active-intent native render nudge only for target floors', () => {
  const source = readSource('useStreamingDemo.ts');
  const nudgeBody = extractFunctionBody(source, 'nudgePluginNativePromptProcessingForActiveIntent');

  assert.match(
    nudgeBody,
    /if \(!shouldRunPluginNativePromptScan\(reason, normalizedMessageIds\)\) return;/,
    'scanner-missing fallback must keep the same current-generation gate as the normal prompt scan',
  );
  assert.match(
    nudgeBody,
    /await ensureHostMesTextRendered\(messageId\)/,
    'scanner-missing fallback should materialize only the targeted host mes_text before asking the plugin to process it',
  );
  assert.match(
    nudgeBody,
    /tavern_events\.CHARACTER_MESSAGE_RENDERED[\s\S]*eventEmit\(/,
    'scanner-missing fallback should emit the same rendered-message signal that wakes st-chatu8 after MVU reprocessing',
  );
  assert.match(
    nudgeBody,
    /collectPluginImageGenerationHandoffProgress\(messageId\)[\s\S]*triggerPendingPluginNativePromptButtons\('prompt_scan_module_missing_nudge', messageId, handoffProgress\)/,
    'after the native nudge has materialized prompt buttons, the existing scoped button fallback should take over',
  );
  assert.doesNotMatch(
    nudgeBody,
    /collectVisibleAssistantMessageIds|hydrateVisibleImageMessages|hydrateRecentPluginNativeHostWindow|hydrateSelectedGalleryWindowMessages/,
    'scanner-missing fallback must not reuse history hydration paths or broaden to every visible historical floor',
  );
});

test('gallery recomputation is isolated behind a gallery revision instead of transcript dom revision', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(source.includes('const galleryRevision = ref(0);'), true, 'gallery should track its own revision');
  assert.equal(
    source.includes("if (domains.includes('gallery')) {\n      galleryRevision.value += 1;\n    }"),
    true,
    'gallery refreshes should increment galleryRevision',
  );
  assert.equal(
    source.includes('void galleryRevision.value;'),
    true,
    'galleryGroups should depend on galleryRevision instead of transcriptDomRevision',
  );
  assert.equal(
    source.includes('void transcriptDomRevision.value;'),
    false,
    'galleryGroups should not recompute from transcriptDomRevision anymore',
  );
});

test('generated image revision tracking is scoped per message instead of one global counter', () => {
  const revisionSource = readSource('generatedImageEntityRevision.ts');
  const assetSource = readSource('components/GeneratedImageAsset.vue');

  assert.equal(
    revisionSource.includes('const generatedImageEntityRevision = ref(0);'),
    false,
    'generated image revisions should not use a single global ref anymore',
  );
  assert.equal(
    revisionSource.includes('new Map<number, number>()'),
    true,
    'generated image revisions should be stored per message id',
  );
  assert.equal(
    assetSource.includes('readGeneratedImageEntityRevision(props.entry.messageId)'),
    true,
    'GeneratedImageAsset should watch only its own message-scoped revision',
  );
});

test('plugin-native render mode is decided from original host message roots, not same-layer transcript roots', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const iframeRoots = resolveIframeAssistantRoots(messageId);'),
    true,
    'appendChatu8ArtifactsToHtml should still keep same-layer roots as a fallback source',
  );
  assert.equal(
    source.includes('const originalHostRoots = collectOriginalHostMessageRoots(messageId);'),
    true,
    'appendChatu8ArtifactsToHtml should resolve the real Tavern-rendered message roots separately',
  );
  assert.equal(
    source.includes('const hasPluginNativeArtifacts = countPluginNativeImageArtifacts(originalHostRoots) > 0;'),
    true,
    'render mode should only treat original host plugin-native DOM as already rendered',
  );
  assert.equal(
    source.includes(
      'const existingRoots = [...resolveIframeAssistantRoots(messageId), ...resolveDisplayedMessageRoots(messageId)];',
    ),
    false,
    'host displayed message roots should not suppress iframe-side image injection',
  );
});

test('gallery image refs are built from canonical image entities instead of sequential native fallback matching', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const entities = buildGeneratedImageEntities({'),
    true,
    'gallery refs should be built from canonical image entities',
  );
  assert.equal(
    source.includes('const matchedImage = findMatchingNativeImage(membership, index);'),
    false,
    'gallery refs should stop assigning native images by per-membership fallback matching',
  );
  assert.equal(
    source.includes('id: `host-dom-${messageId}-${image.requestId ?? index}-${index}`,'),
    true,
    'gallery refs should fall back to message-scoped host DOM images when entity matching produces no ready entries',
  );
});

test('gallery output is rebuilt directly from transcript groups without same-layer manifest persistence', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("from './galleryCatalogPersistence'"),
    false,
    'plugin-native gallery should not import a same-layer manifest persistence helper',
  );
  assert.equal(
    source.includes(
      'const galleryEntries = computed<GeneratedImageRef[]>(() => flattenGalleryGroupsForEntries(mergedGalleryGroups.value));',
    ),
    true,
    'gallery entries should flatten directly from transcript-derived groups and lazy history groups',
  );
  assert.equal(
    source.includes('buildGeneratedImageRefsForMessage({'),
    true,
    'gallery groups should continue to be derived from per-message plugin-native refs',
  );
  assert.equal(
    source.includes("if (item.role !== 'assistant' || item.isOpening) continue;"),
    false,
    'gallery groups should not permanently exclude opening assistant messages with ready images',
  );
  assert.equal(
    source.includes("if (item.role !== 'assistant') continue;"),
    false,
    'visible gallery groups should try every visible floor and let image discovery decide whether the floor contributes',
  );
});

test('same-layer no longer persists its own gallery manifest or binary cache', () => {
  const source = readSource('useStreamingDemo.ts');
  const typesSource = readSource('types.ts');

  assert.equal(
    source.includes('readGalleryManifestRecord'),
    false,
    'plugin-native path should not rehydrate a same-layer gallery manifest',
  );
  assert.equal(
    source.includes('writeGalleryManifestRecord'),
    false,
    'plugin-native path should not persist a same-layer gallery manifest',
  );
  assert.equal(
    source.includes('storeGalleryBinary'),
    false,
    'plugin-native path should not write a same-layer binary image store',
  );
  assert.equal(
    typesSource.includes('storageKey?: string;'),
    false,
    'GeneratedImageRef should not carry same-layer storageKey metadata',
  );
  assert.equal(
    typesSource.includes("cacheState?: 'ready' | 'missing' | 'not_cached';"),
    false,
    'GeneratedImageRef should not carry same-layer cacheState metadata',
  );
});

test('GeneratedImageAsset resolves sources from plugin-native runtime only', () => {
  const assetSource = readSource('components/GeneratedImageAsset.vue');

  assert.equal(
    assetSource.includes("from '../galleryBinaryStore'"),
    false,
    'GeneratedImageAsset should not import a same-layer gallery binary store',
  );
  assert.equal(
    assetSource.includes('readGeneratedImageSourceAsync'),
    true,
    'GeneratedImageAsset should still use async plugin-native resolution when sync lookup misses',
  );
  assert.equal(
    assetSource.includes('loadGalleryBinaryAsObjectUrl'),
    false,
    'GeneratedImageAsset should not fall back to same-layer IndexedDB object URLs',
  );
  assert.equal(
    assetSource.includes('IndexedDB'),
    false,
    'GeneratedImageAsset active UI comments should not promise IndexedDB restore fallbacks',
  );
});

test('TranscriptMessageCard does not restore idb image refs through active UI runtime', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    cardSource.includes("from '../imageStore'"),
    false,
    'TranscriptMessageCard should not import the deprecated same-layer imageStore',
  );
  assert.equal(
    cardSource.includes('loadImage('),
    false,
    'TranscriptMessageCard should not call imageStore.loadImage() to restore idb:// refs',
  );
  assert.equal(
    cardSource.includes('hydratePersistedImageElements'),
    false,
    'TranscriptMessageCard should not run active idb:// hydration over rendered transcript HTML',
  );
  assert.equal(
    cardSource.includes('img[src^="idb://"]'),
    false,
    'TranscriptMessageCard should not scan rendered transcript HTML for idb:// restore candidates',
  );
});

test('pending request hint heartbeat also syncs host image data changes from message text and extra images', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("syncTranscriptItemsFromHostData('host.plugin_native_data_sync');"),
    true,
    'pending request hint syncing should also reconcile host-side image data changes',
  );
  assert.equal(
    source.includes('const rawMessage = resolveHostMessageText(message).trim();'),
    true,
    'host image data signature should include the MVU-preserving host raw message text',
  );
  assert.equal(
    source.includes("const extraImages = _.get(message, 'extra.images', null);"),
    true,
    'host image data signature should include extra.images payloads',
  );
});

test('successful image generation responses actively reconcile host image data', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('onResponseSuccess: ({ requestId,'),
    true,
    'successful plugin-native image responses should not rely only on DOM mutation observers',
  );
  assert.match(
    source,
    /onRequest:\s*\(\{\s*requestId,\s*prompt\s*\}\)\s*=>\s*\{[\s\S]*?syncPendingRequestHintsFromDom\(\);\s*const requestBinding = imagePendingTaskManager\.registerRequest/,
    'plugin-native image requests should bind request ids from DOM hints before success responses arrive',
  );
  assert.equal(
    source.includes("syncTranscriptItemsFromHostData('host.plugin_native_response_success',"),
    true,
    'successful plugin-native image responses should force a host image data sync for affected messages',
  );
  assert.match(
    source,
    /const responseMessageIds =\s*targetMessageIds\.length > 0\s*\?\s*targetMessageIds\s*:\s*collectPluginNativeHandoffMessageIds\(\{ requestId, prompt \}\);/,
    'successful plugin-native image responses without exact task bindings should still target recent handoff floors',
  );
  assert.match(
    source,
    /function normalizePluginNativeHandoffMessageId\(value: unknown\): number \| null \{[\s\S]*if \(value == null \|\| value === ''\) return null;/,
    'plugin-native handoff id normalization should not coerce missing response bindings into floor 0',
  );
  assert.match(
    source,
    /\[matchedResponse\?\.messageId, recentIntent\?\.messageId\][\s\S]*\.map\(normalizePluginNativeHandoffMessageId\)[\s\S]*\.filter\(\(id\): id is number => id != null\)/,
    'successful response targeting should ignore absent matched/recent ids before falling back to recent assistant floors',
  );
  assert.equal(
    source.includes("queueGeneratedImageEntityRefresh(responseMessageIds, 'host.plugin_native_response_success');"),
    true,
    'successful plugin-native image responses should force transcript/gallery refresh even when signatures were not snapshotted yet',
  );
  assert.equal(
    source.includes("queueGeneratedImageEntityRefresh([], 'host.plugin_native_response_success:untargeted');"),
    true,
    'untargeted successful plugin-native image responses should still force a broad generated-image refresh',
  );
  assert.equal(
    source.includes(
      "void hydrateVisibleImageMessages('host.plugin_native_response_success:untargeted_visible_hydration');",
    ),
    true,
    'untargeted successful plugin-native image responses should hydrate visible host messages instead of waiting for the next MVU event',
  );
  assert.equal(
    source.includes(
      'const HOST_IMAGE_RESPONSE_RECONCILE_DELAYS_MS = [120, 360, 900, 1800, 3600, 7200, 15000, 30000] as const;',
    ),
    true,
    'successful plugin-native image responses should keep polling long enough for delayed mobile native extra.images saves',
  );
  assert.equal(
    source.includes('queueGeneratedImageEntityRefresh(normalizedMessageIds, `${reason}:delay_${delayMs}`);'),
    true,
    'delayed response reconcile should force a targeted transcript/gallery probe even when host data signatures do not change',
  );
  assert.equal(
    source.includes("scheduleHostImageDataReconcile('host.plugin_native_response_success', responseMessageIds);"),
    true,
    'successful plugin-native image responses should reconcile delayed native image data without requiring UI reload',
  );
  assert.match(
    source,
    /void hydratePluginNativeResponseMessages\('host\.plugin_native_response_success', responseMessageIds\);/,
    'targeted successful plugin-native image responses should materialize host message DOM instead of waiting for MVU MESSAGE_UPDATED',
  );
  assert.match(
    source,
    /void refreshHostMessagesForPluginNativeImageCompletion\(\s*'host\.plugin_native_response_success',\s*responseMessageIds,?\s*\);/,
    'targeted successful plugin-native image responses should explicitly wake the host message DOM after the plugin writes image data',
  );
  assert.match(
    source,
    /async function refreshHostMessagesForPluginNativeImageCompletion\(\s*reason: string,\s*messageIds: number\[\],?\s*\): Promise<void>/,
    'image completion should use a dedicated host-DOM refresh helper instead of overloading trigger-time preparation',
  );
  assert.match(
    source,
    /pluginNativeImageCompletionRefresh[\s\S]*await ensureHostMesTextRendered\(messageId\)[\s\S]*await refreshHostMessageForPluginNativeImageTrigger\(messageId\)[\s\S]*syncTranscriptItemsFromHostData\(`\$\{reason\}:host_dom_refresh`, normalizedMessageIds\)/,
    'image completion refresh should materialize mes_text, emit host wake events, then resync the targeted same-layer item',
  );
  assert.match(
    source,
    /async function hydratePluginNativeResponseMessages\(reason: string, messageIds: number\[\]\): Promise<void>/,
    'plugin-native response hydration should have a dedicated targeted helper',
  );
  assert.match(
    source,
    /for \(const delayMs of \[120, 360, 900, 1800, 3600\] as const\)/,
    'targeted response hydration should keep probing across the mobile delay window where plugin images land after success',
  );
  assert.equal(
    source.includes('hostImageDataReconcileTimers.forEach(timer => window.clearTimeout(timer));'),
    true,
    'delayed host image data reconcile timers should be cleaned up on unmount',
  );
});

test('plugin LLM image responses actively trace prompt placeholder handoff before image requests arrive', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes(
      'function schedulePluginNativePromptPlaceholderReconcile(reason: string, messageIds: number[] = [])',
    ),
    true,
    'same-layer should have a dedicated reconcile path for the image### prompt placeholder stage',
  );
  assert.equal(
    /const PLUGIN_NATIVE_PROMPT_PLACEHOLDER_RECONCILE_DELAYS_MS = \[\s*0,\s*120,\s*360,\s*900,\s*1800,\s*3600,\s*7200,\s*15000,\s*30000,\s*\] as const;/.test(
      source,
    ),
    true,
    'prompt placeholder reconcile should cover the mobile gap between ch-llm-image-gen-response and generate-image-request',
  );
  assert.equal(
    source.includes("recordLifecycleTrace('pluginNativePromptPlaceholderReconcile', 'probe'"),
    true,
    'prompt placeholder reconcile should emit probe diagnostics so mobile/PC failures show which stage stalled',
  );
  assert.equal(
    source.includes("schedulePluginNativeHostRenderHandoff('plugin_native_llm_image_generation_response', payload);"),
    true,
    'the st-chatu8 LLM image response event should enter the host render handoff path for the recent same-layer target',
  );
  assert.equal(
    source.includes(
      "schedulePluginNativePromptPlaceholderReconcile('host.plugin_native_response_success', responseMessageIds);",
    ),
    true,
    'real image responses should also leave a post-response breadcrumb for late placeholder/extra.images updates',
  );
  assert.equal(
    /function triggerPendingPluginNativePromptButtons\(\s*reason: string,\s*messageId: number,\s*handoffProgress: PluginImageGenerationHandoffProgress,\s*\): number/.test(
      source,
    ),
    true,
    'same-layer should have a scoped fallback for materialized plugin prompt buttons that do not enter generate-image-request on mobile',
  );
  assert.match(
    source,
    /hasActivePluginNativePromptHandoff\(messageId\)/,
    'prompt-button fallback should only run for the active same-layer transcript generation handoff',
  );
  assert.match(
    source,
    /pluginNativePromptButtonTriggerAt|PLUGIN_NATIVE_PROMPT_BUTTON_FALLBACK_DEDUPE_MS|hasReadyImageNearPluginNativeButton\(button\)/,
    'prompt-button fallback should dedupe clicks and skip buttons that already own a ready generated image',
  );
  assert.match(
    source,
    /waitForPluginImageGenerationHandoff[\s\S]*elapsedMs >= PLUGIN_NATIVE_PROMPT_BUTTON_FALLBACK_TRIGGER_GRACE_MS[\s\S]*triggerPendingPluginNativePromptButtons\('imageGenerationHandoff', normalizedId, handoffProgress\)/,
    'prompt-button fallback should live inside the bounded handoff wait instead of becoming a global DOM auto-click loop',
  );
  assert.equal(
    source.includes('syncPendingRequestHintsFromDom();'),
    true,
    'same-layer should still observe plugin prompt placeholders and request hints',
  );
  assert.match(
    source,
    /syncTranscriptItemsFromHostData\(`\$\{reason\}:prompt_placeholder_delay_\$\{delayMs\}`, normalizedMessageIds\);[\s\S]*queueGeneratedImageEntityRefresh\(normalizedMessageIds, `\$\{reason\}:prompt_placeholder_delay_\$\{delayMs\}`\);/,
    'prompt placeholder reconcile should refresh same-layer state without clicking plugin buttons',
  );
});

test('plugin prompt scans and fallback clicks are authorized by active handoff instead of recent intent', () => {
  const source = readSource('useStreamingDemo.ts');
  const scheduleBody = extractFunctionBody(source, 'schedulePluginNativePromptPlaceholderReconcile');
  const scanGateBody = extractFunctionBody(source, 'shouldRunPluginNativePromptScan');
  const fallbackGuardBody = extractFunctionBody(source, 'shouldTriggerPendingPluginNativePromptButtons');
  const beginPendingTaskBody = extractFunctionBody(source, 'beginPendingImageTask');
  const waitBody = extractFunctionBody(source, 'waitForPluginImageGenerationHandoff');

  assert.match(
    source,
    /let activePluginNativePromptHandoff: PluginNativePromptHandoff \| null = null;/,
    'same-layer should track an explicit active prompt handoff separate from 10-minute recent intent',
  );
  assert.match(
    source,
    /function beginPluginNativePromptHandoff\(messageId: number, source: 'transcript' \| 'gallery' = 'transcript'\)/,
    'starting a generation should open a short-lived prompt handoff session',
  );
  assert.match(
    beginPendingTaskBody,
    /if \(source === 'transcript'\) \{[\s\S]*beginPluginNativePromptHandoff\(normalizedId, source\);[\s\S]*\}/,
    'manual transcript image-generation proxy paths should also open the active prompt handoff',
  );
  assert.match(
    source,
    /function finishPluginNativePromptHandoff\(messageId: number, reason: string\)/,
    'the active prompt handoff should be closed after observe/timeout/cancel paths',
  );
  assert.doesNotMatch(
    scanGateBody,
    /imageRecentIntentStore\.read\(\)|recentIntent/,
    'prompt scanning must not use recent intent as authorization because history loads can still have a fresh recent intent',
  );
  assert.match(
    scanGateBody,
    /readActivePluginNativePromptHandoff\(\)/,
    'prompt scanning should be authorized by the explicit active handoff session',
  );
  assert.doesNotMatch(
    scheduleBody,
    /imageRecentIntentStore\.read\(\)|recentIntent\?\.messageId/,
    'placeholder reconcile must not append recentIntent to the scan set and make the gate self-fulfilling',
  );
  assert.match(
    scheduleBody,
    /readActivePluginNativePromptHandoff\(\)[\s\S]*activeHandoff\.messageId/,
    'placeholder reconcile may only add the active handoff target when no concrete target was supplied',
  );
  assert.doesNotMatch(
    fallbackGuardBody,
    /imageRecentIntentStore\.read\(\)|recentIntent/,
    'button fallback must not click plugin buttons merely because a stale recent intent matches the message id',
  );
  assert.match(
    fallbackGuardBody,
    /hasActivePluginNativePromptHandoff\(messageId\)/,
    'button fallback should require the explicit active prompt handoff for that message',
  );
  assert.match(
    waitBody,
    /finishPluginNativePromptHandoff\(normalizedId, 'observed'\)/,
    'observed handoff completion should close the active prompt handoff',
  );
  assert.match(
    waitBody,
    /finishPluginNativePromptHandoff\(normalizedId, 'timeout'\)/,
    'handoff timeout should close the active prompt handoff so later UI loads cannot wake old prompts',
  );
});

test('prompt-button fallback does not retrigger once the same-layer handoff already has plugin activity', () => {
  const source = readSource('useStreamingDemo.ts');
  const guardBody = extractFunctionBody(source, 'shouldTriggerPendingPluginNativePromptButtons');

  assert.match(
    source,
    /if \(!shouldTriggerPendingPluginNativePromptButtons\(messageId, handoffProgress\)\) return 0;/,
    'prompt-button fallback should run through one central guard before collecting/clicking buttons',
  );
  assert.match(
    guardBody,
    /handoffProgress\.requestCount > 0[\s\S]{0,160}return false;/,
    'fallback should not click prompt buttons after any generate-image-request has been observed for the floor',
  );
  assert.match(
    guardBody,
    /handoffProgress\.hintCount > 0[\s\S]{0,160}return false;/,
    'fallback should not click prompt buttons after stableId or prompt hints have already bound the floor',
  );
  assert.match(
    guardBody,
    /hasActivePluginNativeLlmImageGenerationRequest\(\)[\s\S]{0,160}return false;/,
    'fallback should not click while st-chatu8 is still in the LLM-image request stage',
  );
  assert.match(
    guardBody,
    /isWithinPluginNativeLlmImageGenerationResponseGrace\(\)[\s\S]{0,160}return false;/,
    'fallback should not click during the post-response grace window where plugin DOM may still be catching up',
  );
});

test('same-layer listens to current st-chatu8 regex and rendered-message handoff events', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("const CHATU8_REGEX_TEST_MESSAGE_EVENT = 'regex-st-chatu8-test-message';"),
    true,
    'current st-chatu8 emits a regex test event before same-layer prompt placeholder insertion',
  );
  assert.equal(
    source.includes("const CHATU8_REGEX_RESULT_MESSAGE_EVENT = 'regex-st-chatu8-result-message';"),
    true,
    'current st-chatu8 emits a regex result event before same-layer prompt placeholder insertion',
  );
  assert.equal(
    source.includes("const CHATU8_AUTO_CLICK_COMPLETE_EVENT = 'st_chatu8_auto_click_complete';"),
    true,
    'current st-chatu8 emits auto-click completion after its body insertion pass',
  );
  assert.match(
    source,
    /const CHATU8_AUTO_CLICK_COMPLETE_EVENTS = \[\s*CHATU8_AUTO_CLICK_COMPLETE_EVENT,\s*'st-chatu8:auto_click_complete'\s*,?\s*\] as const;/,
    'same-layer should listen to both st-chatu8 auto-click completion spellings seen in the plugin modules',
  );
  assert.match(
    source,
    /\.\.\.CHATU8_AUTO_CLICK_COMPLETE_EVENTS\.map\(eventName =>\s*eventOn\(eventName as any,[\s\S]*schedulePluginNativeHostRenderHandoff\('plugin_native_auto_click_complete'/,
    'same-layer should route every st-chatu8 auto-click completion spelling through the same host render handoff',
  );
  assert.match(
    source,
    /eventOn\(CHATU8_REGEX_RESULT_MESSAGE_EVENT as any,[\s\S]*schedulePluginNativeHostRenderHandoff\('plugin_native_regex_result_message'/,
    'same-layer should reconcile after the plugin regex result pass, before image generation responses arrive',
  );
  assert.match(
    source,
    /eventOn\(tavern_events\.CHARACTER_MESSAGE_RENDERED,[\s\S]*schedulePluginNativeHostRenderHandoff\('plugin_native_character_message_rendered'/,
    'same-layer should reconcile after Tavern has rendered the plugin-mutated character message DOM',
  );
  assert.equal(
    source.includes('function collectPluginNativeHandoffMessageIds(payload: unknown = null): number[]'),
    true,
    'event payloads should be normalized into targeted message ids instead of relying only on the latest assistant id',
  );
  assert.match(
    source,
    /collectRecentAssistantMessageIdsForPluginNativeHandoff\(\)\.forEach\(remember\);/,
    'LLM image response events without message ids should still refresh recent assistant floors on mobile',
  );
});

test('plugin-native placeholder-only DOM mutations trigger prompt reconciliation before src is ready', () => {
  const source = readSource('useStreamingDemo.ts');
  const sameLayerObserverStart = source.indexOf('generatedImageDomObserver = new MutationObserver');
  assert.notEqual(sameLayerObserverStart, -1, 'should find same-layer generated image mutation observer');
  const sameLayerObserverEnd = source.indexOf(
    'hostPluginMutationObservers = bindHostPluginMutationObservers',
    sameLayerObserverStart,
  );
  assert.notEqual(sameLayerObserverEnd, -1, 'should find host observer after same-layer observer');
  const sameLayerObserverBody = source.slice(sameLayerObserverStart, sameLayerObserverEnd);
  const hostObserverStart = sameLayerObserverEnd;
  const hostObserverEnd = source.indexOf('rebuildTranscript();', hostObserverStart);
  assert.notEqual(hostObserverEnd, -1, 'should find host observer end before mounted transcript rebuild');
  const hostObserverBody = source.slice(hostObserverStart, hostObserverEnd);

  assert.match(
    sameLayerObserverBody,
    /if \(!hasReadyNativeImageMutation\) \{[\s\S]*schedulePluginNativePromptPlaceholderReconcile\([\s\S]*'same_layer\.plugin_native_placeholder_dom_mutation'[\s\S]*affectedMessageIds[\s\S]*\);[\s\S]*return;[\s\S]*\}/,
    'same-layer document observer should reconcile prompt placeholders even when plugin buttons exist before img src',
  );
  assert.match(
    hostObserverBody,
    /if \(!hasReadyNativeImageMutation\) \{[\s\S]*schedulePluginNativePromptPlaceholderReconcile\([\s\S]*'host\.plugin_native_placeholder_dom_mutation'[\s\S]*affectedMessageIds[\s\S]*\);[\s\S]*return;[\s\S]*\}/,
    'host document observer should reconcile prompt placeholders even when plugin buttons exist before img src',
  );
});

test('same-layer boot hydrates a bounded native host window before relying on persisted image entities', () => {
  const source = readSource('useStreamingDemo.ts');
  const hydrateRecentBody = extractFunctionBody(source, 'hydrateRecentPluginNativeHostWindow');

  assert.equal(
    source.includes('async function hydrateRecentPluginNativeHostWindow(reason: string): Promise<void>'),
    true,
    'same-layer reload should have a bounded native host hydration path for plugin-native images',
  );
  assert.match(
    source,
    /function collectRecentPluginNativeHydrationMessageIds\(\): number\[\][\s\S]*PLUGIN_NATIVE_HOST_ASSISTANT_ANCHOR_COUNT[\s\S]*collectPluginNativeHostWindowMessageIds/,
    'boot hydration should stay bounded to three assistant anchors and the six-floor native shadow window',
  );
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*hostVisualHideController\.leaseMessageIdsForPluginNativeHandoff\([\s\S]*native_host_hydration/,
    'hydration should keep materialized host messages user-invisible while plugin DOM is rebuilt',
  );
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*await setChatMessages\([\s\S]*is_hidden: false[\s\S]*\{ refresh: 'affected' \}/,
    'hydration must force affected host messages to render instead of only toggling hidden data',
  );
  assert.doesNotMatch(
    hydrateRecentBody,
    /await setChatMessages\([\s\S]*is_hidden: true[\s\S]*\{ refresh: 'none' \}/,
    'hydration should keep the bounded host shadow window physically rendered so late mobile plugin image DOM can land',
  );
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*queueGeneratedImageEntityRefresh\(messageIds, `\$\{reason\}:native_host_hydration`\)/,
    'hydration should immediately refresh same-layer image entities after native DOM has had a chance to rebuild',
  );
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*for \(const delayMs of \[180, 800, 1800\]\)[\s\S]*discoverRecentNativeGalleryImages\(`\$\{reason\}:native_host_hydration_delay_\$\{delayMs\}`, messageIds\);/,
    'hydration should scan repeatedly before restoring hidden host messages because mobile plugin DOM can arrive late',
  );
  assert.match(
    source,
    /window\.setTimeout\(\(\) => void hydrateRecentPluginNativeHostWindow\('mounted\.host_plugin_native_hydration'\), 250\);/,
    'mounted same-layer UI should run the native host hydration probe, not just recompute existing iframe DOM',
  );
});

test('same-layer keeps three assistant anchors as a six-floor native shadow window instead of hiding every host floor', () => {
  const source = readSource('useStreamingDemo.ts');
  const visualHideSource = readSource('hostVisualHide.ts');
  const applyHidePolicyBody = extractFunctionBody(source, 'applyHidePolicy');
  const syncHostVisualHideBody = extractFunctionBody(source, 'syncHostVisualHideFromCurrentState');

  assert.equal(
    source.includes('const TRANSCRIPT_UI_WINDOW_SIZE = 6;'),
    true,
    'same-layer reader window should show three assistant turns plus their adjacent user floors',
  );
  assert.equal(
    source.includes('const PLUGIN_NATIVE_HOST_ASSISTANT_ANCHOR_COUNT = 3;'),
    true,
    'plugin-native host window should be anchored by three recent assistant floors',
  );
  assert.equal(
    source.includes('const PLUGIN_NATIVE_HOST_SHADOW_WINDOW_MESSAGE_COUNT = 6;'),
    true,
    'plugin-native host shadow window should keep six recent host floors materialized',
  );
  assert.match(
    source,
    /function collectNativeShadowWindowMessageIds\([\s\S]*PLUGIN_NATIVE_HOST_SHADOW_WINDOW_MESSAGE_COUNT/,
    'hide policy should compute a bounded host shadow window from chat metas',
  );
  assert.match(
    applyHidePolicyBody,
    /const nativeShadowWindowIds = collectNativeShadowWindowMessageIds\(\);[\s\S]*\.filter\(item => !nativeShadowWindowIds\.includes\(item\.message_id\)\)[\s\S]*is_hidden: true/,
    'hide policy should hide only floors outside the native shadow window',
  );
  assert.match(
    applyHidePolicyBody,
    /const showPatch = nativeShadowWindowIds[\s\S]*\.map\(id => \(\{ message_id: id, is_hidden: false \}\)\);[\s\S]*await setChatMessages\(showPatch, \{ refresh: 'affected' \}\)/,
    'hide policy should keep the native shadow window rendered instead of depending on later hydration',
  );
  assert.match(
    source,
    /function hasHostMessageDom\(messageId: number\): boolean/,
    'hide policy should be able to detect shadow-window messages that are visible in data but missing from host DOM',
  );
  assert.match(
    applyHidePolicyBody,
    /item\.is_hidden === true \|\| !hasHostMessageDom\(id\)/,
    'shadow-window floors created with refresh:none should be materialized even when their is_hidden flag is already false',
  );
  assert.match(
    syncHostVisualHideBody,
    /hostVisualHideController\.applyNativeShadowWindow\(nativeShadowWindowIds/,
    'visual hide sync should apply an explicit plugin-native shadow state to the materialized host window',
  );
  assert.match(
    visualHideSource,
    /applyNativeShadowWindow\(messageIds: number\[\]/,
    'host visual hide helper should expose a durable native shadow-window API',
  );
});

test('same-layer boot starts a lightweight gallery image cache session without waiting for the drawer click', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /window\.setTimeout\(\(\) => startGalleryImageCacheSession\('mounted\.initial_gallery_cache', 'boot'\), 300\);/,
    'initial same-layer image hydration should run lightweight gallery cache probes before the user opens the drawer',
  );
  assert.match(
    source,
    /startGalleryImageCacheSession[\s\S]*const delays = mode === 'boot' \? GALLERY_BOOT_CACHE_RESCAN_DELAYS_MS : GALLERY_DRAWER_CACHE_RESCAN_DELAYS_MS;[\s\S]*scheduleUiRefresh\(\['gallery'\], `\$\{reason\}:initial_cache_\$\{delayMs\}`\);[\s\S]*scanSelectedGalleryWindow\(`\$\{reason\}:initial_cache_\$\{delayMs\}`\);/,
    'boot cache probes should also refresh gallery state so delayed mobile native images are not missed',
  );
  assert.match(
    source,
    /const GALLERY_BOOT_CACHE_RESCAN_DELAYS_MS = \[1200, 5000, 12000, 24000\] as const;/,
    'boot cache probes should keep scanning after slower mobile DOM and metadata hydration',
  );
});

test('same-layer gallery ref cache must not freeze partial multi-prompt image batches', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function shouldCacheGeneratedImageRefsForMessage\([\s\S]*promptTokenCount[\s\S]*refs[\s\S]*if \(promptTokenCount > 1 && refs\.length > 0 && refs\.length < promptTokenCount\) return false;/,
    'multi-prompt messages should keep rebuilding refs until every prompt has had a chance to surface',
  );
  assert.match(
    source,
    /const cachedRefs = readCachedGeneratedImageRefsForMessage\(\{[\s\S]*promptTokenCount: promptTokens\.length,[\s\S]*\}\);/,
    'cache reads should know the expected prompt count so old partial entries can be discarded',
  );
  assert.match(
    source,
    /if \(!shouldCacheGeneratedImageRefsForMessage\(\{ promptTokenCount: promptTokens\.length, refs \}\)\) return refs;[\s\S]*writeCachedGeneratedImageRefsForMessage\(\{/,
    'native-first refs should return partial batches without writing them into the gallery ref cache',
  );
  assert.match(
    source,
    /if \(!shouldCacheGeneratedImageRefsForMessage\(\{ promptTokenCount: promptTokens\.length, refs: fallbackRefs \}\)\)\s*return fallbackRefs;[\s\S]*writeCachedGeneratedImageRefsForMessage\(\{/,
    'host DOM fallback refs should also avoid caching partial multi-prompt batches',
  );
});

test('same-layer gallery initial probes continue after the first image in a multi-image mobile batch', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function startGalleryImageCacheSession(');
  assert.notEqual(start, -1, 'should find startGalleryImageCacheSession');
  const end = source.indexOf('watch(', start);
  assert.notEqual(end, -1, 'should find watch block after initial cache session');
  const body = source.slice(start, end);

  assert.match(
    body,
    /const shouldKeepProbing = hasPartialVisibleMultiPromptGalleryBatch\(\);/,
    'initial gallery probes should detect whether the visible batch is still partial',
  );
  assert.match(
    body,
    /if \(\(galleryVisibleEntries\.value\.length > 0 \|\| galleryEntries\.value\.length > 0\) && !shouldKeepProbing\) \{/,
    'finding one image should not cancel later probes while a multi-prompt batch is still incomplete',
  );
});

test('same-layer transcript preserves plugin-native prompt placeholders before ready image responses', () => {
  const source = readSource('useStreamingDemo.ts');
  const appendStart = source.indexOf('function appendChatu8ArtifactsToHtml(');
  assert.notEqual(appendStart, -1, 'should find appendChatu8ArtifactsToHtml');
  const appendEnd = source.indexOf('function resolveDisplayedMessageRoots', appendStart);
  assert.notEqual(appendEnd, -1, 'should find next helper after appendChatu8ArtifactsToHtml');
  const appendBody = source.slice(appendStart, appendEnd);

  assert.equal(
    source.includes('function hydratePluginNativePromptPlaceholdersHtml('),
    true,
    'same-layer should have a helper that can copy plugin-native button/placeholder HTML into transcript html',
  );
  assert.match(
    appendBody,
    /hydratePluginNativePromptPlaceholdersHtml\(\s*htmlWithImages,\s*originalHostRoots\.length > 0\s*\?\s*originalHostRoots\s*:\s*iframeRoots\.length > 0\s*\?\s*iframeRoots\s*:\s*resolveDisplayedMessageRoots\(messageId\),\s*nativeFirstArtifacts,\s*\)/,
    'appendChatu8ArtifactsToHtml should hydrate native prompt placeholders from real host-rendered DOM before same-layer fallbacks',
  );
  assert.doesNotMatch(
    appendBody,
    /return htmlWithImages;\s*}/,
    'appendChatu8ArtifactsToHtml should not return only ready-image html and drop prompt placeholder/button artifacts',
  );
  assert.match(
    source,
    /const nativePromptTokenTargets = collectNativePromptTokenPlacementTargets\(doc\.body\);[\s\S]*takeNativePromptTokenPlacementTarget\(nativePromptTokenTargets, placeholder\.tokenCompare\);[\s\S]*nativePromptTarget\.replaceWith\(replacement\);/,
    'plugin-native prompt placeholders should replace matching image### placement markers instead of collecting at the message tail',
  );
  assert.match(
    source,
    /const key = tokenCompare \|\| fallbackKey \|\| element\.outerHTML;/,
    'duplicated plugin-native placeholders should dedupe by prompt token before falling back to request-specific keys',
  );
  assert.match(
    source,
    /if \(placedCount > 0 \|\| nativePromptTokenTargets\.length > 0\) \{[\s\S]*return doc\.body\.innerHTML;[\s\S]*\}/,
    'when prompt markers exist, unmatched plugin placeholder leftovers should not be appended as a duplicate tail strip',
  );
  assert.match(
    source,
    /hintByTokenCompare\.delete\(placeholder\.tokenCompare\);[\s\S]*resolveInlineAnchorTarget\(doc\.body, placeholder\.anchorText\);[\s\S]*reference\.after\(replacement\);/,
    'plugin-native prompt placeholders should fall back to regex anchor placement without duplicating token-marker replacements',
  );
  assert.match(
    source,
    /extraImages: readChatu8ExtraImageRecords\(messageId\),/,
    'native placement hints should read raw st-chatu8 extra image records so regex anchors survive before src is available',
  );
});

test('same-layer mirrored plugin-native placeholders do not keep response-target request ids', () => {
  const source = readSource('useStreamingDemo.ts');
  const domSource = readSource('pluginNativeImageDom.ts');
  const activationSource = readSource('generatedImageActivation.ts');
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    domSource.includes('function sanitizeSameLayerPluginNativeRequestIds(html: string): string'),
    true,
    'same-layer should have a sanitizer for plugin-native mirrored request ids',
  );
  assert.equal(
    domSource.includes('function sanitizeSameLayerPluginNativeRequestIdElements('),
    true,
    'same-layer should also sanitize plugin-native request ids that are inserted after v-html mount',
  );
  assert.equal(
    domSource.includes('element.setAttribute(SAME_LAYER_REQUEST_ID_ATTR, requestId);') &&
      domSource.includes("element.removeAttribute('data-request-id');"),
    true,
    'sanitizer should move native response-target data-request-id to a same-layer private attribute',
  );
  assert.equal(
    source.includes('sanitizeSameLayerPluginNativeRequestIds(stripVisibleChatu8PromptTokensHtml(htmlWithArtifacts))'),
    true,
    'same-layer final HTML should sanitize mirrored plugin-native request ids before v-html renders it',
  );
  assert.equal(
    cardSource.includes('return sanitizeSameLayerPluginNativeRequestIds(stripVisibleChatu8PromptTokensHtml(html));'),
    true,
    'transcript card final v-html should sanitize any plugin-native ids added after transcript assembly',
  );
  assert.equal(
    (cardSource.match(/sanitizeSameLayerPluginNativeRequestIdElements\(root\);/g) ?? []).length >= 3,
    true,
    'transcript card should sanitize mounted plugin-native DOM before hydration and interaction binding',
  );
  assert.equal(
    cardSource.includes("attributeFilter: ['data-request-id'],") &&
      cardSource.includes('observeAssistantBodyPluginNativeRequestIds(root, disposers);'),
    true,
    'transcript card should keep sanitizing plugin-native request ids that are inserted asynchronously',
  );
  assert.equal(
    activationSource.includes('carrierDataset.samelayerRequestId') &&
      activationSource.includes('targetDataset.samelayerRequestId'),
    true,
    'same-layer interactions should still parse the private request id for host bridge actions',
  );
  assert.equal(
    cardSource.includes('carrier.dataset.samelayerRequestId') &&
      cardSource.includes('candidate.dataset.samelayerRequestId'),
    true,
    'transcript card prompt lookup should match same-layer private request ids',
  );
});

test('same-layer prompt placeholder hydration imports the prompt token extractor it calls', () => {
  const source = readSource('useStreamingDemo.ts');
  const importStart = source.indexOf("} from './hostBridge';");
  assert.notEqual(importStart, -1, 'should import hostBridge helpers');
  const importBlockStart = source.lastIndexOf('import {', importStart);
  assert.notEqual(importBlockStart, -1, 'should find hostBridge import block');
  const importBlock = source.slice(importBlockStart, importStart);

  assert.match(
    source,
    /function hydratePluginNativePromptPlaceholdersHtml\([\s\S]*extractPromptToken\(/,
    'placeholder hydration should extract tokens from native button/span payloads',
  );
  assert.match(
    importBlock,
    /\bextractPromptToken\b/,
    'extractPromptToken must be imported before placeholder hydration calls it',
  );
});

test('transcript card traces native prompt token scan state before and after hydration', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(
    cardSource,
    /function collectNativePromptTokenScanState\(root: HTMLElement\)/,
    'transcript card should collect whether image### markers, plugin buttons, and placeholders coexist in the rendered DOM',
  );
  assert.match(
    cardSource,
    /recordNativePromptTokenScanState\('assistant_body_signature:before_hydration'\)/,
    'card should trace marker state before same-layer gallery hydration can replace markers',
  );
  assert.match(
    cardSource,
    /recordNativePromptTokenScanState\('assistant_body_signature:after_bind'\)/,
    'card should trace marker state after plugin/native carriers are bound',
  );
  assert.match(
    cardSource,
    /recordComponentTrace\('native_prompt_token_scan'/,
    'trace should be visible in the same-layer debug trace stream during mobile plugin failures',
  );
});

test('plugin-native host handoff scans host documents only, never the same-layer iframe document', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function collectHostDocuments(): Document[]');
  assert.notEqual(start, -1, 'should find collectHostDocuments');
  const end = source.indexOf('function collectPluginNativeHandoffDiagnostics', start);
  assert.notEqual(end, -1, 'should find next helper after collectHostDocuments');
  const body = source.slice(start, end);

  assert.match(
    body,
    /collectReachableHostDocuments\(\)\.filter\(doc => doc !== document\)/,
    'plugin-native trigger and handoff probes must not mistake same-layer transcript DOM for the original chat DOM',
  );
});

test('same-layer host rendered html falls back to host mes_text when plugin-native placeholders are already inserted', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function readHostRenderedMessageHtml(');
  assert.notEqual(start, -1, 'should find readHostRenderedMessageHtml');
  const end = source.indexOf('const RAW_IMAGE_TAG_PATTERN', start);
  assert.notEqual(end, -1, 'should find next section after readHostRenderedMessageHtml');
  const body = source.slice(start, end);

  assert.match(
    source,
    /function readHostMesTextRenderedHtmlFromRoots\(message_id: number\)/,
    'same-layer should read host .mes_text innerHTML directly when retrieveDisplayedMessage is stale or wrapper-only',
  );
  assert.match(
    body,
    /const rootHtml = readHostMesTextRenderedHtmlFromRoots\(normalizedId\);[\s\S]*if \(rootHtml\) return rootHtml;/,
    'host mes_text placeholder/button html should be preferred before giving up on host rendered html',
  );
});

test('gallery image regeneration keeps a gallery recent intent through the native response refresh path', () => {
  const source = readSource('useStreamingDemo.ts');
  const storySource = readSource('pages/StoryPage.vue');
  const activationSource = readSource('generatedImageActivation.ts');

  assert.equal(
    activationSource.includes("source?: 'transcript' | 'gallery';"),
    true,
    'generated image activation payloads should preserve whether the gesture came from the transcript or gallery',
  );
  assert.equal(
    source.includes(
      "function beginPendingImageTask(messageId: number, source: 'transcript' | 'gallery' = 'transcript')",
    ),
    true,
    'pending image tasks should accept gallery as a first-class intent source',
  );
  assert.equal(
    storySource.includes("const intentSource = payload?.source === 'gallery' ? 'gallery' : 'transcript';"),
    true,
    'StoryPage should pass gallery regenerate gestures into the pending task manager as gallery intents',
  );
  assert.match(
    source,
    /\[matchedResponse\?\.messageId, recentIntent\?\.messageId\][\s\S]*\.map\(normalizePluginNativeHandoffMessageId\)/,
    'successful native responses should refresh the recent gallery message as well as transcript-triggered messages',
  );
});

test('StoryPage can hide duplicate tail gallery images while keeping the gallery drawer data source', () => {
  const source = readSource('pages/StoryPage.vue');
  const cardSource = readSource('components/TranscriptMessageCard.vue');
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const showTailGalleryImages = ref(false);'),
    true,
    'tail gallery image strip should default to hidden so正文 image interaction remains gallery-only',
  );
  assert.equal(
    source.includes(':show-tail-gallery-images="showTailGalleryImages"'),
    true,
    'StoryPage should pass the tail-image visibility switch to transcript cards',
  );
  assert.equal(
    source.includes(':gallery-entries="galleryEntries"'),
    true,
    'TranscriptList should keep the full gallery entries so image counts and gallery refs stay intact',
  );
  assert.equal(
    source.includes('transcriptGalleryEntries'),
    false,
    'tail image visibility should not be implemented by starving TranscriptList of gallery entries',
  );
  assert.equal(
    cardSource.includes('showTailGalleryImages?: boolean;'),
    true,
    'TranscriptMessageCard should accept the tail image visibility switch',
  );
  assert.equal(
    cardSource.includes("root.classList.toggle('hide-tail-gallery-images', props.showTailGalleryImages === false);"),
    true,
    'tail image visibility should hide the fallback gallery already present in finalHtml',
  );
  assert.match(
    cardSource,
    /function shouldRunDirectHostBackfill\(\): boolean \{[\s\S]*props\.showTailGalleryImages !== false/,
    'direct host backfill should not spend resources when tail images are hidden',
  );
  assert.match(
    cardSource,
    /function hydratePendingImagesFromGalleryEntries\(\) \{[\s\S]*props\.showTailGalleryImages === false[\s\S]*return;/,
    'gallery entries should stay in the drawer instead of hydrating正文 inline images while tail images are hidden',
  );
  assert.match(
    cardSource,
    /function bindAssistantBodyInteractions\(\) \{[\s\S]*props\.showTailGalleryImages === false[\s\S]*return;/,
    '正文 inline image gestures should stay disabled while gallery-only interaction is selected',
  );
  assert.equal(
    streamingSource.includes("figure.setAttribute('data-tail-gallery-image', 'true');"),
    true,
    'unanchored images appended by finalHtml injection should be marked as tail duplicates',
  );
  assert.equal(
    cardSource.includes(":deep([data-tail-gallery-image='true'])"),
    true,
    'tail image visibility should hide the real appended finalHtml images, not only gallery containers',
  );
  assert.equal(
    source.includes(':entries="galleryVisibleEntries"'),
    true,
    'the right-side gallery drawer should keep the selected-window gallery entries regardless of the tail image switch',
  );
  assert.equal(
    source.includes('末尾图'),
    true,
    'the top toolbar should expose a visible tail-image switch near the layout controls',
  );
});

test('StoryPage keeps generated image host actions gallery-only by default', () => {
  const source = readSource('pages/StoryPage.vue');
  const viewBody = extractFunctionBody(source, 'activateGeneratedImageView');
  const tagBody = extractFunctionBody(source, 'activateGeneratedImageTag');
  const regenerateBody = extractFunctionBody(source, 'activateGeneratedImageRegenerate');

  assert.match(
    source,
    /function shouldAllowGeneratedImageHostAction\(payload: GeneratedImageActivationPayload\): boolean/,
    'StoryPage should centralize the gallery-only activation boundary',
  );
  for (const [name, body] of [
    ['view', viewBody],
    ['tag', tagBody],
    ['regenerate', regenerateBody],
  ]) {
    assert.match(
      body,
      /if \(!shouldAllowGeneratedImageHostAction\(payload\)\) return;/,
      `${name} should ignore transcript-origin generated image actions before leasing host DOM`,
    );
  }
});

test('TranscriptMessageCard leaves plugin-native image DOM uncovered while bridging direct native gestures', () => {
  const source = readSource('components/TranscriptMessageCard.vue');
  const activationSource = readSource('generatedImageActivation.ts');

  assert.doesNotMatch(
    source,
    /root\.querySelectorAll\(\s*['"]\.st-chatu8-image-span,\s*\.assistant-fallback-inline-image,\s*\.assistant-fallback-generated-image['"]/,
    'plugin-native inline image spans should not be covered by the fallback hitarea query',
  );
  assert.equal(
    source.includes('const pluginNativeCarriers = Array.from(') &&
      source.includes("root.querySelectorAll('.st-chatu8-image-span, span.image-tag-placeholder')"),
    true,
    'plugin-native inline image spans and placeholders should be bound as their own native carrier targets',
  );
  assert.equal(
    source.includes('const promptButtons = Array.from(') &&
      source.includes(
        'root.querySelectorAll(\n      \'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role="button"]\'',
      ),
    true,
    'plugin-native generate placeholders should bind both image-tag-button and st-chatu8-image-button variants',
  );
  assert.match(
    source,
    /const fallbackCarriers = Array\.from\(\s*root\.querySelectorAll\('\.assistant-fallback-inline-image, \.assistant-fallback-generated-image'\),?\s*\)\s*as HTMLElement\[\];/,
    'same-layer hitareas should remain limited to fallback images that are not plugin-native DOM',
  );
  assert.doesNotMatch(
    source,
    /\.st-chatu8-image-span \.generated-image-hitarea/,
    'plugin-native image spans should not retain hitarea-specific styling hooks',
  );
  assert.doesNotMatch(
    source,
    /image\.style\.pointerEvents = 'none';/,
    'plugin-native image nodes must keep their own pointer event surface for native preview/regenerate/tag handling',
  );
  assert.doesNotMatch(
    source,
    /emit\('generate-image', props\.item\.message_id\);/,
    'inline plugin image buttons should not be rerouted to the same-layer message-level generation menu',
  );
  assert.equal(
    source.includes('String(props.item.message_id)'),
    true,
    'inline HTML image payloads should fall back to the transcript item message id when injected nodes lack one',
  );
  assert.equal(
    activationSource.includes('carrierDataset.imageTag') && activationSource.includes('carrierDataset.link'),
    true,
    'plugin-native data-image-tag/data-link values should be parsed as prompt tokens for host button lookup',
  );
});

test('TranscriptMessageCard rebinds plugin-native gestures when image DOM is inserted after hydration', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.match(
    source,
    /function isPluginNativeInteractionMutationTarget\(node: Node\): boolean/,
    'late plugin-native image/button nodes should be recognized by the assistant body mutation observer',
  );
  assert.match(
    source,
    /let rebindTimer: number \| null = null;[\s\S]*bindAssistantBodyInteractions\(\);/,
    'late plugin-native image/button nodes should schedule a fresh interaction bind pass',
  );
  assert.match(
    source,
    /record\.type === 'childList'[\s\S]*isPluginNativeInteractionMutationTarget\(node\)[\s\S]*shouldRebind = true;/,
    'childList mutations that add plugin-native image/button DOM should trigger the rebind path',
  );
});

test('TranscriptMessageCard delegates plugin-native image gestures through the template capture layer only', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    source.includes('isBridgedEvent,'),
    true,
    'delegated same-layer image gestures should ignore events that were already bridged back to plugin DOM',
  );
  assert.match(
    source,
    /function resolveAssistantBodyNativeImageCarrierFromEventTarget\(target: EventTarget \| null\): HTMLElement \| null/,
    'template capture handlers should resolve current plugin-native carriers at event time',
  );
  assert.match(
    source,
    /function getAssistantBodyDelegatedGestureState\(carrier: HTMLElement\): AssistantBodyDelegatedGestureState/,
    'template capture handlers should share one gesture controller per plugin-native carrier',
  );
  assert.match(
    source,
    /@click\.capture="handleAssistantBodyNativeImageClick"[\s\S]*@dblclick\.capture="handleAssistantBodyNativeImageDoubleClick"[\s\S]*@pointerdown\.capture="handleAssistantBodyNativeImagePointerDown"/,
    'Vue template-level assistant body handlers should keep the delegation attached when the body element is replaced',
  );
  assert.match(
    source,
    /class="assistant-body-wrap"[\s\S]*@click\.capture="handleAssistantBodyNativeImageClick"[\s\S]*@pointerdown\.capture="handleAssistantBodyNativeImagePointerDown"/,
    'assistant body wrap should catch plugin-native gestures before inner transcript markup can stop propagation',
  );
  assert.doesNotMatch(
    source,
    /root\.addEventListener\('click', handlePluginNativeCarrierClick, true\);/,
    'plugin-native images should not also install a second root-level click listener',
  );
  assert.doesNotMatch(
    source,
    /bindGestureTarget\(carrier, carrier\);/,
    'plugin-native image carriers should not also receive per-node gesture controllers',
  );
  assert.match(
    source,
    /const handlePointerDown = \(event: Event\) => \{[\s\S]*?if \(isBridgedEvent\(event\)\) return;[\s\S]*?controller\.handleTouchStart\([\s\S]*?\);/,
    'fallback-image per-node handlers should still ignore bridged touch events',
  );
});

test('StoryPage resolves plugin-native image double clicks with adjacent prompt payloads', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.match(
    source,
    /function isSameLayerPluginNativeImageGestureTarget\(target: EventTarget \| null\): boolean/,
    'StoryPage should recognize same-layer plugin-native image targets before global double-click proxies run',
  );
  assert.match(
    source,
    /async function handleTranscriptDoubleClickCapture\(event: MouseEvent\) \{[\s\S]*if \(isSameLayerPluginNativeImageGestureTarget\(event\.target\)\) return;[\s\S]*void startTranscriptHostImageProxy/,
    'generic transcript double-click generation should not steal plugin-native image double clicks from TranscriptMessageCard',
  );
  assert.match(
    source,
    /function resolvePluginNativePromptDatasetFromCarrier\(carrier: HTMLElement\): DOMStringMap \| null/,
    'window-level generated-image double clicks should be able to recover the adjacent native prompt button payload',
  );
  assert.match(
    source,
    /function getPluginNativeRequestId\(element: HTMLElement \| null\): string[\s\S]*element\?\.dataset\.samelayerRequestId[\s\S]*data-samelayer-request-id/,
    'plugin-native target resolution should recognize same-layer request ids as well as native data-request-id values',
  );
  assert.match(
    source,
    /const promptDataset = resolvePluginNativePromptDatasetFromCarrier\(carrier\);[\s\S]*const carrierDataset = \{ \.\.\.promptDataset, \.\.\.carrier\.dataset, messageId \};/,
    'fallback payload parsing should merge data-image-tag/data-link before resolving regeneration targets',
  );
  assert.match(
    source,
    /function handleGeneratedImageWindowDoubleClickCapture\(event: MouseEvent\) \{[\s\S]*const payload = resolveGeneratedImagePayloadFromDomTarget\(event\.target\);[\s\S]*void activateGeneratedImageRegenerate\(payload\);/,
    'window-level generated-image double clicks should continue to route through the payload-aware regenerate action',
  );
  assert.match(
    source,
    /function isSameLayerGeneratedImageAssetTarget\(target: EventTarget \| null\): boolean/,
    'GeneratedImageAsset-owned images should be detectable before the window fallback handler runs',
  );
  assert.match(
    source,
    /function handleGeneratedImageWindowDoubleClickCapture\(event: MouseEvent\) \{[\s\S]*if \(isSameLayerGeneratedImageAssetTarget\(event\.target\)\) return;[\s\S]*const payload = resolveGeneratedImagePayloadFromDomTarget\(event\.target\);/,
    'window-level fallback should not steal double-clicks from GeneratedImageAsset component guards',
  );
  assert.match(
    source,
    /async function activateGeneratedImageRegenerate\(payload: GeneratedImageActivationPayload\) \{[\s\S]*if \(!targetNode\) \{[\s\S]*if \(payload\.sameLayerOnly === true\) \{[\s\S]*console\.warn\('\[image-regenerate\] same-layer-only image has no plugin-native regenerate target'/,
    'same-layer-only rendered image copies should not show a missing-target regenerate toast when the host native plugin node never existed',
  );
});

test('TranscriptMessageCard hard-backfills body images directly from host chat and DOM', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    cardSource.includes("from '../hostBridge'"),
    true,
    'body-level image fallback should read host data directly instead of waiting for parent gallery entries',
  );
  assert.equal(
    cardSource.includes('function collectDirectHostBackfillEntries()'),
    true,
    'TranscriptMessageCard should have a direct host backfill collector for stubborn mobile timing failures',
  );
  assert.equal(
    cardSource.includes('readChatMessageDetail(props.item.message_id)'),
    true,
    'direct body fallback should read the current message extra.images by message id',
  );
  assert.equal(
    cardSource.includes('collectReachableHostDocuments().filter(doc => doc !== document)'),
    true,
    'direct body fallback should also scan already-rendered host DOM images',
  );
  assert.match(
    cardSource,
    /const DIRECT_HOST_IMAGE_BACKFILL_DELAYS_MS = \[0, 300, 900, 1800, 3600, 7200, 15000\] as const;/,
    'direct backfill should poll long enough to survive mobile delayed extra.images writes',
  );
});

test('TranscriptMessageCard body recovery images stay visible when tail duplicates are hidden', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    cardSource.includes('function ensureGalleryRecoveryStrip(root: HTMLElement): HTMLElement'),
    true,
    'missing gallery entries should be appended to a dedicated recovery strip instead of the hideable tail gallery',
  );
  assert.match(
    cardSource,
    /strip\.className = 'assistant-inline-image-strip';[\s\S]*strip\.setAttribute\('data-gallery-recovery-strip', 'true'\);/,
    'the recovery strip should use the non-hidden inline-image strip surface',
  );
  assert.match(
    cardSource,
    /ensureGalleryRecoveryStrip\(root\)\.append\(figure\);/,
    'body recovery figures should not be placed inside assistant-fallback-generated-gallery',
  );
  const tailHideRule =
    cardSource.match(
      /\.assistant-body\.hide-tail-gallery-images :deep\(\.assistant-fallback-generated-gallery\)[\s\S]*?\}/,
    )?.[0] ?? '';
  assert.doesNotMatch(
    tailHideRule,
    /data-gallery-recovery-strip/,
    'the tail image toggle must not hide the recovery strip that makes gallery entries visible in the正文',
  );
});

test('TranscriptMessageCard direct DOM backfill inherits prompt data from adjacent plugin buttons', () => {
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(
    cardSource,
    /function resolvePluginPromptCarrierForImageContainer\(carrier: HTMLElement \| null\): HTMLElement \| null/,
    'direct DOM image recovery should inspect plugin-native siblings for prompt identity',
  );
  assert.match(
    cardSource,
    /let sibling = carrier\.previousElementSibling;[\s\S]*sibling\.matches\?\.\('button\.image-tag-button, \.st-chatu8-image-button'\)/,
    'ai-image-container images should inherit data-link/data-image-tag from the preceding plugin button',
  );
  assert.match(
    cardSource,
    /const promptCarrier = resolvePluginPromptCarrierForImageContainer\(carrier\);[\s\S]*promptCarrier\?\.dataset\.imageTag[\s\S]*promptCarrier\?\.dataset\.link/,
    'direct DOM fallback entries should carry prompt tokens so single/double/long gestures can resolve native targets',
  );
});
