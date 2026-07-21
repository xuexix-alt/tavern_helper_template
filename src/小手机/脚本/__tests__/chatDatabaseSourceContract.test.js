const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');

const source = readSource('../聊天数据库/index.ts');
const publicCrud = [
  'createConversation',
  'getConversation',
  'getConversations',
  'updateConversation',
  'addMessage',
  'getRecentMessages',
  'markSyncedToLore',
];

test('every public CRUD pins one operation and awaits its local database', () => {
  for (const name of publicCrud) {
    const body = extractFunctionBody(source, name);
    assert.match(body, /^\s*const operation = beginOperation\(\);/);
    assert.match(
      body,
      /await operation\.dbPromise|(?:createConversationForOperation|getConversationInContext|queryConversationsForOperation)\(operation,/,
    );
    assert.doesNotMatch(body, /ensureConnection\(|\bcurrentChatId\b|\bdb!/);
  }
});

test('compound CRUD reuses internal context helpers and validates partition ownership', () => {
  assert.doesNotMatch(extractFunctionBody(source, 'updateConversation'), /await getConversation\(/);
  assert.match(extractFunctionBody(source, 'updateConversation'), /getConversationInContext\(operation,/);
  assert.match(extractFunctionBody(source, 'getConversationInContext'), /record\?\.chatId === operation\.chatId/);
  assert.match(extractFunctionBody(source, 'markSyncedToLore'), /validateMessageIdsInContext\(operation,/);
  const updateBody = extractFunctionBody(source, 'updateConversation');
  assert.ok(updateBody.indexOf('...updates') < updateBody.indexOf('id: conversation.id'));
  assert.ok(updateBody.indexOf('...updates') < updateBody.indexOf('chatId: operation.chatId'));
});

test('legacy connection helpers are compatibility-only and no CRUD calls them', () => {
  assert.match(source, /async function ensureConnection/);
  for (const name of publicCrud)
    assert.doesNotMatch(extractFunctionBody(source, name), /ensureConnection\(|getChatId\(/);
});

test('openDB uses the shared connection cache instead of opening once per CRUD', () => {
  assert.match(source, /createDatabaseConnectionCache\(/);
  assert.match(extractFunctionBody(source, 'openDB'), /return databaseConnectionCache\.open\(\);/);
});

test('write CRUD reloads and validates the latest conversation inside its target transaction', () => {
  const updateBody = extractFunctionBody(source, 'updateConversation');
  assert.match(updateBody, /await getConversationInContext\(operation, conversationId\);/);
  assert.match(updateBody, /const conversationRequest = conversationStore\.get\(conversationId\);/);
  assert.match(updateBody, /conversation\?\.chatId !== operation\.chatId/);
  assert.ok(
    updateBody.indexOf("database.transaction(['conversations'], 'readwrite')") <
      updateBody.indexOf('.get(conversationId)'),
  );
  assert.ok(updateBody.indexOf('.get(conversationId)') < updateBody.indexOf('.put(updated)'));
  assert.doesNotMatch(updateBody, /const conversation = await requireConversationInContext/);

  const addBody = extractFunctionBody(source, 'addMessage');
  assert.match(addBody, /await requireConversationInContext\(operation, conversationId\);/);
  assert.match(addBody, /const conversationRequest = conversationStore\.get\(conversationId\);/);
  assert.match(addBody, /conversation\?\.chatId !== operation\.chatId/);
  assert.ok(
    addBody.indexOf("database.transaction(['messages', 'conversations'], 'readwrite')") <
      addBody.indexOf('.get(conversationId)'),
  );
  assert.ok(addBody.indexOf('.get(conversationId)') < addBody.indexOf('messageStore.add(msg as ChatMessage)'));
  assert.doesNotMatch(addBody, /const conversation = await requireConversationInContext/);
});
