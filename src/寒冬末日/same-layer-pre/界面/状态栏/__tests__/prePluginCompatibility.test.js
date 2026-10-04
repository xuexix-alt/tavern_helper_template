const test = require('node:test');
const assert = require('node:assert/strict');
const { scanLatestPreGalleryImageRefs } = require('../preGalleryImageRefs.ts');

const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

test('transparent host placeholder cannot win over a ready image with the same request', () => {
  const result = scanLatestPreGalleryImageRefs({
    messages: [{ message_id: 5, message: '', swipe_id: 0 }],
    context: {},
    hostArtifacts: [
      { messageId: 5, requestId: 'one', src: placeholder, source: 'host-dom' },
      { messageId: 5, requestId: 'one', src: 'https://example.test/real.png', source: 'pre-render' },
    ],
  });
  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].src, 'https://example.test/real.png');
});

test('same prompt or src does not merge two distinct request identities', () => {
  const result = scanLatestPreGalleryImageRefs({
    messages: [{ message_id: 5, message: '', swipe_id: 0 }],
    context: {},
    hostArtifacts: ['one', 'two'].map(requestId => ({
      messageId: 5,
      requestId,
      tag: 'same',
      src: 'https://example.test/shared.png',
    })),
  });
  assert.equal(result.refs.length, 2);
});

test('extra.images uses only the current swipe in the plugin object-map format', () => {
  const result = scanLatestPreGalleryImageRefs({
    messages: [
      {
        message_id: 5,
        message: '',
        swipe_id: 1,
        extra: {
          images: {
            0: [{ src: 'https://example.test/old.png' }],
            1: [{ src: 'https://example.test/current.png' }],
          },
        },
      },
    ],
    context: {},
    hostArtifacts: [],
  });
  assert.deepEqual(
    result.refs.map(ref => ref.src),
    ['https://example.test/current.png'],
  );
});
