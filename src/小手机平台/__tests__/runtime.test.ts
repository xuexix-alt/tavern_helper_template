import assert from 'node:assert/strict';

import { EventBus } from '../core/eventBus';
import { ModuleRegistry } from '../core/moduleRegistry';
import { registerPhoneModule } from '../core/register';
import { createPhoneRuntime, installPhoneRuntime, makeSessionKey } from '../core/runtime';
import type { PhoneModule, PhoneModuleContext, PhoneModuleRegistration, PhoneOwner } from '../core/types';
import { createHostGateway, createTopHostGateway } from '../platform/hostGateway';
import { createSettingsStore, type PublicSettings, type StorageLike } from '../platform/settingsStore';

const ownerA: PhoneOwner = {
  characterName: '末世寒冬 - 星穹秩序',
  adapterId: 'winter-apocalypse',
  runtimeMajor: 1,
};
const ownerB: PhoneOwner = { characterName: '另一张卡', adapterId: 'other', runtimeMajor: 1 };

function registration(
  id: string,
  dependsOn: string[] = [],
  hooks: { init?: () => void | Promise<void>; dispose?: () => void | Promise<void> } = {},
): PhoneModuleRegistration {
  return {
    manifest: { id, version: '1.0.0', required: true, dependsOn, capabilities: [] },
    factory: (): PhoneModule => ({
      init: () => hooks.init?.(),
      dispose: () => hooks.dispose?.(),
      getStatus: () => 'READY',
    }),
  };
}

async function testModuleRegistry(): Promise<void> {
  const registry = new ModuleRegistry();
  registry.register(registration('apps', ['shell']));
  registry.register(registration('shell'));
  assert.deepEqual(registry.resolveOrder(), ['shell', 'apps'], '乱序注册应按依赖拓扑解析');

  registry.register(registration('shell'));
  assert.equal(registry.list().filter(module => module.manifest.id === 'shell').length, 1, '同版本重复注册应忽略');

  assert.throws(
    () =>
      registry.register({
        ...registration('shell'),
        manifest: { ...registration('shell').manifest, version: '2.0.0' },
      }),
    /version|版本|hot replace/i,
  );

  const missing = new ModuleRegistry();
  missing.register(registration('apps', ['shell']));
  assert.throws(() => missing.resolveOrder(), /missing|缺少.*shell|shell.*缺少/i);
  assert.throws(() => missing.assertRequired(['runtime', 'shell']), /runtime|shell/i);

  const cyclic = new ModuleRegistry();
  cyclic.register(registration('a', ['b']));
  cyclic.register(registration('b', ['a']));
  assert.throws(() => cyclic.resolveOrder(), /cycle|循环/i);

  const lifecycle: string[] = [];
  const initialized = new ModuleRegistry();
  initialized.register(
    registration('apps', ['shell'], {
      init: () => {
        lifecycle.push('init:apps');
      },
      dispose: () => {
        lifecycle.push('dispose:apps');
      },
    }),
  );
  initialized.register(
    registration('shell', [], {
      init: () => {
        lifecycle.push('init:shell');
      },
      dispose: () => {
        lifecycle.push('dispose:shell');
      },
    }),
  );
  await initialized.initialize({} as PhoneModuleContext, ['apps', 'shell']);
  await initialized.dispose('test');
  assert.deepEqual(
    lifecycle,
    ['init:shell', 'init:apps', 'dispose:apps', 'dispose:shell'],
    'dispose 应按初始化逆序执行',
  );
}

async function testInitializeRollbackAndRetry(): Promise<void> {
  const initError = new Error('bad init');
  const cleanupError = new Error('bad cleanup');
  const lifecycle: string[] = [];
  let shouldFail = true;
  const registry = new ModuleRegistry();
  registry.register(
    registration('good', [], {
      init: () => {
        lifecycle.push('init:good');
      },
      dispose: () => {
        lifecycle.push('dispose:good');
      },
    }),
  );
  registry.register({
    manifest: { id: 'bad', version: '1.0.0', required: true, dependsOn: ['good'], capabilities: [] },
    factory: () => ({
      init: () => {
        lifecycle.push('init:bad');
        if (shouldFail) throw initError;
      },
      dispose: () => {
        lifecycle.push('dispose:bad');
        if (shouldFail) throw cleanupError;
      },
      getStatus: () => 'READY',
    }),
  });

  await assert.rejects(
    () => registry.initialize({} as PhoneModuleContext, ['good', 'bad']),
    error =>
      error instanceof AggregateError &&
      error.cause === initError &&
      error.errors.includes(initError) &&
      error.errors.includes(cleanupError),
  );
  assert.deepEqual(lifecycle, ['init:good', 'init:bad', 'dispose:bad', 'dispose:good']);

  shouldFail = false;
  await registry.initialize({} as PhoneModuleContext, ['good', 'bad']);
  await registry.dispose('retry completed');
  assert.deepEqual(lifecycle.slice(4), ['init:good', 'init:bad', 'dispose:bad', 'dispose:good']);
}

