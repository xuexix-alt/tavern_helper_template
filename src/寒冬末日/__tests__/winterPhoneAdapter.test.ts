import assert from 'node:assert/strict';
import { ControlledPhoneScheduler } from '../../小手机平台/scheduler/phoneScheduler';

import {
  buildEdenNotices,
  buildWinterTasks,
  buildWinterSchedulerJobs,
  advanceSnapshotCompletionGate,
  collectChatLoreContext,
  canPublishSnapshot,
  characterProfileEntryName,
  createStableSnapshotKey,
  diffConfirmedMvuChanges,
  extractWinterContactCandidates,
  isCapturedSessionCurrent,
  isHostEpochCaptureCurrent,
  migrateTemporaryNpcIdentity,
  planTemporaryNpcPromotion,
  planTemporaryNpcMigration,
  resolveWinterPersonMvu,
  resolveWinterWorldTime,
  selectCharacterProfile,
  selectDynamicProfile,
  selectPublicWinterMvuFacts,
  runPendingDispatchPreparation,
  submitWinterSchedulerJobs,
} from '../脚本/小手机-90寒冬适配器/winterAdapterCore';

function testWinterContactCandidateExtraction(): void {
  assert.deepEqual(
    extractWinterContactCandidates({
      世界: { 登场状态: '登场' },
      通讯网络: { 登场状态: '离场' },
      庇护所: { 登场状态: '登场' },
      伊甸一次性指令: { 登场状态: '离场' },
      房间: { 登场状态: '登场' },
      主线任务: { 登场状态: '离场' },
      楼层其他住户: { 登场状态: '登场' },
      纪宁: { 姓名: '纪宁', 登场状态: '离场' },
      旧角色Key: { 登场状态: '登场' },
      非角色: { 姓名: '错误对象' },
      临时NPC: {
        红衣男子: { 登场状态: '登场' },
        无状态路人: { 姓名: '无状态路人' },
      },
    }),
    [
      { id: 'main:纪宁', name: '纪宁', temporary: false },
      { id: 'main:旧角色Key', name: '旧角色Key', temporary: false },
      { id: 'temporary:红衣男子', name: '红衣男子', temporary: true },
    ],
  );
}

function testSnapshotCompletionGateAndHostEpoch(): void {
  const started = advanceSnapshotCompletionGate(undefined, { type: 'generation-started' });
  const generated = advanceSnapshotCompletionGate(started.state, { type: 'generation-ended', assistantMessageId: 19 });
  assert.equal(generated.publishAssistantMessageId, null, 'generation ended 后必须等待 MVU 完成');
  const updating = advanceSnapshotCompletionGate(generated.state, { type: 'mvu-started' });
  const completed = advanceSnapshotCompletionGate(updating.state, { type: 'mvu-ended' });
  assert.equal(completed.publishAssistantMessageId, 19);

  const earlyMvu = advanceSnapshotCompletionGate(started.state, { type: 'mvu-ended' });
  assert.equal(earlyMvu.publishAssistantMessageId, null);
  assert.equal(
    advanceSnapshotCompletionGate(earlyMvu.state, { type: 'generation-ended', assistantMessageId: 20 })
      .publishAssistantMessageId,
    20,
    'MVU 先完成时 generation ended 才可发布',
  );

  const host = { characterName: '末世寒冬 - 星穹秩序', chatId: 'chat-a', sessionKey: 'winter::chat-a' };
  assert.equal(isHostEpochCaptureCurrent({ epoch: 3, host }, 3, { ...host }), true);
  assert.equal(isHostEpochCaptureCurrent({ epoch: 3, host }, 4, { ...host }), false);
  assert.equal(isHostEpochCaptureCurrent({ epoch: 3, host }, 3, { ...host, chatId: 'chat-b' }), false);
}

