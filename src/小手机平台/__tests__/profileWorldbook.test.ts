import assert from 'node:assert/strict';

import { resolveProfilePromptMacros } from '../profiles/profileMacro';
import {
  buildDynamicProfileEntry,
  dynamicProfileEntryName,
  readDynamicProfileEntry,
} from '../profiles/profileWorldbook';
import type { DynamicProfileDocument } from '../profiles/profileTypes';

const document: DynamicProfileDocument = {
  version: 1,
  sessionKey: '角色A::chat-a',
  personId: 'main:纪宁',
  personName: '纪宁',
  fixedBaseline: '冷静谨慎的医生',
  hardFacts: { 关系: '协作', 位置: '诊疗室' },
  basicInfoAdditions: ['近期负责诊疗室'],
  personalityTuning: '近期更关注补给风险',
  currentSituationSummary: '正在清点药品',
  relationshipInterpretation: '协作关系',
  storyInteractionSummary: '回到诊疗室',
  chatInteractionSummary: '提醒药品不足',
  lastWechatRound: ['纪宁：药品快用完了。'],
  evidenceRefs: ['story:12', 'wechat:new'],
  updatedAt: 100,
};

function testSelectiveEntry(): void {
  const entry = buildDynamicProfileEntry(document, ['纪宁', '宁医生'], 2_000);
  assert.equal(entry.name, '[人物动态]main:纪宁');
  assert.equal(entry.strategy.type, 'selective');
  assert.deepEqual(entry.strategy.keys, ['纪宁', '宁医生']);
  assert.equal(entry.content.includes('playerActionAdvice'), false);
  assert.match(entry.content, /私密范围/);
  assert.deepEqual((entry.extra as any).dynamicProfileDocument, document);
}

function testExactRead(): void {
  const entry = buildDynamicProfileEntry(document, ['纪宁'], 2_000);
  const selected = readDynamicProfileEntry('main:纪宁', [
    { ...entry, uid: 1 },
    { ...entry, uid: 2, name: dynamicProfileEntryName('main:赵卫国'), content: '赵卫国动态' },
  ]);
  assert.equal(selected?.content, entry.content);
  assert.deepEqual(selected?.document, document);
  assert.equal(readDynamicProfileEntry('main:陌生人', [{ ...entry, uid: 1 }]), undefined);
}

function testLocalMacroIsolation(): void {
  const entry = buildDynamicProfileEntry(document, ['纪宁'], 2_000);
  const expanded = resolveProfilePromptMacros('A={{TAVERN_PHONE_PROFILE}} B={{TAVERN_PHONE_PROFILE:main:赵卫国}}', {
    currentPersonId: 'main:纪宁',
    read: personId => (personId === 'main:纪宁' ? entry.content : undefined),
  });
  assert.match(expanded, /A=.+纪宁/s);
  assert.match(expanded, / B=$/);
}

testSelectiveEntry();
testExactRead();
testLocalMacroIsolation();
console.log('profile worldbook tests passed');
