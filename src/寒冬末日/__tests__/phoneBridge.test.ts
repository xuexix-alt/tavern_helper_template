import assert from 'node:assert/strict';

import {
  createPrePhoneBridge,
  type PhoneHostAction,
  type PrePhoneRuntime,
} from '../same-layer-pre/\u754c\u9762/\u72b6\u6001\u680f/phoneBridge';

type RuntimeListener = (...args: any[]) => void;

function createFakeComposer(initial = '') {
  return { value: initial, generateCalls: 0 };
}

function createFakeRuntime(
  options: {
    ownerMatches?: boolean;
    ownerReady?: boolean;
    sessionReady?: boolean;
    unread?: number;
    open?: boolean;
  } = {},
) {
  const listeners = new Map<string, Set<RuntimeListener>>();
  let unread = options.unread ?? 0;
  let open = options.open ?? false;
  let ownerReady = options.ownerReady ?? true;
  let sessionReady = options.sessionReady ?? true;
  let detachCalls = 0;
  let attachCalls = 0;
  let toggleCalls = 0;
  let attachedSubmit: ((action: PhoneHostAction) => Promise<void> | void) | undefined;
  const runtime: PrePhoneRuntime = {
    getOwner: () =>
      ownerReady
        ? {
            characterName: '\u672b\u4e16\u5bd2\u51ac - \u661f\u7a79\u79e9\u5e8f',
            adapterId: options.ownerMatches === false ? 'another-adapter' : 'winter-apocalypse',
            runtimeMajor: 1,
          }
        : null,
    getStatus: () => ({ isOpen: open }),
    getUnreadCount: () => unread,
    async toggle() {
      toggleCalls += 1;
      open = !open;
      emit('status', { isOpen: open });
    },
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set<RuntimeListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return () => eventListeners.delete(listener);
    },
    attachHostBridge(bridge) {
      if (!sessionReady) throw new Error('runtime session is still loading');
      attachCalls += 1;
      attachedSubmit = bridge.submitAction;
      return () => {
        detachCalls += 1;
        attachedSubmit = undefined;
      };
    },
  };

  function emit(event: string, ...args: any[]) {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  }

  return {
    runtime,
    emitUnread(value: number) {
      unread = value;
      emit('unread', value);
    },
    closeFromShell() {
      open = false;
      emit('status', { isOpen: false });
    },
    setOwnerReady(value: boolean) {
      ownerReady = value;
      emit('status', { isOpen: open });
    },
    setSessionReady(value: boolean) {
      sessionReady = value;
      emit('status', { isOpen: open });
    },
    submit(action: PhoneHostAction) {
      assert.ok(attachedSubmit, 'host bridge should be attached');
      return attachedSubmit(action);
    },
    get detachCalls() {
      return detachCalls;
    },
    get attachCalls() {
      return attachCalls;
    },
    get toggleCalls() {
      return toggleCalls;
    },
  };
}

function createFakeRuntimeInstallation() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit() {
      for (const listener of [...listeners]) listener();
    },
    get size() {
      return listeners.size;
    },
  };
}

