const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runtime = fs.readFileSync(path.resolve(__dirname, '../useSameLayerPre.ts'), 'utf8');
const page = fs.readFileSync(path.resolve(__dirname, '../pages/StoryPagePre.vue'), 'utf8');

test('normal, opening, and regeneration requests all use the shared streaming preference', () => {
  assert.equal([...runtime.matchAll(/await generatePreReply\((?:text|prompt), generationId\)/g)].length, 3);
  assert.match(runtime, /const shouldStream = streamingEnabled\.value/);
  assert.match(runtime, /should_stream:\s*shouldStream/);
  assert.match(runtime, /stopGenerationById\(id\)/);
  assert.match(runtime, /STREAM_TOKEN_RECEIVED_FULLY/);
});

test('settings and opening controls share the same preference', () => {
  assert.match(page, /v-model="streamingEnabled"/);
  assert.match(page, /use_stream:\s*streamingEnabled/);
  assert.match(page, /function updateOpeningStream\(value: boolean\)\s*\{\s*streamingEnabled\.value = value/);
});
