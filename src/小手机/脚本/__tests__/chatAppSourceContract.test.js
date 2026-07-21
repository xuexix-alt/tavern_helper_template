const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../聊天APP/index.ts'), 'utf8');

function extractFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `expected ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(brace + 1, index);
  }
  assert.fail(`unterminated ${name}`);
}

test('chat registers a renderer using the exact container and passed Vue runtime', () => {
  assert.match(source, /registerRenderer\(['"]chat-app['"],\s*\(\{\s*container,\s*vue\s*\}\)/);
  assert.match(source, /mountChatRenderer\(\{\s*container,\s*vue,\s*component:\s*createChatRenderer\(vue,\s*PS\)/);
  assert.match(source, /function createChatRenderer\(vue:/);
  assert.doesNotMatch(source, /window\.parent\.Vue/);
});

test('pagehide cancels waiting and unregisters the exact renderer', () => {
  const body = extractFunctionBody('disposeChatAppScript');
  assert.match(body, /stopWaitingForPhoneSystem\?\.\(\)/);
  assert.match(body, /registeredPhoneSystem\?\.unregisterRenderer\(['"]chat-app['"]\)/);
  assert.match(source, /pagehide['"],\s*disposeChatAppScript/);
});

test('legacy iframe guessing and retry mounting are removed', () => {
  assert.doesNotMatch(source, /nextElementSibling/);
  assert.doesNotMatch(source, /iframe\[script_id\]/);
  assert.doesNotMatch(source, /retries\s*>\s*20/);
});

test('list and modal states distinguish loading error empty and reset paths', () => {
  assert.match(source, /listState:\s*['"]loading['"]/);
  assert.match(source, /listState\s*===\s*['"]ready['"][\s\S]*conversations\.length\s*===\s*0/);
  assert.match(source, /聊天记录加载失败/);
  assert.match(source, /重试/);
  assert.match(source, /暂无聊天记录/);
  assert.match(source, /['"]＋['"]/);
  const openBody = extractFunctionBody('openCreationModal');
  assert.match(openBody, /candidateState\s*=\s*['"]loading['"]/);
  assert.match(openBody, /await vue\.nextTick\(\)/);
  assert.match(openBody, /await loadCreationCandidates\(\)/);
  const closeBody = extractFunctionBody('closeCreationModal');
  for (const token of ["creationMode = null", "selectedNames = []", "groupName = ''", "candidateError = ''", "creationError = ''", 'isCreating = false']) {
    assert.ok(closeBody.includes(token), `expected reset: ${token}`);
  }
  const candidatesBody = extractFunctionBody('loadCreationCandidates');
  assert.match(candidatesBody, /loadStatDataRootNames\(source\s*=>\s*substitudeMacros\(source\)\)/);
  assert.match(candidatesBody, /candidateError\s*=\s*candidateErrorMessage\[result\.reason\]/);
  assert.match(source, /candidateError:\s*['"]["']/);
  assert.match(source, /重新读取/);
  assert.match(source, /onClick:\s*\(\)\s*=>\s*\{\s*void loadCreationCandidates\(\);\s*\}/);
  const submitBody = extractFunctionBody('submitCreation');
  assert.match(submitBody, /const submitContext = captureContext\(\)/);
  assert.match(submitBody, /isContextCurrent\(submitContext\)/);
  assert.match(submitBody, /try\s*\{/);
  assert.match(submitBody, /catch\s*\(error\)/);
  assert.match(submitBody, /finally\s*\{/);
  assert.match(submitBody, /catch\s*\(error\)[\s\S]*closeCreationModal\(\)/);
  assert.match(submitBody, /catch\s*\(error\)[\s\S]*goBack\(\)/);
  assert.match(submitBody, /catch\s*\(error\)[\s\S]*void loadConversations\(\)/);
  assert.match(submitBody, /会话状态需要刷新，已返回列表，请稍后重试/);
  assert.doesNotMatch(submitBody, /会话已创建或打开/);
});

test('message busy spans same-renderer navigation while unmount aborts and invalidates the operation', () => {
  const goBackBody = extractFunctionBody('goBack');
  const openConversationBody = extractFunctionBody('openConversation');
  const sendBody = extractFunctionBody('sendMessage');
  assert.doesNotMatch(goBackBody, /messageOperation\.invalidate\(\)|isGenerating\s*=\s*false/);
  assert.doesNotMatch(openConversationBody, /messageOperation\.invalidate\(\)|isGenerating\s*=\s*false/);
  assert.match(sendBody, /const operationToken = messageOperation\.start\(\)/);
  assert.match(sendBody, /messageOperation\.isCurrent\(operationToken\)/);
  assert.match(sendBody, /if \(messageOperation\.finish\(operationToken\)\)\s*\{\s*store\.isGenerating = false/);
  assert.match(source, /onBeforeUnmount\(\(\) => \{[\s\S]*ChatCore\?\.abort\?\.\(\)[\s\S]*messageOperation\.invalidate\(\)/);
});

test('existing message send generation and sync chain remains intact', () => {
  for (const token of ['ChatDB.addMessage', 'generatePrivateReply', 'generateGroupReply', 'ChatSync.instantSync']) {
    assert.ok(source.includes(token), `expected preserved chain ${token}`);
  }
});
