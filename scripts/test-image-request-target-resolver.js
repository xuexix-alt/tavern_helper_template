require('ts-node/register/transpile-only');

const { resolveImageRequestTargetMessageId } = require('../src/寒冬末日/界面同层版/界面/状态栏/imageRequestTargetResolver.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

function createButton(prompt, messageId) {
  const messageCarrier = { dataset: { messageId: String(messageId) }, closest: () => null };
  return {
    getAttribute(name) {
      if (name === 'data-image-tag' || name === 'data-link') return prompt;
      return '';
    },
    closest(selector) {
      if (
        selector ===
        '.assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]'
      ) {
        return messageCarrier;
      }
      return null;
    },
  };
}

function createPromptMarker(prompt, messageId, options = {}) {
  const mesCarrier =
    options.useMesCarrier === true
      ? {
          dataset: {},
          getAttribute(name) {
            if (name === 'mesid') return String(messageId);
            return '';
          },
        }
      : null;
  const messageCarrier =
    mesCarrier ??
    {
      dataset: { messageId: String(messageId) },
      getAttribute() {
        return '';
      },
    };

  return {
    textContent: options.useTextContent === false ? '' : prompt,
    getAttribute(name) {
      if (name === 'data-prompt-token' && options.useTextContent === false) return prompt;
      return '';
    },
    closest(selector) {
      if (
        selector ===
        '.assistant-body[data-message-id], .assistant-card[data-message-id], .transcript-entry[data-message-id]'
      ) {
        return mesCarrier ? null : messageCarrier;
      }
      if (selector === '.mes[mesid]') return mesCarrier;
      return null;
    },
  };
}

const promptA = 'image###角色A###';
const promptB = 'image###角色B###';
const buttons = [createButton(promptA, 2), createButton(promptB, 6)];

assertEqual(
  resolveImageRequestTargetMessageId({
    prompt: promptB,
    listButtons: () => buttons,
  }),
  6,
  'request target resolver should find message id from matching button prompt',
);

assertEqual(
  resolveImageRequestTargetMessageId({
    prompt: 'image###未知###',
    listButtons: () => buttons,
  }),
  null,
  'request target resolver should return null when no button matches prompt',
);

assertEqual(
  resolveImageRequestTargetMessageId({
    prompt: promptA,
    listButtons: () => [],
    listTokenMarkers: () => [createPromptMarker(promptA, 8)],
  }),
  8,
  'request target resolver should fall back to正文 token markers when plugin button is missing',
);

assertEqual(
  resolveImageRequestTargetMessageId({
    prompt: promptB,
    listButtons: () => [],
    listTokenMarkers: () => [createPromptMarker(promptB, 12, { useMesCarrier: true, useTextContent: false })],
  }),
  12,
  'request target resolver should read mesid carriers when prompt marker is attached to host message nodes',
);

console.log('image request target resolver test passed');
