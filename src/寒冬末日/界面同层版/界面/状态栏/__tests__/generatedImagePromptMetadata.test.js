/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCharacterNameFromPrompt,
  extractCharacterNameFromPngDataUri,
  extractImageTitleFromPrompt,
  extractImageTitleFromPngDataUri,
  extractPromptFromPngDataUri,
  formatImageDisplayName,
} = require('../generatedImagePromptMetadata.ts');

const linYuehuaPrompt =
  'image###sfw,1girl,solo,${"name":"Lin Yuehua (original)","angle":"from front","upperBody":"sfw","lowerBody":"sfw"}$,${"name":"thick winter coat","upperBody":"visible","lowerBody":"visible"}$, mature female,long brown hair,brown eyes###';

test('extracts character name from structured json name prompt blocks', () => {
  assert.equal(extractCharacterNameFromPrompt(linYuehuaPrompt), 'Lin Yuehua (original)');
});

test('uses determined character name as the generated image gallery title', () => {
  assert.equal(extractImageTitleFromPrompt(linYuehuaPrompt), 'Lin Yuehua (original)');
});

test('formats image display names without noisy original suffixes', () => {
  assert.equal(formatImageDisplayName('Lin Yuehua (original)'), 'Lin Yuehua');
  assert.equal(formatImageDisplayName('Lin Yuehua（origin）'), 'Lin Yuehua');
  assert.equal(formatImageDisplayName('林月华'), '林月华');
});

function makePngDataUriWithText(keyword, text) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const type = Buffer.from('tEXt', 'ascii');
  const data = Buffer.concat([Buffer.from(keyword, 'utf8'), Buffer.from([0]), Buffer.from(text, 'utf8')]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return `data:image/png;base64,${Buffer.concat([signature, length, type, data, crc, iend]).toString('base64')}`;
}

test('extracts prompt text from png Description metadata', () => {
  const png = makePngDataUriWithText('Description', linYuehuaPrompt);

  assert.equal(extractPromptFromPngDataUri(png), linYuehuaPrompt);
  assert.equal(extractCharacterNameFromPngDataUri(png), 'Lin Yuehua (original)');
  assert.equal(extractImageTitleFromPngDataUri(png), 'Lin Yuehua (original)');
});

test('extracts prompt field from png Comment json metadata', () => {
  const prompt = 'sfw,1girl,${"name":"Lin Yuehua (original)","angle":"from side"}$,winter coat';
  const png = makePngDataUriWithText('Comment', JSON.stringify({ prompt, seed: 12345 }));

  assert.equal(extractPromptFromPngDataUri(png), prompt);
  assert.equal(extractCharacterNameFromPngDataUri(png), 'Lin Yuehua (original)');
});
