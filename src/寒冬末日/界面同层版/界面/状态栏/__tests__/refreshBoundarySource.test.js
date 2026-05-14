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

test('host stream token echoes do not trigger external transcript rebuilds after UI is already done', () => {
  const refreshSource = readSource('refreshDomains.ts');
  const demoSource = readSource('useStreamingDemo.ts');
  const hostRefreshBody = extractFunctionBody(demoSource, 'handleHostRefreshEvent');

  assert.match(
    refreshSource,
    /case 'host\.stream_token_received':\s*case 'host\.smooth_stream_token_received':\s*return out;/,
    'host token echoes should not map to the full transcript domain; iframe incremental tokens own StreamRenderer updates',
  );
  assert.match(
    hostRefreshBody,
    /if \(isHostGenerationStarted\) \{[\s\S]*?status\.value = 'streaming';[\s\S]*?transcript\.value = syncTranscriptFlags\(transcript\.value\);/,
    'host generation_started should enter streaming status so an already-present latest item mounts StreamRenderer',
  );
  assert.match(
    hostRefreshBody,
    /const isHostStreamTokenEcho =[\s\S]*tavern_events\.STREAM_TOKEN_RECEIVED[\s\S]*tavern_events\.SMOOTH_STREAM_TOKEN_RECEIVED/,
    'host token echo detection should be explicit so it can be gated by UI status',
  );
  assert.match(
    hostRefreshBody,
    /if \(isHostStreamTokenEcho && status\.value === 'done'\) \{[\s\S]*?ignored_post_done_token_echo[\s\S]*?return;/,
    'post-done host token echoes must not flip the same-layer UI back to streaming',
  );
  assert.match(
    refreshSource,
    /case 'host\.generation_started':\s*return out;/,
    'host generation_started should flip streaming flags without forcing an external transcript rebuild',
  );
});

test('generated image refresh targets both the current transcript item and gallery', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'queueGeneratedImageEntityRefresh');

  assert.match(
    body,
    /scheduleUiRefresh\(\['transcriptItems', 'gallery'\], reason, \[messageId\]\);/,
    'ready native image mutations should refresh the affected same-layer body item and gallery with the same target id',
  );
  assert.doesNotMatch(
    body,
    /runQueuedHostMessageUpdate\(\{[\s\S]*stage: 'image-refresh'/,
    'ready native image mutations must not wait behind the auto-image host queue once the host DOM already has the image',
  );
});

test('host image request hints fall back to the recent transcript intent instead of message 0', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'syncPendingRequestHintsFromDom');

  assert.match(
    body,
    /const recentIntent = imageRecentIntentStore\.read\(\);/,
    'request hint sync should consult the latest same-layer transcript image intent',
  );
  assert.match(
    body,
    /recentIntent\?\.source === 'transcript'\s*\?\s*recentIntent\.messageId\s*:\s*null/,
    'buttons without a resolvable host carrier should bind to the recent transcript target rather than message 0',
  );
  assert.doesNotMatch(
    body,
    /Number\([^)]+messageId[\s\S]{0,120}\)\s*\|\|\s*0/,
    'missing carrier ids must not be coerced to message 0',
  );
});

test('mounted same-layer probes visible assistant messages for existing host-native images', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'queueVisibleGeneratedImageEntityRefresh');
  const mountedSegment = source.slice(source.indexOf('onMounted(async () => {'));

  assert.match(
    body,
    /transcript\.value[\s\S]*filter\(item => item\.role === 'assistant'\)[\s\S]*queueGeneratedImageEntityRefresh\(visibleAssistantMessageIds, reason\);/,
    'visible assistant message ids should be rechecked for host-native image artifacts after startup',
  );
  assert.match(
    mountedSegment,
    /window\.setTimeout\(\(\) => queueVisibleGeneratedImageEntityRefresh\('mounted\.host_plugin_native_probe'\), 250\);/,
    'mounted startup should refresh existing host-native images even when no fresh mutation fires',
  );
});

test('targeted transcript item refresh preserves host mes fallback and latest assistant identity', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'refreshTranscriptItemsByIds');

  assert.match(
    body,
    /const rawMessage = String\(hostMessage\?\.message \?\? hostMessage\?\.mes \?\? ''\);/,
    'targeted refresh should use mes fallback because host chat entries may not expose message',
  );
  assert.match(
    body,
    /latestAssistantId: latestAssistantItem\.value\?\.message_id \?\? assistantMessageId\.value,/,
    'targeted refresh should not depend only on the active generation placeholder id after startup',
  );
});

test('ready host-native images take precedence over stale streaming preview phase', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const hostRenderedHasReadyImage = [\s\S]*st-chatu8-image-span[\s\S]*assistant-fallback/,
    'buildTranscriptItem should detect ready host-native image HTML before choosing the stream renderer',
  );
  assert.match(
    source,
    /input\.latestAssistantId === input\.id &&\s*!hostRenderedHasReadyImage &&\s*phase === 'stream' &&\s*\(input\.status === 'streaming'/,
    'stale image-generation streaming phase must not hide ready host-rendered image markup',
  );
});

test('latest plain done assistant is never reclassified as streaming by stale global status', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function shouldTreatLatestAssistantAsStreaming[\s\S]*?if \(input\.isLatest !== true\) return false;\s*if \(input\.phase !== 'stream'\) return false;/,
    'latest assistant streaming flags should require the message runtime phase itself to still be stream',
  );
  assert.match(
    source,
    /return input\.status === 'streaming' \|\| input\.busy === true;/,
    'global streaming or busy state may only apply after the message phase guard',
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
