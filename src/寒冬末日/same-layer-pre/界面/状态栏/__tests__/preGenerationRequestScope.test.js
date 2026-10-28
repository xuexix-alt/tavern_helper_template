const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPreGenerationRequestScope } = require('../preGenerationRequestScope.ts');

function environment() {
  const events = new EventEmitter();
  const seen = [];
  const host = {
    location: { href: 'http://localhost:8000/' },
    fetch: async (...args) => {
      seen.push(args);
      return new Response('original');
    },
  };
  let adapted = 0;
  const scope = createPreGenerationRequestScope({
    host,
    events,
    generationId: 'pre-1',
    adapt: async response => {
      adapted++;
      return new Response((await response.text()) + '-adapted');
    },
  });
  return { host, events, seen, scope, count: () => adapted };
}
test('matches current generation and exact finalized body without changing any request options', async () => {
  const e = environment();
  const originalFetch = e.scope.originalFetch;
  e.events.emit('js_generation_started', 'pre-1');
  const data = {
    stream: true,
    messages: ['input'],
    tools: [{ function: { name: 'preset_tool' } }],
    tool_choice: { type: 'function', function: { name: 'preset_tool' } },
  };
  e.events.emit('chat_completion_settings_ready', data);
  data.tools.push({ function: { name: 'late_plugin_tool' } });
  const init = { method: 'POST', body: JSON.stringify(data), signal: new AbortController().signal };
  assert.equal(await (await e.host.fetch('/api/backends/chat-completions/generate', init)).text(), 'original-adapted');
  assert.equal(e.seen[0][1], init);
  assert.equal(e.count(), 1);
  e.scope.assertClaimed();
  e.scope.dispose();
  assert.equal(e.host.fetch, originalFetch);
  assert.equal(e.events.listenerCount('js_generation_started'), 0);
});
test('unrelated requests pass through and overlapping generation refuses attribution', async () => {
  const e = environment();
  e.events.emit('js_generation_started', 'pre-1');
  const data = { messages: ['target'], stream: false };
  e.events.emit('chat_completion_settings_ready', data);
  assert.equal(await (await e.host.fetch('/other', { method: 'POST', body: JSON.stringify(data) })).text(), 'original');
  assert.equal(
    await (
      await e.host.fetch('/api/backends/chat-completions/generate', { method: 'POST', body: '{"messages":["other"]}' })
    ).text(),
    'original',
  );
  e.events.emit('js_generation_started', 'another-generation');
  assert.equal(
    await (
      await e.host.fetch('/api/backends/chat-completions/generate', { method: 'POST', body: JSON.stringify(data) })
    ).text(),
    'original',
  );
  assert.equal(e.count(), 0);
  assert.throws(() => e.scope.assertClaimed(), /并发/);
  e.scope.dispose();
});
test('an aborted request cannot be adopted and newer fetch wrappers are never overwritten on cleanup', async () => {
  const e = environment();
  const controller = new AbortController();
  controller.abort();
  e.events.emit('js_generation_started', 'pre-1');
  const data = { messages: ['target'] };
  e.events.emit('chat_completion_settings_ready', data);
  await e.host.fetch('/api/backends/chat-completions/generate', {
    method: 'POST',
    body: JSON.stringify(data),
    signal: controller.signal,
  });
  assert.equal(e.count(), 0);
  const newerFetch = async () => new Response('newer');
  e.host.fetch = newerFetch;
  e.scope.dispose();
  assert.equal(e.host.fetch, newerFetch);
});

test('unawaited helper start is observed before an existing asynchronous listener', async () => {
  const events = new EventEmitter();
  events.makeFirst = events.prependListener;
  let unblock;
  events.on(
    'js_generation_started',
    () =>
      new Promise(resolve => {
        unblock = resolve;
      }),
  );
  const host = { location: { href: 'http://localhost:8000/' }, fetch: async () => new Response('original') };
  const scope = createPreGenerationRequestScope({
    host,
    events,
    generationId: 'pre-1',
    adapt: async () => new Response('adapted'),
  });
  const emitStart = (async () => {
    for (const listener of events.listeners('js_generation_started')) await listener('pre-1');
  })();
  const data = { stream: false, messages: ['input'] };
  events.emit('chat_completion_settings_ready', data);
  assert.equal(
    await (
      await host.fetch('/api/backends/chat-completions/generate', { method: 'POST', body: JSON.stringify(data) })
    ).text(),
    'adapted',
  );
  unblock();
  await emitStart;
  scope.assertClaimed();
  scope.dispose();
});