async function testPendingDispatchPreparation(): Promise<void> {
  const states: string[] = [];
  await assert.rejects(
    () =>
      runPendingDispatchPreparation({
        markPending: async () => void states.push('pending'),
        prepareAndDispatch: async () => {
          states.push('prepare');
          throw new Error('profile read failed');
        },
        markFailed: async error => void states.push(`failed:${error instanceof Error ? error.message : String(error)}`),
      }),
    /profile read failed/,
  );
  assert.deepEqual(states, ['pending', 'prepare', 'failed:profile read failed']);

  states.length = 0;
  await runPendingDispatchPreparation({
    markPending: async () => void states.push('pending'),
    prepareAndDispatch: async () => void states.push('dispatched'),
    markFailed: async () => void states.push('failed'),
  });
  assert.deepEqual(states, ['pending', 'dispatched']);
}

function testStableSnapshotPolicy(): void {
  assert.equal(canPublishSnapshot({ assistantMessageId: null, mvu: {} }), false);
  assert.equal(canPublishSnapshot({ assistantMessageId: 12, mvu: {} }), false);
  assert.equal(canPublishSnapshot({ assistantMessageId: 12, mvu: { stat_data: { 世界: {} } } }), false);
  assert.equal(
    canPublishSnapshot({ assistantMessageId: 12, mvu: { stat_data: {} }, assistantCompleted: false }),
    false,
  );
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

function testTemporaryNpcMigration(): void {
  assert.deepEqual(planTemporaryNpcMigration(['工程师'], ['工程师']), {
    migrations: [{ from: 'temporary:工程师', to: 'main:工程师' }],
    diagnostics: [],
  });
  const ambiguous = planTemporaryNpcMigration(['工程师', ' 工程师 '], ['工程师']);
  assert.deepEqual(ambiguous.migrations, []);
  assert.match(ambiguous.diagnostics[0] ?? '', /歧义|ambiguous/i);

  assert.deepEqual(planTemporaryNpcPromotion(['工程师'], [], ['工程师']), {
    migrations: [{ from: 'temporary:工程师', to: 'main:工程师' }],
    diagnostics: [],
  });
  assert.deepEqual(
    planTemporaryNpcPromotion(['工程师'], ['工程师'], ['工程师']),
    { migrations: [], diagnostics: [] },
    '早已存在的同名主角色不得被误判为本次转正',
  );
  assert.deepEqual(
    planTemporaryNpcPromotion(['工程师'], ['旧角色'], ['旧角色', '工程师']),
    { migrations: [{ from: 'temporary:工程师', to: 'main:工程师' }], diagnostics: [] },
    '只允许相对上一已发布快照新增的主角色参与匹配',
  );

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

function testProfilesAndExactMvuReference(): void {
  assert.equal(characterProfileEntryName('工程师'), '角色档案 - 工程师');
  assert.equal(
    selectCharacterProfile('工程师', [
      { name: '角色档案 - 工程师', content: '主档案' },
      { name: '角色详情 - 工程师', content: '错误档案' },
    ]),
    '主档案',
  );
  assert.equal(selectCharacterProfile('临时工程师', [], true), undefined);

  const statData = {
    纪宁: { 关系: '协作', 位置: '诊疗室' },
    临时NPC: { 工程师: { 关系: '初识', 位置: '锅炉房' } },
  };
  assert.deepEqual(resolveWinterPersonMvu('main:纪宁', statData), statData.纪宁);
  assert.deepEqual(resolveWinterPersonMvu('temporary:工程师', statData), statData.临时NPC.工程师);
  assert.deepEqual(resolveWinterPersonMvu('main:不存在', statData), {});
  assert.deepEqual(
    resolveWinterWorldTime({ 世界: { 日期: ' 灾后第七日 ', 时间: '上午 - 08:00' } }),
    { gameDate: '灾后第七日', gameTime: '上午 - 08:00' },
    '世界时间应去除首尾空白后盖章',
  );
  assert.deepEqual(resolveWinterWorldTime({ 世界: { 日期: '', 时间: '  ' } }), {}, '空白时间字段应省略');
  assert.deepEqual(resolveWinterWorldTime({}), {}, '缺少世界状态时不盖章');
  assert.deepEqual(resolveWinterWorldTime(null), {});
  assert.equal(
    selectDynamicProfile('main:纪宁', [
      { name: '[人物动态]main:纪宁', content: '纪宁动态' },
      { name: '[人物动态]main:赵卫国', content: '赵卫国动态' },
    ]),
    '纪宁动态',
  );
  assert.deepEqual(
    selectPublicWinterMvuFacts({
      世界: { 日期: '灾后第七日' },
      通讯网络: { 公共通信网: '受限' },
      庇护所: {
        庇护所等级: 2,
        今日投掷点数: '3d6=12',
        庇护所能力总述: '覆盖19-20层',
        接口覆盖范围: { 19: [] },
        庇护范围变更: { add: { 19: ['东侧'] }, remove: {}, note: '修复东侧围墙' },
      },
      房间: { 玄关: { 净化隔离区入住者: ['赵卫国'], 临时客房A入住者: [] } },
      主线任务: {
        当前阶段: '阶段一：秩序的萌芽',
        阶段目标: { 修复供暖: { 描述: '检查锅炉', 当前值: 1, 目标值: 2 } },
        $meta: { 角色控制: { revealed_roles: ['纪宁'] }, 楼层: { last_seen_message_id: 42 } },
      },
      楼层其他住户: { 言语: '走廊传来脚步声', 行为: '' },
      临时NPC: {
        工程师: {
          关系: '交易',
          健康状况: '生病/受伤',
          所在房间: '楼层20/2001',
          登场状态: '登场',
          内心想法: '私密内容',
        },
        路人: { 关系: '无', 内心想法: '私密内容' },
      },
      纪宁: { 内心想法: '私密内容' },
    }),
    {
      世界: { 日期: '灾后第七日' },
      通讯网络: { 公共通信网: '受限' },
      庇护所: { 庇护所等级: 2, 庇护所能力总述: '覆盖19-20层', 庇护范围变更: '修复东侧围墙' },
      房间: { 玄关: { 净化隔离区入住者: ['赵卫国'] } },
      主线任务: {
        当前阶段: '阶段一：秩序的萌芽',
        阶段目标: { 修复供暖: { 描述: '检查锅炉', 当前值: 1, 目标值: 2 } },
      },
      楼层其他住户: { 言语: '走廊传来脚步声' },
      临时NPC动向: {
        工程师: { 关系: '交易', 健康状况: '生病/受伤', 所在房间: '楼层20/2001', 登场状态: '登场' },
      },
    },
    '广播公开事实应做字段级投影：剔除剧透元数据/机制字段/私密字段，仅留播报必需信息',
  );
  assert.deepEqual(
    selectPublicWinterMvuFacts({ 庇护所: { 今日投掷点数: '3d6' }, 房间: { 玄关: { 临时客房A入住者: [] } } }),
    {},
    '投影后为空的分节应整体省略',
  );
  assert.deepEqual(selectPublicWinterMvuFacts(null), {});
  assert.deepEqual(selectPublicWinterMvuFacts('garbage'), {});
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
        { name: '[微信-私聊]main:纪宁', content: '纪宁私聊事实' },
        { name: '[微信-私聊]main:赵卫国', content: '赵卫国私聊事实' },
        { name: '[手机通讯]私聊记录', content: '旧汇总不得进入' },
      ],
      'private',
      'private:main:纪宁',
      6_000,
    ),
    '[微信-私聊]main:纪宁\n纪宁私聊事实',
  );
}

