const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGeneratedImageEntities, filterReadyGeneratedImageEntities } = require('../generatedImageEntities.ts');

test('DOM-only historical images pair with raw prompt memberships by order', () => {
  const promptToken = 'image###sfw, 1girl, ${"name":"fujii yukino"}$, hallway###';
  const entities = buildGeneratedImageEntities({
    messageId: 3,
    memberships: [
      {
        markerId: 'message-3-prompt-0',
        promptToken,
        createdOrder: 0,
      },
    ],
    nativeImages: [
      {
        src: 'data:image/png;base64,abc',
        alt: 'Generated Image',
      },
    ],
  });

  const ready = filterReadyGeneratedImageEntities(entities);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].promptToken, promptToken);
  assert.equal(ready[0].src, 'data:image/png;base64,abc');
  assert.equal(ready[0].id, 'message-3-prompt-0');
});

test('DOM-only images with src-derived identities still pair with raw prompt memberships by order', () => {
  const promptToken = 'image###sfw, 1girl, ${"name":"fujii yukino"}$, close-up###';
  const src = 'data:image/png;base64,src-derived';
  const entities = buildGeneratedImageEntities({
    messageId: 4,
    memberships: [
      {
        markerId: 'message-4-prompt-0',
        promptToken,
        createdOrder: 0,
      },
    ],
    nativeImages: [
      {
        imageId: src,
        src,
        alt: 'Generated Image',
        anchorText: '一段正文锚点，但不是图片身份',
      },
    ],
  });

  const ready = filterReadyGeneratedImageEntities(entities);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].promptToken, promptToken);
  assert.equal(ready[0].src, src);
  assert.equal(ready[0].id, 'message-4-prompt-0');
});
