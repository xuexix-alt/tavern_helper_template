/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findDefaultRolePortraitEntries,
  listDefaultRolePortraitRoleNames,
  isDefaultRolePortraitEntryId,
} = require('../defaultRolePortraits.ts');

test('default portraits are registered for every role listed in 图床对应关系.txt', () => {
  const roleNames = listDefaultRolePortraitRoleNames();
  for (const expected of ['林月华', '凌音', '慕小小', '雪乃', '佐伯惠理', '佐伯诗织', '纪宁']) {
    assert.ok(roleNames.includes(expected), `${expected} should have a default portrait recipe registered`);
  }
});

test('findDefaultRolePortraitEntries returns at least two entries per main role so the back strip has 动漫 + 真人', () => {
  for (const roleName of ['林月华', '凌音', '慕小小', '雪乃', '佐伯惠理', '佐伯诗织', '纪宁']) {
    const entries = findDefaultRolePortraitEntries(roleName);
    assert.ok(
      entries.length >= 2,
      `${roleName} should expose at least 动漫/真人 default portraits, got ${entries.length}`,
    );
    assert.ok(
      entries.every(entry => typeof entry.src === 'string' && entry.src.startsWith('https://')),
      `${roleName} default entries should carry an https image source`,
    );
    assert.ok(
      entries.every(entry => entry.characterName === roleName),
      `${roleName} default entries should tag characterName so gallery matcher cannot mix them up`,
    );
  }
});

test('慕小小 keeps all three variants (动漫/真人/真人变色)', () => {
  const entries = findDefaultRolePortraitEntries('慕小小');
  assert.equal(entries.length, 3);
  const tokens = entries.map(entry => entry.promptToken);
  assert.deepEqual(tokens.sort(), ['default:anime', 'default:realistic', 'default:realistic_alt'].sort());
});

test('findDefaultRolePortraitEntries ignores case and whitespace variations', () => {
  const upper = findDefaultRolePortraitEntries('  林月华  ');
  assert.equal(upper.length, 2);
});

test('unknown role names fall back to the generic random portrait pool instead of the builtin placeholder', () => {
  const entries = findDefaultRolePortraitEntries('陈雪');

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map(entry => entry.src).sort(),
    ['https://files.catbox.moe/mkdgkp.jpg', 'https://files.catbox.moe/w7txx9.jpg'].sort(),
  );
  assert.ok(entries.every(entry => entry.characterName === '陈雪'));
});

test('empty role names still return an empty default portrait list', () => {
  assert.deepEqual(findDefaultRolePortraitEntries(''), []);
  assert.deepEqual(findDefaultRolePortraitEntries(null), []);
  assert.deepEqual(findDefaultRolePortraitEntries(undefined), []);
});

test('isDefaultRolePortraitEntryId distinguishes synthesized defaults from real gallery ids', () => {
  assert.equal(isDefaultRolePortraitEntryId('default::林月华::anime'), true);
  assert.equal(isDefaultRolePortraitEntryId('gallery-lin-1'), false);
  assert.equal(isDefaultRolePortraitEntryId(undefined), false);
  assert.equal(isDefaultRolePortraitEntryId(null), false);
});
