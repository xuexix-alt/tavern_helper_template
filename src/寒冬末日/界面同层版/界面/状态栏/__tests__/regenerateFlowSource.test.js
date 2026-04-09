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
