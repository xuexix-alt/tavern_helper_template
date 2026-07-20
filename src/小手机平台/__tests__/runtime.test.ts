import assert from 'node:assert/strict';

import { EventBus } from '../core/eventBus';
import { ModuleRegistry } from '../core/moduleRegistry';
import { registerPhoneModule } from '../core/register';
import { createPhoneRuntime, installPhoneRuntime, makeSessionKey } from '../core/runtime';
import type { PhoneModule, PhoneModuleContext, PhoneModuleRegistration, PhoneOwner } from '../core/types';

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

async function testRuntimeBridge(): Promise<void> {
  assert.equal(makeSessionKey(ownerA, 'chat-42'), '末世寒冬 - 星穹秩序::chat-42');

  const runtime = createPhoneRuntime();
  runtime.setOwner(ownerA);
  runtime.setSession('chat-a');

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

  runtime.setSession('chat-b');
  await assert.rejects(
    () => runtime.submitActionToHost({ kind: 'composer.insert', text: '串线', sourceKey: 'stale', mode: 'append' }),
    /owner|session|会话/i,
  );

  runtime.setSession('chat-a');
  runtime.setOwner(ownerB);
  await assert.rejects(
    () =>
      runtime.submitActionToHost({ kind: 'composer.insert', text: '串卡', sourceKey: 'stale-owner', mode: 'append' }),
    /owner|session|会话/i,
  );

  detach();
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
    const first = installPhoneRuntime();
    const second = installPhoneRuntime();
    assert.equal(first, second, 'top 只能安装一个 TavernPhone runtime');
    assert.deepEqual(queuedTop.__TAVERN_PHONE_PENDING_MODULES__, [], 'runtime 应消费 pending 队列');
  });

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

async function main(): Promise<void> {
  await testModuleRegistry();
  await testRuntimeBridge();
  testEventBus();
  testTopRegistration();
  console.log('runtime tests passed');
}

void main();
