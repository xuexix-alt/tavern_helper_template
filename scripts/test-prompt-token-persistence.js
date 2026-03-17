require('ts-node/register/transpile-only');

const { mergePromptTokensIntoRawMessage } = require('../src/寒冬末日/界面同层版/界面/状态栏/promptTokenPersistence.ts');

function assertIncludes(actual, expected, message) {
  if (!String(actual).includes(expected)) {
    throw new Error(`${message}\nexpected substring: ${expected}\nactual: ${actual}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const raw = [
  '[stream-demo:minimal]',
  '<demo_phase>done</demo_phase>',
  '<content>',
  '第一段。',
  '声音的目标，似乎是2002室的房门。',
  '第三段。',
  '</content>',
].join('\n');

const anchored = mergePromptTokensIntoRawMessage(raw, [
  {
    promptToken: 'image###图一###',
    anchorText: '声音的目标，似乎是2002室的房门。',
  },
]);

assertIncludes(
  anchored,
  '声音的目标，似乎是2002室的房门。\nimage###图一###',
  'prompt token should be inserted right after the matching anchor line inside content',
);

const fallback = mergePromptTokensIntoRawMessage(raw, [
  {
    promptToken: 'image###图二###',
    anchorText: '',
  },
]);

assertIncludes(
  fallback,
  '第三段。\nimage###图二###\n</content>',
  'prompt token without anchor should fall back to the end of the content block',
);

const deduped = mergePromptTokensIntoRawMessage(
  [
    '[stream-demo:minimal]',
    '<demo_phase>done</demo_phase>',
    '<content>',
    '第一段。',
    'image###图一###',
    '</content>',
  ].join('\n'),
  ['image###图一###'],
);

assertEqual(
  (deduped.match(/image###图一###/g) || []).length,
  1,
  'existing prompt token should not be duplicated when re-persisting',
);

console.log('prompt token persistence test passed');
