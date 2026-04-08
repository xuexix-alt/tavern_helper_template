const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

test('opening assistant MVU path waits for current message stat_data and avoids post-write reprocess', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /async function buildOpeningAssistantMvuData\(/);
  assert.match(source, /await waitGlobalInitialized\('Mvu'\);/);
  assert.match(source, /await waitUntilMessageStatDataReady\(/);
  assert.match(source, /await Mvu\.parseMessage\(/);

  assert.doesNotMatch(source, /async function syncOpeningConfigToResultMvu\(/);
  assert.doesNotMatch(source, /await syncOpeningConfigToResultMvu\(finalResultId\);/);
  assert.doesNotMatch(
    source,
    /await reprocessMessageVariablesById\(finalResultId, \{ force: true, refreshMessage: true \}\);/,
  );
});

test('opening seed user floor carries initialized MVU data from layer 0 so assistant floor can continue the chain', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /async function buildOpeningSeedMvuData\(/);
  assert.match(source, /const openingSeedMvuData = await buildOpeningSeedMvuData\(\);/);
  assert.match(source, /await upsertOpeningSeedMessage\(compiledPrompt, 'none', openingSeedMvuData\)/);
  assert.match(
    source,
    /async function upsertOpeningSeedMessage\(\s*prompt: string,\s*refresh: HideRefreshMode = 'none',\s*messageData\?: Record<string, unknown> \| null,/,
  );
  assert.match(source, /_.merge\(nextData, _.cloneDeep\(messageData\)\);/);
});

test('opening result message also emits official generation lifecycle so host extra-model MVU parsing can run', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /const finalResultId = openingResultMessageId \?\? updatedResultId \?\? openingPayload\.value\.opening_result_message_id;/);
  assert.match(source, /await emitOfficialGenerationLifecycle\(finalResultId, 'normal'\);/);
});
