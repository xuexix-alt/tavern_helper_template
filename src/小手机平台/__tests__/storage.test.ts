import assert from 'node:assert/strict';
import { MemoryProfileStore, MemoryTaskStore } from '../intelligence/storage';
import type { PersonProfile, SmartTask } from '../intelligence/profileTypes';

const sessionA = '角色A::chat-a';
const sessionB = '角色B::chat-b';

function createTestProfile(id: string, name: string): PersonProfile {
  return {
    id,
    name,
    basicInfo: `${name}的基本信息`,
    personality: '友善',
    currentStatus: '正常',
    relationship: '朋友',
    recentInteraction: '最近见过面',
    sources: {
      fromMvu: true,
      fromChat: true,
      fromBroadcast: false,
      fromStory: true,
    },
    lastUpdated: Date.now(),
  };
}

function createTestTask(id: string, title: string, priority: 'high' | 'medium' | 'low'): SmartTask {
  return {
    id,
    title,
    detail: `${title}的详细说明`,
    type: 'chat-derived',
    source: '微信聊天',
    relatedPersons: ['张三'],
    actionText: `执行${title}`,
    priority,
    createdAt: Date.now(),
  };
}

async function testMemoryProfileStore(): Promise<void> {
  const store = new MemoryProfileStore();

  // 测试保存和获取
  const profile1 = createTestProfile('person-1', '张三');
  await store.saveProfile(sessionA, profile1);

  const retrieved = await store.getProfile(sessionA, 'person-1');
  assert.ok(retrieved, '应能获取已保存的档案');
  assert.equal(retrieved?.name, '张三', '档案内容应正确');

  // 测试更新
  const updated = { ...profile1, basicInfo: '更新后的信息' };
  await store.saveProfile(sessionA, updated);
  const retrieved2 = await store.getProfile(sessionA, 'person-1');
  assert.equal(retrieved2?.basicInfo, '更新后的信息', '应能更新档案');

  // 测试列表
  const profile2 = createTestProfile('person-2', '李四');
  await store.saveProfile(sessionA, profile2);
  const list = await store.listProfiles(sessionA);
  assert.equal(list.length, 2, '应有 2 个档案');

  // 测试 session 隔离
  const profile3 = createTestProfile('person-3', '王五');
  await store.saveProfile(sessionB, profile3);
  const listA = await store.listProfiles(sessionA);
  const listB = await store.listProfiles(sessionB);
  assert.equal(listA.length, 2, 'sessionA 应有 2 个档案');
  assert.equal(listB.length, 1, 'sessionB 应有 1 个档案');

  // 测试删除
  await store.deleteProfile(sessionA, 'person-1');
  const deleted = await store.getProfile(sessionA, 'person-1');
  assert.equal(deleted, null, '删除后应获取不到档案');

  // 测试清理 session
  store.clearSession(sessionA);
  const cleared = await store.listProfiles(sessionA);
  assert.equal(cleared.length, 0, '清理后应无档案');
}

async function testMemoryTaskStore(): Promise<void> {
  const store = new MemoryTaskStore();

  // 测试保存和获取
  const task1 = createTestTask('task-1', '去张三家', 'high');
  await store.saveTask(sessionA, task1);

  const retrieved = await store.getTask(sessionA, 'task-1');
  assert.ok(retrieved, '应能获取已保存的任务');
  assert.equal(retrieved?.title, '去张三家', '任务内容应正确');

  // 测试列表和排序
  const task2 = createTestTask('task-2', '购买食材', 'low');
  const task3 = createTestTask('task-3', '会议', 'high');
  const task4 = createTestTask('task-4', '散步', 'medium');

  await store.saveTask(sessionA, task2);
  await store.saveTask(sessionA, task3);
  await store.saveTask(sessionA, task4);

  const list = await store.listTasks(sessionA);
  assert.equal(list.length, 4, '应有 4 个任务');

  // 验证优先级排序：high > medium > low
  assert.equal(list[0].priority, 'high', '第一个应是 high');
  assert.equal(list[1].priority, 'high', '第二个应是 high');
  assert.equal(list[2].priority, 'medium', '第三个应是 medium');
  assert.equal(list[3].priority, 'low', '第四个应是 low');

  // 测试 session 隔离
  const task5 = createTestTask('task-5', '其他任务', 'high');
  await store.saveTask(sessionB, task5);
  const listA = await store.listTasks(sessionA);
  const listB = await store.listTasks(sessionB);
  assert.equal(listA.length, 4, 'sessionA 应有 4 个任务');
  assert.equal(listB.length, 1, 'sessionB 应有 1 个任务');

  // 测试删除
  await store.deleteTask(sessionA, 'task-1');
  const deleted = await store.getTask(sessionA, 'task-1');
  assert.equal(deleted, null, '删除后应获取不到任务');

  // 测试清理过期任务
  const oldTask = createTestTask('task-old', '过期任务', 'low');
  oldTask.createdAt = Date.now() - 10000; // 10 秒前
  await store.saveTask(sessionA, oldTask);

  await store.cleanExpiredTasks(sessionA, 5000); // 清理 5 秒前的
  const afterClean = await store.getTask(sessionA, 'task-old');
  assert.equal(afterClean, null, '过期任务应被清理');

  // 测试清理 session
  store.clearSession(sessionA);
  const cleared = await store.listTasks(sessionA);
  assert.equal(cleared.length, 0, '清理后应无任务');
}

