const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveHostDispatchPlanWithRetry } = require('../hostCoordinateTarget.ts');

test('resolveHostDispatchPlanWithRetry retries direct host message target before point fallback', async () => {
  const directTarget = { id: 'direct-target' };
  const hostPoint = { clientX: 48, clientY: 96 };
  let directAttempts = 0;
  let pointFallbackCalls = 0;

  const plan = await resolveHostDispatchPlanWithRetry({
    resolveDirectTarget() {
      directAttempts += 1;
      return directAttempts >= 3 ? directTarget : null;
    },
    resolvePointFallbackTarget() {
      pointFallbackCalls += 1;
      return { id: 'point-fallback' };
    },
    hostPoint,
    directRetry: { attempts: 4, delayMs: 0 },
    pointRetry: { attempts: 2, delayMs: 0 },
  });

  assert.deepEqual(plan, {
    target: directTarget,
    hostPoint: null,
    source: 'message_id',
  });
  assert.equal(directAttempts, 3);
  assert.equal(pointFallbackCalls, 0);
});

test('resolveHostDispatchPlanWithRetry falls back to point target only after direct retries are exhausted', async () => {
  const pointFallbackTarget = { id: 'point-fallback' };
  const hostPoint = { clientX: 12, clientY: 24 };
  let directAttempts = 0;
  let pointFallbackCalls = 0;

  const plan = await resolveHostDispatchPlanWithRetry({
    resolveDirectTarget() {
      directAttempts += 1;
      return null;
    },
    resolvePointFallbackTarget() {
      pointFallbackCalls += 1;
      return pointFallbackTarget;
    },
    hostPoint,
    directRetry: { attempts: 3, delayMs: 0 },
    pointRetry: { attempts: 2, delayMs: 0 },
  });

  assert.deepEqual(plan, {
    target: pointFallbackTarget,
    hostPoint,
    source: 'point_fallback',
  });
  assert.equal(directAttempts, 3);
  assert.equal(pointFallbackCalls, 1);
});
