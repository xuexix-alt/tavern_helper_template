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

function testOutputToleratesExtraFieldsAndEmptyValues(): void {
  // B1: 多余字段剥离而非整体失败
  const tolerant = parseProfileAnalysisOutput(
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
      confidence: 0.9,
    }),
    source,
  );
  assert.equal((tolerant as unknown as Record<string, unknown>).mvuRelation, undefined);
  assert.equal((tolerant as unknown as Record<string, unknown>).confidence, undefined);

  // B1: 空串/null/缺键走兜底文案
  const sparse = parseProfileAnalysisOutput(
    JSON.stringify({
      personId: 'main:纪宁',
      personName: '纪宁',
      analysisNarrative: '',
      currentGoals: null,
      behaviorTuning: '保持谨慎',
    }),
    source,
  );
  assert.equal(sparse.analysisNarrative, '本次分析未提供概括说明。');
  assert.equal(sparse.currentGoals, '暂无明确目标');
  assert.equal(sparse.behaviorTuning, '保持谨慎');
  assert.equal(sparse.personalityTuning, '暂无明显变化');
  assert.equal(sparse.playerActionAdvice, '暂无特别建议');
  assert.deepEqual(sparse.changes, []);
  assert.deepEqual(sparse.basicInfoAdditions, []);

  assert.throws(() => parseProfileAnalysisOutput('{"__proto__":{"polluted":true}}'), /结构|字段|危险/);
}

function testChangesEntryTolerance(): void {
  // 线上实测：changes 条目缺 evidenceRefs / 带未知 field / 空 after 时不得否决整份分析
  const parsed = parseProfileAnalysisOutput(
    JSON.stringify({
      personId: 'main:纪宁',
      personName: '纪宁',
      analysisNarrative: '纪宁在诊疗室清点药品。',
      changes: [
        {
          field: 'relationshipInterpretation',
          before: '协作',
          after: '信任加深',
          reason: '共同完成抢修',
          evidenceRefs: ['story:12'],
        },
        {
          // 缺 evidenceRefs：sanitize 应回填 fixed-profile
          field: 'currentSituationSummary',
          before: '在诊疗室',
          after: '正在清点药品',
          reason: '正文明确',
        },
        {
          // 未知 field：条目剔除
          field: 'mvuRelation',
          before: 'a',
          after: 'b',
          reason: 'c',
          evidenceRefs: ['fixed-profile'],
        },
        {
          // 空 after：条目剔除
          field: 'currentGoals',
          before: '补库存',
          after: '   ',
          reason: 'c',
          evidenceRefs: ['fixed-profile'],
        },
      ],
    }),
    source,
  );
  assert.equal(parsed.changes.length, 2);
  assert.deepEqual(
    parsed.changes.map(change => change.field),
    ['relationshipInterpretation', 'currentSituationSummary'],
  );
  assert.deepEqual(parsed.changes[0].evidenceRefs, ['story:12']);
  assert.deepEqual(parsed.changes[1].evidenceRefs, ['fixed-profile'], '缺 evidenceRefs 的条目应回填 fixed-profile');
}

