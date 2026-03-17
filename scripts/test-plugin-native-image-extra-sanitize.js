require('ts-node/register/transpile-only');

const {
  buildPluginImageExtraSanitizePatch,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const messages = [
  {
    message_id: 1,
    extra: {
      images: [[{ requestId: 'req-legacy', src: 'data:image/png;base64,legacy' }]],
      lockedTags: [' legacy-tag '],
    },
  },
  {
    message_id: 2,
    extra: {
      images: [[{
        requestId: 'req-ok',
        request_id: 'req-ok',
        tag: '角色A',
        regex: '',
        src: 'data:image/png;base64,ok',
        image: 'data:image/png;base64,ok',
        imageData: 'data:image/png;base64,ok',
        alt: 'generated image',
      }]],
      lockedTags: ['角色A'],
    },
  },
];

const patch = buildPluginImageExtraSanitizePatch(messages);

assertEqual(
  patch.length,
  1,
  'sanitize patch builder should only emit a patch for dirty messages',
);
assertEqual(
  patch[0].message_id,
  1,
  'sanitize patch builder should target the malformed message id',
);
assertEqual(
  patch[0].extra.images[0][0].regex,
  '',
  'sanitize patch builder should backfill missing regex',
);
assertEqual(
  patch[0].extra.images[0][0].request_id,
  'req-legacy',
  'sanitize patch builder should mirror requestId into request_id',
);
assertEqual(
  patch[0].extra.lockedTags[0],
  'legacy-tag',
  'sanitize patch builder should normalize lockedTags values',
);

console.log('plugin native image extra sanitize test passed');
