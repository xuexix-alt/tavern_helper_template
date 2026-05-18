const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createReasoningStreamState,
  extractNativeReasoningText,
  readTavernReasoningConfig,
  splitReasoningStreamText,
  resolveReasoningVisibleText,
} = require('../reasoningStreamBridge.ts');

test('splitReasoningStreamText treats an open reasoning block as reasoning-only streaming text', () => {
  const result = splitReasoningStreamText('<think>\n正在推理第一步', {
    enabled: true,
    prefix: '<think>\n',
    suffix: '\n</think>',
  });

  assert.equal(result.state, 'thinking');
  assert.equal(result.visibleText, '');
  assert.equal(result.reasoningText, '正在推理第一步');
  assert.equal(result.hasReasoning, true);
});

test('splitReasoningStreamText moves closed reasoning out of the visible assistant body', () => {
  const result = splitReasoningStreamText('<think>\n先确认安全屋\n</think>\n窗外风雪压低了声音。', {
    enabled: true,
    prefix: '<think>\n',
    suffix: '\n</think>',
  });

  assert.equal(result.state, 'done');
  assert.equal(result.visibleText, '\n窗外风雪压低了声音。');
  assert.equal(result.reasoningText, '先确认安全屋');
});

test('splitReasoningStreamText supports custom Tavern reasoning wrappers', () => {
  const result = splitReasoningStreamText('<reason>alpha</reason>正文', {
    enabled: true,
    prefix: '<reason>',
    suffix: '</reason>',
  });

  assert.equal(result.state, 'done');
  assert.equal(result.visibleText, '正文');
  assert.equal(result.reasoningText, 'alpha');
});

test('splitReasoningStreamText leaves stream text untouched when reasoning auto parse is disabled', () => {
  const raw = '<think>alpha</think>正文';
  const result = splitReasoningStreamText(raw, {
    enabled: false,
    prefix: '<think>',
    suffix: '</think>',
  });

  assert.equal(result.state, 'idle');
  assert.equal(result.visibleText, raw);
  assert.equal(result.reasoningText, '');
});

test('resolveReasoningVisibleText prefers visible final text but can fall back to raw stream text', () => {
  const state = createReasoningStreamState({
    enabled: true,
    prefix: '<think>',
    suffix: '</think>',
  });

  state.appendRawToken('<think>alpha');
  assert.equal(resolveReasoningVisibleText(state, '', 'stream'), '');
  assert.equal(resolveReasoningVisibleText(state, '', 'done'), '<think>alpha');

  state.appendRawToken('</think>正文');
  assert.equal(resolveReasoningVisibleText(state, '', 'done'), '正文');
  assert.equal(state.reasoningText, 'alpha');
  assert.equal(state.reasoningState, 'done');
});

test('extractNativeReasoningText reads SillyTavern parsed reasoning without parsing wrappers', () => {
  const result = extractNativeReasoningText({
    mes: '窗外风雪压低了声音。',
    extra: {
      reasoning: '先确认避难所库存，再推动楼层行动。',
      reasoning_duration: 47000,
    },
  });

  assert.equal(result, '先确认避难所库存，再推动楼层行动。');
});

test('readTavernReasoningConfig reads SillyTavern context power user settings', () => {
  const hostWindow = {
    SillyTavern: {
      getContext() {
        return {
          powerUserSettings: {
            reasoning: {
              auto_parse: true,
              auto_expand: false,
              show_hidden: true,
              prefix: '<thinking>',
              suffix: '</thinking>',
            },
          },
        };
      },
    },
  };

  const result = readTavernReasoningConfig(hostWindow);

  assert.equal(result.enabled, true);
  assert.equal(result.prefix, '<thinking>');
  assert.equal(result.suffix, '</thinking>');
  assert.equal(result.autoExpand, false);
  assert.equal(result.showHidden, true);
});

test('splitReasoningStreamText prefers the host native reasoning parser for closed blocks', () => {
  let calls = 0;
  const hostParser = (text, options) => {
    calls += 1;
    assert.equal(text, '  <thinking>alpha</thinking>正文  ');
    assert.deepEqual(options, { strict: true });
    return { reasoning: 'alpha', content: '正文' };
  };

  const result = splitReasoningStreamText('  <thinking>alpha</thinking>正文  ', {
    enabled: true,
    prefix: '<thinking>',
    suffix: '</thinking>',
    parseReasoningFromString: hostParser,
  });

  assert.equal(calls, 1);
  assert.equal(result.state, 'done');
  assert.equal(result.visibleText, '正文');
  assert.equal(result.reasoningText, 'alpha');
});
