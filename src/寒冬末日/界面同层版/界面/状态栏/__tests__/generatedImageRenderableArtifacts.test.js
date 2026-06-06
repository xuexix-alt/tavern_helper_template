const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeRenderableGeneratedImageArtifact,
} = require('../generatedImageRenderableArtifacts.ts');

test('same-src rendered image artifacts keep the existing image while filling plugin identity fields', () => {
  const merged = mergeRenderableGeneratedImageArtifact(
    {
      src: 'data:image/png;base64,abc',
      alt: 'Generated Image',
    },
    {
      src: 'data:image/png;base64,abc',
      promptToken: 'image###sfw, 1girl, convenience store###',
      requestId: 'chatu8-id-ya9jqz',
      anchorText: '她右手背在身后，死死捏着那个零钱包',
    },
  );

  assert.equal(merged.src, 'data:image/png;base64,abc');
  assert.equal(merged.alt, 'Generated Image');
  assert.equal(merged.promptToken, 'image###sfw, 1girl, convenience store###');
  assert.equal(merged.requestId, 'chatu8-id-ya9jqz');
  assert.equal(merged.anchorText, '她右手背在身后，死死捏着那个零钱包');
});
