/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveRolePortrait,
  buildRolePortraitOverride,
  findGalleryEntryForRole,
  addRolePortraitSetImage,
  setPrimaryRolePortraitOverride,
  resolveRolePortraitSet,
} = require('../rolePortraits.ts');

test('manual portrait override resolves the matching gallery image before defaults', () => {
  const entries = [
    {
      id: 'gallery-1',
      messageId: 7,
      markerId: 'marker-7',
      imageId: 'img-7',
      promptToken: 'image###王静, coat###',
      title: '王静设定图',
      characterName: '王静',
      createdOrder: 0,
      src: 'https://example.com/wangjing.png',
    },
  ];

  const portrait = resolveRolePortrait(
    { key: '王静', label: '王静' },
    entries,
    {
      王静: {
        roleKey: '王静',
        imageRef: { messageId: 7, markerId: 'marker-7', imageId: 'img-7' },
        updatedAt: 1,
      },
    },
    { defaultSrc: 'builtin-default.webp' },
  );

  assert.equal(portrait.src, 'https://example.com/wangjing.png');
  assert.equal(portrait.source, 'gallery');
  assert.equal(portrait.entry?.id, 'gallery-1');
});

test('role portrait falls back to a matching character gallery entry and then built in default', () => {
  const entries = [
    {
      id: 'gallery-old',
      messageId: 3,
      promptToken: 'image###林月华###',
      title: '旧图',
      characterName: '林月华',
      createdOrder: 0,
      src: 'https://example.com/old.png',
    },
    {
      id: 'gallery-new',
      messageId: 9,
      promptToken: 'image###林月华###',
      title: '新图',
      characterName: '林月华',
      createdOrder: 1,
      src: 'https://example.com/new.png',
    },
  ];

  const matched = resolveRolePortrait({ key: 'lin', label: '林月华' }, entries, {}, { defaultSrc: 'default.webp' });
  const fallback = resolveRolePortrait({ key: 'chen', label: '陈雪' }, [], {}, { defaultSrc: 'default.webp' });

  assert.equal(matched.src, 'https://example.com/new.png');
  assert.equal(matched.source, 'gallery');
  assert.equal(fallback.src, 'default.webp');
  assert.equal(fallback.source, 'default');
});

test('portrait picker can persist a thin gallery reference without storing image data', () => {
  const override = buildRolePortraitOverride('林月华', {
    id: 'gallery-new',
    messageId: 9,
    markerId: 'marker-9',
    imageId: 'img-9',
    requestId: 'req-9',
    promptToken: 'image###林月华###',
    title: '新图',
    characterName: '林月华',
    createdOrder: 1,
    src: 'https://example.com/new.png',
  });

  assert.deepEqual(override.imageRef, {
    messageId: 9,
    markerId: 'marker-9',
    imageId: 'img-9',
    requestId: 'req-9',
    promptToken: 'image###林月华###',
  });
  assert.equal('src' in override.imageRef, false);
});

test('findGalleryEntryForRole prefers exact character names over prompt text matches', () => {
  const exact = {
    id: 'exact',
    messageId: 2,
    promptToken: 'image###portrait###',
    title: '人物',
    characterName: '陈雪',
    createdOrder: 0,
    src: 'https://example.com/exact.png',
  };
  const fuzzy = {
    id: 'fuzzy',
    messageId: 10,
    promptToken: 'image###陈雪, later###',
    title: '提示词命中',
    createdOrder: 1,
    src: 'https://example.com/fuzzy.png',
  };

  assert.equal(findGalleryEntryForRole({ key: 'chen', label: '陈雪' }, [fuzzy, exact])?.id, 'exact');
});

test('findGalleryEntryForRole treats parenthesized prompt suffixes as the same character name', () => {
  const entry = {
    id: 'lin-yuehua',
    messageId: 12,
    promptToken: 'image###portrait###',
    title: 'portrait',
    characterName: 'Lin Yuehua (original)',
    createdOrder: 0,
    src: 'https://example.com/lin-yuehua.png',
  };

  assert.equal(findGalleryEntryForRole({ key: 'lin', label: 'Lin Yuehua' }, [entry])?.id, 'lin-yuehua');
});

test('findGalleryEntryForRole matches project Chinese role names to English prompt names', () => {
  const entry = {
    id: 'lin-yuehua-english',
    messageId: 13,
    promptToken: 'image###portrait###',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: 0,
    src: 'https://example.com/lin-yuehua.png',
  };

  assert.equal(findGalleryEntryForRole({ key: '林月华', label: '林月华' }, [entry])?.id, 'lin-yuehua-english');
});

