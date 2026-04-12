const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');
const helperPath = path.resolve(statusBarDir, 'runtimeLeasePersistence.ts');
const policyPath = path.resolve(statusBarDir, 'runtimeLeasePolicy.ts');

test('same-layer runtime lease helper should expose fresh-versus-stale contract boundaries', () => {
  assert.equal(
    fs.existsSync(helperPath),
    true,
    'runtime lease persistence should live in the planned status-bar helper surface before send/hide callers depend on it',
  );

  assert.equal(
    fs.existsSync(policyPath),
    true,
    'runtime lease policy should live in its own helper surface so timing constants do not drift in callers',
  );

  const source = fs.readFileSync(helperPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');

  assert.match(source, /SameLayerRuntimeLeaseStatus/);
  assert.match(source, /createSameLayerRuntimeLease/);
  assert.match(source, /readSameLayerRuntimeLease/);
  assert.match(source, /writeSameLayerRuntimeLease/);
  assert.match(source, /clearSameLayerRuntimeLease/);
  assert.match(source, /fresh|isFresh|freshness/i);
  assert.match(source, /stale|invalidate|markStale|isStale/i);

  assert.match(policySource, /SAME_LAYER_LEASE_HEARTBEAT_MS/);
  assert.match(policySource, /SAME_LAYER_LEASE_SUSPEND_GRACE_MS/);
  assert.match(policySource, /SAME_LAYER_LEASE_STALE_MS/);
});
