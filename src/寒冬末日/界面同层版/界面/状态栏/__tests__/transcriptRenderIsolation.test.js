const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
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
  assert.equal(
    source.includes("attributeFilter: ['src'],"),
    true,
    'host native image observer should watch img src attribute changes when the plugin fills images after inserting containers',
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
});

test('pending request hint heartbeat also syncs host image data changes from message text and extra images', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("syncTranscriptItemsFromHostData('host.plugin_native_data_sync');"),
    true,
    'pending request hint syncing should also reconcile host-side image data changes',
  );
  assert.equal(
    source.includes("const rawMessage = String(message?.message ?? message?.mes ?? '').trim();"),
    true,
    'host image data signature should include the host raw message text',
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
  assert.equal(
    source.includes(
      'syncPendingRequestHintsFromDom();\n            const requestBinding = imagePendingTaskManager.registerRequest',
    ),
    true,
    'plugin-native image requests should bind request ids from DOM hints before success responses arrive',
  );
  assert.equal(
    source.includes("syncTranscriptItemsFromHostData('host.plugin_native_response_success',"),
    true,
    'successful plugin-native image responses should force a host image data sync for affected messages',
  );
  assert.equal(
    source.includes("queueGeneratedImageEntityRefresh(targetMessageIds, 'host.plugin_native_response_success');"),
    true,
    'successful plugin-native image responses should force transcript/gallery refresh even when signatures were not snapshotted yet',
  );
  assert.equal(
    source.includes('const HOST_IMAGE_RESPONSE_RECONCILE_DELAYS_MS = [120, 360, 900, 1800, 3600, 7200] as const;'),
    true,
    'successful plugin-native image responses should keep polling long enough for delayed native extra.images saves',
  );
  assert.equal(
    source.includes('queueGeneratedImageEntityRefresh(normalizedMessageIds, `${reason}:delay_${delayMs}`);'),
    true,
    'delayed response reconcile should force a targeted transcript/gallery probe even when host data signatures do not change',
  );
  assert.equal(
    source.includes("scheduleHostImageDataReconcile('host.plugin_native_response_success', targetMessageIds);"),
    true,
    'successful plugin-native image responses should reconcile delayed native image data without requiring UI reload',
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
    source.includes(
      'const PLUGIN_NATIVE_PROMPT_PLACEHOLDER_RECONCILE_DELAYS_MS = [0, 120, 360, 900, 1800, 3600, 7200] as const;',
    ),
    true,
    'prompt placeholder reconcile should cover the gap between ch-llm-image-gen-response and generate-image-request',
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
      "schedulePluginNativePromptPlaceholderReconcile('host.plugin_native_response_success', targetMessageIds);",
    ),
    true,
    'real image responses should also leave a post-response breadcrumb for late placeholder/extra.images updates',
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
});

test('plugin-native placeholder-only DOM mutations trigger prompt reconciliation before src is ready', () => {
  const source = readSource('useStreamingDemo.ts');
  const sameLayerObserverStart = source.indexOf('generatedImageDomObserver = new MutationObserver');
  assert.notEqual(sameLayerObserverStart, -1, 'should find same-layer generated image mutation observer');
  const sameLayerObserverEnd = source.indexOf('hostPluginMutationObservers = bindHostPluginMutationObservers', sameLayerObserverStart);
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

  assert.equal(
    source.includes('async function hydrateRecentPluginNativeHostWindow(reason: string): Promise<void>'),
    true,
    'same-layer reload should have a bounded native host hydration path for plugin-native images',
  );
  assert.match(
    source,
    /function collectRecentPluginNativeHydrationMessageIds\(\): number\[\][\s\S]*PLUGIN_NATIVE_HOST_WINDOW_MESSAGE_COUNT/,
    'boot hydration should stay bounded to the recent plugin-native window',
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
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*await setChatMessages\([\s\S]*is_hidden: true[\s\S]*\{ refresh: 'none' \}/,
    'hydration should re-hide the materialized host messages without tearing down the plugin-mutated DOM',
  );
  assert.match(
    source,
    /hydrateRecentPluginNativeHostWindow[\s\S]*queueGeneratedImageEntityRefresh\(messageIds, `\$\{reason\}:native_host_hydration`\)/,
    'hydration should immediately refresh same-layer image entities after native DOM has had a chance to rebuild',
  );
  assert.match(
    source,
    /window\.setTimeout\(\(\) => void hydrateRecentPluginNativeHostWindow\('mounted\.host_plugin_native_hydration'\), 250\);/,
    'mounted same-layer UI should run the native host hydration probe, not just recompute existing iframe DOM',
  );
});

test('same-layer boot starts a lightweight gallery image cache session without waiting for the drawer click', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /window\.setTimeout\(\(\) => startGalleryImageCacheSession\('mounted\.initial_gallery_cache', 'boot'\), 900\);/,
    'initial same-layer image hydration should run lightweight gallery cache probes before the user opens the drawer',
  );
  assert.match(
    source,
    /startGalleryImageCacheSession[\s\S]*const delays = mode === 'boot' \? GALLERY_BOOT_CACHE_RESCAN_DELAYS_MS : GALLERY_DRAWER_CACHE_RESCAN_DELAYS_MS;[\s\S]*if \(mode !== 'boot'\) scheduleUiRefresh\(\['gallery'\], `\$\{reason\}:initial_cache_\$\{delayMs\}`\);[\s\S]*scanSelectedGalleryWindow\(`\$\{reason\}:initial_cache_\$\{delayMs\}`\);/,
    'boot cache probes should keep image recovery without repainting the gallery panel on every retry',
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
  assert.equal(
    source.includes('[matchedResponse?.messageId, recentIntent?.messageId ?? null]'),
    true,
    'successful native responses should refresh the recent gallery message as well as transcript-triggered messages',
  );
});

test('StoryPage can hide duplicate tail gallery images while keeping the gallery drawer data source', () => {
  const source = readSource('pages/StoryPage.vue');
  const cardSource = readSource('components/TranscriptMessageCard.vue');
  const streamingSource = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const showTailGalleryImages = ref(true);'),
    true,
    'tail gallery image strip should default to visible',
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
        "root.querySelectorAll(\n      'button.image-tag-button, button.st-chatu8-image-button, .st-chatu8-image-button[role=\"button\"]'",
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
