const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyTranscriptArtifacts,
  hydratePersistedImageElements,
} = require('../transcriptImagePersistence');

function createFakeImage(initialSrc) {
  const attrs = new Map([['src', initialSrc]]);
  return {
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    read(name) {
      return attrs.get(name);
    },
  };
}

test('applyTranscriptArtifacts appends persisted image markup during html rebuild', () => {
  const calls = [];
  const html = applyTranscriptArtifacts({
    html: '<p>正文</p>',
    renderSource: '<content>正文</content>',
    messageId: 7,
    appendArtifacts(currentHtml, renderSource, messageId) {
      calls.push({ currentHtml, renderSource, messageId });
      return `${currentHtml}<figure data-message-id="${messageId}"></figure>`;
    },
  });

  assert.equal(html, '<p>正文</p><figure data-message-id="7"></figure>');
  assert.deepEqual(calls, [
    {
      currentHtml: '<p>正文</p>',
      renderSource: '<content>正文</content>',
      messageId: 7,
    },
  ]);
});

test('hydratePersistedImageElements resolves idb src values asynchronously', async () => {
  const persisted = createFakeImage('idb://12/request-a');
  const untouched = createFakeImage('data:image/png;base64,abc');
  const seen = [];

  await hydratePersistedImageElements({
    elements: [persisted, untouched],
    async resolveSrc(src) {
      seen.push(src);
      if (src === 'idb://12/request-a') return 'data:image/png;base64,resolved';
      return null;
    },
  });

  assert.deepEqual(seen, ['idb://12/request-a']);
  assert.equal(persisted.read('src'), 'data:image/png;base64,resolved');
  assert.equal(persisted.read('data-persisted-image-status'), 'ready');
  assert.equal(persisted.read('data-persisted-image-src'), 'idb://12/request-a');
  assert.equal(untouched.read('src'), 'data:image/png;base64,abc');
  assert.equal(untouched.read('data-persisted-image-status'), undefined);
});
