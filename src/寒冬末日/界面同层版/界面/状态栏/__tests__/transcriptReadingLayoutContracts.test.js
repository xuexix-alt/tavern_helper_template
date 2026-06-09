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
    /:class="\{[\s\S]*'is-streaming': item\.isStreaming[\s\S]*\}"/.test(source),
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
    source.includes(
      '.assistant-body-wrap :deep(.stream-stage-pre) {\n  margin: 0;\n  max-width: 100%;\n  overflow-x: auto;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n  color: var(--demo-text-panel-strong);\n  font: inherit;\n  line-height: inherit;',
    ),
    true,
    'assistant stream-stage pre blocks should inherit the same line-height contract while isolating overflow locally',
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
    source.includes(
      '.html-body :deep(.stream-stage-pre) {\n  margin: 0;\n  max-width: 100%;\n  overflow-x: auto;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n  color: var(--demo-text-opening-strong);\n  font: inherit;\n  line-height: inherit;',
    ),
    true,
    'opening stream-stage pre blocks should inherit the same line-height contract while isolating overflow locally',
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

test('reader theme defaults to amber when no saved layout choice exists', () => {
  const readerStateSource = readSource('readerState.ts');
  const demoSource = readSource('useStreamingDemo.ts');

  assert.equal(
    readerStateSource.includes("theme: normalizeTheme(raw?.theme) ?? 'amber'"),
    true,
    'migrated reader chat state should default missing theme values to amber',
  );
  assert.equal(
    readerStateSource.includes("theme: normalizeTheme(patch.theme) ?? normalizeTheme(current.theme) ?? 'amber'"),
    true,
    'reader chat state patching should preserve amber as the fallback theme',
  );
  assert.equal(
    demoSource.includes("const theme = ref<DemoTheme>('amber');"),
    true,
    'fresh same-layer reader sessions should start on the amber theme before restored state is applied',
  );
});

test('transcript html bodies isolate unbreakable content so it cannot widen parent cards', () => {
  const messageSource = readSource('components/TranscriptMessageCard.vue');
  const openingSource = readSource('components/TranscriptOpeningCard.vue');
  const streamRendererSource = readSource('components/StreamRenderer.vue');

  assert.equal(
    messageSource.includes('.assistant-body {\n  position: relative;\n  z-index: 1;\n  contain: inline-size;'),
    true,
    'assistant html body should contain inline sizing so unbreakable regex HTML cannot widen ancestor cards',
  );
  assert.equal(
    messageSource.includes('overflow-x: hidden;\n  overflow-wrap: anywhere;'),
    true,
    'assistant html body should force ordinary oversized inline content to wrap instead of widening or scrolling the whole prose body',
  );
  assert.equal(
    messageSource.includes('.assistant-body-wrap :deep(div),\n.assistant-body-wrap :deep(section),'),
    true,
    'assistant html descendants should be clamped to the body width even when regex output uses block wrappers',
  );
  assert.equal(
    openingSource.includes('.html-body {\n  contain: inline-size;'),
    true,
    'opening html body should use the same inline-size containment contract as normal assistant bodies',
  );
  assert.equal(
    streamRendererSource.includes('.stream-renderer {\n  display: block;\n  contain: inline-size;'),
    true,
    'streaming renderer should isolate unbreakable live regex output before done rendering takes over',
  );
  assert.equal(
    messageSource.includes(
      '.assistant-body-wrap :deep(pre),\n.assistant-body-wrap :deep(table) {\n  display: block;\n  max-width: 100%;\n  overflow-x: auto;',
    ),
    true,
    'only preformatted blocks and tables should keep local horizontal scrolling',
  );
  assert.equal(
    messageSource.includes('.assistant-body-wrap :deep(pre) {\n  white-space: pre;\n}'),
    true,
    'preformatted code blocks should preserve long lines instead of forced wrapping',
  );
});
