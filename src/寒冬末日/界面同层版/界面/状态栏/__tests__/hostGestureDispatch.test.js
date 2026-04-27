const test = require('node:test');
const assert = require('node:assert/strict');

const { dispatchHostPrimaryTrigger } = require('../hostGestureDispatch.ts');

function createFakeTarget({ mobile = false } = {}) {
  const dispatched = [];
  const timers = [];
  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }

  class FakeMouseEvent extends FakeEvent {}

  const view = {
    Event: FakeEvent,
    MouseEvent: FakeMouseEvent,
    navigator: { maxTouchPoints: mobile ? 5 : 0 },
    innerWidth: mobile ? 390 : 1280,
    ontouchstart: mobile ? () => {} : undefined,
    setTimeout(callback, delayMs) {
      timers.push({ callback, delayMs });
      return timers.length;
    },
  };

  const target = {
    ownerDocument: { defaultView: view },
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 200, height: 100 };
    },
    dispatchEvent(event) {
      dispatched.push(event);
      return true;
    },
  };

  return { target, dispatched, timers };
}

test('dispatchHostPrimaryTrigger dispatches desktop dblclick for non-mobile host', () => {
  const { target, dispatched } = createFakeTarget({ mobile: false });
  assert.equal(dispatchHostPrimaryTrigger(target), true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'dblclick');
});

test('dispatchHostPrimaryTrigger dispatches the plugin click-trigger triple tap sequence for mobile message text', () => {
  const { target, dispatched, timers } = createFakeTarget({ mobile: true });
  assert.equal(dispatchHostPrimaryTrigger(target), true);
  assert.equal(dispatched.map(event => event.type).join(','), 'touchstart,touchend');
  assert.deepEqual(
    timers.map(timer => timer.delayMs),
    [80, 160],
  );
  timers.forEach(timer => timer.callback());
  assert.equal(
    dispatched.map(event => event.type).join(','),
    'touchstart,touchend,touchstart,touchend,touchstart,touchend',
  );
});

test('dispatchHostPrimaryTrigger can force a host dblclick on mobile for image-button bridges', () => {
  const { target, dispatched, timers } = createFakeTarget({ mobile: true });
  assert.equal(dispatchHostPrimaryTrigger(target, { strategy: 'dblclick' }), true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'dblclick');
  assert.equal(dispatched[0].detail, 2);
  assert.equal(timers.length, 0);
});