async function testRuntimeBridge(): Promise<void> {
  assert.equal(makeSessionKey(ownerA, 'chat-42'), '末世寒冬 - 星穹秩序::chat-42');

  const runtime = createPhoneRuntime();
  runtime.setOwner(ownerA);
  runtime.setSession('chat-a');

  runtime.setOwner({ ...ownerA });
  assert.equal(
    runtime.getSession()?.sessionKey,
    makeSessionKey(ownerA, 'chat-a'),
    '同 owner 重复绑定应保持当前 session',
  );
  assert.throws(() => runtime.setOwner(ownerB), /owner|owned|占用|接管/i, '非空 owner 不允许被另一 owner 接管');
  assert.equal(runtime.getOwner()?.adapterId, ownerA.adapterId, 'owner 冲突后必须保留原 owner');

  const received: string[] = [];
  const detach = runtime.attachHostBridge({
    id: 'same-layer-pre',
    submitAction: action => {
      received.push(action.text);
    },
  });
  await runtime.submitActionToHost({
    kind: 'composer.insert',
    text: '检查供暖',
    sourceKey: 'task:heat',
    mode: 'replace',
  });
  assert.deepEqual(received, ['检查供暖'], '合法动作应路由到当前 bridge');

  await assert.rejects(
    () => runtime.submitActionToHost({ kind: 'composer.insert', text: '   ', sourceKey: 'empty', mode: 'append' }),
    /empty|空/i,
  );
  await assert.rejects(
    () => runtime.submitActionToHost({ kind: 'unknown', text: 'x', sourceKey: 'bad', mode: 'append' } as never),
    /kind|unsupported|不支持/i,
  );
  await assert.rejects(
    () => runtime.submitActionToHost({ kind: 'composer.insert', text: 'x', sourceKey: '   ', mode: 'append' }),
    /sourceKey|source key|来源/i,
  );
  await assert.rejects(
    () =>
      runtime.submitActionToHost({
        kind: 'composer.insert',
        text: 'x',
        sourceKey: 'bad-mode',
        mode: 'invalid',
      } as never),
    /mode|unsupported|不支持/i,
  );

  runtime.setSession('chat-b');
  await assert.rejects(
    () => runtime.submitActionToHost({ kind: 'composer.insert', text: '串线', sourceKey: 'stale', mode: 'append' }),
    /owner|session|会话/i,
  );

  runtime.setOwner(null);
  runtime.setOwner(ownerB);
  runtime.setSession('chat-a');
  await assert.rejects(
    () =>
      runtime.submitActionToHost({ kind: 'composer.insert', text: '串卡', sourceKey: 'stale-owner', mode: 'append' }),
    /owner|session|会话/i,
  );

  detach();
  runtime.setOwner(null);
  runtime.setOwner(ownerA);
  runtime.setSession('chat-a');
  await assert.rejects(
    () =>
      runtime.submitActionToHost({ kind: 'composer.insert', text: '释放后', sourceKey: 'detached', mode: 'append' }),
    /host bridge/i,
  );
}

function testEventBus(): void {
  const bus = new EventBus<{ tick: [number] }>();
  const received: number[] = [];
  const unsubscribe = bus.on('tick', value => received.push(value));
  bus.emit('tick', 1);
  unsubscribe();
  bus.emit('tick', 2);
  assert.deepEqual(received, [1]);

  bus.on('tick', value => received.push(value));
  bus.dispose();
  bus.emit('tick', 3);
  assert.deepEqual(received, [1], 'dispose 应清空所有订阅');

  const listenerErrors: unknown[] = [];
  const isolatedBus = new EventBus<{ tick: [number] }>(error => listenerErrors.push(error));
  let secondListenerRan = false;
  isolatedBus.on('tick', () => {
    throw new Error('listener failed');
  });
  isolatedBus.on('tick', () => {
    secondListenerRan = true;
  });
  isolatedBus.emit('tick', 4);
  assert.equal(secondListenerRan, true, '单个 listener 失败不能阻断后续 listener');
  assert.match(String(listenerErrors[0]), /listener failed/);
}

