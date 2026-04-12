const test = require('node:test');
const assert = require('node:assert/strict');

const { installHostChatInputBridge, shouldIgnoreNativeSubmitEvent } = require('../hostChatInputBridge.ts');

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const bucket = listeners.get(type) ?? [];
      bucket.push(handler);
      listeners.set(type, bucket);
    },
    removeEventListener(type, handler) {
      const bucket = listeners.get(type) ?? [];
      listeners.set(
        type,
        bucket.filter(item => item !== handler),
      );
    },
    async dispatch(type, event) {
      const bucket = listeners.get(type) ?? [];
      for (const handler of bucket) {
        await handler(event);
      }
    },
  };
}

function createMockComposerDocument() {
  const form = createEventTarget();
  const input = {
    value: 'native prompt',
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
  };

  return {
    form,
    input,
    querySelector(selector) {
      if (selector === '#send_form') return form;
      if (selector === '#send_textarea, #send_textarea textarea, #send_form textarea, textarea') return input;
      return null;
    },
  };
}

test('shouldIgnoreNativeSubmitEvent skips IME composition submits', () => {
  assert.equal(shouldIgnoreNativeSubmitEvent({ isComposing: true }), true);
  assert.equal(shouldIgnoreNativeSubmitEvent({ isComposing: false }), false);
});

test('installHostChatInputBridge intercepts one submit and routes it into same-layer send once', async () => {
  const doc = createMockComposerDocument();
  const submissions = [];
  const bridge = installHostChatInputBridge({
    getHostDocument: () => doc,
    isBusy: () => false,
    onSubmit: async text => {
      submissions.push(text);
      return true;
    },
  });

  const event = {
    isComposing: false,
    defaultPrevented: false,
    preventDefaultCalled: 0,
    stopImmediatePropagationCalled: 0,
    preventDefault() {
      this.defaultPrevented = true;
      this.preventDefaultCalled += 1;
    },
    stopImmediatePropagation() {
      this.stopImmediatePropagationCalled += 1;
    },
  };

  await doc.form.dispatch('submit', event);

  assert.deepEqual(submissions, ['native prompt']);
  assert.equal(event.preventDefaultCalled, 1);
  assert.equal(event.stopImmediatePropagationCalled, 1);
  assert.equal(doc.input.value, '');
  assert.equal(doc.input.focusCalls, 1);

  bridge.destroy();
});
