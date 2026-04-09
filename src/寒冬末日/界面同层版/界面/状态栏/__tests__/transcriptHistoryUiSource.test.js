const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('story page exposes a transcript window menu and history badge in the top bar', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /class="ui-icon-btn ui-page-menu-trigger"/);
  assert.match(source, /v-if="transcriptWindowMenuOpen"/);
  assert.match(source, /v-for="page in transcriptWindowPages"/);
  assert.match(source, /class="ui-history-badge clip-corner-sm"/);
  assert.match(source, /selectTranscriptWindowPage\(page\.pageIndex\)/);
});

test('mobile top bar no longer forces the fullscreen button to occupy a whole wrapped row', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /\.ui-fullscreen-btn\s*\{\s*flex:\s*0 0 auto;/);
});

test('transcript cards constrain rich html content to avoid horizontal page overflow', () => {
  const source = read('../components/TranscriptMessageCard.vue');

  assert.match(source, /\.assistant-card\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(source, /\.assistant-body\s*\{[\s\S]*max-width:\s*100%;/);
  assert.match(source, /\.assistant-body-wrap :deep\(pre\),[\s\S]*overflow-x:\s*auto;/);
});
