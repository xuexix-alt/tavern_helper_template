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

test('generateOpening uses the same native send chain as ordinary正文 instead of local generate orchestration', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'generateOpening');
  const helperBody = extractFunctionBody(source, 'runOpeningNativeGeneration');

  assert.equal(
    body.includes('const compiledPromptSnapshot = await buildOpeningCompiledUserInput('),
    true,
    'generateOpening should freeze a compiled prompt snapshot before starting generation',
  );
  assert.equal(
    body.includes('await runOpeningNativeGeneration(compiledPromptSnapshot);'),
    true,
    'generateOpening should route through the ordinary native send flow helper',
  );
  assert.equal(
    helperBody.includes('await sendToNativeChat(compiledPromptSnapshot, false);'),
    true,
    'opening should send through the ordinary native send helper so host streaming owns token-time rendering',
  );
  assert.match(
    helperBody,
    /await revealHiddenStoryMessagesForNativeGeneration\('opening_native_generation'\);[\s\S]*await sendToNativeChat\(compiledPromptSnapshot, false\);/,
    'opening native generation should reveal hidden story floors before host prompt assembly',
  );
  assert.equal(
    helperBody.includes('await runGenerationFlow('),
    false,
    'opening native flow must not enter the local Tavern Helper generate()/placeholder pipeline',
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

test('runGenerationFlow keeps detached user_input support out of opening native send flow', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'runGenerationFlow');
  const openingBody = extractFunctionBody(source, 'runOpeningNativeGeneration');

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
    openingBody.includes('detachedUserInput'),
    false,
    'opening should not opt into detached generate() user_input mode anymore',
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
    rerollBody.includes('await runOpeningNativeGeneration(compiledPromptSnapshot);'),
    true,
    'rerollOpening should reuse the native opening send helper with the frozen prompt snapshot',
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
