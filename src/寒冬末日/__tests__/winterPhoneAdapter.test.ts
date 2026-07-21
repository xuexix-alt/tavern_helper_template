import assert from 'node:assert/strict';

import {
  buildBoundedMemberContext,
  buildEdenNotices,
  buildWinterTasks,
  collectChatLoreContext,
  canAssignEdenTerminal,
  canPublishSnapshot,
  characterProfileEntryName,
  createStableSnapshotKey,
  deriveContactAvailability,
  diffConfirmedMvuChanges,
  isCapturedSessionCurrent,
  isEdenTerminalDeploymentAllowed,
  migrateTemporaryNpcIdentity,
  planTemporaryNpcMigration,
  selectCharacterProfile,
} from '../脚本/小手机-90寒冬适配器/winterAdapterCore';

function testStableSnapshotPolicy(): void {
  assert.equal(canPublishSnapshot({ assistantMessageId: null, mvu: {} }), false);
  assert.equal(canPublishSnapshot({ assistantMessageId: 12, mvu: {} }), false);
  assert.equal(canPublishSnapshot({ assistantMessageId: 12, mvu: { stat_data: { 世界: {} } } }), false);
  assert.equal(canPublishSnapshot({ assistantMessageId: 12, mvu: { stat_data: {} }, assistantCompleted: false }), false);
  assert.equal(
    canPublishSnapshot({ assistantMessageId: 12, mvu: { stat_data: { 世界: {} } }, assistantCompleted: true }),
    true,
  );
  assert.equal(
    createStableSnapshotKey({ chatId: 'chat-a', assistantMessageId: 12, mvuSignature: 'mvu:abc' }),
    'chat-a::12::mvu:abc',
  );
  assert.equal(isCapturedSessionCurrent('winter::chat-a', 'winter::chat-b'), false);
  assert.equal(isCapturedSessionCurrent('winter::chat-a', 'winter::chat-a'), true);
}

function testEdenTerminalAndContactPolicy(): void {
  assert.equal(
    canAssignEdenTerminal({ abilities: ['social.shift_ration_protocol_t2'], assignedCount: 5 }),
    false,
  );
  assert.equal(
    canAssignEdenTerminal({ abilities: ['social.shift_ration_protocol_t2'], assignedCount: 4 }),
    true,
  );
  assert.equal(canAssignEdenTerminal({ abilities: ['social.eden_phone_mass_t4'], assignedCount: 99 }), true);
  assert.equal(
    isEdenTerminalDeploymentAllowed({ abilities: ['social.shift_ration_protocol_t2'], assignedCount: 6 }),
    false,
  );
  assert.equal(
    isEdenTerminalDeploymentAllowed({ abilities: ['social.shift_ration_protocol_t2'], assignedCount: 5 }),
    true,
  );
  assert.equal(isEdenTerminalDeploymentAllowed({ abilities: [], assignedCount: 1 }), false);

  const base = { established: true, terminalStatus: '正常' as const, signalStatus: '在线' as const };
  assert.deepEqual(
    deriveContactAvailability({ ...base, terminalType: '普通手机', publicNetwork: '在线', edenNetwork: '中断' }),
    { online: true, canSend: true, network: '公共通信网' },
  );
  assert.deepEqual(
    deriveContactAvailability({ ...base, terminalType: '伊甸终端T2', publicNetwork: '在线', edenNetwork: '受限' }),
    { online: false, canSend: false, network: '伊甸内网' },
  );
  assert.equal(
    deriveContactAvailability({
      ...base,
      terminalType: '伊甸终端T2',
      publicNetwork: '在线',
      edenNetwork: '在线',
      edenAccessAllowed: false,
    }).canSend,
    false,
  );
  assert.equal(
    deriveContactAvailability({
      ...base,
      terminalType: '伊甸终端T2',
      publicNetwork: '在线',
      edenNetwork: '在线',
      edenAccessAllowed: true,
    }).canSend,
    true,
  );
  assert.equal(
    deriveContactAvailability({ ...base, established: false, terminalType: '普通手机', publicNetwork: '在线' }).canSend,
    false,
  );
}