function testSchedulerJobsCaptureStableScope(): void {
  const jobs = buildWinterSchedulerJobs({
    sessionKey: 'winter::chat-a',
    snapshotKey: 'chat-a::19::mvu:abc',
    conversationId: 'eden-group:residents',
    worldbookName: '世界书-A',
    speaker: '纪宁',
    participants: ['main:纪宁', 'temporary:工程师'],
    notices: [
      { id: 'network', source: '伊甸网络', content: '伊甸内网:在线', trust: 'confirmed', triggerKey: 'network:在线' },
      { id: 'external-1', source: '北区广播', content: '疑似物资', trust: 'unverified', triggerKey: 'external:1' },
    ],
    gameDate: '灾后第七日',
    gameTime: '上午 - 08:00',
  });
  assert.equal(
    jobs.every(job => {
      const payload = job.payload as Record<string, unknown>;
      return payload.gameDate === '灾后第七日' && payload.gameTime === '上午 - 08:00';
    }),
    true,
    '调度任务 payload 必须透传剧情时间戳供落库盖章',
  );
  assert.equal(
    jobs.some(job => job.requiresAi),
    true,
  );
  assert.equal(
    jobs.some(job => !job.requiresAi),
    true,
  );
  assert.equal(
    jobs.every(job => job.sessionKey === 'winter::chat-a' && job.snapshotKey === 'chat-a::19::mvu:abc'),
    true,
  );
  assert.equal(
    jobs.every(job => JSON.stringify(job.payload).includes('世界书-A')),
    true,
  );
  assert.equal(
    jobs.filter(job => job.requiresAi).every(job => JSON.stringify(job.payload).includes('temporary:工程师')),
    true,
    '主动群消息任务必须捕获稳定群成员列表',
  );
  assert.equal(new Set(jobs.map(job => job.triggerKey)).size, jobs.length, '稳定事件应生成可去重 trigger');
}

