const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGeneratedImageEntities, filterReadyGeneratedImageEntities } = require('../generatedImageEntities.ts');

test('prompt placeholder and later ready native image collapse into one ready entity', () => {
  const entities = buildGeneratedImageEntities({
    messageId: 7,
    memberships: [
      {
        markerId: 'gm:7:placeholder',
        promptToken: 'image###nsf,1girl,snow###',
        createdOrder: 0,
      },
    ],
    nativeImages: [
      {
        requestId: 'req-7-1',
        promptToken: 'image###nsf,1girl,snow###',
        src: 'https://example.com/7-1.png',
        alt: 'ready image',
      },
    ],
  });

  assert.equal(entities.length, 1);
  assert.equal(entities[0].ready, true);
  assert.equal(entities[0].promptToken, 'image###nsf,1girl,snow###');
  assert.equal(entities[0].src, 'https://example.com/7-1.png');
  assert.equal(entities[0].requestId, 'req-7-1');
});

test('gallery filtering excludes placeholder-only entities', () => {
  const readyOnly = filterReadyGeneratedImageEntities(
    buildGeneratedImageEntities({
      messageId: 9,
      memberships: [
        {
          markerId: 'gm:9:a',
          promptToken: 'image###placeholder-only###',
          createdOrder: 0,
        },
      ],
      nativeImages: [],
    }),
  );

  assert.deepEqual(readyOnly, []);
});

test('ready image without prompt token remains a single ready entity instead of creating a duplicate fallback card', () => {
  const entities = buildGeneratedImageEntities({
    messageId: 11,
    memberships: [
      {
        markerId: 'gm:11:a',
        promptToken: 'image###floor-11-image-1###',
        requestId: 'req-11-1',
        createdOrder: 0,
      },
    ],
    nativeImages: [
      {
        requestId: 'req-11-1',
        src: 'https://example.com/11-1.png',
        alt: 'gallery image',
      },
    ],
  });

  assert.equal(entities.length, 1);
  assert.equal(filterReadyGeneratedImageEntities(entities).length, 1);
  assert.equal(filterReadyGeneratedImageEntities(entities)[0].src, 'https://example.com/11-1.png');
});

test('later ready source upgrades an existing placeholder entity instead of allocating a second entity', () => {
  const placeholderPass = buildGeneratedImageEntities({
    messageId: 13,
    memberships: [
      {
        markerId: 'gm:13:a',
        promptToken: 'image###7楼图3###',
        createdOrder: 2,
      },
    ],
    nativeImages: [],
  });

  assert.equal(placeholderPass.length, 1);
  assert.equal(placeholderPass[0].ready, false);

  const upgradedPass = buildGeneratedImageEntities({
    messageId: 13,
    memberships: [
      {
        markerId: 'gm:13:a',
        promptToken: 'image###7楼图3###',
        createdOrder: 2,
      },
    ],
    nativeImages: [
      {
        promptToken: 'image###7楼图3###',
        src: 'https://example.com/13-3.png',
        alt: 'late ready image',
      },
    ],
  });

  assert.equal(upgradedPass.length, 1);
  assert.equal(upgradedPass[0].ready, true);
  assert.equal(upgradedPass[0].src, 'https://example.com/13-3.png');
});