function testTemporaryNpcMigration(): void {
  assert.deepEqual(planTemporaryNpcMigration(['工程师'], ['工程师']), {
    migrations: [{ from: 'temporary:工程师', to: 'main:工程师' }],
    diagnostics: [],
  });
  const ambiguous = planTemporaryNpcMigration(['工程师', ' 工程师 '], ['工程师']);
  assert.deepEqual(ambiguous.migrations, []);
  assert.match(ambiguous.diagnostics[0] ?? '', /歧义|ambiguous/i);

  const migrated = migrateTemporaryNpcIdentity(
    { migrations: [{ from: 'temporary:工程师', to: 'main:工程师' }], diagnostics: [] },
    {
      conversations: [{ id: 'c1', participants: ['temporary:工程师', 'main:纪宁'] }],
      contactPreferences: { 'temporary:工程师': { muted: true } },
      messages: [{ id: 'm1', sender: 'temporary:工程师', content: '还在' }],
    },
  );
  assert.deepEqual(migrated.conversations[0]?.participants, ['main:工程师', 'main:纪宁']);
  assert.deepEqual(migrated.contactPreferences['main:工程师'], { muted: true });
  assert.equal(migrated.messages[0]?.content, '还在', '历史内容不得丢失');
}

function testProfilesAndBoundedFallback(): void {
  assert.equal(characterProfileEntryName('工程师'), '角色档案 - 工程师');
  assert.equal(
    selectCharacterProfile('工程师', [{ name: '角色档案 - 工程师', content: '主档案' }, { name: '角色详情 - 工程师', content: '错误档案' }]),
    '主档案',
  );
  assert.equal(selectCharacterProfile('临时工程师', [], true), undefined);
  const context = buildBoundedMemberContext({
    name: '工程师',
    profile: undefined,
    mvuFields: { 通讯: { 信号状态: '在线' }, 内心想法: '保持供暖' },
    recentCompletedStory: '雪'.repeat(500),
    characterBudget: 120,
  });
  assert.ok(context.length <= 120);
  assert.match(context, /工程师|在线/);
}

function testTasksAndNotices(): void {
  const mvu = {
    主线任务: {
      当前阶段: '不得读取',
      阶段目标: { 修复供暖: { 描述: '检查锅炉', 当前值: 1, 目标值: 2 } },
      情报碎片: { intel1: { 编号: 'I-1', 描述: '地下室信号', 价值: '高', 风险: '低', 状态: '未探索' } },
      其他字段: { 泄漏: true },
    },
  };
  assert.deepEqual(buildWinterTasks(mvu), [
    {
      id: 'goal:修复供暖',
      title: '修复供暖',
      detail: '检查锅炉（1/2）',
      sourceKey: 'winter:goal:修复供暖',
      triggerKey: 'goal:修复供暖:1:2',
      actionText: '推进阶段目标「修复供暖」：检查锅炉',
    },
    {
      id: 'intel:intel1',
      title: '情报 I-1',
      detail: '地下室信号｜价值：高｜风险：低｜未探索',
      sourceKey: 'winter:intel:intel1',
      triggerKey: 'intel:intel1:未探索',
      actionText: '调查情报碎片「I-1」：地下室信号',
    },
  ]);

  const notices = buildEdenNotices({
    communicationNetwork: { 公共通信网: '受限', 伊甸内网: '在线' },
    tasks: buildWinterTasks(mvu),
    confirmedChanges: ['通讯网络.伊甸内网:受限→在线'],
    scheduledExternalBroadcasts: [{ id: 'ext-1', source: '北区广播', content: '疑似有物资' }],
  });
  assert.equal(notices.filter(item => item.trust === 'unverified').length, 1);
  assert.match(notices.map(item => item.triggerKey).join('\n'), /network|goal|intel|confirmed|external/);

  assert.deepEqual(
    diffConfirmedMvuChanges(
      { 通讯网络: { 伊甸内网: '受限' }, 主线任务: { 阶段目标: { 供暖: { 当前值: 0 } } } },
      { 通讯网络: { 伊甸内网: '在线' }, 主线任务: { 阶段目标: { 供暖: { 当前值: 1 } } } },
    ),
    ['主线任务.阶段目标.供暖.当前值:0→1', '通讯网络.伊甸内网:受限→在线'],
  );

  assert.equal(
    collectChatLoreContext(
      [
        { name: '[手机通讯]私聊记录', content: '私聊事实' },
        { name: '无关条目', content: '不得进入' },
        { name: '[手机情报]广播摘要', content: '广播事实' },
      ],
      30,
    ),
    '[手机通讯]私聊记录\n私聊事实\n\n[手机情报]广播摘要\n广播',
  );
}

function main(): void {
  testStableSnapshotPolicy();
  testEdenTerminalAndContactPolicy();
  testTemporaryNpcMigration();
  testProfilesAndBoundedFallback();
  testTasksAndNotices();
  console.log('winter phone adapter tests passed');
}

main();
