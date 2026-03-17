require('ts-node/register/transpile-only');

const {
  buildGeneratedImagePersistencePatch,
  syncDisplayedGeneratedImagesToExtra,
  sanitizePluginImageExtra,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const currentMessage = {
  message_id: 6,
  swipe_id: 0,
  data: {
    stream_demo: {
      generated_images: [],
    },
  },
  extra: {},
};

const patch = buildGeneratedImagePersistencePatch({
  message: currentMessage,
  response: {
    requestId: 'req-1',
    prompt: 'image###角色A###',
    promptToken: 'image###角色A###',
    imageData: 'data:image/png;base64,aaa',
  },
});

assertEqual(
  patch.nextData.stream_demo.generated_images.length,
  1,
  'generated image should be appended to data.stream_demo.generated_images',
);
assertEqual(
  patch.nextData.stream_demo.generated_images[0].requestId,
  'req-1',
  'generated image should preserve request id in message data',
);
assertEqual(
  Array.isArray(patch.nextExtra.images[0]),
  true,
  'extra.images should be created as swipe-indexed array when swipe id is available',
);
assertEqual(
  patch.nextExtra.images[0][0].requestId,
  'req-1',
  'extra.images entry should preserve request id',
);
assertEqual(
  patch.nextExtra.images[0][0].regex,
  '',
  'extra.images entry should include a safe regex field for st-chatu8 restore flow',
);
assertEqual(
  Array.isArray(patch.nextExtra.lockedTags),
  true,
  'extra.lockedTags should be created for plugin-native recovery flow',
);
assertEqual(
  patch.nextExtra.lockedTags[0],
  'image###角色A###',
  'extra.lockedTags should include the prompt/tag used for the generated image',
);

const syncedExtra = syncDisplayedGeneratedImagesToExtra(
  {
    swipe_id: 0,
    extra: {},
  },
  [
    {
      src: 'data:image/png;base64,aaa',
      alt: 'generated image',
      promptToken: 'image###角色B###',
      requestId: 'req-2',
      anchorText: '声音的目标，似乎是2002室的房门。',
    },
  ],
);

assertEqual(
  syncedExtra.images[0][0].regex,
  '声音的目标，似乎是2002室的房门。',
  'displayed-image sync should persist anchorText as plugin-native regex',
);
assertEqual(
  syncedExtra.images[0][0].tag,
  '角色B',
  'displayed-image sync should persist plain prompt body as plugin-native tag',
);
assertEqual(
  syncedExtra.lockedTags[0],
  '角色B',
  'displayed-image sync should refresh lockedTags from rendered images',
);

const sanitized = sanitizePluginImageExtra({
  images: [[{ requestId: 'req-legacy', src: 'data:image/png;base64,legacy' }]],
  lockedTags: [' legacy-tag '],
});

assertEqual(
  sanitized.images[0][0].regex,
  '',
  'sanitize should backfill missing regex to a safe empty string for legacy entries',
);
assertEqual(
  sanitized.images[0][0].tag,
  '',
  'sanitize should backfill missing tag to a safe empty string for legacy entries',
);
assertEqual(
  sanitized.images[0][0].request_id,
  'req-legacy',
  'sanitize should mirror requestId into request_id for plugin-native compatibility',
);
assertEqual(
  sanitized.lockedTags[0],
  'legacy-tag',
  'sanitize should normalize existing lockedTags entries',
);

console.log('image persistence patch test passed');
