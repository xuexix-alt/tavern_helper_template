require('ts-node/register/transpile-only');

const {
  resolveGeneratedImageSource,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

function assertTruthy(value, message) {
  if (!value) throw new Error(message);
}

const message = {
  swipe_id: 0,
  data: {
    stream_demo: {
      generated_images: [
        {
          imageId: 'img-1',
          requestId: 'req-1',
          promptToken: 'image###角色A###',
          src: 'data:image/png;base64,aaa',
          alt: 'image A',
        },
      ],
    },
  },
  extra: {
    images: [
      [
        {
          imageId: 'img-2',
          requestId: 'req-2',
          request_id: 'req-2',
          tag: '角色B',
          src: 'data:image/png;base64,bbb',
          image: 'data:image/png;base64,bbb',
          imageData: 'data:image/png;base64,bbb',
          alt: 'image B',
        },
      ],
    ],
  },
};

const cacheEntries = [
  {
    messageId: 4,
    imageId: 'img-3',
    requestId: 'req-3',
    promptToken: 'image###角色C###',
    src: 'data:image/png;base64,ccc',
    alt: 'image C',
  },
];

const fromStreamDemo = resolveGeneratedImageSource(
  {
    messageId: 4,
    imageId: 'img-1',
    requestId: 'req-1',
    promptToken: 'image###角色A###',
  },
  message,
  cacheEntries,
);

assertTruthy(fromStreamDemo, 'resolver should find persisted stream_demo image data');
assertEqual(fromStreamDemo.source, 'stream_demo', 'resolver should prefer stream_demo image data');
assertEqual(fromStreamDemo.src, 'data:image/png;base64,aaa', 'resolver should return stream_demo src');

const fromExtra = resolveGeneratedImageSource(
  {
    messageId: 4,
    imageId: 'img-2',
    requestId: 'req-2',
    promptToken: 'image###角色B###',
  },
  {
    ...message,
    data: { stream_demo: { generated_images: [] } },
  },
  cacheEntries,
);

assertTruthy(fromExtra, 'resolver should fall back to extra.images when stream_demo data is absent');
assertEqual(fromExtra.source, 'extra', 'resolver should report extra.images as the source');
assertEqual(fromExtra.src, 'data:image/png;base64,bbb', 'resolver should return extra.images src');

const fromCache = resolveGeneratedImageSource(
  {
    messageId: 4,
    imageId: 'img-3',
    requestId: 'req-3',
    promptToken: 'image###角色C###',
  },
  {
    swipe_id: 0,
    data: { stream_demo: { generated_images: [] } },
    extra: {},
  },
  cacheEntries,
);

assertTruthy(fromCache, 'resolver should fall back to cache entries when message data is absent');
assertEqual(fromCache.source, 'cache', 'resolver should report cache as the fallback source');
assertEqual(fromCache.src, 'data:image/png;base64,ccc', 'resolver should return cache src');

console.log('generated image source resolver test passed');
