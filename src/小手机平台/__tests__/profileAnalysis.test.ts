import assert from 'node:assert/strict';

import {
  PROFILE_ANALYSIS_SYSTEM_PROMPT,
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
      personId: 'main:纪宁',
      personName: '纪宁',
      analysisNarrative: '纪宁近期更明确地表达药品补给风险。',
      changes: [],
      basicInfoAdditions: ['近期负责诊疗室'],
      behaviorTuning: '清点物资时会先核对缺口，再向玩家提出明确需求',
      personalityTuning: '近期更直接地确认补给风险',
      speechStyleTuning: '涉及药品时使用短句，直接给出数量与期限',
      currentGoals: '补足诊疗室的常用药品库存',
      currentSituationSummary: '人在诊疗室，正在清点药品',
      relationshipInterpretation: '愿意在协作范围内提供医疗支持',
      storyInteractionSummary: '回到诊疗室继续工作',
      chatInteractionSummary: '提醒药品即将耗尽',
      playerActionAdvice: '尽快确认药品补给',
      evidenceRefs: ['story:12', 'wechat:new'],
    }),
    source,
  );
  const merged = mergeDynamicProfile(source, parsed, ['纪宁：药品快用完了。']);

  assert.equal(merged.hardFacts.关系, '协作');
  assert.equal(merged.hardFacts.位置, '诊疗室');
  assert.match(merged.personalityTuning, /补给风险/);
  assert.match(merged.behaviorTuning, /核对缺口/);
  assert.match(merged.speechStyleTuning, /短句/);
  assert.match(merged.currentGoals, /药品库存/);
  assert.deepEqual(merged.lastWechatRound, ['纪宁：药品快用完了。']);
  assert.doesNotMatch(renderPromptProfile(merged, 2_000), /尽快确认药品补给/);
}

function testOutputRejectsUnknownFields(): void {
  assert.throws(
    () =>
      parseProfileAnalysisOutput(
        JSON.stringify({
          personId: 'main:纪宁',
          personName: '纪宁',
          analysisNarrative: '无变化',
          changes: [],
          basicInfoAdditions: [],
          behaviorTuning: 'x',
          personalityTuning: 'x',
          speechStyleTuning: 'x',
          currentGoals: 'x',
          currentSituationSummary: 'x',
          relationshipInterpretation: 'x',
          storyInteractionSummary: 'x',
          chatInteractionSummary: 'x',
          playerActionAdvice: 'x',
          evidenceRefs: ['fixed-profile'],
          mvuRelation: '忠诚',
        }),
        source,
      ),
    /结构|字段/,
  );
  assert.throws(() => parseProfileAnalysisOutput('{"__proto__":{"polluted":true}}'), /结构|字段|危险/);
}

function testIdentityAndEvidenceValidation(): void {
  const valid = {
    personId: 'main:纪宁',
    personName: '纪宁',
    analysisNarrative: '近期对药品不足的表达更直接。',
    changes: [],
    basicInfoAdditions: [],
    behaviorTuning: '先核对药品，再提出补给需求',
    personalityTuning: '保持谨慎，近期表达更直接',
    speechStyleTuning: '医疗事务使用简短明确的措辞',
    currentGoals: '补足药品库存',
    currentSituationSummary: '正在诊疗室清点药品',
    relationshipInterpretation: '保持协作关系',
    storyInteractionSummary: '回到诊疗室',
    chatInteractionSummary: '提醒药品即将耗尽',
    playerActionAdvice: '确认药品补给安排',
    evidenceRefs: ['story:12', 'wechat:new'],
  };
  assert.doesNotThrow(() => parseProfileAnalysisOutput(JSON.stringify(valid), source));
  assert.throws(
    () => parseProfileAnalysisOutput(JSON.stringify({ ...valid, personId: 'main:陈宇' }), source),
    /人物|personId/,
  );
  assert.throws(
    () => parseProfileAnalysisOutput(JSON.stringify({ ...valid, evidenceRefs: ['story:999'] }), source),
    /证据|story:999/,
  );
}

