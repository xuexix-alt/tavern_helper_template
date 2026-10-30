import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../ai/providers';
import { createMemoryPhoneDb } from '../data/phoneDb';
import {
  PROFILE_BROADCAST_TITLES,
  PROFILE_BROADCAST_SYSTEM_PROMPT,
  buildProfileBroadcastPrompt,
  parseProfileBroadcastOutput,
  saveProfileBroadcastIssue,
} from '../profiles/profileBroadcast';

async function main(): Promise<void> {
  for (const stream of [false, true]) {
    const db = createMemoryPhoneDb();
    const prompt = buildProfileBroadcastPrompt({
      publicStory: ['北门已经关闭。'],
      publicMvuFacts: { 通讯网络: { 状态: '不稳定' } },
      publicProfileChanges: [],
    });
    const raw = JSON.stringify({
      sections: PROFILE_BROADCAST_TITLES.map(title => ({ title, body: '本期栏目内容。' })),
    });
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      timeoutMs: 30_000,
      stream,
      parameters: { stream: !stream },
      withApiKey: callback => callback('test-key'),
      setTimer: (_callback, delay) => {
        assert.equal(delay, 300_000);
        return 1;
      },
      clearTimer: () => {},
      fetch: async (url, init) => {
        assert.equal(url, 'https://example.test/v1/chat/completions');
        const body = JSON.parse(String(init.body));
        assert.equal(body.stream, stream);
        assert.deepEqual(body.response_format, { type: 'json_object' });
        assert.deepEqual(
          body.messages,
          [
            { role: 'system', content: PROFILE_BROADCAST_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          '广播不得混入微信身份或聊天预填充',
        );
        if (!stream) return new Response(JSON.stringify({ choices: [{ message: { content: raw } }] }));
        const frame = (delta: object) => 'data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n';
        const wire =
          frame({ reasoning_content: '仅用于测试的分析' }) +
          frame({ content: raw.slice(0, 35) }) +
          frame({ content: raw.slice(35) }) +
          'data: [DONE]\n\n';
        const bytes = new TextEncoder().encode(wire);
        let offset = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (offset >= bytes.length) {
                controller.close();
                return;
              }
              controller.enqueue(bytes.slice(offset, offset + 7));
              offset += 7;
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    });
    const response = await provider.requestDetailed(prompt, {
      mode: 'structured',
      systemPrompt: PROFILE_BROADCAST_SYSTEM_PROMPT,
      jsonMode: true,
      minimumTimeoutMs: 300_000,
    }).promise;
    assert.equal(response.content, raw);
    const output = parseProfileBroadcastOutput(response.content);
    await saveProfileBroadcastIssue(db, {
      id: 'issue',
      sessionKey: 'session',
      sourceStoryCursor: '12',
      generatedAt: 1000,
      rawText: response.content,
      output,
    });
    const records = await db.listRecords('broadcastIssues', 'session');
    assert.equal(records.length, 1);
    assert.equal(records[0].rawText, raw);
    assert.deepEqual(records[0].sections, output.sections);
    assert.deepEqual(
      output.sections.map(section => section.title),
      [...PROFILE_BROADCAST_TITLES],
    );
  }
  console.log('broadcast API flow tests passed');
}
void main();
