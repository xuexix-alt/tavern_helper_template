const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');
const helperPath = path.resolve(statusBarDir, 'runtimeLeasePersistence.ts');
const heartbeatPath = path.resolve(statusBarDir, 'runtimeLeaseHeartbeat.ts');
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

test('same-layer runtime lease heartbeat should stay out of chat variables', () => {
  assert.equal(
    fs.existsSync(heartbeatPath),
    true,
    'volatile runtime heartbeat should live in a separate helper from durable chat-variable lease persistence',
  );

  const heartbeatSource = fs.readFileSync(heartbeatPath, 'utf8');
  const persistenceSource = fs.readFileSync(helperPath, 'utf8');

  assert.match(
    heartbeatSource,
    /writeSameLayerRuntimeHeartbeat/,
    'volatile helper should expose a heartbeat writer for the 2 second lease loop',
  );
  assert.match(
    heartbeatSource,
    /readSameLayerRuntimeHeartbeat/,
    'volatile helper should expose a heartbeat reader for restore freshness decisions',
  );
  assert.match(
    heartbeatSource,
    /clearSameLayerRuntimeHeartbeat/,
    'volatile helper should expose cleanup for explicit disable and stale recovery',
  );
  assert.doesNotMatch(
    heartbeatSource,
    /updateVariablesWith|getVariables|replaceVariables/,
    'volatile heartbeat must not touch Tavern chat variables or it will keep saving metadata while idle',
  );
  assert.match(
    persistenceSource,
    /writeSameLayerRuntimeLease[\s\S]*updateVariablesWith/,
    'durable runtime lease persistence should remain the only runtime lease helper that writes chat variables',
  );
});

test('same-layer runtime lease freshness should account for suspended grace before stale recovery', () => {
  const source = fs.readFileSync(helperPath, 'utf8');

  assert.match(
    source,
    /SAME_LAYER_LEASE_SUSPEND_GRACE_MS/,
    'suspended leases should use the explicit suspend grace policy instead of falling through to the long stale timeout',
  );
  assert.match(
    source,
    /isSameLayerRuntimeLeaseRecoverable/,
    'restore callers should use a named recoverable decision helper instead of open-coding stale checks',
  );
});
