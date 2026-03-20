const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  readNativeFirstImageArtifacts,
  readNativeFirstPromptTokens,
  readNativeFirstMembershipEntries,
} = require('../pluginNativeImageArtifacts.ts');
const { resolveGeneratedImageSource } = require('../generatedImageSourceResolver.ts');

test('extra images beat cache fallback for the same artifact key', () => {
  const result = readNativeFirstImageArtifacts({
    messageId: 42,
    extraImages: [
      {
        requestId: 'req-1',
        promptToken: 'image###foo###',
        image: 'https://example.com/extra-foo.png',
      },
    ],
    cacheArtifacts: [
      {
        requestId: 'req-1',
        promptToken: 'image###foo###',
        src: 'https://example.com/cache-foo.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(result[0].requestId, 'req-1');
  assert.equal(result[0].src, 'https://example.com/extra-foo.png');
});

test('mes tag parser results beat cache fallback when extra images are absent', () => {
  const result = readNativeFirstImageArtifacts({
    messageId: 8,
    rawMessage: ['她把围巾往上提了提。', 'image###Scene Composition:sfw,1girl,ruins###'].join('\n'),
    cacheArtifacts: [
      {
        promptToken: 'image###Scene Composition:sfw,1girl,ruins###',
        requestId: 'cache-only',
        src: 'https://example.com/cache.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'mes_tag');
  assert.equal(result[0].promptToken, 'image###Scene Composition:sfw,1girl,ruins###');
  assert.match(result[0].anchorText ?? '', /围巾/);
});

test('cache is only used as last fallback when host/extra/mes-tag are all empty', () => {
  const withNative = readNativeFirstImageArtifacts({
    messageId: 11,
    hostDomArtifacts: [
      {
        requestId: 'host-1',
        promptToken: 'image###host###',
        src: 'https://example.com/host.png',
      },
    ],
    cacheArtifacts: [
      {
        requestId: 'cache-1',
        promptToken: 'image###cache###',
        src: 'https://example.com/cache.png',
      },
    ],
  });

  assert.equal(withNative.length, 1);
  assert.equal(withNative[0].source, 'host_dom');

  const fallbackOnly = readNativeFirstImageArtifacts({
    messageId: 11,
    cacheArtifacts: [
      {
        requestId: 'cache-1',
        promptToken: 'image###cache###',
        src: 'https://example.com/cache.png',
      },
    ],
  });

  assert.equal(fallbackOnly.length, 1);
  assert.equal(fallbackOnly[0].source, 'cache');
  assert.equal(fallbackOnly[0].requestId, 'cache-1');
});

test('legacy stream_demo artifacts are ignored when any native data exists', () => {
  const result = readNativeFirstImageArtifacts({
    messageId: 15,
    extraImages: [
      {
        requestId: 'req-native',
        promptToken: 'image###native###',
        image: 'https://example.com/native.png',
      },
    ],
    legacyGeneratedImages: [
      {
        requestId: 'req-legacy',
        promptToken: 'image###legacy###',
        image: 'https://example.com/legacy.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(
    result.some(item => item.source === 'legacy_stream_demo'),
    false,
  );
});

test('native-first helper prompt-token fallback does not start from cache and ignores legacy when native exists', () => {
  const promptTokens = readNativeFirstPromptTokens({
    messageId: 19,
    rawMessage: ['她抬起下巴，看向破损的天花板。', 'image###Scene Composition:native-mes###'].join('\n'),
    extraImages: [
      {
        requestId: 'native-extra',
        promptToken: 'image###native-extra###',
        image: 'https://example.com/native-extra.png',
      },
    ],
    cacheArtifacts: [
      {
        requestId: 'cache-only',
        promptToken: 'image###cache-only###',
        src: 'https://example.com/cache-only.png',
      },
    ],
    legacyGeneratedImages: [
      {
        requestId: 'legacy-only',
        promptToken: 'image###legacy-only###',
        src: 'https://example.com/legacy-only.png',
      },
    ],
  });

  assert.deepEqual(promptTokens, ['image###native-extra###']);
  assert.equal(promptTokens.includes('image###cache-only###'), false);
  assert.equal(promptTokens.includes('image###legacy-only###'), false);
});

test('native-first helper membership falls back to cache before legacy, and only uses legacy when native/cache are absent', () => {
  const fromCache = readNativeFirstMembershipEntries({
    messageId: 20,
    rawMessage: '没有原生图 tag。',
    cacheArtifacts: [
      {
        requestId: 'cache-20',
        promptToken: 'image###cache-20###',
        src: 'https://example.com/cache-20.png',
      },
    ],
    legacyGeneratedImages: [
      {
        requestId: 'legacy-20',
        promptToken: 'image###legacy-20###',
        src: 'https://example.com/legacy-20.png',
      },
    ],
  });

  assert.equal(fromCache.length, 1);
  assert.equal(fromCache[0].source, 'cache');
  assert.equal(fromCache[0].promptToken, 'image###cache-20###');

  const fromLegacyOnly = readNativeFirstMembershipEntries({
    messageId: 20,
    rawMessage: '没有任何 native 或 cache。',
    cacheArtifacts: [],
    legacyGeneratedImages: [
      {
        requestId: 'legacy-20',
        promptToken: 'image###legacy-20###',
        src: 'https://example.com/legacy-20.png',
      },
    ],
  });

  assert.equal(fromLegacyOnly.length, 1);
  assert.equal(fromLegacyOnly[0].source, 'legacy_stream_demo');
  assert.equal(fromLegacyOnly[0].promptToken, 'image###legacy-20###');
});

test('resolver prefers extra.images over legacy stream_demo and cache for the same key', () => {
  const result = resolveGeneratedImageSource(
    {
      messageId: 16,
      requestId: 'req-native-first',
    },
    {
      swipe_id: 0,
      extra: {
        images: [
          [
            {
              requestId: 'req-native-first',
              promptToken: 'image###native###',
              image: 'https://example.com/native-first.png',
            },
          ],
        ],
      },
      data: {
        stream_demo: {
          generated_images: [
            {
              requestId: 'req-native-first',
              promptToken: 'image###native###',
              src: 'idb://16/req-native-first',
            },
          ],
        },
      },
    },
    [
      {
        requestId: 'req-native-first',
        promptToken: 'image###native###',
        src: 'https://example.com/cache.png',
      },
    ],
  );

  assert.ok(result);
  assert.equal(result?.source, 'extra');
  assert.equal(result?.src, 'https://example.com/native-first.png');
});

test('resolver uses mes-tag derived entries before cache fallback', () => {
  const result = resolveGeneratedImageSource(
    {
      messageId: 17,
      promptToken: 'image###Scene Composition:sfw,1girl,ruins###',
    },
    {
      message: ['她把围巾往上提了提。', 'image###Scene Composition:sfw,1girl,ruins###'].join('\n'),
      swipe_id: 0,
      extra: {
        images: [],
      },
      data: {
        stream_demo: {
          generated_images: [],
        },
      },
    },
    [
      {
        promptToken: 'image###Scene Composition:sfw,1girl,ruins###',
        requestId: 'cache-only',
        src: 'https://example.com/cache.png',
      },
    ],
  );

  assert.ok(result);
  assert.equal(result?.source, 'mes_tag');
  assert.equal(result?.promptToken, 'image###Scene Composition:sfw,1girl,ruins###');
});

test('task6 runtime path does not keep the legacy UI-owned persistence bridge active', () => {
  const statusBarDir = path.resolve(__dirname, '..');
  const useStreamingDemoSource = fs.readFileSync(path.join(statusBarDir, 'useStreamingDemo.ts'), 'utf8');
  const resolverSource = fs.readFileSync(path.join(statusBarDir, 'generatedImageSourceResolver.ts'), 'utf8');

  assert.equal(
    useStreamingDemoSource.includes('bindImagePersistenceEvents();'),
    false,
    'onMounted runtime should not mount bindImagePersistenceEvents() in active flow',
  );
  assert.equal(
    useStreamingDemoSource.includes('void persistGeneratedImageResponse('),
    false,
    'normal runtime flow should not invoke persistGeneratedImageResponse()',
  );
  assert.equal(
    useStreamingDemoSource.includes("await import('./imageStore')"),
    false,
    'runtime path should not import imageStore.ts for active writes',
  );
  assert.equal(
    useStreamingDemoSource.includes('buildGeneratedImagePersistencePatch('),
    false,
    'runtime path should not buildGeneratedImagePersistencePatch() for active writes',
  );
  assert.equal(
    resolverSource.includes('idb://'),
    false,
    'active source resolver should not keep idb:// references in source priority path',
  );
});
