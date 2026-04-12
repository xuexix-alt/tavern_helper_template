const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveHostComposerInterceptionPlan } = require('../hostChatInputBridge.ts');

function createMockDocument() {
  const form = { tagName: 'FORM' };
  const textarea = { value: 'hello', focus() {} };
  const button = { tagName: 'BUTTON' };

  return {
    querySelector(selector) {
      if (selector === '#send_form') return form;
      if (selector === '#send_textarea, #send_textarea textarea, #send_form textarea, textarea') return textarea;
      if (selector === '#send_but, #send_form button[type="submit"], #send_form .send-button') return button;
      return null;
    },
  };
}

test('resolveHostComposerInterceptionPlan prefers one capture-submit hook before host message creation', () => {
  const plan = resolveHostComposerInterceptionPlan(createMockDocument());

  assert.equal(plan.mode, 'capture_submit');
  assert.ok(plan.form);
  assert.ok(plan.input);
});
