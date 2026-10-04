import assert from 'node:assert/strict';
import { extractRoleStoryContext } from '../platform/roleStoryContext';
import {
  extractCurrentStory,
  extractRecentCompletedStory,
  extractRecentMainChatMessages,
} from '../platform/storyExtractor';

// Mock getChatMessages
let mockChatMessages: any[] = [];
(globalThis as any).formatAsTavernRegexedString = (value: string) => value;
(globalThis as any).getChatMessages = (range: any, options?: any) => {
  let selected: any[];
  if (typeof range === 'number') {
    selected = mockChatMessages.filter(msg => msg.message_id === range);
  } else if (typeof range === 'string') {
    const [start, end] = range.split('-').map(Number);
    selected = mockChatMessages.filter(msg => msg.message_id >= start && msg.message_id <= end);
  } else {
    selected = [...mockChatMessages];
  }
  if (options?.role) selected = selected.filter(msg => msg.role === options.role);
  if (options?.hide_state === 'unhidden') selected = selected.filter(msg => !msg.is_hidden);
  return selected.sort((left, right) => left.message_id - right.message_id);
};

function testExtractRecentCompletedStory(): void {
  // 准备测试数据
  mockChatMessages = [
    { message_id: 5, role: 'user', message: '用户消息 5', is_hidden: false },
    { message_id: 6, role: 'assistant', message: '正文 6：角色回复内容', is_hidden: false },
    { message_id: 7, role: 'user', message: '用户消息 7', is_hidden: false },
    { message_id: 8, role: 'assistant', message: '正文 8：更多内容', is_hidden: false },
    { message_id: 9, role: 'assistant', message: '正文 9：最新内容', is_hidden: false },
    { message_id: 10, role: 'assistant', message: '正文 10：当前楼层', is_hidden: false },
    { message_id: 11, role: 'assistant', message: '正文 11：隐藏内容', is_hidden: true },
  ];

  // 测试 1：基本提取
  const result1 = extractRecentCompletedStory({ storyMessageId: 10 });
  assert.equal(result1.length, 3, '应提取 3 条正文（排除当前楼层和用户消息）');
  assert.equal(result1[0].id, 'story-6');
  assert.equal(result1[0].content, '正文 6：角色回复内容');
  assert.equal(result1[0].relevant, true);
  assert.equal(result1[2].id, 'story-9');

  // 测试 2：限制数量
  const result2 = extractRecentCompletedStory({ storyMessageId: 10, maxStoryCount: 2 });
  assert.equal(result2.length, 2, '应只提取最近 2 条');
  assert.equal(result2[0].id, 'story-8');
  assert.equal(result2[1].id, 'story-9');

  // 测试 3：标记为不相关
  const result3 = extractRecentCompletedStory({ storyMessageId: 10, markAllRelevant: false });
  assert.equal(
    result3.every(entry => entry.relevant === false),
    true,
    '所有条目应标记为不相关',
  );

  // 测试 4：null storyMessageId
  const result4 = extractRecentCompletedStory({ storyMessageId: null });
  assert.deepEqual(result4, [], 'null messageId 应返回空数组');

  // 测试 5：负数 messageId
  const result5 = extractRecentCompletedStory({ storyMessageId: -1 });
  assert.deepEqual(result5, [], '负数 messageId 应返回空数组');

  // 测试 6：messageId 为 0
  const result6 = extractRecentCompletedStory({ storyMessageId: 0 });
  assert.deepEqual(result6, [], 'messageId 为 0 应返回空数组（没有之前的消息）');

  // 测试 7：空白内容处理
  mockChatMessages = [
    { message_id: 1, role: 'assistant', message: '  \n\t  ', is_hidden: false },
    { message_id: 2, role: 'assistant', message: '有效内容', is_hidden: false },
  ];
  const result7 = extractRecentCompletedStory({ storyMessageId: 3 });
  assert.equal(result7[0].content, '', '空白内容应 trim 为空字符串');
  assert.equal(result7[1].content, '有效内容');
}

function testExtractCurrentStory(): void {
  mockChatMessages = [
    { message_id: 10, role: 'assistant', message: '当前楼层正文内容', is_hidden: false },
    { message_id: 11, role: 'assistant', message: '隐藏的正文', is_hidden: true },
  ];

  // 测试 1：正常提取
  const result1 = extractCurrentStory(10);
  assert.equal(result1, '当前楼层正文内容');

  // 测试 2：提取隐藏消息（hide_state: 'all'）
  const result2 = extractCurrentStory(11);
  assert.equal(result2, '隐藏的正文');

  // 测试 3：null messageId
  const result3 = extractCurrentStory(null);
  assert.equal(result3, '');

  // 测试 4：不存在的楼层
  const result4 = extractCurrentStory(999);
  assert.equal(result4, '');

  // 测试 5：负数 messageId
  const result5 = extractCurrentStory(-1);
  assert.equal(result5, '');
}

