import assert from 'node:assert/strict';

import { buildParseRetryPrompt, requestParsedWithRetry } from '../ai/parseRetry';
import { ResponseParseError } from '../ai/responseParser';

const GOOD = JSON.stringify({ messages: [{ sender: '爱丽丝', content: '你好' }] });
const BAD = '我不是 JSON';

interface RecordedHandle {
  prompt: string;
  cancelled: boolean;
}

/** 依次返回预设响应的假请求器；记录每次收到的提示词 */
function fakeRequester(responses: string[], error?: Error) {
  const handles: RecordedHandle[] = [];
  const prompts: string[] = [];
  let calls = 0;
  const request = (promptText: string) => {
    prompts.push(promptText);
    const handle: RecordedHandle = { prompt: promptText, cancelled: false };
    handles.push(handle);
    const index = calls;
    calls += 1;
    return {
      promise:
        error && index === 0
          ? Promise.reject(error)
          : Promise.resolve(responses[Math.min(index, responses.length - 1)]),
      cancel: () => {
        handle.cancelled = true;
      },
    };
  };
  return { request, prompts, handles, get calls() { return calls; } };
}

async function testFirstAttemptSuccess(): Promise<void> {
  const fake = fakeRequester([GOOD]);
  const handle = requestParsedWithRetry(fake.request, 'ORIGIN', ['爱丽丝']);
  const result = await handle.promise;
  assert.equal(result.attempts, 1, '首次成功不应重试');
  assert.equal(fake.calls, 1);
  assert.deepEqual(result.retryReasons, []);
  assert.deepEqual(result.messages, [{ sender: '爱丽丝', content: '你好' }]);
  assert.equal(result.raw, GOOD);
  assert.equal(fake.prompts[0], 'ORIGIN');
}

async function testRetryRecovers(): Promise<void> {
  const fake = fakeRequester([BAD, GOOD]);
  const handle = requestParsedWithRetry(fake.request, 'ORIGIN', ['爱丽丝']);
  const result = await handle.promise;
  assert.equal(result.attempts, 2, '首次失败应喂回重试');
  assert.equal(fake.calls, 2);
  assert.equal(result.retryReasons.length, 1);
  const retryPrompt = fake.prompts[1];
  assert.match(retryPrompt, /^ORIGIN/, '重试提示词应保留原提示词');
  assert.match(retryPrompt, /【上一次的输出】\n我不是 JSON/, '重试提示词应包含上次原始输出');
  assert.match(retryPrompt, /【解析失败原因】/, '重试提示词应包含失败原因');
  assert.match(retryPrompt, /sender 必须属于：爱丽丝/, '重试提示词应重述成员契约');
  assert.match(retryPrompt, /"messages"/);
}

async function testRetryExhaustedThrows(): Promise<void> {
  const fake = fakeRequester([BAD, BAD]);
  const handle = requestParsedWithRetry(fake.request, 'ORIGIN', ['爱丽丝']);
  await assert.rejects(handle.promise, (error: unknown) => {
    assert.ok(error instanceof ResponseParseError, '重试耗尽应抛最后一个解析错误');
    return true;
  });
  assert.equal(fake.calls, 2, '默认 maxRetries=1，共两次请求');
}

async function testMaxRetriesZeroDisablesRetry(): Promise<void> {
  const fake = fakeRequester([BAD, GOOD]);
  const handle = requestParsedWithRetry(fake.request, 'ORIGIN', ['爱丽丝'], { maxRetries: 0 });
  await assert.rejects(handle.promise, ResponseParseError);
  assert.equal(fake.calls, 1, 'maxRetries=0 不得重试');
}

async function testNetworkErrorDoesNotRetry(): Promise<void> {
  const fake = fakeRequester([GOOD], new Error('network down'));
  const handle = requestParsedWithRetry(fake.request, 'ORIGIN', ['爱丽丝']);
  await assert.rejects(handle.promise, /network down/);
  assert.equal(fake.calls, 1, '非解析错误不得重试');
}

async function testCancelStopsLoop(): Promise<void> {
  let release!: (value: string) => void;
  const gate = new Promise<string>(resolve => {
    release = resolve;
  });
  let cancelled = false;
  const handle = requestParsedWithRetry(
    () => ({
      promise: gate,
      cancel: () => {
        cancelled = true;
      },
    }),
    'ORIGIN',
    ['爱丽丝'],
  );
  handle.cancel();
  release(GOOD);
  await assert.rejects(handle.promise, /已取消/);
  assert.equal(cancelled, true, '取消应传播到当前请求句柄');
}

function testPromptTemplateTruncates(): void {
  const prompt = buildParseRetryPrompt({
    originalPrompt: 'O',
    raw: 'x'.repeat(50),
    error: '格式错误',
    members: ['爱丽丝'],
    rawEchoLimit: 10,
  });
  assert.match(prompt, /x{10}…（已截断）/, '超长输出应截断');
  assert.doesNotMatch(prompt, /x{11}/);
}

async function main(): Promise<void> {
  await testFirstAttemptSuccess();
  await testRetryRecovers();
  await testRetryExhaustedThrows();
  await testMaxRetriesZeroDisablesRetry();
  await testNetworkErrorDoesNotRetry();
  await testCancelStopsLoop();
  testPromptTemplateTruncates();
  console.log('parse retry tests passed');
}

void main();
