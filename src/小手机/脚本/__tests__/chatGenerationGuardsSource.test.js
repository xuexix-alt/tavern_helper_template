const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, extractFunctionBody } = require('./sourceTestUtils.js');

const source = readSource('../聊天APP/index.ts');

test('component and modal contexts are separate and phone generation is mandatory', () => {
  assert.match(source, /getContextGeneration\(\): number/);

  const componentBody = extractFunctionBody(source, 'captureComponentContext');
  const modalBody = extractFunctionBody(source, 'captureModalContext');
  assert.doesNotMatch(componentBody, /modalGeneration/);
  assert.match(componentBody, /componentGeneration/);
  assert.match(componentBody, /getContextGeneration\(\)/);
  assert.match(modalBody, /captureComponentContext\(\)/);
  assert.match(modalBody, /modalGeneration/);
});

test('list and message loads guard component ownership after awaits and before writes', () => {
  for (const name of ['loadConversations', 'loadMessages']) {
    const body = extractFunctionBody(source, name);
    const capture = body.indexOf('const context = captureComponentContext()');
    const awaited = body.indexOf('await ', capture);
    const guard = body.indexOf('isComponentContextCurrent(context)', awaited);
    assert.ok(capture >= 0 && awaited > capture && guard > awaited, `${name} guard order`);
  }

  const messagesBody = extractFunctionBody(source, 'loadMessages');
  const guard = messagesBody.indexOf('isComponentContextCurrent(context)', messagesBody.indexOf('await '));
  const write = messagesBody.indexOf('replaceItems(store.messages', guard);
  const scroll = messagesBody.indexOf('scrollChatBottom(context, convId)', write);
  assert.ok(write > guard && scroll > write, 'message store and scroll stay behind the captured guard');

  const scrollBody = extractFunctionBody(source, 'scrollChatBottom');
  assert.match(scrollBody, /isComponentContextCurrent\(context\)/);
  assert.match(scrollBody, /store\.activeConvId\s*!==\s*convId/);
});

test('send separates operation validity, component validity, and conversation UI ownership', () => {
  const body = extractFunctionBody(source, 'sendMessage');
  const capture = body.indexOf('const sendContext = captureComponentContext()');
  const addAwait = body.indexOf('await ChatDB.addMessage', capture);
  const addGuard = body.indexOf('isComponentContextCurrent(sendContext)', addAwait);
  const userOwner = body.indexOf('store.activeConvId === conv.id', addGuard);
  const userPush = body.indexOf('store.messages.push(userMsg)', userOwner);
  const coreCall = Math.min(...['await ChatCore.generateGroupReply', 'await ChatCore.generatePrivateReply'].map(token => {
    const index = body.indexOf(token, userPush);
    return index < 0 ? Infinity : index;
  }));
  const replyGuard = body.indexOf('isComponentContextCurrent(sendContext)', coreCall);
  const replyOwner = body.indexOf('store.activeConvId === conv.id', replyGuard);
  const replyPush = body.indexOf('store.messages.push(...replies)', replyOwner);
  const sync = body.indexOf('ChatSync.instantSync(conv.id)', replyPush);

  assert.ok(
    capture >= 0 && addAwait > capture && addGuard > addAwait && userOwner > addGuard && userPush > userOwner
      && coreCall > userPush && replyGuard > coreCall && replyOwner > replyGuard && replyPush > replyOwner
      && sync > replyPush,
    'send await guards, UI ownership, and original-conversation sync order',
  );
  assert.match(body, /messageOperation\.isCurrent\(operationToken\)[\s\S]*isComponentContextCurrent\(sendContext\)/);
  assert.doesNotMatch(body.slice(addGuard, coreCall), /activeConvId\s*!==\s*conv\.id[^\n]*return/);
  assert.doesNotMatch(body.slice(replyGuard, sync), /activeConvId\s*!==\s*conv\.id[^\n]*return/);
  assert.match(body, /catch[\s\S]*isComponentContextCurrent\(sendContext\)/);
  assert.match(body, /finally[\s\S]*isComponentContextCurrent\(sendContext\)/);
});
