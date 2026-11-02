const test = require('node:test');
const assert = require('node:assert/strict');

global._ = require('lodash');

const { computeOffstageHealthDelta, capOffstageHoursAtDisaster } = require('../health.ts');

const rules = {
  decayPer6h: 5,
  recoverPer12h: 4,
  decayMultiplier: 1,
  recoverMultiplier: 1,
};

test('A档 opening skips offstage unsheltered health decay', () => {
  assert.deepEqual(computeOffstageHealthDelta(12, false, rules, { worldModeId: 'A' }), {
    delta: 0,
    reason: '0, 无变化',
  });
});

test('non-A opening keeps offstage unsheltered health decay', () => {
  assert.deepEqual(computeOffstageHealthDelta(12, false, rules, { worldModeId: 'B' }), {
    delta: -10,
    reason: '-10, 离场未受庇护自然衰减',
  });
});

test('A档 legacy save without a disaster day skips sheltered recovery too', () => {
  assert.deepEqual(computeOffstageHealthDelta(12, true, rules, { worldModeId: 'A' }), {
    delta: 0,
    reason: '0, 无变化',
  });
});

for (const sheltered of [false, true]) {
  test(`pre-disaster day skips offstage settlement regardless of opening (sheltered=${sheltered})`, () => {
    for (const worldModeId of ['A', 'B', '']) {
      assert.deepEqual(computeOffstageHealthDelta(24, sheltered, rules, { worldModeId, daysSinceDisaster: -30 }), {
        delta: 0,
        reason: '0, 无变化',
      });
    }
  });
}

test('A档 save resumes unsheltered decay after the disaster', () => {
  for (const daysSinceDisaster of [0, 1, 30]) {
    assert.deepEqual(computeOffstageHealthDelta(12, false, rules, { worldModeId: 'A', daysSinceDisaster }), {
      delta: -10,
      reason: '-10, 离场未受庇护自然衰减',
    });
  }
});

test('post-disaster sheltered roles keep their offstage recovery', () => {
  assert.deepEqual(computeOffstageHealthDelta(12, true, rules, { worldModeId: 'A', daysSinceDisaster: 1 }), {
    delta: 4,
    reason: '+4, 离场受庇护休整',
  });
});

test('crossing the disaster boundary never retroactively settles pre-disaster hours', () => {
  assert.equal(capOffstageHoursAtDisaster(10, -1, 0, 7 * 60), 7);
  assert.equal(capOffstageHoursAtDisaster(1000, -30, 1, 12 * 60), 36);
  assert.equal(capOffstageHoursAtDisaster(6, 1, 2, 12 * 60), 6);
  assert.equal(capOffstageHoursAtDisaster(6, -1, 0, null), 0);
});