async function testRuntimeFailureCleanupAndListenerDiagnostics(): Promise<void> {
  const runtime = createPhoneRuntime();
  runtime.setOwner(ownerA);
  runtime.setSession('dispose-chat');

  let readyListenerRan = false;
  runtime.on('ready', () => {
    throw new Error('ready listener failed');
  });
  runtime.on('ready', () => {
    readyListenerRan = true;
  });
  runtime.setSession('listener-chat');
  assert.equal(readyListenerRan, true, 'ready listener 失败不能阻断 ready 流程');
  assert.match(runtime.getStatus().diagnostics.join('\n'), /ready listener failed/);

  runtime.registerModule(
    registration('dispose-fails', [], {
      dispose: () => {
        throw new Error('module dispose failed');
      },
    }),
  );
  await runtime.initializeModules(['dispose-fails']);
  await runtime.open();
  await assert.rejects(() => runtime.dispose('test failure'), /dispose/i);
  assert.deepEqual(
    runtime.getStatus(),
    { state: 'DISPOSED', owner: null, sessionKey: null, isOpen: false, diagnostics: ['ready: ready listener failed'] },
    'registry dispose 失败后 runtime 仍必须完成本地清理',
  );
}

function withFakeWindow(topWindow: object, run: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { top: topWindow } });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function testTopRegistration(): void {
  const queuedTop = { location: { href: 'https://example.test' } } as {
    location: { href: string };
    __TAVERN_PHONE_PENDING_MODULES__?: PhoneModuleRegistration[];
  };
  withFakeWindow(queuedTop, () => registerPhoneModule(registration('queued')));
  assert.equal(queuedTop.__TAVERN_PHONE_PENDING_MODULES__?.length, 1, 'runtime 不存在时应进入 top pending 队列');

  withFakeWindow(queuedTop, () => {
    const first = installPhoneRuntime(ownerA);
    const second = installPhoneRuntime({ ...ownerA });
    assert.equal(first, second, 'top 只能安装一个 TavernPhone runtime');
    assert.deepEqual(queuedTop.__TAVERN_PHONE_PENDING_MODULES__, [], 'runtime 应消费 pending 队列');
    assert.throws(() => installPhoneRuntime(ownerB), /owner|owned|占用|接管/i, 'top runtime 不允许冲突 owner 复用');
    assert.equal(first.getOwner()?.adapterId, ownerA.adapterId, '安装复用冲突后必须保留原 owner');

    first.setOwner(null);
    assert.equal(installPhoneRuntime(ownerB), first, '显式解绑后可由新 owner 复用 runtime');
  });

  const conflictingPending = [
    registration('conflict'),
    {
      ...registration('conflict'),
      manifest: { ...registration('conflict').manifest, version: '2.0.0' },
    },
  ];
  const conflictingTop = {
    location: { href: 'https://example.test' },
    __TAVERN_PHONE_PENDING_MODULES__: conflictingPending,
  } as {
    location: { href: string };
    TavernPhone?: unknown;
    __TAVERN_PHONE_PENDING_MODULES__: PhoneModuleRegistration[];
  };
  withFakeWindow(conflictingTop, () => {
    assert.throws(() => installPhoneRuntime(ownerA), /version|hot replace/i);
  });
  assert.equal(conflictingTop.TavernPhone, undefined, 'pending 注册失败时不得发布半成品 runtime');
  assert.equal(conflictingTop.__TAVERN_PHONE_PENDING_MODULES__, conflictingPending, 'pending 注册失败时不得丢失原队列');

  const inaccessibleWindow = {} as { top?: unknown };
  Object.defineProperty(inaccessibleWindow, 'top', {
    get: () => {
      throw new Error('cross-origin');
    },
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: inaccessibleWindow });
  try {
    assert.throws(() => registerPhoneModule(registration('blocked')), /window\.top|fallback|access/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

type FakeHostListener = () => void;

function createFakePublicHost(characterName = '末世寒冬 - 星穹秩序', chatId = 'chat-a') {
  const listeners = new Map<string, Set<FakeHostListener>>();
  const eventTypes = { CHAT_CHANGED: 'chat_changed', CHARACTER_PAGE_LOADED: 'character_page_loaded' } as const;
  const host = {
    name2: characterName,
    getCurrentChatId: () => chatId,
    eventTypes,
    eventSource: {
      on(event: string, listener: FakeHostListener) {
        const bucket = listeners.get(event) ?? new Set<FakeHostListener>();
        bucket.add(listener);
        listeners.set(event, bucket);
      },
      removeListener(event: string, listener: FakeHostListener) {
        listeners.get(event)?.delete(listener);
      },
    },
  };

  return {
    host,
    switchChat(next: string) {
      chatId = next;
      listeners.get(eventTypes.CHAT_CHANGED)?.forEach(listener => listener());
    },
    switchCharacter(nextCharacter: string, nextChat: string) {
      host.name2 = nextCharacter;
      chatId = nextChat;
      listeners.get(eventTypes.CHARACTER_PAGE_LOADED)?.forEach(listener => listener());
    },
  };
}

function testHostGateway(): void {
  const fake = createFakePublicHost();
  const gateway = createHostGateway(fake.host);
  const initial = gateway.getSnapshot();
  assert.deepEqual(initial, {
    characterName: '末世寒冬 - 星穹秩序',
    chatId: 'chat-a',
    sessionKey: '末世寒冬 - 星穹秩序::chat-a',
  });
  assert.equal(Object.isFrozen(initial), true, '宿主上下文快照必须不可变');

  const received: string[] = [];
  const unsubscribe = gateway.subscribe(snapshot => received.push(snapshot.sessionKey));
  fake.switchChat('chat-b');
  fake.switchChat('chat-b');
  fake.switchCharacter('另一张卡', 'chat-c');
  assert.deepEqual(received, ['末世寒冬 - 星穹秩序::chat-b', '另一张卡::chat-c'], '宿主切换应更新且去重');

  unsubscribe();
  fake.switchChat('chat-d');
  assert.equal(received.length, 2, '订阅 disposer 必须解除通知');

  const disposedReceived: string[] = [];
  gateway.subscribe(snapshot => disposedReceived.push(snapshot.sessionKey));
  gateway.dispose();
  fake.switchChat('chat-e');
  assert.deepEqual(disposedReceived, [], 'gateway dispose 后必须解除宿主监听');

  assert.throws(() => createHostGateway(createFakePublicHost(' ', 'chat').host), /character|角色|empty|空/i);
  assert.throws(() => createHostGateway(createFakePublicHost('角色', ' ').host), /chat|聊天|empty|空/i);

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const inaccessibleWindow = {} as { top?: unknown };
  Object.defineProperty(inaccessibleWindow, 'top', {
    get: () => {
      throw new Error('cross-origin');
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: inaccessibleWindow });
  try {
    assert.throws(() => createTopHostGateway(), /window\.top|public host|宿主|access/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }

  const missingPublicHost = { top: {} };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: missingPublicHost });
  try {
    assert.throws(() => createTopHostGateway(), /SillyTavern|public host|宿主/i);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function testHostGatewayFailureIsolation(): void {
  const fake = createFakePublicHost();
  const reported: unknown[] = [];
  const gateway = createHostGateway(fake.host, { onError: error => reported.push(error) });
  const received: string[] = [];
  gateway.subscribe(() => {
    throw new Error('host listener failed');
  });
  gateway.subscribe(snapshot => received.push(snapshot.sessionKey));

  assert.doesNotThrow(() => fake.switchChat('chat-b'));
  assert.deepEqual(received, ['末世寒冬 - 星穹秩序::chat-b'], '单个宿主 listener 失败不得阻断后续 listener');
  assert.match(String(reported[0]), /host listener failed/);

  const previousSnapshot = gateway.getSnapshot();
  fake.host.getCurrentChatId = () => {
    throw new Error('host snapshot read failed');
  };
  assert.doesNotThrow(() => fake.switchCharacter('不可读取的新卡', 'chat-c'));
  assert.equal(gateway.getSnapshot(), previousSnapshot, '读取失败时必须保留上一份有效宿主快照');
  assert.match(String(reported[1]), /host snapshot read failed/);
  gateway.dispose();
}

function testHostGatewayCleanupFailures(): void {
  const eventTypes = { CHAT_CHANGED: 'chat_changed', CHARACTER_PAGE_LOADED: 'character_page_loaded' } as const;
  const rollbackAttempts: string[] = [];
  let subscriptionCount = 0;
  const rollbackErrors: unknown[] = [];
  const rollbackHost = {
    name2: '角色',
    getCurrentChatId: () => 'chat',
    eventTypes,
    eventSource: {
      on() {
        subscriptionCount += 1;
        if (subscriptionCount === 2) throw new Error('subscribe failed');
      },
      removeListener(event: string) {
        rollbackAttempts.push(event);
        if (event === eventTypes.CHAT_CHANGED) throw new Error('rollback failed');
      },
    },
  };
  assert.throws(
    () => createHostGateway(rollbackHost, { onError: error => rollbackErrors.push(error) }),
    error =>
      error instanceof AggregateError &&
      error.errors.some(item => String(item).includes('subscribe failed')) &&
      error.errors.some(item => String(item).includes('rollback failed')),
  );
  assert.deepEqual(
    rollbackAttempts,
    [eventTypes.CHARACTER_PAGE_LOADED, eventTypes.CHAT_CHANGED],
    '初始化回滚必须逐项 best-effort',
  );
  assert.equal(rollbackErrors[0] instanceof AggregateError, true, '初始化聚合错误应进入错误报告器');

  const listeners = new Map<string, Set<FakeHostListener>>();
  const removalAttempts: string[] = [];
  let failChatRemoval = true;
  const disposeErrors: unknown[] = [];
  const disposeHost = {
    name2: '角色',
    getCurrentChatId: () => 'chat-a',
    eventTypes,
    eventSource: {
      on(event: string, listener: FakeHostListener) {
        const bucket = listeners.get(event) ?? new Set<FakeHostListener>();
        bucket.add(listener);
        listeners.set(event, bucket);
      },
      removeListener(event: string, listener: FakeHostListener) {
        removalAttempts.push(event);
        if (event === eventTypes.CHAT_CHANGED && failChatRemoval) throw new Error('chat remove failed');
        listeners.get(event)?.delete(listener);
      },
    },
  };
  const gateway = createHostGateway(disposeHost, { onError: error => disposeErrors.push(error) });
  let notifications = 0;
  gateway.subscribe(() => {
    notifications += 1;
  });
  assert.throws(
    () => gateway.dispose(),
    error => error instanceof AggregateError && error.errors.some(item => String(item).includes('chat remove failed')),
  );
  assert.deepEqual(
    removalAttempts,
    [eventTypes.CHAT_CHANGED, eventTypes.CHARACTER_PAGE_LOADED],
    'dispose 必须在单项失败后继续退订其他事件',
  );
  listeners.get(eventTypes.CHAT_CHANGED)?.forEach(listener => listener());
  assert.equal(notifications, 0, 'dispose 失败后 gateway 仍必须 inactive 且清空业务 listener');
  assert.equal(disposeErrors[0] instanceof AggregateError, true, 'dispose 聚合错误应进入错误报告器');

  failChatRemoval = false;
  gateway.dispose();
  assert.deepEqual(
    removalAttempts,
    [eventTypes.CHAT_CHANGED, eventTypes.CHARACTER_PAGE_LOADED, eventTypes.CHAT_CHANGED],
    '再次 dispose 应只重试之前退订失败的事件',
  );
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failNextSet = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('storage set failed');
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

async function testSettingsStore(): Promise<void> {
  const storage = new MemoryStorage();
  const winter = createSettingsStore('末世寒冬 - 星穹秩序', storage);
  assert.deepEqual(winter.getPublic(), {
    provider: 'tavern',
    apiUrl: '',
    model: '',
    theme: 'system',
    notifications: true,
  });

  const notifications: PublicSettings[] = [];
  const unsubscribe = winter.subscribe(settings => notifications.push(settings));
  winter.updatePublic({ provider: 'openai-compatible', apiUrl: 'https://api.example.test/v1', model: 'gpt-test' });
  assert.equal(notifications.length, 1);
  assert.equal(Object.isFrozen(notifications[0]), true, '公共设置事件必须传不可变快照');
  assert.equal('apiKey' in notifications[0], false, '公共设置事件不得包含 secret');
  unsubscribe();
  winter.updatePublic({ theme: 'dark' });
  assert.equal(notifications.length, 1, '设置订阅 disposer 必须有效');

  for (const apiUrl of ['javascript:alert(1)', 'data:text/plain,bad', '/relative', 'not a url']) {
    assert.throws(() => winter.updatePublic({ apiUrl }), /api.?url|http|https|invalid|无效/i, apiUrl);
  }
  winter.updatePublic({ apiUrl: '' });

  winter.setSecret('super-secret-token');
  const publicSnapshot = winter.getPublic() as PublicSettings & { apiKey?: string };
  assert.equal(publicSnapshot.apiKey, undefined);
  assert.equal(JSON.stringify(publicSnapshot).includes('super-secret-token'), false);
  for (const [key, value] of storage.values) {
    if (!key.includes(':secret')) assert.equal(value.includes('super-secret-token'), false, '公共持久化不得含 secret');
  }

  assert.equal(
    winter.withApiKey(apiKey => `sync:${apiKey}`),
    'sync:super-secret-token',
  );
  assert.equal(await winter.withApiKey(async apiKey => `async:${apiKey}`), 'async:super-secret-token');
  assert.throws(
    () =>
      winter.withApiKey(() => {
        throw new Error('callback failed');
      }),
    error =>
      error instanceof Error && error.message === 'callback failed' && !error.message.includes('super-secret-token'),
  );
  await assert.rejects(
    () =>
      winter.withApiKey(async () => {
        throw new Error('async callback failed');
      }),
    error =>
      error instanceof Error &&
      error.message === 'async callback failed' &&
      !error.message.includes('super-secret-token'),
  );
  winter.clearSecret();
  assert.equal(
    winter.withApiKey(apiKey => apiKey),
    undefined,
  );

  const other = createSettingsStore('另一张卡', storage);
  assert.equal(other.getPublic().theme, 'system', '不同角色公共设置不得串用');
  other.setSecret('other-secret');
  assert.equal(
    winter.withApiKey(apiKey => apiKey),
    undefined,
    '不同角色 secret 不得串用',
  );
  assert.equal(
    other.withApiKey(apiKey => apiKey),
    'other-secret',
  );

  const publicKey = [...storage.values.keys()].find(
    key => key.includes(encodeURIComponent('损坏设置')) && key.includes(':public'),
  );
  assert.equal(publicKey, undefined);
  const broken = createSettingsStore('损坏设置', storage);
  const brokenKey = [...storage.values.keys()].find(
    key => key.includes(encodeURIComponent('损坏设置')) && key.includes(':public'),
  );
  assert.ok(brokenKey, '首次读取应写入规范化默认公共设置');
  storage.setItem(brokenKey, '{bad json');
  assert.deepEqual(createSettingsStore('损坏设置', storage).getPublic(), {
    provider: 'tavern',
    apiUrl: '',
    model: '',
    theme: 'system',
    notifications: true,
  });
  assert.deepEqual(broken.getPublic().theme, 'system');
}

function testSettingsStoreFailureIsolation(): void {
  const storage = new MemoryStorage();
  const reported: unknown[] = [];
  const settings = createSettingsStore('事务设置', storage, { onError: error => reported.push(error) });

  storage.failNextSet = true;
  assert.throws(() => settings.updatePublic({ theme: 'dark' }), /storage set failed/);
  assert.equal(settings.getPublic().theme, 'system', '持久化失败不得提前提交内存状态');
  assert.equal(settings.updatePublic({ theme: 'dark' }).theme, 'dark', '同一 patch 必须可重试');

  let laterListenerTheme = '';
  settings.subscribe(() => {
    throw new Error('settings listener failed');
  });
  settings.subscribe(snapshot => {
    laterListenerTheme = snapshot.theme;
  });
  assert.doesNotThrow(() => settings.updatePublic({ theme: 'light' }));
  assert.equal(laterListenerTheme, 'light', '单个设置 listener 失败不得阻断后续 listener');
  assert.match(String(reported[0]), /settings listener failed/);
  assert.equal(settings.getPublic().theme, 'light', 'listener 失败不得伪装为公共设置提交失败');
}

async function main(): Promise<void> {
  await testModuleRegistry();
  await testInitializeRollbackAndRetry();
  await testRuntimeBridge();
  testEventBus();
  await testRuntimeFailureCleanupAndListenerDiagnostics();
  testTopRegistration();
  testHostGateway();
  testHostGatewayFailureIsolation();
  testHostGatewayCleanupFailures();
  await testSettingsStore();
  testSettingsStoreFailureIsolation();
  console.log('runtime tests passed');
}

void main();
