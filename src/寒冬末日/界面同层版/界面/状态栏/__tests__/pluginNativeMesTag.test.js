const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseNativeMesImageTags,
  extractNativeMesAnchorText,
  mergeNativeMesTagsWithExtraEntries,
} = require('../pluginNativeMesTag.ts');

test('parseNativeMesImageTags extracts ordered image tags with anchor text from raw message body', () => {
  const rawMessage = [
    '她这种目中无人的性格，让人一眼就看出是旧时代遗民。',
    'image###Scene Composition:sfw,1girl,ruins###',
    '风雪突然加大，她把衣领又拢紧了一点。',
    'image###Scene Composition:sfw,1girl,snowstorm###',
    '末尾补一句无关描述。',
  ].join('\n');

  const entries = parseNativeMesImageTags({
    messageId: 4,
    rawMessage,
  });

  assert.equal(entries.length, 2);

  assert.equal(entries[0].messageId, 4);
  assert.equal(entries[0].order, 0);
  assert.equal(entries[0].promptToken, 'image###Scene Composition:sfw,1girl,ruins###');
  assert.equal(entries[0].rawTag, 'image###Scene Composition:sfw,1girl,ruins###');
  assert.ok(entries[0].anchorText.includes('她这种目中无人的性格'));

  assert.equal(entries[1].messageId, 4);
  assert.equal(entries[1].order, 1);
  assert.equal(entries[1].promptToken, 'image###Scene Composition:sfw,1girl,snowstorm###');
  assert.equal(entries[1].rawTag, 'image###Scene Composition:sfw,1girl,snowstorm###');
  assert.ok(entries[1].anchorText.includes('风雪突然加大'));
});

test('extractNativeMesAnchorText derives nearby body text for target tag', () => {
  const rawMessage = ['第一段正文。', '第二段正文，描述她的神情。', 'image###foo###', '后文。'].join('\n');

  const anchor = extractNativeMesAnchorText({
    rawMessage,
    rawTag: 'image###foo###',
  });

  assert.ok(anchor.includes('第二段正文'));
});

test('mergeNativeMesTagsWithExtraEntries merges requestId and src hints from extra images', () => {
  const parsed = [
    {
      messageId: 9,
      order: 0,
      promptToken: 'image###foo###',
      rawTag: 'image###foo###',
      anchorText: 'foo anchor',
    },
    {
      messageId: 9,
      order: 1,
      promptToken: 'image###bar###',
      rawTag: 'image###bar###',
      anchorText: 'bar anchor',
    },
  ];

  const merged = mergeNativeMesTagsWithExtraEntries({
    tags: parsed,
    extraImages: [
      {
        prompt: 'foo',
        requestId: 'req-foo',
        image: 'https://example.com/foo.png',
      },
      {
        prompt: 'bar',
        requestId: 'req-bar',
        image: 'https://example.com/bar.png',
      },
    ],
  });

  assert.equal(merged.length, 2);
  assert.equal(merged[0].requestId, 'req-foo');
  assert.equal(merged[0].src, 'https://example.com/foo.png');
  assert.equal(merged[1].requestId, 'req-bar');
  assert.equal(merged[1].src, 'https://example.com/bar.png');
});
