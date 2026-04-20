const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGalleryCatalogReadDebugPayload,
  buildGalleryCatalogWriteDebugPayload,
  buildGalleryCatalogRecord,
  mergeGalleryCatalogEntries,
  normalizeGalleryCatalogEntry,
} = require('../galleryCatalogPersistence.ts');

test('normalizeGalleryCatalogEntry keeps ready image metadata and rejects placeholder-only entries', () => {
  const readyEntry = normalizeGalleryCatalogEntry({
    id: 'gm:21:1',
    messageId: 21,
    markerId: 'gm:21:1',
    promptToken: 'image###雪地立绘###',
    title: '雪地立绘',
    createdOrder: 0,
    src: 'https://example.com/21-1.png',
    alt: 'ready image',
  });

  assert.equal(readyEntry?.id, 'gm:21:1');
  assert.equal(readyEntry?.messageId, 21);
  assert.equal(readyEntry?.src, 'https://example.com/21-1.png');

  const placeholderOnly = normalizeGalleryCatalogEntry({
    id: 'gm:21:placeholder',
    messageId: 21,
    promptToken: 'image###只有占位###',
    title: '只有占位',
    createdOrder: 1,
  });

  assert.equal(placeholderOnly, null);
});

test('mergeGalleryCatalogEntries collapses metadata, local cache, and live ready entries by canonical id', () => {
  const merged = mergeGalleryCatalogEntries({
    persistedEntries: [
      {
        id: 'gm:22:1',
        messageId: 22,
        markerId: 'gm:22:1',
        promptToken: 'image###旧图###',
        title: '旧图',
        createdOrder: 0,
        src: 'https://example.com/22-old.png',
      },
    ],
    liveEntries: [
      {
        id: 'gm:22:1',
        messageId: 22,
        markerId: 'gm:22:1',
        promptToken: 'image###旧图###',
        title: '新图',
        createdOrder: 0,
        src: 'https://example.com/22-new.png',
        alt: 'live image',
      },
    ],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, '新图');
  assert.equal(merged[0].src, 'https://example.com/22-new.png');
  assert.equal(merged[0].alt, 'live image');
});

test('buildGalleryCatalogRecord upgrades existing entries instead of duplicating them', () => {
  const initial = buildGalleryCatalogRecord({
    chatId: 'chat-eden',
    existingRecord: null,
    liveEntries: [
      {
        id: 'gm:23:1',
        messageId: 23,
        markerId: 'gm:23:1',
        promptToken: 'image###第一次###',
        title: '第一次',
        createdOrder: 0,
        src: 'https://example.com/23-a.png',
      },
    ],
  });

  const upgraded = buildGalleryCatalogRecord({
    chatId: 'chat-eden',
    existingRecord: initial,
    liveEntries: [
      {
        id: 'gm:23:1',
        messageId: 23,
        markerId: 'gm:23:1',
        promptToken: 'image###第一次###',
        title: '第一次升级',
        createdOrder: 0,
        src: 'https://example.com/23-b.png',
      },
    ],
  });

  assert.equal(initial.entries.length, 1);
  assert.equal(upgraded.entries.length, 1);
  assert.equal(upgraded.entries[0].title, '第一次升级');
  assert.equal(upgraded.entries[0].src, 'https://example.com/23-b.png');
});

test('buildGalleryCatalogReadDebugPayload summarizes source hit counts for runtime logs', () => {
  const payload = buildGalleryCatalogReadDebugPayload({
    chatId: 'chat-eden',
    metadataRecord: { entries: [{ id: 'a' }, { id: 'b' }] },
    localRecord: { entries: [{ id: 'c' }] },
    fallbackRecord: null,
    mergedEntries: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  });

  assert.deepEqual(payload, {
    chatId: 'chat-eden',
    metadataCount: 2,
    localCount: 1,
    fallbackCount: 0,
    mergedCount: 3,
  });
});

test('buildGalleryCatalogWriteDebugPayload reports metadata vs fallback persistence outcome', () => {
  const payload = buildGalleryCatalogWriteDebugPayload({
    record: {
      chatId: 'chat-eden',
      entries: [{ id: 'gm:1' }, { id: 'gm:2' }],
    },
    wroteMetadata: false,
    wroteFallback: true,
  });

  assert.deepEqual(payload, {
    chatId: 'chat-eden',
    entryCount: 2,
    wroteMetadata: false,
    wroteFallback: true,
  });
});
