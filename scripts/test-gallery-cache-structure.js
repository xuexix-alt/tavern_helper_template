require('ts-node/register/transpile-only');

const {
  collectChatu8CacheEntries,
  sanitizeChatu8CacheMeta,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/galleryCache.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const legacyMeta = {
  imageCache: {
    entryA: {
      messageId: 1,
      requestId: 'legacy-1',
      prompt: '人物：林月华',
      imageData: 'abc123',
      alt: 'legacy image',
    },
  },
};

const nestedMeta = {
  data: {
    image_groups: {
      entryB: {
        messageId: 1,
        requestId: 'nested-1',
        prompt: '人物：慕小小',
        imageData: 'xyz789',
        alt: 'nested image',
      },
    },
  },
};

const legacyEntries = collectChatu8CacheEntries(legacyMeta, 1);
assertEqual(legacyEntries.length, 1, 'legacy imageCache entries should still be collected');
assertEqual(legacyEntries[0]?.requestId, 'legacy-1', 'legacy requestId should be preserved');

const nestedEntries = collectChatu8CacheEntries(nestedMeta, 1);
assertEqual(nestedEntries.length, 1, 'nested data.image_groups entries should be collected');
assertEqual(nestedEntries[0]?.requestId, 'nested-1', 'nested requestId should be preserved');

const malformedMeta = {
  imageCache: {
    entryA: {
      messageId: 1,
      requestId: 'legacy-2',
      imageData: 'abc123',
    },
  },
};

const sanitizedMeta = sanitizeChatu8CacheMeta(malformedMeta);
assertEqual(
  sanitizedMeta.imageCache.entryA.request_id,
  'legacy-2',
  'cache meta sanitize should mirror requestId into request_id',
);
assertEqual(
  sanitizedMeta.imageCache.entryA.regex,
  '',
  'cache meta sanitize should backfill regex for malformed cache entries',
);
assertEqual(
  sanitizedMeta.imageCache.entryA.image,
  'data:image/png;base64,abc123',
  'cache meta sanitize should normalize image payload fields',
);

console.log('gallery cache structure test passed');
