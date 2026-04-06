const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TranscriptMessageCard no longer uses preview as a rendering fallback for system or user cards', () => {
  const sourcePath = path.resolve(__dirname, '../components/TranscriptMessageCard.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /item\.preview\s*\|\|\s*item\.content/);
  assert.doesNotMatch(source, /item\.content\s*\|\|\s*item\.preview/);
});

test('reader summary no longer derives latest previews from transcript preview fields', () => {
  const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(source, /latestUserItem\.value\?\.preview/);
  assert.doesNotMatch(source, /latestAssistantItem\.value\?\.preview/);
  assert.doesNotMatch(source, /find\(item => item\.isOpening\)\?\.preview/);
});
