import assert from 'node:assert/strict';
import { extractRecentCompletedStory, extractCurrentStory } from '../platform/storyExtractor';

// Mock getChatMessages
let mockChatMessages: any[] = [];
(globalThis as any).getChatMessages = (range: any, options?: any) => {
  if (typeof range === 'number') {
    return mockChatMessages.filter(msg => msg.message_id === range);
  }
  if (typeof range === 'string') {
    const [start, end] = range.split('-').map(Number);
    return mockChatMessages.filter(msg => msg.message_id >= start && msg.message_id <= end);
  }
  return mockChatMessages;
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
  assert.equal(result1.length, 4, '应提取 4 条正文（排除当前楼层和用户消息）');
  assert.equal(result1[0].id, 'story-6');
  assert.equal(result1[0].content, '正文 6：角色回复内容');
  assert.equal(result1[0].relevant, true);
  assert.equal(result1[3].id, 'story-9');

  // 测试 2：限制数量
  const result2 = extractRecentCompletedStory({ storyMessageId: 10, maxStoryCount: 2 });
  assert.equal(result2.length, 2, '应只提取最近 2 条');
  assert.equal(result2[0].id, 'story-8');
  assert.equal(result2[1].id, 'story-9');

  // 测试 3：标记为不相关
  const result3 = extractRecentCompletedStory({ storyMessageId: 10, markAllRelevant: false });
  assert.equal(result3.every(entry => entry.relevant === false), true, '所有条目应标记为不相关');

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

    console.log('[Story Extractor Tests] All tests passed! ✓');
  } catch (error) {
    console.error('[Story Extractor Tests] Test failed:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runStoryExtractorTests();
}