test('role portrait set keeps all matching character images instead of only the primary portrait', () => {
  const entries = [1, 2, 3, 4].map(index => ({
    id: `lin-${index}`,
    messageId: 5,
    promptToken: '',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: index,
    src: `https://example.com/lin-${index}.png`,
  }));

  const set = resolveRolePortraitSet({ key: '林月华', label: '林月华' }, entries, {});

  assert.deepEqual(
    set.map(entry => entry.id),
    ['lin-4', 'lin-3', 'lin-2', 'lin-1'],
  );
});

test('adding a gallery image stores it in the role portrait set without duplicating refs', () => {
  const entry = {
    id: 'lin-added',
    messageId: 5,
    markerId: 'marker-5',
    imageId: 'img-5',
    requestId: '',
    promptToken: '',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: 1,
    src: 'https://example.com/lin-added.png',
  };

  const once = addRolePortraitSetImage('林月华', undefined, entry);
  const twice = addRolePortraitSetImage('林月华', once, entry);

  assert.equal(twice.imageRefs.length, 1);
  assert.deepEqual(twice.imageRefs[0], {
    messageId: 5,
    markerId: 'marker-5',
    imageId: 'img-5',
  });
  assert.equal('src' in twice.imageRefs[0], false);
});

test('adding same-prompt images from one message keeps distinct set refs by gallery order', () => {
  const entries = [0, 1, 2, 3].map(index => ({
    id: `lin-same-prompt-${index}`,
    messageId: 5,
    markerId: '',
    imageId: '',
    requestId: '',
    promptToken: 'image###Lin Yuehua portrait###',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: index,
    src: `https://example.com/lin-${index}.png`,
  }));

  const override = entries.reduce(
    (current, entry) => addRolePortraitSetImage('林月华', current, entry),
    undefined,
  );
  const set = resolveRolePortraitSet({ key: '林月华', label: '林月华' }, entries, { 林月华: override });

  assert.deepEqual(
    override.imageRefs.map(ref => ref.createdOrder),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    set.map(entry => entry.id),
    ['lin-same-prompt-0', 'lin-same-prompt-1', 'lin-same-prompt-2', 'lin-same-prompt-3'],
  );
});

test('selecting a primary portrait keeps existing set images available', () => {
  const first = {
    id: 'lin-first',
    messageId: 5,
    markerId: 'marker-5',
    imageId: 'img-5',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: 1,
    src: 'https://example.com/lin-first.png',
  };
  const second = {
    id: 'lin-second',
    messageId: 6,
    markerId: 'marker-6',
    imageId: 'img-6',
    title: 'Lin Yuehua (original)',
    characterName: 'Lin Yuehua (original)',
    createdOrder: 2,
    src: 'https://example.com/lin-second.png',
  };

  const withFirst = addRolePortraitSetImage('林月华', undefined, first);
  const selectedSecond = setPrimaryRolePortraitOverride('林月华', withFirst, second);

  assert.deepEqual(selectedSecond.imageRef, {
    messageId: 6,
    markerId: 'marker-6',
    imageId: 'img-6',
  });
  assert.deepEqual(
    selectedSecond.imageRefs.map(ref => ref.messageId),
    [5, 6],
  );
});

test('resolving a portrait uses the selected primary ref even when it already exists in the set', () => {
  const entries = [
    {
      id: 'lin-first',
      messageId: 5,
      markerId: 'marker-5',
      imageId: 'img-5',
      title: 'Lin Yuehua (original)',
      characterName: 'Lin Yuehua (original)',
      createdOrder: 1,
      src: 'https://example.com/lin-first.png',
    },
    {
      id: 'lin-second',
      messageId: 6,
      markerId: 'marker-6',
      imageId: 'img-6',
      title: 'Lin Yuehua (original)',
      characterName: 'Lin Yuehua (original)',
      createdOrder: 2,
      src: 'https://example.com/lin-second.png',
    },
  ];

  const withFirst = addRolePortraitSetImage('林月华', undefined, entries[0]);
  const selectedSecond = setPrimaryRolePortraitOverride('林月华', withFirst, entries[1]);
  const selectedFirstAgain = setPrimaryRolePortraitOverride('林月华', selectedSecond, entries[0]);
  const portrait = resolveRolePortrait(
    { key: '林月华', label: '林月华' },
    entries,
    { 林月华: selectedFirstAgain },
    { defaultSrc: 'default.webp' },
  );

  assert.equal(portrait.entry?.id, 'lin-first');
});
