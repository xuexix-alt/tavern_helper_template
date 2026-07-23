import assert from 'node:assert/strict';

import {
  buildProfileAnalysisPrompt,
  mergeDynamicProfile,
  parseProfileAnalysisOutput,
  renderPromptProfile,
} from '../profiles/profileAnalysis';
import type { ProfileAnalysisSource } from '../profiles/profileTypes';

const source: ProfileAnalysisSource = {
  sessionKey: '角色A::chat-a',
  personId: 'main:纪宁',
  personName: '纪宁',
  fixedProfile: '冷静谨慎，职业为医生。',
  mvuFacts: { 关系: '协作', 位置: '诊疗室', 健康: 83 },
  story: [{ id: '12', role: 'assistant', content: '纪宁回到诊疗室。' }],
  wechatContext: [{ id: 'old', sender: '纪宁', content: '之前说过药品。', isNew: false }],
  wechatNew: [{ id: 'new', sender: '纪宁', content: '药品快用完了。', isNew: true }],
  previous: null,
};

function testStrictOutputAndMerge(): void {
  const parsed = parseProfileAnalysisOutput(
    JSON.stringify({
      basicInfoAdditions: ['近期负责诊疗室'],
      personalityTuning: '近期更直接地确认补给风险',
      currentSituationSummary: '人在诊疗室，正在清点药品',
      relationshipInterpretation: '愿意在协作范围内提供医疗支持',
      storyInteractionSummary: '回到诊疗室继续工作',
      chatInteractionSummary: '提醒药品即将耗尽',
      playerActionAdvice: '尽快确认药品补给',
      evidenceRefs: ['story:12', 'wechat:new'],
    }),
  );
  const merged = mergeDynamicProfile(source, parsed, ['纪宁：药品快用完了。']);

  assert.equal(merged.hardFacts.关系, '协作');
  assert.equal(merged.hardFacts.位置, '诊疗室');
  assert.match(merged.personalityTuning, /补给风险/);
  assert.deepEqual(merged.lastWechatRound, ['纪宁：药品快用完了。']);
  assert.doesNotMatch(renderPromptProfile(merged, 2_000), /尽快确认药品补给/);
}

function testOutputRejectsUnknownFields(): void {
  assert.throws(
    () =>
      parseProfileAnalysisOutput(
        JSON.stringify({
          basicInfoAdditions: [],
          personalityTuning: 'x',
          currentSituationSummary: 'x',
          relationshipInterpretation: 'x',
          storyInteractionSummary: 'x',
          chatInteractionSummary: 'x',
          playerActionAdvice: 'x',
          evidenceRefs: [],
          mvuRelation: '忠诚',
        }),
      ),
    /结构|字段/,
  );
  assert.throws(
    () => parseProfileAnalysisOutput('{"__proto__":{"polluted":true}}'),
    /结构|字段|危险/,
  );
}

function testPromptSourceOrder(): void {
  const prompt = buildProfileAnalysisPrompt(source);
  assert.ok(prompt.indexOf('【1 MVU硬事实】') < prompt.indexOf('【2 固定角色世界书】'));
  assert.ok(prompt.indexOf('【2 固定角色世界书】') < prompt.indexOf('【3 最近20条正文】'));
  assert.ok(prompt.indexOf('【3 最近20条正文】') < prompt.indexOf('【5 上一次动态档案】'));
  assert.match(prompt, /只允许输出结构化动态字段/);
}

testStrictOutputAndMerge();
testOutputRejectsUnknownFields();
testPromptSourceOrder();
console.log('profile analysis tests passed');
