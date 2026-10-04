import assert from 'node:assert/strict';
import { assemblePrompt, createPromptContextSnapshot } from '../ai/promptAssembler';
import { OpenAICompatibleProvider, openAiModelsEndpoint } from '../ai/providers';

function testProtectedHistory() {
  const snapshot = createPromptContextSnapshot({
    sessionKey: 'test',
    snapshotKey: { chatId: 'test', assistantMessageId: 8, mvuSignature: 'test' },
    mode: '私聊',
    protocol: '协议',
    members: [{ name: '甲', identity: 'main:甲', profile: '档案' }],
    recentMainChat: [{ id: 'main', role: 'assistant', sender: '甲', content: 'LONG_STORY'.repeat(1800) }],
    phoneHistory: [
      { id: 'old', sender: '甲', content: 'OLD_WECHAT'.repeat(100) },
      ...Array.from({ length: 16 }, (_, index) => ({
        id: `recent-${index}`,
        sender: '甲',
        content: `小刘是维修工-${index}`,
      })),
    ],
    protectedPhoneHistoryCount: 16,
    playerMessage: '你之前说的小刘',
    outputContract: 'JSON',
    maxCharacters: 16000,
  });
  const prompt = assemblePrompt(snapshot);
  assert.match(prompt, /小刘是维修工/);
  for (let index = 0; index < 16; index++) assert.ok(prompt.includes(`"id":"recent-${index}"`));
  assert.doesNotMatch(prompt, /LONG_STORY|OLD_WECHAT/);
  assert.throws(() => assemblePrompt(snapshot, 10), /预算/);
  assert.throws(
    () =>
      createPromptContextSnapshot({
        ...snapshot,
        members: [...snapshot.members],
        phoneHistory: [],
        recentMainChat: [],
        protectedPhoneHistoryCount: -1,
      }),
    /protectedPhoneHistoryCount/,
  );
}

async function testEndpointCompatibility() {
  for (const [base, expected, statuses] of [
    ['https://example.test/chat/completions', ['https://example.test/chat/completions'], [200]],
    ['https://example.test/proxy/chat/completions', ['https://example.test/proxy/chat/completions'], [200]],
    [
      'https://example.test',
      ['https://example.test/v1/chat/completions', 'https://example.test/chat/completions'],
      [404, 200],
    ],
    [
      'https://example.test/api',
      ['https://example.test/api/v1/chat/completions', 'https://example.test/api/chat/completions'],
      [405, 200],
    ],
    ['https://example.test/v1', ['https://example.test/v1/chat/completions'], [404]],
    ['https://example.test', ['https://example.test/v1/chat/completions'], [401]],
    ['https://example.test', ['https://example.test/v1/chat/completions'], [429]],
  ] as const) {
    const urls: string[] = [];
    let keyReads = 0;
    const provider = new OpenAICompatibleProvider({
      baseUrl: base,
      model: 'test',
      withApiKey: fn => {
        keyReads++;
        return fn('test-secret');
      },
      fetch: async (url, init) => {
        urls.push(url);
        assert.equal((init.headers as any).Authorization, 'Bearer test-secret');
        const status = statuses[urls.length - 1];
        return { ok: status === 200, status, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
      },
    });
    const handle = provider.request('prompt');
    if (statuses[statuses.length - 1] === 200) assert.equal(await handle.promise, 'ok');
    else await assert.rejects(handle.promise, /HTTP/);
    assert.deepEqual(urls, expected);
    assert.equal(keyReads, urls.length, '每次请求在同步回调内获取密钥');
  }
  assert.equal(openAiModelsEndpoint('https://example.test/chat/completions'), 'https://example.test/models');
  assert.equal(openAiModelsEndpoint('https://example.test/models'), 'https://example.test/models');
  let release!: (response: any) => void;
  let calls = 0;
  const provider = new OpenAICompatibleProvider({
    baseUrl: 'https://example.test',
    model: 'test',
    withApiKey: fn => fn('test'),
    fetch: () => {
      calls++;
      return new Promise(resolve => {
        release = resolve;
      });
    },
  });
  const handle = provider.request('prompt');
  handle.cancel();
  release({ ok: false, status: 404, json: async () => ({}) });
  await assert.rejects(handle.promise, /cancelled/);
  assert.equal(calls, 1, '取消后不得继续回退');
}

async function main() {
  await testEndpointCompatibility();
  testProtectedHistory();
  console.log('prompt compatibility tests passed');
}
void main();
