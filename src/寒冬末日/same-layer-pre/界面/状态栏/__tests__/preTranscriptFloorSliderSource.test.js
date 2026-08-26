const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../components/PreTranscriptFloorSlider.vue'), 'utf8');

test('floor slider exposes bounded native range semantics', () => {
  assert.match(source, /type="range"/);
  assert.match(source, /:min="effectiveMinimum"/);
  assert.match(source, /:max="effectiveMaximum"/);
  assert.match(source, /:aria-valuetext="displayLabel"/);
  assert.match(source, /emit\('update:modelValue', next\)/);
  assert.match(source, /emit\('change', draftValue\.value\)/);
});

test('floor slider distinguishes recent and complete transcript labels', () => {
  assert.match(source, /全部 \$\{effectiveMaximum\.value\} 层/);
  assert.match(source, /最近 \$\{draftValue\.value\} 层 \/ 共 \$\{effectiveMaximum\.value\} 层/);
});