async function main() {
  const composer = createFakeComposer('\u5df2\u6709\u6587\u672c');
  const fake = createFakeRuntime({ unread: 2 });
  let focusCalls = 0;
  const launcher = {
    isConnected: true,
    focus() {
      focusCalls += 1;
    },
  };
  const bridge = createPrePhoneBridge({
    runtime: fake.runtime,
    composer,
    launcher: () => launcher,
  });

  assert.equal(bridge.getAvailability(), 'available');
  assert.equal(bridge.getUnread(), 2);
  await fake.submit({
    kind: 'composer.insert',
    text: '\u68c0\u67e5\u4f9b\u6696',
    sourceKey: 'task:heat',
    mode: 'append',
  });
  assert.equal(composer.value, '\u5df2\u6709\u6587\u672c\n\u68c0\u67e5\u4f9b\u6696');
  assert.equal(composer.generateCalls, 0);

  await bridge.submitAction({
    kind: 'composer.insert',
    text: '\u66ff\u6362\u5185\u5bb9',
    sourceKey: 'task:replace',
    mode: 'replace',
  });
  assert.equal(composer.value, '\u66ff\u6362\u5185\u5bb9');
  await assert.rejects(() => bridge.submitAction({ kind: 'unknown' } as any), /kind/i);
  await assert.rejects(
    () => bridge.submitAction({ kind: 'composer.insert', text: '', sourceKey: 'task:empty', mode: 'replace' }),
    /text/i,
  );
  await assert.rejects(
    () => bridge.submitAction({ kind: 'composer.insert', text: 'x', sourceKey: '', mode: 'replace' }),
    /sourceKey/i,
  );
  await assert.rejects(
    () => bridge.submitAction({ kind: 'composer.insert', text: 'x', sourceKey: 'task:x', mode: 'unknown' } as any),
    /mode/i,
  );

  const unreadValues: number[] = [];
  const stopUnread = bridge.subscribe(unread => unreadValues.push(unread));
  fake.emitUnread(5);
  stopUnread();
  fake.emitUnread(8);
  assert.deepEqual(unreadValues, [2, 5]);

  await bridge.toggle();
  assert.equal(fake.toggleCalls, 1);
  fake.closeFromShell();
  assert.equal(focusCalls, 1, 'closing or Escape should restore focus to the Pre launcher');

  bridge.dispose();
  bridge.dispose();
  assert.equal(fake.detachCalls, 1, 'dispose should detach the host bridge exactly once');

  const unavailableComposer = createFakeComposer();
  const unavailable = createPrePhoneBridge({ runtime: undefined, composer: unavailableComposer });
  assert.equal(unavailable.getAvailability(), 'offline');
  await unavailable.toggle();
  assert.equal(unavailable.getUnread(), 0);
  unavailable.dispose();

  const throwingRuntime = {
    getOwner() {
      throw new Error('runtime is still loading');
    },
  } as unknown as PrePhoneRuntime;
  assert.doesNotThrow(() => {
    const loading = createPrePhoneBridge({ runtime: throwingRuntime, composer: createFakeComposer() });
    assert.equal(loading.getAvailability(), 'unavailable');
    loading.dispose();
  });

  const mismatched = createFakeRuntime({ ownerMatches: false });
  const unavailableOwner = createPrePhoneBridge({ runtime: mismatched.runtime, composer: createFakeComposer() });
  assert.equal(unavailableOwner.getAvailability(), 'unavailable');
  await unavailableOwner.toggle();
  assert.equal(mismatched.toggleCalls, 0);
  unavailableOwner.dispose();
  assert.equal(mismatched.detachCalls, 0);

  const delayed = createFakeRuntime({ ownerReady: false, sessionReady: false });
  const delayedBridge = createPrePhoneBridge({ runtime: delayed.runtime, composer: createFakeComposer() });
  assert.equal(delayedBridge.getAvailability(), 'unavailable');
  delayed.setOwnerReady(true);
  assert.equal(delayedBridge.getAvailability(), 'unavailable', 'owner alone must not bind before the session exists');
  delayed.setSessionReady(true);
  assert.equal(delayedBridge.getAvailability(), 'available', 'a later session status must retry host bridge binding');
  assert.equal(delayed.attachCalls, 1, 'late readiness must attach exactly once');
  delayed.setSessionReady(true);
  assert.equal(delayed.attachCalls, 1, 'repeated ready status must not attach twice');
  delayedBridge.dispose();
  assert.equal(delayed.detachCalls, 1, 'late attachment must detach exactly once');

  const installed = createFakeRuntimeInstallation();
  const lateFake = createFakeRuntime({ unread: 3 });
  let currentRuntime: PrePhoneRuntime | undefined;
  const lateBridge = createPrePhoneBridge({
    resolveRuntime: () => currentRuntime,
    subscribeRuntimeInstalled: listener => installed.subscribe(listener),
    composer: createFakeComposer(),
  });
  assert.equal(lateBridge.getAvailability(), 'offline');

  currentRuntime = lateFake.runtime;
  installed.emit();
  assert.equal(lateBridge.getAvailability(), 'available');
  assert.equal(lateBridge.getUnread(), 3);
  assert.equal(lateFake.attachCalls, 1);

  installed.emit();
  assert.equal(lateBridge.redetect(), 'available');
  assert.equal(lateFake.attachCalls, 1, 'event and manual redetect must be idempotent');

  const replacement = createFakeRuntime({ unread: 7 });
  currentRuntime = replacement.runtime;
  assert.equal(lateBridge.redetect(), 'available');
  assert.equal(lateFake.detachCalls, 1, 'runtime replacement must release the old host bridge');
  assert.equal(replacement.attachCalls, 1, 'runtime replacement must attach the new host bridge once');
  assert.equal(lateBridge.getUnread(), 7);

  lateBridge.dispose();
  assert.equal(installed.size, 0, 'dispose must remove the runtime installation listener');
  assert.equal(replacement.detachCalls, 1, 'dispose must detach the replacement runtime once');
  installed.emit();
  assert.equal(replacement.attachCalls, 1, 'installation events after dispose must have no effect');
}

void main();
