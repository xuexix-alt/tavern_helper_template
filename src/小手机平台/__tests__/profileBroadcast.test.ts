import assert from 'node:assert/strict';

import {
  PROFILE_BROADCAST_SYSTEM_PROMPT,
  buildProfileBroadcastPrompt,
  isMeaningfulStorySummary,
  parseProfileBroadcastOutput,
} from '../profiles/profileBroadcast';

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

  // 公开正文以可读的编号行渲染，而非单行 JSON
  assert.match(prompt, /1\. 北门在正文中确认关闭/);
  assert.match(prompt, /纪宁公开接管诊疗室/);
  // MVU 公开事实以多行 JSON 渲染，便于模型挖掘
  assert.match(prompt, /"通讯网络"[\s\S]*?"状态"\s*:\s*"不稳定"/);
  // 节目单与三声腔指引存在
  assert.match(prompt, /本期节目单/);
  assert.match(prompt, /本台通告/);
  assert.match(prompt, /街坊风声/);
  // 隐私：私聊原文/上次档案/playerActionAdvice 不得出现
  assert.doesNotMatch(prompt, /私聊原文|药品不足|上次档案猜测|playerActionAdvice/);
  // 隐私提醒保留
  assert.match(prompt, /私聊.*不得/);
}

function testSystemPromptPushesNewsWriting(): void {
  // 系统提示词必须给出节目感设计与写作机制，而不是引导兜底
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /三种声音/);
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /感知化改写/);
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /活人感/);
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /仅当某段节目在全部素材中确实无话可说/);
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /严禁.*私聊/);
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /严禁编造/);
  // 「街坊风声」传闻叙事上限放宽到 300 字，其余两段保持 200 字
  assert.match(PROFILE_BROADCAST_SYSTEM_PROMPT, /「街坊风声」放宽到 60~300 字/);
}

function testRumorSectionRelaxedLength(): void {
  const prompt = buildProfileBroadcastPrompt({
    publicStory: [],
    publicMvuFacts: {},
    publicProfileChanges: [],
  });
  assert.match(prompt, /「街坊风声」body 为 60~300 字/);
  assert.match(prompt, /「本台通告」「生活频道」body 为 60~200 字/);
  assert.match(prompt, /60~300字/);
  // 契约示例中只有街坊风声标注 300 字
  const contractStart = prompt.indexOf('【输出契约】');
  const contract = prompt.slice(contractStart);
  assert.match(contract, /"title":"街坊风声","body":"节目正文（60~300字）"/);
  assert.match(contract, /"title":"本台通告","body":"节目正文（60~200字）"/);
}

function testStrictThreeSectionOutput(): void {
  const issue = parseProfileBroadcastOutput(
    JSON.stringify({
      sections: [
        { title: '本台通告', body: '北门暂时关闭。' },
        { title: '生活频道', body: '暂无重大变化。' },
        { title: '街坊风声', body: '诊疗室恢复值守。' },
      ],
    }),
  );
  assert.equal(issue.sections.length, 3);
  assert.deepEqual(
    issue.sections.map(section => section.title),
    ['本台通告', '生活频道', '街坊风声'],
  );
}

function testOutputTolerance(): void {
  // B5: 乱序标题按标题识别重排，而非整体失败
  const reordered = parseProfileBroadcastOutput(
    JSON.stringify({
      sections: [
        { title: '生活频道', body: '食堂今天有热汤。' },
        { title: '本台通告', body: '北门暂时关闭。' },
        { title: '街坊风声', body: '诊疗室恢复值守。' },
      ],
    }),
  );
  assert.deepEqual(
    reordered.sections.map(section => section.title),
    ['本台通告', '生活频道', '街坊风声'],
  );
  assert.equal(reordered.sections[0].body, '北门暂时关闭。');
  assert.equal(reordered.sections[1].body, '食堂今天有热汤。');

  // B5: 缺逗号的近合法 JSON 走 jsonrepair
  const malformed = `{
    "sections": [
      { "title": "本台通告", "body": "北门暂时关闭。" }
      { "title": "生活频道", "body": "食堂今天有热汤。" },
      { "title": "街坊风声", "body": "诊疗室恢复值守。" }
    ]
  }`;
  assert.doesNotThrow(() => parseProfileBroadcastOutput(malformed));

  // B5: OpenAI 兼容信封解包
  const wrapped = JSON.stringify({
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            sections: [
              { title: '本台通告', body: '北门暂时关闭。' },
              { title: '生活频道', body: '食堂今天有热汤。' },
              { title: '街坊风声', body: '诊疗室恢复值守。' },
            ],
          }),
        },
      },
    ],
  });
  assert.equal(parseProfileBroadcastOutput(wrapped).sections[0].body, '北门暂时关闭。');

  // B5: 多余字段剥离、空 body 兜底、超长 body 钳制到 1500 字
  const tolerant = parseProfileBroadcastOutput(
    JSON.stringify({
      sections: [
        { title: '本台通告', body: '', extra: 'x' },
        { title: '生活频道', body: null },
        { title: '街坊风声', body: '风'.repeat(1_600) },
      ],
      meta: '多余顶层字段',
    }),
  );
  assert.equal(tolerant.sections[0].body, '暂无重大变化');
  assert.equal(tolerant.sections[1].body, '暂无重大变化');
  assert.equal(tolerant.sections[2].body.length, 1_500);
  assert.equal((tolerant as unknown as Record<string, unknown>).meta, undefined);

  // B5: 段数不足仍然失败（三段是硬契约）
  assert.throws(
    () => parseProfileBroadcastOutput(JSON.stringify({ sections: [{ title: '本台通告', body: '只有一段。' }] })),
    /广播结构或字段无效/,
  );
}

function testMeaningfulStorySummaryFilter(): void {
  // B6: 契约兜底文案不是素材，不得混入人物动向
  assert.equal(isMeaningfulStorySummary('纪宁接管诊疗室并组织抢修。'), true);
  assert.equal(isMeaningfulStorySummary('  '), false);
  assert.equal(isMeaningfulStorySummary('暂无正文互动'), false);
  assert.equal(isMeaningfulStorySummary('暂无明显变化'), false);
  assert.equal(isMeaningfulStorySummary(' 暂无微信互动 '), false);
}

function main(): void {
  testPromptContainsPublicEvidenceOnly();
  testSystemPromptPushesNewsWriting();
  testRumorSectionRelaxedLength();
  testStrictThreeSectionOutput();
  testOutputTolerance();
  testMeaningfulStorySummaryFilter();
  console.log('profile broadcast tests passed');
}

main();
