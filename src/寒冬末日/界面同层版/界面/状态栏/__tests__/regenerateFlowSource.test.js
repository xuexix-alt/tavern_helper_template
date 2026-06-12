const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
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

test('triggerNativeRegenerate clears trailing assistant floors before replaying one assistant reply', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'triggerNativeRegenerate');

  assert.equal(
    body.includes("await deleteChatMessages(trailingAssistantIds, { refresh: 'none' });"),
    true,
    'triggerNativeRegenerate should remove trailing assistant floors before fallback generation',
  );
  assert.equal(
    body.includes('await runGenerationFlow({ prompt: nextPrompt, createUser: false });'),
    true,
    'triggerNativeRegenerate should still regenerate exactly one assistant reply from the resolved prompt',
  );
  assert.equal(
    body.includes(
      'await setChatMessages([{ message_id: anchorMessageId, message: nextPrompt, is_hidden: latestUser.hidden }], {',
    ),
    true,
    'triggerNativeRegenerate should update the latest user floor when composer input overrides the previous text',
  );
  assert.equal(
    body.includes('runNativeRegenerateProxy('),
    false,
    'triggerNativeRegenerate should no longer bridge to host-native regenerate',
  );
});

test('rollLatestTurn reuses current composer input as the regenerate prompt when present', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'rollLatestTurn');

  assert.equal(
    body.includes("const nextPrompt = String(input.value ?? '').trim();"),
    true,
    'rollLatestTurn should read the current composer input before regenerating',
  );
  assert.equal(
    body.includes('await triggerNativeRegenerate(latestUser.message_id, nextPrompt || undefined);'),
    true,
    'rollLatestTurn should pass the current composer input into regenerate when available',
  );
});

test('inline edit regenerate prepares once and enters generation flow directly', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'confirmInlineEditRegenerate');

  assert.equal(
    body.includes('await triggerNativeRegenerate(targetId, nextText);'),
    false,
    'confirmInlineEditRegenerate should not re-enter the full regenerate wrapper after it already patched and deleted floors',
  );
  assert.equal(
    body.includes('await runGenerationFlow({ prompt: nextText, createUser: false });'),
    true,
    'confirmInlineEditRegenerate should call runGenerationFlow directly after one local preparation pass',
  );
  assert.equal(
    body.includes('rebuildTranscript();'),
    false,
    'confirmInlineEditRegenerate should not run a full transcript rebuild before generation starts',
  );
  assert.match(
    body,
    /applyInlineRegenerateTranscriptPatch\(\{[\s\S]*targetId,[\s\S]*nextText,[\s\S]*trailingIds,/,
    'confirmInlineEditRegenerate should update the same-layer transcript locally instead of rebuilding the full window',
  );
});

test('inline edit regenerate records preparation timings before generate', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'confirmInlineEditRegenerate');

  assert.match(
    body,
    /const markStageTiming = createStageTimingTrace\('confirmInlineEditRegenerate'/,
    'confirmInlineEditRegenerate should expose stage timings for the pre-generate stall',
  );
  for (const stage of [
    'patch_user_message_start',
    'patch_user_message_done',
    'scan_trailing_start',
    'scan_trailing_done',
    'delete_trailing_start',
    'delete_trailing_done',
    'local_transcript_patch_done',
    'run_generation_start',
  ]) {
    assert.match(body, new RegExp(`markStageTiming\\('${stage}'`), `missing timing stage ${stage}`);
  }
});
