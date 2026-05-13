const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const startToken = `function ${functionName}(`;
  const startIndex = source.indexOf(startToken);
  assert.notEqual(startIndex, -1, `should find ${functionName}`);

  const braceStart = source.indexOf('{', startIndex);
  assert.notEqual(braceStart, -1, `should find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }

  assert.fail(`should find closing brace for ${functionName}`);
}

test('message-level host updates map to transcriptItems instead of full transcript rebuild domains', () => {
  const source = readSource('refreshDomains.ts');

  assert.equal(
    source.includes("case 'host.message_updated':"),
    true,
    'refresh domain mapping should handle host.message_updated explicitly',
  );
  assert.equal(
    source.includes("case 'host.message_edited':"),
    true,
    'refresh domain mapping should handle host.message_edited explicitly',
  );
  assert.equal(
    source.includes("case 'host.message_swiped':"),
    true,
    'refresh domain mapping should handle host.message_swiped explicitly',
  );
  assert.equal(
    source.includes("pushDomain(out, 'transcriptItems');"),
    true,
    'message-level host updates should prefer transcriptItems incremental refresh domain',
  );
});

test('scheduleUiRefresh uses transcriptItems for targeted message refresh and reserves queueExternalSync for full transcript rebuilds', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("if (domains.includes('transcriptItems')) {"),
    true,
    'scheduleUiRefresh should branch transcriptItems separately',
  );
  assert.equal(
    source.includes('refreshTranscriptItemsByIds(targetedMessageIds, reason);'),
    true,
    'scheduleUiRefresh should refresh only targeted transcript items when message ids are available',
  );
  assert.equal(
    source.includes("if (domains.includes('transcript')) {"),
    true,
    'full transcript rebuild branch should still exist for structural changes',
  );
  assert.equal(
    source.includes('queueExternalSync(reason);'),
    true,
    'full transcript rebuilds should still use queueExternalSync',
  );
});

test('handleHostRefreshEvent forwards message ids into refresh domain resolution', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('function handleHostRefreshEvent(name: string, payload: unknown[] = []) {'),
    true,
    'handleHostRefreshEvent should accept raw event payloads for targeted refresh decisions',
  );
  assert.equal(
    source.includes('messageId: resolveHostRefreshMessageId(name, payload),'),
    true,
    'handleHostRefreshEvent should resolve message ids before computing refresh domains',
  );
  assert.equal(
    source.includes(
      'return eventOn(name as any, (...payload: unknown[]) => handleHostRefreshEvent(String(name), payload));',
    ),
    true,
    'history event binding should pass event payloads through to handleHostRefreshEvent',
  );
});

test('onBeforeUnmount should stop restoring hidden host messages during teardown', () => {
  const source = readSource('useStreamingDemo.ts');
  const unmountSegment = source.slice(source.indexOf('onBeforeUnmount(() => {'));

  assert.doesNotMatch(
    unmountSegment,
    /setChatMessages\(hiddenMessages, \{ refresh: 'all' \}\)/,
    'teardown should not unhide host messages as a cleanup side effect',
  );
});

test('restoreHideState should gate hide replay on runtime lease freshness first', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const runtimeLease = readSameLayerRuntimeLease\(\);/,
    'restoreHideState should read the same-layer runtime lease before replaying hidden ids',
  );
  assert.match(
    source,
    /isSameLayerRuntimeLeaseRecoverable\(runtimeLease/,
    'restoreHideState should reject stale lease state before reapplying hidden ids',
  );
});

test('runtime lease heartbeat loop should update volatile host memory instead of durable chat variables', () => {
  const source = readSource('useStreamingDemo.ts');
  const heartbeatBody = extractFunctionBody(source, 'startRuntimeLeaseHeartbeat');

  assert.match(
    heartbeatBody,
    /writeRuntimeLeaseHeartbeat\(\)/,
    '2 second heartbeat loop should refresh volatile runtime heartbeat only',
  );
  assert.doesNotMatch(
    heartbeatBody,
    /writeRuntimeLeaseStatus\('active'\)/,
    '2 second heartbeat loop must not write the durable chat-variable runtime lease',
  );
});

test('mounted same-layer startup should inspect old lease before claiming a new durable lease', () => {
  const source = readSource('useStreamingDemo.ts');
  const mountedSegment = source.slice(source.indexOf('onMounted(async () => {'));

  const restoreIndex = mountedSegment.indexOf('await restoreHideState();');
  const bootingIndex = mountedSegment.indexOf("writeRuntimeLeaseStatus('booting');");

  assert.notEqual(restoreIndex, -1, 'mounted startup should restore previous hide state');
  assert.notEqual(bootingIndex, -1, 'mounted startup should still claim a booting lease after restore');
  assert.ok(
    restoreIndex < bootingIndex,
    'restoreHideState must read the old durable lease before mounted startup overwrites it with this iframe session',
  );
});

test('explicit same-layer disable should own the only host restore path', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(source, /async function disableSameLayerUi\(/);
  assert.match(source, /clearSameLayerRuntimeLease\(\);/);
  assert.match(source, /setChatMessages\(hiddenMessages, \{ refresh: 'all' \}\)/);
});

test('host refresh events should requeue hide policy so native host turns do not remain visible', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /queueHidePolicy\(`event:\$\{name\}`\);/,
    'host-side message growth and regenerate flows should trigger hide policy again',
  );
});

test('host DOM mutation callbacks should reapply visual hide after external re-render', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /syncHostVisualHideFromCurrentState\(\);/,
    'host DOM mutation handling should reapply visual hide after external host re-render',
  );
});
