const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('assistant streaming state should be surfaced on the outer card instead of narrowing the inner body box', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    source.includes(":class=\"{ 'is-streaming': item.isStreaming }\""),
    true,
    'assistant card should expose a streaming state class on the outer shell for layout-neutral status styling',
  );
  assert.equal(
    source.includes('.assistant-body.is-stream-stage {\n  padding: 14px 16px;'),
    false,
    'assistant stream state should not add extra inner padding that narrows the readable text width',
  );
  assert.equal(
    source.includes('.assistant-body.is-stream-stage {\n  padding: 0;'),
    true,
    'assistant stream state should keep the same inner body width contract as the final rendered body',
  );
  assert.equal(
    source.includes('.assistant-body-wrap :deep(.stream-stage-pre) {\n  margin: 0;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--demo-text-panel-strong);\n  font: inherit;\n  line-height: inherit;'),
    true,
    'assistant stream-stage pre blocks should inherit the same line-height contract as the live body wrapper',
  );
});

test('opening streaming state should reuse the final body width instead of wrapping content in a narrower padded shell', () => {
  const source = readSource('components/TranscriptOpeningCard.vue');

  assert.equal(
    source.includes("{ collapsed: !expanded, 'is-streaming': item.isStreaming }"),
    true,
    'opening card should expose a streaming state class on the outer shell for status-only styling',
  );
  assert.equal(
    source.includes('.html-body.is-stream-stage {\n  white-space: normal;\n  padding: 12px 14px;'),
    false,
    'opening stream state should not add extra inner padding that changes the final reading width',
  );
  assert.equal(
    source.includes('.html-body.is-stream-stage {\n  padding: 2px 0 0;'),
    true,
    'opening stream state should preserve the same body padding contract as the final rendered opening body',
  );
  assert.equal(
    source.includes('.html-body :deep(.stream-stage-pre) {\n  margin: 0;\n  white-space: pre-wrap;\n  word-break: break-word;\n  color: var(--demo-text-opening-strong);\n  font: inherit;\n  line-height: inherit;'),
    true,
    'opening stream-stage pre blocks should inherit the same line-height contract as the opening prose wrapper',
  );
});

test('transcript cards should share one centered prose width contract for both reading and nearby actions', () => {
  const listSource = readSource('components/TranscriptList.vue');
  const messageSource = readSource('components/TranscriptMessageCard.vue');
  const openingSource = readSource('components/TranscriptOpeningCard.vue');

  assert.equal(
    listSource.includes('--transcript-prose-max: min(100%, var(--reader-content-max, 72rem));'),
    true,
    'TranscriptList should publish one shared prose-width token derived from the reader content max',
  );
  assert.equal(
    messageSource.includes('max-width: var(--transcript-prose-max, 100%);'),
    true,
    'assistant/user message shells should clamp to the shared prose width token',
  );
  assert.equal(
    messageSource.includes('margin-inline: auto;'),
    true,
    'assistant/user message shells should be centered within the transcript rail for consistent reading alignment',
  );
  assert.equal(
    openingSource.includes('max-width: var(--transcript-prose-max, 100%);'),
    true,
    'opening cards should clamp to the same shared prose width token as normal transcript cards',
  );
  assert.equal(
    openingSource.includes('margin-inline: auto;'),
    true,
    'opening cards should be centered within the same reading rail as the rest of the transcript',
  );
});