async function testProfileStoreDataIsolation(): Promise<void> {
  const store = new MemoryProfileStore();

  const original = createTestProfile('person-1', '张三');
  await store.saveProfile(sessionA, original);

  // 修改返回的对象不应影响存储的数据
  const retrieved = await store.getProfile(sessionA, 'person-1');
  if (retrieved) {
    retrieved.basicInfo = '被修改的信息';
  }

  const retrieved2 = await store.getProfile(sessionA, 'person-1');
  assert.equal(retrieved2?.basicInfo, '张三的基本信息', '存储的数据不应被修改');

  // 修改列表中的对象不应影响存储
  const list = await store.listProfiles(sessionA);
  if (list[0]) {
    list[0].basicInfo = '列表修改';
  }

  const list2 = await store.listProfiles(sessionA);
  assert.equal(list2[0]?.basicInfo, '张三的基本信息', '列表数据不应被修改');
}

async function testTaskStoreDataIsolation(): Promise<void> {
  const store = new MemoryTaskStore();

  const original = createTestTask('task-1', '原始任务', 'high');
  await store.saveTask(sessionA, original);

  // 修改返回的对象不应影响存储的数据
  const retrieved = await store.getTask(sessionA, 'task-1');
  if (retrieved) {
    retrieved.title = '被修改的标题';
  }

  const retrieved2 = await store.getTask(sessionA, 'task-1');
  assert.equal(retrieved2?.title, '原始任务', '存储的数据不应被修改');
}

async function testTaskPrioritySorting(): Promise<void> {
  const store = new MemoryTaskStore();

  // 创建相同优先级的任务，验证时间排序
  const task1 = createTestTask('task-1', '任务1', 'high');
  task1.createdAt = 1000;

  const task2 = createTestTask('task-2', '任务2', 'high');
  task2.createdAt = 2000;

  const task3 = createTestTask('task-3', '任务3', 'high');
  task3.createdAt = 1500;

  await store.saveTask(sessionA, task1);
  await store.saveTask(sessionA, task2);
  await store.saveTask(sessionA, task3);

  const list = await store.listTasks(sessionA);

  // 相同优先级按创建时间倒序
  assert.equal(list[0].id, 'task-2', '最新的应在最前');
  assert.equal(list[1].id, 'task-3', '中间的应在中间');
  assert.equal(list[2].id, 'task-1', '最旧的应在最后');
}

export async function runStorageTests(): Promise<void> {
  console.log('[Storage Tests] Starting...');

  try {
    await testMemoryProfileStore();
    console.log('✓ MemoryProfileStore 基本功能测试通过');

    await testMemoryTaskStore();
    console.log('✓ MemoryTaskStore 基本功能测试通过');

    await testProfileStoreDataIsolation();
    console.log('✓ ProfileStore 数据隔离测试通过');

    await testTaskStoreDataIsolation();
    console.log('✓ TaskStore 数据隔离测试通过');

    await testTaskPrioritySorting();
    console.log('✓ 任务优先级排序测试通过');

    console.log('[Storage Tests] All tests passed! ✓');
  } catch (error) {
    console.error('[Storage Tests] Test failed:', error);
    throw error;
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runStorageTests().catch(console.error);
}