function testStoryExtractorEdgeCases(): void {
  // 测试错误处理
  mockChatMessages = [
    { message_id: 1, role: 'assistant', message: { nested: 'object' }, is_hidden: false }, // 非字符串
    { message_id: 2, role: 'assistant', message: null, is_hidden: false }, // null
    { message_id: 3, role: 'assistant', message: undefined, is_hidden: false }, // undefined
    { message_id: 4, role: 'assistant', message: '正常内容', is_hidden: false },
  ];

  const result = extractRecentCompletedStory({ storyMessageId: 5 });
  assert.equal(result.length, 4, '应处理所有消息');
  assert.equal(result[0].content, '', '非字符串应转为空字符串');
  assert.equal(result[1].content, '', 'null 应转为空字符串');
  assert.equal(result[2].content, '', 'undefined 应转为空字符串');
  assert.equal(result[3].content, '正常内容');
}

function testStoryExtractorOrder(): void {
  // 测试顺序：应按时间从旧到新
  mockChatMessages = [
    { message_id: 1, role: 'assistant', message: '第一条', is_hidden: false },
    { message_id: 3, role: 'assistant', message: '第二条', is_hidden: false },
    { message_id: 2, role: 'assistant', message: '第三条（乱序）', is_hidden: false },
    { message_id: 5, role: 'assistant', message: '第四条', is_hidden: false },
  ];

  const result = extractRecentCompletedStory({ storyMessageId: 6 });

  // getChatMessages 应该已经按 message_id 排序
  assert.equal(result[0].id, 'story-1');
  assert.equal(result[1].id, 'story-2');
  assert.equal(result[2].id, 'story-3');
  assert.equal(result[3].id, 'story-5');
}

function testRecentMainChatMessages(): void {
  mockChatMessages = [
    { message_id: 1, name: '小明', role: 'user', message: '旧玩家消息', is_hidden: false },
    { message_id: 2, name: '纪宁', role: 'assistant', message: '旧 AI 消息', is_hidden: false },
    { message_id: 3, name: '系统', role: 'system', message: '不得进入', is_hidden: false },
    {
      message_id: 4,
      name: '小明',
      role: 'user',
      message: '玩家行动<Analysis>内部分析</Analysis>',
      is_hidden: false,
    },
    {
      message_id: 5,
      name: '纪宁',
      role: 'assistant',
      message: 'AI 正文<UpdateVariable>{"path":"x"}</UpdateVariable>',
      is_hidden: false,
    },
    { message_id: 6, name: '纪宁', role: 'assistant', message: '隐藏消息', is_hidden: true },
    {
      message_id: 7,
      name: '小明',
      role: 'user',
      message: '继续询问<JSONPatch>[{"op":"replace"}]</JSONPatch>',
      is_hidden: false,
    },
    { message_id: 8, name: '纪宁', role: 'assistant', message: '当前已完成 AI 正文', is_hidden: false },
    { message_id: 9, name: '小明', role: 'user', message: '范围外消息', is_hidden: false },
  ];

  const result = extractRecentMainChatMessages(8, 5);

  assert.deepEqual(
    result,
    [
      { id: 'main-chat-2', role: 'assistant', sender: '纪宁', content: '旧 AI 消息' },
      { id: 'main-chat-4', role: 'user', sender: '小明', content: '玩家行动' },
      { id: 'main-chat-5', role: 'assistant', sender: '纪宁', content: 'AI 正文' },
      { id: 'main-chat-7', role: 'user', sender: '小明', content: '继续询问' },
      { id: 'main-chat-8', role: 'assistant', sender: '纪宁', content: '当前已完成 AI 正文' },
    ],
    '应取最后五条可见玩家/AI消息并包含当前已完成 assistant 楼层',
  );
  assert.doesNotMatch(JSON.stringify(result), /UpdateVariable|Analysis|JSONPatch/);
}

function testPromptRegexDepthAndRefresh(): void {
  mockChatMessages = [
    { message_id: 0, role: 'assistant', message: '旧正文' },
    { message_id: 1, role: 'assistant', message: '隐藏', is_hidden: true },
    { message_id: 2, role: 'system', message: '系统' },
    { message_id: 3, role: 'user', message: '玩家输入' },
    { message_id: 4, role: 'assistant', message: '<Analysis>只含控制块</Analysis>' },
    { message_id: 5, role: 'assistant', message: '新正文' },
    { message_id: 6, role: 'user', message: '快照之外' },
  ];
  const calls: unknown[] = [];
  (globalThis as any).formatAsTavernRegexedString = (
    value: string,
    source: string,
    destination: string,
    options: any,
  ) => {
    calls.push([value, source, destination, options.depth]);
    return options.depth >= 3 ? '旧摘要' : value;
  };
  const result = extractRecentMainChatMessages(5, 3);
  assert.deepEqual(
    result.map(item => item.content),
    ['旧摘要', '玩家输入', '新正文'],
  );
  assert.deepEqual(
    calls.map((call: any) => call.slice(1)),
    [
      ['ai_output', 'prompt', 3],
      ['user_input', 'prompt', 2],
      ['ai_output', 'prompt', 1],
      ['ai_output', 'prompt', 0],
    ],
    '在清理空消息与截取之前计算深度，排除隐藏/系统/未来楼层',
  );
  (globalThis as any).formatAsTavernRegexedString = () => '修改后的规则';
  assert.equal(extractRecentMainChatMessages(5, 1)[0].content, '修改后的规则');
  (globalThis as any).formatAsTavernRegexedString = (value: string) => value;
}

