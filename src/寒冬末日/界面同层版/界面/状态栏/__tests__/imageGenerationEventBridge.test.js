/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createImageGenerationEventBridge,
  summarizeImageGenerationFailure,
  GENERATE_IMAGE_REQUEST_EVENT,
  GENERATE_IMAGE_RESPONSE_EVENT,
} = require('../imageGenerationEventBridge.ts');

function buildFakeEvents() {
  const listeners = new Map();
  return {
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    removeListener: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    emit: (event, payload) => {
      const bucket = listeners.get(event);
      if (!bucket) return;
      for (const handler of [...bucket]) handler(payload);
    },
    listenerCount: event => listeners.get(event)?.size ?? 0,
  };
}

function createBridge(opts = {}) {
  const events = buildFakeEvents();
  const notified = [];
  const requests = [];
  const successes = [];
  const failures = [];
  const traces = [];
  const bridge = createImageGenerationEventBridge({
    eventOn: events.on,
    eventRemoveListener: events.removeListener,
    onRequest: payload => requests.push(payload),
    onResponseSuccess: payload => successes.push(payload),
    onResponseFailure: payload => failures.push(payload),
    notifyError: (message, detail) => notified.push({ message, detail }),
    recordTrace: (scope, event, payload) => traces.push({ scope, event, payload }),
    ...opts,
  });
  return { bridge, events, notified, requests, successes, failures, traces };
}

test('request handler records the pending prompt and increments inflight count', () => {
  const { bridge, events, requests } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-1', prompt: 'a cat' });
  assert.equal(bridge.getInFlightCount(), 1);
  assert.deepEqual(requests, [{ requestId: 'req-1', prompt: 'a cat' }]);
});

test('request and response handlers accept plugin change text as the prompt fallback', () => {
  const { bridge, events, requests, successes } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-change', change: 'reroll same image prompt' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, {
    id: 'req-change',
    success: true,
    change: 'reroll same image prompt',
    imageData: 'data:image/png;base64,BBB',
  });

  assert.equal(bridge.getInFlightCount(), 0);
  assert.deepEqual(requests, [{ requestId: 'req-change', prompt: 'reroll same image prompt' }]);
  assert.equal(successes.length, 1);
  assert.equal(successes[0].prompt, 'reroll same image prompt');
});

test('successful response clears inflight and dispatches onResponseSuccess without toast', () => {
  const { bridge, events, successes, failures, notified } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-2', prompt: 'a cat' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, { id: 'req-2', success: true, imageData: 'data:image/png;base64,AAA' });

  assert.equal(bridge.getInFlightCount(), 0);
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 0);
  assert.equal(notified.length, 0);
  assert.equal(successes[0].prompt, 'a cat');
});

test('undefined plugin request ids are treated as anonymous while preserving prompt handoff', () => {
  const { bridge, events, requests, successes, failures, notified } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'undefined', prompt: 'Scene Composition:car interior' });
  assert.equal(bridge.getInFlightCount(), 0);
  assert.deepEqual(requests, [{ requestId: '', prompt: 'Scene Composition:car interior' }]);

  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, {
    id: 'undefined',
    success: true,
    prompt: 'Scene Composition:car interior',
    imageData: 'data:image/png;base64,ANON',
  });

  assert.equal(successes.length, 1);
  assert.equal(successes[0].requestId, '');
  assert.equal(successes[0].prompt, 'Scene Composition:car interior');
  assert.equal(successes[0].imageData, 'data:image/png;base64,ANON');
  assert.equal(failures.length, 0);
  assert.equal(notified.length, 0);
});

test('single anonymous response without prompt can reuse the only anonymous request prompt', () => {
  const { events, successes } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'undefined', prompt: 'Scene Composition:single anon' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, {
    id: 'undefined',
    success: true,
    imageData: 'data:image/png;base64,SINGLE',
  });

  assert.equal(successes.length, 1);
  assert.equal(successes[0].requestId, '');
  assert.equal(successes[0].prompt, 'Scene Composition:single anon');
});

