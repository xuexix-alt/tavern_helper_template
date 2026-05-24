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

test('iframe transcript render mode is decided from iframe roots, not host displayed message roots', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const iframeRoots = resolveIframeAssistantRoots(messageId);'),
    true,
    'appendChatu8ArtifactsToHtml should inspect iframe roots separately',
  );
  assert.equal(
    source.includes('const hasPluginNativeArtifacts = countPluginNativeImageArtifacts(iframeRoots) > 0;'),
    true,
    'render mode should only treat iframe plugin-native DOM as already rendered',
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
    source.includes('const HOST_IMAGE_RESPONSE_RECONCILE_DELAYS_MS = [120, 360, 900, 1800] as const;'),
    true,
    'successful plugin-native image responses should keep polling briefly for the native extra.images save that can land after the response event',
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
    source.includes("function beginPendingImageTask(messageId: number, source: 'transcript' | 'gallery' = 'transcript')"),
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
    source.includes(':entries="galleryEntries"'),
    true,
    'the right-side gallery drawer should keep the full gallery entries regardless of the tail image switch',
  );
  assert.equal(
    source.includes('末尾图'),
    true,
    'the top toolbar should expose a visible tail-image switch near the layout controls',
  );
});

test('TranscriptMessageCard binds plugin-native inline image spans to the generated-image gesture bridge', () => {
  const source = readSource('components/TranscriptMessageCard.vue');
  const activationSource = readSource('generatedImageActivation.ts');

  assert.equal(
    /root\.querySelectorAll\(\s*['"]\.st-chatu8-image-span,\s*\.assistant-fallback-inline-image,\s*\.assistant-fallback-generated-image['"]/.test(
      source,
    ),
    true,
    'plugin-native inline image spans should receive the same hitarea gesture bridge as fallback images',
  );
  assert.equal(
    source.includes("carrier.closest('.st-chatu8-image-span')"),
    true,
    'plugin-native payload extraction should read the st-chatu8 carrier dataset when the hitarea wraps the inner img',
  );
  assert.equal(
    source.includes('const carrierDataset = pluginNativeCarrier?.dataset ?? carrier.dataset;'),
    true,
    'plugin-native hitareas should forward the native carrier dataset to the host activation bridge',
  );
  assert.equal(
    source.includes('String(props.item.message_id)'),
    true,
    'inline HTML image hitareas should fall back to the transcript item message id when injected nodes lack one',
  );
  assert.equal(
    activationSource.includes('carrierDataset.imageTag') && activationSource.includes('carrierDataset.link'),
    true,
    'plugin-native data-image-tag/data-link values should be parsed as prompt tokens for host button lookup',
  );
});
