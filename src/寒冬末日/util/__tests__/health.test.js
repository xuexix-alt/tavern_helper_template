const test = require('node:test');
const assert = require('node:assert/strict');

global._ = require('lodash');

const { computeOffstageHealthDelta } = require('../health.ts');

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

test('A档 opening still allows sheltered offstage recovery', () => {
  assert.deepEqual(computeOffstageHealthDelta(12, true, rules, { worldModeId: 'A' }), {
    delta: 4,
    reason: '+4, 离场受庇护休整',
  });
});