test('concurrent anonymous responses without prompt are not guessed by FIFO', () => {
  const { events, successes } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'undefined', prompt: 'Scene Composition:first anon' });
  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'undefined', prompt: 'Scene Composition:second anon' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, {
    id: 'undefined',
    success: true,
    imageData: 'data:image/png;base64,AMBIGUOUS',
  });

  assert.equal(successes.length, 1);
  assert.equal(successes[0].requestId, '');
  assert.equal(successes[0].prompt, '');
});

test('failure response triggers notifyError and onResponseFailure with summarized message', () => {
  const { bridge, events, successes, failures, notified } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-3', prompt: 'a dog' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, {
    id: 'req-3',
    success: false,
    error: "Can't read the data of 'the loaded zip file'. Is it in a supported JavaScript type?",
  });

  assert.equal(bridge.getInFlightCount(), 0);
  assert.equal(successes.length, 0);
  assert.equal(failures.length, 1);
  assert.match(notified[0].message, /NovelAI|zip|解析/);
});

test('response with falsy success and empty imageData is treated as a failure even when error is missing', () => {
  const { bridge, events, failures, notified } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-4', prompt: 'x' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, { id: 'req-4', success: false, imageData: '' });

  assert.equal(bridge.getInFlightCount(), 0);
  assert.equal(failures.length, 1);
  assert.equal(notified.length, 1);
});

test('response that omits success but carries imageData is treated as success for backward compatibility', () => {
  const { bridge, events, successes, notified } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-5', prompt: 'x' });
  events.emit(GENERATE_IMAGE_RESPONSE_EVENT, { id: 'req-5', imageData: 'data:image/png;base64,AAA' });

  assert.equal(successes.length, 1);
  assert.equal(notified.length, 0);
});

test('uninstall stops delivering events and cancels inflight tracking', () => {
  const { bridge, events, requests } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-6', prompt: 'x' });
  assert.equal(bridge.getInFlightCount(), 1);

  bridge.uninstall();
  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'req-7', prompt: 'y' });
  assert.equal(requests.length, 1, 'after uninstall, no new request callback should fire');
  assert.equal(bridge.getInFlightCount(), 0, 'inflight should be cleared after uninstall');
  assert.equal(events.listenerCount(GENERATE_IMAGE_REQUEST_EVENT), 0);
  assert.equal(events.listenerCount(GENERATE_IMAGE_RESPONSE_EVENT), 0);
});

test('summarizeImageGenerationFailure recognises zip, 429, auth, timeout and unknown errors', () => {
  const zip = summarizeImageGenerationFailure({
    requestId: 'r1',
    prompt: 'p',
    error: "Can't read the data of 'the loaded zip file'",
  });
  assert.match(zip.short, /NovelAI|zip|解析/);

  const rate = summarizeImageGenerationFailure({ requestId: 'r2', prompt: 'p', error: 'HTTP 429 rate limit' });
  assert.match(rate.short, /限流/);

  const auth = summarizeImageGenerationFailure({ requestId: 'r3', prompt: 'p', error: 'HTTP 401 Unauthorized' });
  assert.match(auth.short, /凭据|Token/);

  const timeout = summarizeImageGenerationFailure({ requestId: 'r4', prompt: 'p', error: 'Request timeout aborted' });
  assert.match(timeout.short, /超时/);

  const unknown = summarizeImageGenerationFailure({ requestId: 'r5', prompt: 'p', error: 'unexpected undefined' });
  assert.match(unknown.short, /unexpected undefined/);

  const empty = summarizeImageGenerationFailure({ requestId: 'r6', prompt: 'p', error: '' });
  assert.match(empty.short, /未返回错误详情/);
});

test('unrelated event payloads without id or prompt are silently ignored', () => {
  const { bridge, events, requests } = createBridge();

  events.emit(GENERATE_IMAGE_REQUEST_EVENT, { id: 'undefined' });
  events.emit(GENERATE_IMAGE_REQUEST_EVENT, null);

  assert.equal(bridge.getInFlightCount(), 0);
  assert.equal(requests.length, 0);
});
