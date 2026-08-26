const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStreamRendererHtml, STREAM_RENDERER_PENDING_HTML } = require('../streamRendererDisplay.ts');

function withTavernRegex(impl, run) {
  const previousRegex = globalThis.formatAsTavernRegexedString;
  const previousFormatter = globalThis.formatAsDisplayedMessage;
  globalThis.formatAsTavernRegexedString = impl;
  globalThis.formatAsDisplayedMessage = () => {
    throw new Error('streaming must not require an existing message floor');
  };
  try {
    run();
  } finally {
    if (previousRegex === undefined) delete globalThis.formatAsTavernRegexedString;
    else globalThis.formatAsTavernRegexedString = previousRegex;
    if (previousFormatter === undefined) delete globalThis.formatAsDisplayedMessage;
    else globalThis.formatAsDisplayedMessage = previousFormatter;
  }
}

test('returns the pending marker for an empty streaming snapshot', () => {
  assert.equal(buildStreamRendererHtml('   ', 'assistant', 12), STREAM_RENDERER_PENDING_HTML);
});

test('uses ai_output display regex HTML without an existing message floor', () => {
  const calls = [];
  withTavernRegex(
    (text, source, destination, options) => {
      calls.push({ text, source, destination, options });
      return `<section class="beautified">${text}</section>`;
    },
    () => {
      assert.equal(
        buildStreamRendererHtml('<scene>雪夜</scene>', 'assistant', 999),
        '<section class="beautified"><scene>雪夜</scene></section>',
      );
    },
  );
  assert.deepEqual(calls, [
    {
      text: '<scene>雪夜</scene>',
      source: 'ai_output',
      destination: 'display',
      options: { depth: 0 },
    },
  ]);
});

test('maps user and system streaming roles to Tavern regex sources', () => {
  const sources = [];
  withTavernRegex(
    (text, source) => {
      sources.push(source);
      return text;
    },
    () => {
      buildStreamRendererHtml('玩家输入', 'user', 8);
      buildStreamRendererHtml('世界信息', 'system', 9);
    },
  );
  assert.deepEqual(sources, ['user_input', 'world_info']);
});

test('escapes the snapshot when Tavern display regex returns an empty string', () => {
  withTavernRegex(
    () => '',
    () => {
      assert.equal(
        buildStreamRendererHtml('<script>alert(1)</script>', 'assistant', 10),
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    },
  );
});

test('escapes the snapshot when Tavern display regex throws', () => {
  withTavernRegex(
    () => {
      throw new Error('regex unavailable');
    },
    () => {
      assert.equal(
        buildStreamRendererHtml('<b>unfinished</b>', 'assistant', 11),
        '&lt;b&gt;unfinished&lt;/b&gt;',
      );
    },
  );
});
