const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizePromptTokenForCompare,
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

test('native-first artifacts preserve plugin persisted idb image refs from extra.images', () => {
  const result = readNativeFirstImageArtifacts({
    messageId: 77,
    extraImages: [
      {
        requestId: 'req-idb-native',
        promptToken: 'image###native persisted###',
        src: 'idb://77/req-idb-native',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(result[0].requestId, 'req-idb-native');
  assert.equal(result[0].src, 'idb://77/req-idb-native');
});

test('generated image source resolver keeps idb srcs for transcript hydration', () => {
  const result = resolveGeneratedImageSource(
    {
      messageId: 78,
      requestId: 'req-idb-source',
    },
    {
      swipe_id: 0,
      extra: {
        images: [
          [
            {
              requestId: 'req-idb-source',
              promptToken: 'image###idb source###',
              image: 'idb://78/req-idb-source',
            },
          ],
        ],
      },
    },
  );

  assert.ok(result);
  assert.equal(result?.source, 'extra');
  assert.equal(result?.src, 'idb://78/req-idb-source');
});

test('extra image prompt text is normalized into promptToken when tag fields are absent', () => {
  const prompt = 'sfw, 1girl, ${"name":"fujii yukino","angle":"from above"}$, hallway';
  const result = readNativeFirstImageArtifacts({
    messageId: 43,
    extraImages: [
      {
        requestId: 'req-prompt-only',
        prompt,
        image: 'https://example.com/prompt-only.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(result[0].promptToken, `image###${prompt}###`);
});

test('preprocessed extra image promptToken text is normalized back into a chatu8 prompt token', () => {
  const prompt = 'sfw, 1girl, ${"name":"fujii yukino"}$, snowy window';
  const result = readNativeFirstImageArtifacts({
    messageId: 45,
    extraImages: [
      {
        requestId: 'req-preprocessed-prompt',
        promptToken: prompt,
        src: 'https://example.com/preprocessed-prompt.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(result[0].promptToken, `image###${prompt}###`);
});

test('prompt token comparison ignores plugin whitespace normalization differences', () => {
  const rawToken = [
    'image###Scene Composition:sfw, 1girl, solo;',
    'Character 1 Prompt:girl, Mu Xiaoxiao (original), long hair;',
    'Character 1 UC:background characters###',
  ].join('\n');
  const pluginTag =
    'Scene Composition:sfw, 1girl, solo;Character 1 Prompt:girl, Mu Xiaoxiao (original), long hair;Character 1 UC:background characters';

  assert.equal(normalizePromptTokenForCompare(rawToken), normalizePromptTokenForCompare(pluginTag));
});

test('cache metadata enriches native image artifacts when native source lacks promptToken', () => {
  const prompt = 'sfw, 1girl, ${"name":"fujii yukino"}$, moon light';
  const result = readNativeFirstImageArtifacts({
    messageId: 44,
    hostDomArtifacts: [
      {
        src: 'https://example.com/rendered.png',
        alt: 'Generated Image',
      },
    ],
    cacheArtifacts: [
      {
        prompt,
        src: 'https://example.com/rendered.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'host_dom');
  assert.equal(result[0].promptToken, `image###${prompt}###`);
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

test('cache fallback is ignored when any native data exists and no legacy source remains', () => {
  const result = readNativeFirstImageArtifacts({
    messageId: 15,
    extraImages: [
      {
        requestId: 'req-native',
        promptToken: 'image###native###',
        image: 'https://example.com/native.png',
      },
    ],
    cacheArtifacts: [
      {
        requestId: 'req-cache',
        promptToken: 'image###cache###',
        image: 'https://example.com/cache.png',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'extra');
  assert.equal(
    result.some(item => item.source === 'cache'),
    false,
  );
});

test('native-first helper prompt-token fallback does not start from cache when native exists', () => {
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
  });

  assert.deepEqual(promptTokens, ['image###native-extra###']);
  assert.equal(promptTokens.includes('image###cache-only###'), false);
});

test('native-first helper membership only falls back to cache when native sources are absent', () => {
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
  });

  assert.equal(fromCache.length, 1);
  assert.equal(fromCache[0].source, 'cache');
  assert.equal(fromCache[0].promptToken, 'image###cache-20###');
});

test('resolver prefers extra.images over cache fallback for the same key', () => {
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
  assert.equal(result?.source, 'cache');
  assert.equal(result?.promptToken, 'image###Scene Composition:sfw,1girl,ruins###');
  assert.equal(result?.src, 'https://example.com/cache.png');
});

test('runtime path removes legacy UI-owned persistence symbols entirely', () => {
  const statusBarDir = path.resolve(__dirname, '..');
  const useStreamingDemoSource = fs.readFileSync(path.join(statusBarDir, 'useStreamingDemo.ts'), 'utf8');
  const resolverSource = fs.readFileSync(path.join(statusBarDir, 'generatedImageSourceResolver.ts'), 'utf8');
  const artifactSource = fs.readFileSync(path.join(statusBarDir, 'pluginNativeImageArtifacts.ts'), 'utf8');
  const removedReadFn = ['read', 'PersistedGeneratedImages('].join('');
  const removedResolverPath = ['stream_demo', '.generated_images'].join('');
  const removedLegacyInput = ['legacy', 'GeneratedImages'].join('');
  const removedLegacySource = ['legacy_', 'stream_demo'].join('');

  assert.equal(
    useStreamingDemoSource.includes('bindImagePersistenceEvents();'),
    false,
    'onMounted runtime should not mount bindImagePersistenceEvents() in active flow',
  );
  assert.equal(
    useStreamingDemoSource.includes(removedReadFn),
    false,
    'runtime path should not keep the removed legacy read helper',
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
    resolverSource.includes(removedResolverPath),
    false,
    'resolver should not keep the removed stream_demo fallback path',
  );
  assert.equal(
    artifactSource.includes(removedLegacyInput),
    false,
    'native artifact reader should not keep the removed legacy input',
  );
  assert.equal(
    artifactSource.includes(removedLegacySource),
    false,
    'native artifact reader should not emit the removed legacy source name',
  );
});