function testRoleTextWindows(): void {
  const short = '纪宁说：检查完成。陈宇点了点头。';
  assert.equal(extractRoleStoryContext(short, ['纪宁', '纪宁', '陈宇']), short, '重叠片段去重');
  assert.equal(extractRoleStoryContext('她离开了。', ['纪宁']), '', '不猜测代词');
  assert.equal(extractRoleStoryContext('AxxB 离开了。', ['A.*B']), '', '姓名按字面匹配，不能作为正则');
  assert.match(extractRoleStoryContext('A.*B 离开了。', [' A.*B ']), /A\.\*B/);
  const long =
    '无关内容'.repeat(800) + '纪宁检查药品。' + '过场'.repeat(800) + '陈宇修好了发电机。' + '结尾'.repeat(800);
  const selected = extractRoleStoryContext(long, ['纪宁', '陈宇']);
  assert.ok(selected.length <= 1600);
  assert.match(selected, /纪宁检查药品/);
  assert.match(selected, /陈宇修好了发电机/);
  assert.ok(selected.indexOf('纪宁') < selected.indexOf('陈宇'), '保持原文顺序');
  assert.match(selected, /省略/);
  const repeated = Array.from({ length: 50 }, (_, i) => `纪宁事件${i}。${'间隔'.repeat(300)}`).join('');
  const bounded = extractRoleStoryContext(repeated, ['纪宁']);
  assert.ok(bounded.length <= 1600);
  assert.match(bounded, /纪宁事件49/);
  assert.doesNotMatch(bounded, /纪宁事件0。/);
  const emoji = extractRoleStoryContext('😀'.repeat(400) + '纪宁' + '😀'.repeat(400), ['纪宁']);
  assert.equal(emoji.isWellFormed(), true);
}

function testRoleRelevantMainChat(): void {
  mockChatMessages = [
    { message_id: 0, role: 'assistant', message: '纪宁检查药品。她发现缺少绷带。' },
    ...Array.from({ length: 7 }, (_, index) => ({
      message_id: index + 1,
      role: 'assistant',
      message: '其他人在外面搬运物资。',
    })),
    {
      message_id: 8,
      role: 'assistant',
      message: '无关天气。'.repeat(300) + '\n陈宇修好了发电机。\n他请大家节约用电。\n' + '无关仓库。'.repeat(300),
    },
    { message_id: 9, role: 'assistant', message: '纪宁秘密行动', is_hidden: true },
    { message_id: 10, role: 'assistant', message: '纪宁未来行动' },
  ];
  const calls: number[] = [];
  (globalThis as any).formatAsTavernRegexedString = (
    value: string,
    _source: string,
    _destination: string,
    options: any,
  ) => {
    calls.push(options.depth);
    return value;
  };
  const result = extractRecentMainChatMessages(9, 5, ['纪宁', '陈宇']);
  assert.deepEqual(
    result.map(item => item.id),
    ['main-chat-0', 'main-chat-8'],
    '先检索全部已有正文，再取相关楼层窗口',
  );
  assert.match(result[0].content, /她发现缺少绷带/);
  assert.match(result[1].content, /陈宇修好了发电机/);
  assert.match(result[1].content, /他请大家节约用电/);
  assert.ok(result.every(item => item.content.length <= 1600));
  assert.ok(result[1].content.length < 1000, '不因一次命中而带入整楼无关长正文');
  assert.deepEqual(calls, [8, 7, 6, 5, 4, 3, 2, 1, 0], '角色筛选不能改变正则深度');
  assert.deepEqual(extractRecentMainChatMessages(9, 5, ['不存在的人']), []);
  assert.deepEqual(extractRecentMainChatMessages(9, 5, []), []);
  (globalThis as any).formatAsTavernRegexedString = () => '无人物信息的摘要';
  assert.deepEqual(extractRecentMainChatMessages(9, 5, ['纪宁']), [], '不得从被正则删掉的正文中捞回信息');
  (globalThis as any).formatAsTavernRegexedString = (value: string) => value;
}

export function runStoryExtractorTests(): void {
  console.log('[Story Extractor Tests] Starting...');

  try {
    testExtractRecentCompletedStory();
    console.log('✓ extractRecentCompletedStory 基本功能测试通过');

    testExtractCurrentStory();
    console.log('✓ extractCurrentStory 基本功能测试通过');

    testStoryExtractorEdgeCases();
    console.log('✓ 边界情况测试通过');

    testStoryExtractorOrder();
    console.log('✓ 排序测试通过');

    testRecentMainChatMessages();
    testPromptRegexDepthAndRefresh();
    testRoleRelevantMainChat();
    testRoleTextWindows();
    console.log('✓ 最近五条主聊天与控制块清理测试通过');

    console.log('[Story Extractor Tests] All tests passed! ✓');
  } catch (error) {
    console.error('[Story Extractor Tests] Test failed:', error);
    throw error;
  }
}

runStoryExtractorTests();
