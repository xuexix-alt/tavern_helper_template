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
    source.includes("scheduleUiRefresh(['gallery'], 'host.plugin_native_dom_mutation');"),
    true,
    'native image DOM mutations should only refresh gallery scope',
  );
  assert.equal(
    source.includes("refreshTranscriptItemsByIds(affectedMessageIds, 'host.plugin_native_dom_mutation');"),
    true,
    'native image DOM mutations should refresh only affected transcript items',
  );
  assert.equal(
    source.includes("rebuildTranscript('host.plugin_native_dom_mutation')"),
    false,
    'native image DOM mutations should not trigger a full transcript rebuild',
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
