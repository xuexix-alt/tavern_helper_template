const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');
const helperPath = path.resolve(statusBarDir, 'runtimeLeasePersistence.ts');

test('same-layer runtime lease helper should expose fresh-versus-stale contract boundaries', () => {
  assert.equal(
    fs.existsSync(helperPath),
    true,
    'runtime lease persistence should live in the planned status-bar helper surface before send/hide callers depend on it',
  );

  const source = fs.readFileSync(helperPath, 'utf8');

  assert.match(source, /runtimeLease/i);
  assert.match(source, /fresh|isFresh|freshness/i);
  assert.match(source, /stale|invalidate|markStale|isStale/i);
});
