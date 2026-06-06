const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('host DOM image extraction merges same-src plugin identity instead of first weak artifact winning', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function extractRenderedImagesFromRoots(');
  const end = source.indexOf('function pickFirstNonEmpty', start);
  const block = source.slice(start, end);

  assert.match(
    source,
    /mergeRenderableGeneratedImageArtifact/,
    'useStreamingDemo should import the rendered image artifact merger',
  );
  assert.match(
    block,
    /imageIndexBySrc/,
    'extractRenderedImagesFromRoots should keep an index for merging repeated image sources',
  );
  assert.doesNotMatch(
    block,
    /seen\.has\(src\)\) return;/,
    'same-src artifacts should be merged rather than dropping later prompt/request identity fields',
  );
});

test('gallery resolver can read already-rendered same-layer transcript images without adding persistence', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function extractSameLayerRenderedImagesFromTranscript(');
  const end = source.indexOf('function collectRenderableImagesForGalleryMessage', start);
  const block = source.slice(start, end);

  assert.notEqual(start, -1, 'same-layer rendered image extractor should exist');
  assert.match(
    block,
    /collectSameLayerRenderedMessageRoots\(messageId\)/,
    'same-layer fallback should stay scoped to the requested transcript floor',
  );
  assert.match(
    block,
    /image\.closest\('\.gallery-panel, \.assistant-gallery-image'\)/,
    'same-layer fallback should not harvest the gallery drawer images back into itself',
  );
  assert.match(
    block,
    /!src\.startsWith\('data:image'\) && !src\.startsWith\('blob:'\)/,
    'same-layer fallback should only accept ready inline image sources',
  );
  assert.match(
    block,
    /resolveSameLayerPromptCarrierForImage\(image, root\)/,
    'same-layer fallback should recover prompt/request identity from adjacent plugin buttons when present',
  );
  assert.match(
    source,
    /function resolveSameLayerRenderedImageCarrier\(image: HTMLImageElement\): HTMLElement \| null[\s\S]*image\.closest\(CHATU8_IMAGE_SPAN_SELECTOR\)/,
    'same-layer fallback should prefer the outer plugin placeholder span before the inner image container',
  );
  assert.doesNotMatch(
    source,
    /writeGalleryManifestRecord|storeGalleryBinary|readGalleryManifestRecord/,
    'same-layer transcript fallback should not reintroduce a separate gallery persistence layer',
  );
});

test('gallery ref builder keeps regenerate gated by plugin-native identity, with host DOM artifacts as exact matches', () => {
  const source = readSource('useStreamingDemo.ts');
  const start = source.indexOf('function buildGeneratedImageRefsForMessage(');
  const end = source.indexOf('  return refs;', start);
  const block = source.slice(start, end);

  assert.match(
    block,
    /const nativeHostDomArtifacts = input\.hostDomArtifacts \?\? extractRenderedImagesFromRoots\(messageId\);/,
    'builder should keep the real host DOM artifact set separate',
  );
  assert.match(
    block,
    /const hostDomArtifacts = collectRenderableImagesForGalleryMessage\(messageId, nativeHostDomArtifacts\);/,
    'builder should merge current same-layer rendered images into the gallery read model',
  );
  assert.match(
    block,
    /const canRegenerate = nativeHostDomArtifacts\.length > 0 && canRegenerateFromHostDomArtifacts\(image, nativeHostDomArtifacts\);/,
    'host-DOM fallback refs should not let same-layer-only inline images masquerade as plugin-native regenerate targets',
  );
  assert.match(
    block,
    /canRegenerate: canRegenerateFromHostDomArtifacts\(entity, nativeHostDomArtifacts\)/,
    'canonical native refs should also derive regenerate eligibility from plugin-native identity',
  );
  assert.match(
    source,
    /const hasNativeRegenerateIdentity = Boolean\(requestId \|\| promptTokenCompare\);[\s\S]*if \(!hasNativeRegenerateIdentity\) return false;[\s\S]*if \(!Array\.isArray\(hostDomArtifacts\) \|\| hostDomArtifacts\.length === 0\) return false;/,
    'canonical refs should expose regenerate only after a real plugin-native host target exists',
  );
});
