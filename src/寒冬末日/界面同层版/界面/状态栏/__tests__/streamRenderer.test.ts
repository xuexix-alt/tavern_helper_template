const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStreamRendererHtml, STREAM_RENDERER_PENDING_HTML } = require('../streamRendererDisplay.ts');

function withTavernRegex(impl, run) {
  const previous = globalThis.formatAsTavernRegexedString;
  globalThis.formatAsTavernRegexedString = impl;
  try {
    run();
  } finally {
    if (previous === undefined) delete globalThis.formatAsTavernRegexedString;
    else globalThis.formatAsTavernRegexedString = previous;
  }
}

test('buildStreamRendererHtml returns pending placeholder for empty / whitespace input', () => {
  assert.equal(buildStreamRendererHtml('', 'assistant'), STREAM_RENDERER_PENDING_HTML);
  assert.equal(buildStreamRendererHtml('   \n  ', 'assistant'), STREAM_RENDERER_PENDING_HTML);
  assert.equal(buildStreamRendererHtml(null, 'assistant'), STREAM_RENDERER_PENDING_HTML);
});

test('buildStreamRendererHtml passes plain text through when no tavern regex intervenes', () => {
  // 测试环境下 formatAsTavernRegexedString 不存在，applyRegexForDisplay 原样返回。
  assert.equal(buildStreamRendererHtml('狂风卷着雪粒打在窗上。', 'assistant'), '狂风卷着雪粒打在窗上。');
});

test('buildStreamRendererHtml prefers tavern display regex HTML output (role -> ai_output)', () => {
  const calls = [];
  withTavernRegex(
    (text, source) => {
      calls.push({ text, source });
      return `<div class="scene-card">${text}</div>`;
    },
    () => {
      const html = buildStreamRendererHtml('<scene>暴风雪夜</scene>', 'assistant');
      assert.equal(html, '<div class="scene-card"><scene>暴风雪夜</scene></div>');
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].source, 'ai_output');
});

test('buildStreamRendererHtml maps user / system roles to their regex sources', () => {
  const sources = [];
  withTavernRegex(
    (text, source) => {
      sources.push(source);
      return text;
    },
    () => {
      buildStreamRendererHtml('hi', 'user');
      buildStreamRendererHtml('sys', 'system');
    },
  );
  assert.deepEqual(sources, ['user_input', 'world_info']);
});

test('buildStreamRendererHtml escapes raw output when tavern regex returns empty', () => {
  withTavernRegex(
    () => '',
    () => {
      const html = buildStreamRendererHtml('<script>alert(1)</script>', 'assistant');
      assert.equal(html.includes('<script>'), false);
      assert.equal(html.includes('&lt;script&gt;'), true);
    },
  );
});

test('buildStreamRendererHtml strips visible chatu8 image### prompt tokens defensively', () => {
  withTavernRegex(
    text => text,
    () => {
      const html = buildStreamRendererHtml('正文开头 image###1girl, snow### 正文结尾', 'assistant');
      assert.equal(html.includes('###'), false);
      assert.equal(html.includes('正文开头'), true);
      assert.equal(html.includes('正文结尾'), true);
    },
  );
});
