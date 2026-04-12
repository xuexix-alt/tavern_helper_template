import { collectHostOnlyDocuments } from './hostBridge.ts';

function firstTruthy(...values) {
  return values.find(Boolean) ?? null;
}

export function resolveHostComposerInterceptionPlan(rootDocument) {
  if (!rootDocument || typeof rootDocument.querySelector !== 'function') return { mode: 'unavailable' };

  const form = rootDocument.querySelector('#send_form');
  const input = rootDocument.querySelector('#send_textarea, #send_textarea textarea, #send_form textarea, textarea');
  const sendButton = rootDocument.querySelector('#send_but, #send_form button[type="submit"], #send_form .send-button');

  if (!form || !input) {
    return { mode: 'unavailable', form: null, input: null, sendButton: sendButton ?? null };
  }

  return {
    mode: 'capture_submit',
    form,
    input,
    sendButton: sendButton ?? null,
  };
}

export function shouldIgnoreNativeSubmitEvent(event) {
  return event?.isComposing === true;
}

function resolveDefaultHostDocument() {
  return firstTruthy(...collectHostOnlyDocuments());
}

export function installHostChatInputBridge({ getHostDocument = resolveDefaultHostDocument, onSubmit, isBusy }) {
  const doc = getHostDocument?.();
  const plan = resolveHostComposerInterceptionPlan(doc);
  if (plan.mode !== 'capture_submit') {
    return { destroy() {} };
  }

  const handler = async event => {
    if (shouldIgnoreNativeSubmitEvent(event)) return;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (isBusy?.()) return;

    const text = String(plan.input?.value ?? '').trim();
    if (!text) return;

    const submitted = await onSubmit?.(text, 'native-chat');
    if (submitted) {
      plan.input.value = '';
      plan.input.focus?.();
    }
  };

  plan.form.addEventListener('submit', handler, true);

  return {
    destroy() {
      plan.form.removeEventListener('submit', handler, true);
    },
  };
}