async function testWinterJobsUseControlledSchedulerConstraints(): Promise<void> {
  const delivered: string[] = [];
  const scheduler = new ControlledPhoneScheduler({
    isEligible: (job, latest) => job.sessionKey === latest.sessionKey && job.snapshotKey === latest.snapshotKey,
    dispatchAi: job => void delivered.push(`ai:${job.triggerKey}`),
    deliverDeterministic: job => void delivered.push(`deterministic:${job.triggerKey}`),
  });
  scheduler.setSnapshot({ sessionKey: 'winter::chat-a', snapshotKey: 'snap-a', storyTurn: 12 });
  const jobs = buildWinterSchedulerJobs({
    sessionKey: 'winter::chat-a',
    snapshotKey: 'snap-a',
    conversationId: 'eden-group:residents',
    worldbookName: '世界书-A',
    speaker: '纪宁',
    participants: ['main:纪宁'],
    notices: [
      { id: 'network', source: '伊甸网络', content: '伊甸内网:在线', trust: 'confirmed', triggerKey: 'network:在线' },
      { id: 'external-1', source: '北区广播', content: '疑似物资', trust: 'unverified', triggerKey: 'external:1' },
    ],
  });
  assert.equal(submitWinterSchedulerJobs(scheduler, jobs), 3);
  await scheduler.whenIdle();
  assert.deepEqual(delivered.sort(), [
    'ai:ai:network:在线',
    'deterministic:deterministic:external:1',
    'deterministic:deterministic:network:在线',
  ]);
  assert.equal(submitWinterSchedulerJobs(scheduler, jobs), 0, '已交付 trigger/topic 必须被调度器去重');
  scheduler.dispose();
}

async function main(): Promise<void> {
  testWinterContactCandidateExtraction();
  testSnapshotCompletionGateAndHostEpoch();
  await testPendingDispatchPreparation();
  testStableSnapshotPolicy();
  testTemporaryNpcMigration();
  testProfilesAndExactMvuReference();
  testTasksAndNotices();
  testSchedulerJobsCaptureStableScope();
  await testWinterJobsUseControlledSchedulerConstraints();
  console.log('winter phone adapter tests passed');
}

void main();
