import assert from 'node:assert/strict';

import { buildProfileBroadcastPrompt, parseProfileBroadcastOutput } from '../profiles/profileBroadcast';

function testPromptContainsPublicEvidenceOnly(): void {
  const prompt = buildProfileBroadcastPrompt({
    publicStory: ['北门在正文中确认关闭。'],
    publicMvuFacts: { 通讯网络: { 状态: '不稳定' } },
    publicProfileChanges: [
      { content: '纪宁公开接管诊疗室。', evidenceRefs: ['story:12', 'mvu:位置'] },
      { content: '私聊原文：药品不足。', evidenceRefs: ['wechat:private-1'] },
      { content: '上次档案猜测有人离开。', evidenceRefs: ['previous-dynamic'] },
    ],
  });

  assert.match(prompt, /北门在正文中确认关闭/);
  assert.match(prompt, /纪宁公开接管诊疗室/);
  assert.doesNotMatch(prompt, /私聊原文|药品不足|上次档案猜测|playerActionAdvice/);
  assert.match(prompt, /暂无重大变化/);
  assert.match(prompt, /私聊不能引用|私聊.*不得.*新闻/);
}

function testStrictThreeSectionOutput(): void {
  const issue = parseProfileBroadcastOutput(
    JSON.stringify({
      sections: [
        { title: '秩序与局势', body: '北门暂时关闭。' },
        { title: '生存与资源', body: '暂无重大变化。' },
        { title: '人物与社会', body: '诊疗室恢复值守。' },
      ],
    }),
  );
  assert.equal(issue.sections.length, 3);
  assert.deepEqual(
    issue.sections.map(section => section.title),
    ['秩序与局势', '生存与资源', '人物与社会'],
  );
  assert.throws(
    () =>
      parseProfileBroadcastOutput(
        JSON.stringify({
          sections: [
            { title: '生存与资源', body: '顺序错误。' },
            { title: '秩序与局势', body: '顺序错误。' },
            { title: '人物与社会', body: '顺序错误。' },
          ],
        }),
      ),
    /广播|结构|字段/,
  );
}

function main(): void {
  testPromptContainsPublicEvidenceOnly();
  testStrictThreeSectionOutput();
  console.log('profile broadcast tests passed');
}

main();
