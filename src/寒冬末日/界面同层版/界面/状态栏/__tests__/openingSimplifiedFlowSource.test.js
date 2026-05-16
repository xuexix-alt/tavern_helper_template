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

test('generateOpening uses the detached same-layer generate flow instead of native send', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'generateOpening');
  const helperBody = extractFunctionBody(source, 'runOpeningDetachedGeneration');

  assert.equal(
    body.includes('const compiledPromptSnapshot = await buildOpeningCompiledUserInput('),
    true,
    'generateOpening should freeze a compiled prompt snapshot before starting generation',
  );
  assert.equal(
    body.includes('await runOpeningDetachedGeneration(compiledPromptSnapshot);'),
    true,
    'generateOpening should route through the detached generate helper',
  );
  assert.equal(
    helperBody.includes('await runGenerationFlow({'),
    true,
    'opening should use the shared generate orchestration helper',
  );
  assert.match(
    helperBody,
    /detachedUserInput:\s*true,[\s\S]*maxChatHistory:\s*0,[\s\S]*emitLifecycleKind:\s*'normal'/,
    'opening detached generation should pass the compiled prompt as generate({ user_input }) with no chat history',
  );
  assert.equal(
    helperBody.includes('sendToNativeChat'),
    false,
    'opening detached flow must not enter the native /send + /trigger pipeline',
  );
  assert.equal(
    body.includes('await upsertOpeningSeedMessage('),
    false,
    'generateOpening should no longer create a dedicated opening seed user floor',
  );
  assert.equal(
    body.includes('await upsertOpeningResultMessage('),
    false,
    'generateOpening should no longer maintain a dedicated opening result assistant floor',
  );
  assert.equal(
    body.includes('bindOpeningGenerationListeners('),
    false,
    'generateOpening should no longer keep a separate opening payload stream listener chain',
  );
});

test('runGenerationFlow keeps detached user_input support for opening generate flow', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'runGenerationFlow');
  const openingBody = extractFunctionBody(source, 'runOpeningDetachedGeneration');

  assert.equal(
    source.includes('detachedUserInput?: boolean'),
    true,
    'runGenerationFlow options should support detached user_input generation',
  );
  assert.equal(
    source.includes("maxChatHistory?: 'all' | number"),
    true,
    'runGenerationFlow should accept explicit chat history limits for detached generation',
  );
  assert.equal(
    body.includes('user_input: prompt'),
    true,
    'detached generation should pass the compiled prompt snapshot through generate({ user_input })',
  );
  assert.equal(
    body.includes('max_chat_history: options.maxChatHistory ?? 0'),
    true,
    'detached generation should default to zero chat history',
  );
  assert.equal(
    openingBody.includes('detachedUserInput: true'),
    true,
    'opening should opt into detached generate() user_input mode',
  );
});

test('opening failure recovery reuses the frozen compiled prompt snapshot instead of reopening the old payload stream chain', () => {
  const source = readSource();
  const rerollBody = extractFunctionBody(source, 'rerollOpening');

  assert.equal(
    rerollBody.includes(
      "const compiledPromptSnapshot = String(openingPayload.value.compiled_prompt_snapshot ?? '').trim();",
    ),
    true,
    'rerollOpening should read the frozen compiled prompt snapshot from opening payload state',
  );
  assert.equal(
    rerollBody.includes('await generateOpening();'),
    false,
    'rerollOpening should not recurse into the legacy opening generator flow anymore',
  );
  assert.equal(
    rerollBody.includes('await runOpeningDetachedGeneration(compiledPromptSnapshot);'),
    true,
    'rerollOpening should reuse the detached generate helper with the frozen prompt snapshot',
  );
});

test('opening mvu anchor prefers latest user, then opening assistant, then latest assistant', () => {
  const source = readSource();

  assert.equal(
    source.includes('const currentMvuAnchorMessageId = computed(() => {'),
    true,
    'useStreamingDemo should expose an explicit current MVU anchor for opening and post-opening states',
  );
  assert.equal(
    source.includes('if (latestUserItem.value?.message_id != null) return latestUserItem.value.message_id;'),
    true,
    'MVU anchor should prefer the latest user floor during normal story turns',
  );
  assert.equal(
    source.includes(
      'const openingAssistantMessageId = Math.trunc(Number(openingPayload.value.opening_assistant_message_id));',
    ),
    true,
    'MVU anchor should fall back to the opening assistant floor after detached opening generation',
  );
  assert.equal(
    source.includes('return latestAssistantItem.value?.message_id ?? null;'),
    true,
    'MVU anchor should finally fall back to the latest assistant floor when no user or opening assistant anchor exists',
  );
});

test('opening setup visibility no longer hides the modal just because a failed detached assistant floor already exists', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'useStreamingDemo');

  assert.equal(
    body.includes('const result = hasStoryMessagesBeyondOpening.value === false;'),
    false,
    'opening modal visibility should not be keyed to generic story-floor existence after detached opening failures',
  );
  assert.equal(
    body.includes('if (hasSuccessfulOpeningAssistant.value) return false;'),
    true,
    'opening modal should stay available until a successful non-empty assistant truly exists',
  );
});

test('opening runtime no longer keeps the payload-result synthetic transcript helpers from the legacy seed/result chain', () => {
  const source = readSource();

  assert.equal(
    source.includes('function buildOpeningTranscriptItem('),
    false,
    'detached opening flow should not keep the old synthetic opening card builder in runtime',
  );
  assert.equal(
    source.includes('function hasRenderableOpeningPayloadResultBody('),
    false,
    'detached opening flow should not keep payload-result rendering checks from the retired opening chain',
  );
  assert.equal(
    source.includes('function findOpeningResultChatMessage('),
    false,
    'detached opening flow should no longer search for a dedicated opening result floor',
  );
});