function testKeywordFallbackExtraction(): void {
  // 严格解析彻底失败（personId 数字类型 + JSON 断尾）时按关键字降级提取
  const salvaged = parseProfileAnalysisOutput(
    '{"personId": 123, "personName": "纪宁", "behaviorTuning": "保持谨慎，清点物资先核对缺口", "currentGoals": "补足药品库存", "changes": [{"field": "relationshipInterp',
    source,
  );
  assert.equal(salvaged.personId, 'main:纪宁', '身份回退到 source');
  assert.equal(salvaged.personName, '纪宁');
  assert.equal(salvaged.behaviorTuning, '保持谨慎，清点物资先核对缺口');
  assert.equal(salvaged.currentGoals, '补足药品库存');
  assert.deepEqual(salvaged.changes, [], '断尾的 changes 直接放弃');
  assert.deepEqual(salvaged.evidenceRefs, ['fixed-profile']);
  assert.equal(salvaged.personalityTuning, '暂无明显变化', '未提取到的字段走兜底');

  // 纯文本（完全无 JSON）也不失败：全部兜底
  const plainText = parseProfileAnalysisOutput('模型拒绝输出 JSON，只说了些闲话。', source);
  assert.equal(plainText.personId, 'main:纪宁');
  assert.equal(plainText.analysisNarrative, '本次分析未提供概括说明。');
  assert.deepEqual(plainText.changes, []);

  // 降级提取路径下身份错乱仍然拒绝
  assert.throws(
    () => parseProfileAnalysisOutput('{"personId": "main:别人", "personName": "别人", "behaviorTuning": "x"}', source),
    /人物|身份/,
  );

  // 原型污染尝试在降级路径前被拦截
  assert.throws(() => parseProfileAnalysisOutput('{"__proto__": {"polluted": true}, "personId": 1}'), /结构|字段|危险/);
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

  // 身份不一致仍然整体拒绝（张冠李戴的档案比没有档案更糟）
  assert.throws(
    () => parseProfileAnalysisOutput(JSON.stringify({ ...valid, personId: 'main:陈宇' }), source),
    /人物|personId/,
  );

  // B2: 非法引用被剔除，合法引用保留
  const pruned = parseProfileAnalysisOutput(
    JSON.stringify({ ...valid, evidenceRefs: ['story:999', 'story:12', 'mvu:关系'] }),
    source,
  );
  assert.deepEqual(pruned.evidenceRefs, ['story:12', 'mvu:关系']);

  // B2: mvu 嵌套路径按顶层键匹配视为合法（顶层键「健康」在 mvuFacts 中存在）
  const nested = parseProfileAnalysisOutput(
    JSON.stringify({ ...valid, evidenceRefs: ['mvu:健康状况.所在房间', 'mvu:健康'] }),
    source,
  );
  assert.deepEqual(nested.evidenceRefs, ['mvu:健康']);

  // B3: 全部非法时回填 fixed-profile
  const fallback = parseProfileAnalysisOutput(
    JSON.stringify({ ...valid, evidenceRefs: ['story:999', 'wechat:ghost'] }),
    source,
  );
  assert.deepEqual(fallback.evidenceRefs, ['fixed-profile']);

  // B2: changes 内的非法引用同样被剔除
  const changePruned = parseProfileAnalysisOutput(
    JSON.stringify({
      ...valid,
      changes: [
        {
          field: 'behaviorTuning',
          before: '暂无',
          after: '主动组织抢修',
          reason: '正文明确其带队',
          evidenceRefs: ['story:999', 'story:12'],
        },
      ],
    }),
    source,
  );
  assert.deepEqual(changePruned.changes[0].evidenceRefs, ['story:12']);
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

function testPromptProfileCharacterBudget(): void {
  // 不可变块（身份+固定本色+MVU硬事实+私密范围）超上限时不再整体失败，而是原样保留并压缩动态段预算
  const parsed = parseProfileAnalysisOutput(
    JSON.stringify({
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
      evidenceRefs: ['story:12'],
    }),
    source,
  );
  const bigSource: ProfileAnalysisSource = {
    ...source,
    mvuFacts: { 关系: '协作', 位置: '诊疗室', 健康: 83, 备注: 'x'.repeat(3_000) },
  };
  const merged = mergeDynamicProfile(bigSource, parsed, []);

  const rendered = renderPromptProfile(merged, 2_000);
  assert.ok(rendered.includes('MVU硬事实'), '不可变块必须保留');
  assert.ok(rendered.length > 2_000, '不可变块超上限时原样保留而非失败或截断');

  // 正常上限下动态段仍按预算追加
  const normal = renderPromptProfile(mergeDynamicProfile(source, parsed, []), 4_000);
  assert.match(normal, /近期行为模式/);
  assert.ok(normal.length <= 4_000);
}

function testPromptEnforcesFieldLengthDiscipline(): void {
  const prompt = buildProfileAnalysisPrompt(source);
  // 契约与写作要求中必须有明确的字数约束
  assert.match(prompt, /不超过200字/);
  assert.match(prompt, /不超过120字/);
  assert.match(prompt, /不超过80字/);
  assert.match(prompt, /每条不超过60字/);
  assert.match(prompt, /合计不超过800字/);
  assert.match(PROFILE_ANALYSIS_SYSTEM_PROMPT, /字数纪律/);
}

testStrictOutputAndMerge();
testOutputToleratesExtraFieldsAndEmptyValues();
testChangesEntryTolerance();
testKeywordFallbackExtraction();
testIdentityAndEvidenceValidation();
testPromptSourceOrder();
testOpenAiResponseEnvelopeCanBeParsed();
testPromptProfileCharacterBudget();
testPromptEnforcesFieldLengthDiscipline();
testNearValidOpenAiResponseCanBeRepaired();
console.log('profile analysis tests passed');
