const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../useSameLayerPre.ts'), 'utf8');

test('PRE transcript state uses the shared preference and dynamic readable count', () => {
  assert.match(source, /readPreTranscriptDisplayPreference/);
  assert.match(source, /resolvePreTranscriptDisplayCount/);
  assert.match(source, /writePreTranscriptDisplayPreference/);
  assert.match(source, /const transcriptTotalCount = ref\(0\)/);
  assert.match(source, /const transcriptDisplayCount = computed/);
  assert.match(source, /function setTranscriptDisplayPreference\(value: number\)/);
});

test('PRE exposes a separately bounded six-floor MVU window', () => {
  assert.match(
    source,
    /const mvuTranscriptItems = computed\([\s\S]*selectPreMvuTranscriptItems\(transcriptItems\.value\)/,
  );
  assert.match(source, /mvuTranscriptItems,/);
});

test('streaming remains appended outside the persisted-floor quota', () => {
  assert.match(source, /return item \? \[\.\.\.transcriptItems\.value, item\] : transcriptItems\.value/);
});