function testPromptSourceOrder(): void {
  const prompt = buildProfileAnalysisPrompt(source);
  assert.match(PROFILE_ANALYSIS_SYSTEM_PROMPT, /角色动态分析专家/);
  assert.match(PROFILE_ANALYSIS_SYSTEM_PROMPT, /固定本色/);
  assert.match(PROFILE_ANALYSIS_SYSTEM_PROMPT, /只输出一个 JSON 对象/);
  assert.doesNotMatch(prompt, /你是寒冬末日人物动态档案分析器/);
  assert.ok(prompt.indexOf('【1 MVU硬事实】') < prompt.indexOf('【2 固定角色世界书】'));
  assert.ok(prompt.indexOf('【2 固定角色世界书】') < prompt.indexOf('【3 最近20条正文】'));
  assert.ok(prompt.indexOf('【3 最近20条正文】') < prompt.indexOf('【5 上一次动态档案】'));
  assert.match(prompt, /只允许输出结构化动态字段/);
  assert.match(prompt, /行为模式/);
  assert.match(prompt, /说话方式/);
  assert.match(prompt, /当前目标/);
  assert.match(prompt, /只输出一个 JSON 对象/);
  assert.match(prompt, /"personId":"main:纪宁"/);
  assert.match(prompt, /story:12/);
}

function testOpenAiResponseEnvelopeCanBeParsed(): void {
  const content = JSON.stringify({
    personId: 'main:纪宁',
    personName: '纪宁',
    analysisNarrative: '纪宁近期更明确地表达药品补给风险。',
    changes: [],
    basicInfoAdditions: [],
    behaviorTuning: '先核对药品，再提出补给需求',
    personalityTuning: '保持谨慎，近期表达更直接',
    speechStyleTuning: '医疗事务使用简短明确的措辞',
    currentGoals: '补足药品库存',
    currentSituationSummary: '正在诊疗室清点药品',
    relationshipInterpretation: '保持协作关系',
    storyInteractionSummary: '回到诊疗室',
    chatInteractionSummary: '提醒药品即将耗尽',
    playerActionAdvice: '确认药品补给安排',
    evidenceRefs: ['story:12', 'wechat:new'],
  });
  const wrapped = JSON.stringify({
    choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: '分析过程' } }],
  });

  assert.equal(parseProfileAnalysisOutput(wrapped, source).personId, 'main:纪宁');
}

function testNearValidOpenAiResponseCanBeRepaired(): void {
  const malformedContent = `{
    "personId": "main:纪宁",
    "personName": "纪宁",
    "analysisNarrative": "纪宁近期更明确地表达药品补给风险。"
    "changes": [],
    "basicInfoAdditions": [],
    "behaviorTuning": "先核对药品，再提出补给需求",
    "personalityTuning": "保持谨慎，近期表达更直接",
    "speechStyleTuning": "医疗事务使用简短明确的措辞",
    "currentGoals": "补足药品库存",
    "currentSituationSummary": "正在诊疗室清点药品",
    "relationshipInterpretation": "保持协作关系",
    "storyInteractionSummary": "回到诊疗室",
    "chatInteractionSummary": "提醒药品即将耗尽",
    "playerActionAdvice": "确认药品补给安排",
    "evidenceRefs": ["story:12", "wechat:new"]
  }`;
  const wrapped = JSON.stringify({
    choices: [{ index: 0, message: { role: 'assistant', content: malformedContent } }],
  });

  assert.equal(parseProfileAnalysisOutput(wrapped, source).personId, 'main:纪宁');
}

testStrictOutputAndMerge();
testOutputRejectsUnknownFields();
testIdentityAndEvidenceValidation();
testPromptSourceOrder();
testOpenAiResponseEnvelopeCanBeParsed();
testNearValidOpenAiResponseCanBeRepaired();
console.log('profile analysis tests passed');
