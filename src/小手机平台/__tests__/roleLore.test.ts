import assert from 'node:assert/strict';

import { buildRoleLoreEntries, type RoleLoreSourceEntry } from '../ai/roleLore';
import { assemblePrompt, createPromptContextSnapshot, type PromptContextSnapshotInput } from '../ai/promptAssembler';

function entry(overrides: Partial<RoleLoreSourceEntry>): RoleLoreSourceEntry {
  return {
    uid: 1,
    name: '条目',
    enabled: true,
    strategy: { type: 'constant', keys: [] },
    content: '内容',
    ...overrides,
  };
}

function snapshotInput(overrides: Partial<PromptContextSnapshotInput> = {}): PromptContextSnapshotInput {
  return {
    sessionKey: 'winter::chat-7',
    snapshotKey: { chatId: 'chat-7', assistantMessageId: 42, mvuSignature: 'mvu:abc' },
    mode: '私聊',
    protocol: '协议',
    members: [{ name: '爱丽丝', identity: '伊甸居民', profile: '冷静的医生' }],
    recentMainChat: [],
    phoneHistory: [],
    playerMessage: '你好',
    outputContract: '契约',
    maxCharacters: 20000,
    ...overrides,
  };
}

function testRoleLoreMatching(): void {
  const roles = ['爱丽丝', '鲍勃'];
  const entries = buildRoleLoreEntries(
    [
      entry({ uid: 1, name: '蓝灯常驻', strategy: { type: 'constant', keys: [] }, content: '世界规则' }),
      entry({
        uid: 2,
        name: '爱丽丝档案',
        strategy: { type: 'selective', keys: ['爱丽丝'] },
        content: '爱丽丝的私密档案',
      }),
      entry({
        uid: 3,
        name: '鲍勃档案',
        strategy: { type: 'selective', keys: ['鲍勃', /^阿尔/] },
        content: '鲍勃的档案',
      }),
      entry({ uid: 4, name: '未匹配', strategy: { type: 'selective', keys: ['路人'] }, content: '不该出现' }),
      entry({
        uid: 5,
        name: '禁用条目',
        enabled: false,
        strategy: { type: 'selective', keys: ['爱丽丝'] },
        content: '不该出现',
      }),
      entry({ uid: 6, name: '向量条目', strategy: { type: 'vectorized', keys: ['爱丽丝'] }, content: '不该出现' }),
    ],
    roles,
  );

  assert.deepEqual(
    entries,
    [
      { id: '1', content: '世界规则', relevant: true },
      { id: '2', content: '爱丽丝的私密档案', relevant: false, roles: ['爱丽丝'] },
      { id: '3', content: '鲍勃的档案', relevant: false, roles: ['鲍勃'] },
    ],
    '蓝灯常驻 + 绿灯按角色名匹配，未匹配/禁用/向量化全部排除',
  );
}

function testAssembledWorldbookGroupedByRole(): void {
  const assembled = assemblePrompt(
    createPromptContextSnapshot(
      snapshotInput({
        worldbook: [
          { id: 'r1', content: '常驻规则', relevant: true },
          { id: 'g1', content: '爱丽丝专属', relevant: true, roles: ['爱丽丝'] },
          { id: 'g2', content: '爱丽丝与鲍勃共有', relevant: true, roles: ['爱丽丝', '鲍勃'] },
        ],
      }),
    ),
  );
  assert.ok(assembled.includes('"常驻":["常驻规则"]'), '蓝灯条目应归入常驻 key');
  assert.ok(assembled.includes('"爱丽丝":["爱丽丝专属","爱丽丝与鲍勃共有"]'), '角色 key 应聚合该角色的全部绿灯条目');
  assert.ok(assembled.includes('"鲍勃":["爱丽丝与鲍勃共有"]'), '多角色条目应在每个角色 key 下出现');
}

function testUnkeyedWorldbookFallsBackToResident(): void {
  const assembled = assemblePrompt(
    createPromptContextSnapshot(
      snapshotInput({
        worldbook: [{ id: 'legacy', content: '旧格式条目', relevant: true }],
      }),
    ),
  );
  assert.ok(assembled.includes('"常驻":["旧格式条目"]'), '无 roles 的旧格式条目应归入常驻');
}

function testGroupBudgetTrimsRoleEntriesButKeepsResident(): void {
  // 群聊场景：蓝灯常驻 + 大量角色条目，预算不足时应先裁角色条目，保留常驻
  const resident = { id: 'r1', content: '常驻规则'.repeat(80), relevant: true };
  const roleEntries = Array.from({ length: 6 }, (_, index) => ({
    id: 'g' + index,
    content: '角色' + index + '条目' + '.'.repeat(1000),
    relevant: false,
    roles: ['纪宁'] as readonly string[],
  }));
  const assembled = assemblePrompt(
    createPromptContextSnapshot(
      snapshotInput({
        members: [
          { name: '纪宁', identity: 'main:纪宁', profile: '档案'.repeat(100) },
          { name: '爱丽丝', identity: 'main:爱丽丝', profile: '档案'.repeat(100) },
        ],
        worldbook: [resident, ...roleEntries],
        maxCharacters: 3000,
      }),
    ),
  );
  assert.ok(assembled.includes('常驻规则'), '蓝灯常驻应被保留');
  assert.ok(!assembled.includes('角色0条目'), '超预算时应裁剪绿灯角色条目');
}

function main(): void {
  testRoleLoreMatching();
  testAssembledWorldbookGroupedByRole();
  testUnkeyedWorldbookFallsBackToResident();
  testGroupBudgetTrimsRoleEntriesButKeepsResident();
  console.log('role lore tests passed');
}

void main();
