const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

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

test('runNativeSendProxy is no longer the same-layer ordinary send path', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const runDemoBody = extractFunctionBody(source, 'runDemo');
  const submitBody = extractFunctionBody(source, 'submitPromptViaSameLayer');
  const body = extractFunctionBody(source, 'runNativeSendProxy');

  assert.doesNotMatch(
    runDemoBody,
    /runNativeSendProxy\(/,
    'ordinary composer sends should not route through native /send + /trigger',
  );
  assert.doesNotMatch(
    submitBody,
    /runNativeSendProxy\(/,
    'host chat bridge submits should not route through native /send + /trigger',
  );
  assert.doesNotMatch(
    body,
    /withHostTranscriptVisible\(async \(\) => \{/,
    'native send proxy should not toggle host transcript visibility once lease-backed sending exists',
  );
});

test('same-layer generate keeps hidden story floors visible only inside runGenerationFlow reveal window', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    source,
    /collectGenerationRevealMessageIds/,
    'same-layer generate needs an explicit reveal list for hidden story floors',
  );
  assert.match(
    flowBody,
    /if \(hiddenIds\.length > 0\) \{[\s\S]*is_hidden: false[\s\S]*const generatePromise = generate/,
    'hidden story floors should be revealed before Tavern Helper generate() assembles context',
  );
  assert.match(
    flowBody,
    /await runQueuedPostDoneAssistantSideEffects\(\{[\s\S]*await restoreGenerationRevealWindow\('post_done_side_effects'\)/,
    'hidden story floors should stay revealed through post-done lifecycle so MVU extra analysis can assemble macro context',
  );
  assert.match(
    flowBody,
    /finally \{[\s\S]*await restoreGenerationRevealWindow\('finally'\)/,
    'hidden story floors should still be restored if post-done lifecycle or saving fails',
  );
  assert.doesNotMatch(
    flowBody,
    /const result = String\(await generatePromise\)\.trim\(\);[\s\S]{0,360}hiddenIds\.map\(id => \(\{ message_id: id, is_hidden: true \}\)\)/,
    'hidden story floors should not be restored immediately after the main generate resolves',
  );
});

test('same-layer generate reveal window avoids visually flashing hidden floors', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    flowBody,
    /await setChatMessages\(/,
    'hidden message data should still be revealed so generate can assemble full context',
  );
  assert.doesNotMatch(
    flowBody,
    /hostVisualHideController\.suspend/,
    'generate reveal should not suspend visual hiding; same-layer transcript owns visible rendering',
  );
});

test('same-layer pre-generate hidden-floor scan uses lightweight host metadata instead of full transcript text', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');
  const metaBuilderBody = extractFunctionBody(source, 'buildChatMessageMetaFromHostMessage');

  assert.match(
    source,
    /function readAllChatMessageMetasRaw\(\)/,
    'same-layer should have a metadata-only reader for pre-request scans',
  );
  assert.match(
    metaBuilderBody,
    /data: message\?\.data,/,
    'same-layer metadata reader should preserve message data for MVU inheritance without reading full chat objects downstream',
  );
  assert.match(
    flowBody,
    /const hiddenMessages = preGenerationMessageMetas/,
    'runGenerationFlow should not call full getChatMessages("0-last") just to collect hidden metadata before generate()',
  );
  assert.doesNotMatch(
    flowBody,
    /const hiddenMessageIds = readMessagesAfterContainer\(\)/,
    'pre-generate hidden id collection must avoid reading every floor body on large imported chats',
  );
});

test('ordinary same-layer send reuses one pre-generate host metadata snapshot before generate starts', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');
  const beforeGenerate = flowBody.slice(0, flowBody.indexOf('const generatePromise = generate'));

  assert.match(
    beforeGenerate,
    /const preGenerationMessageMetas = readMessageMetasAfterContainer\(\);/,
    'ordinary sends should capture one host metadata snapshot before user creation and hidden reveal selection',
  );
  assert.match(
    beforeGenerate,
    /const userData = resolveInheritedUserMessageData\(preGenerationMessageMetas\);/,
    'user data inheritance should reuse the pre-generate metadata snapshot instead of rescanning all floors',
  );
  assert.match(
    beforeGenerate,
    /const hiddenMessages = preGenerationMessageMetas\s*\.filter\(item => item\.is_hidden === true\)/,
    'hidden reveal selection should reuse the same pre-generate metadata snapshot',
  );
  assert.equal(
    (beforeGenerate.match(/readMessageMetasAfterContainer\(\)/g) ?? []).length,
    1,
    'ordinary sends should not repeatedly traverse every host floor before Tavern Helper generate() is requested',
  );
});

test('same-layer generate reveal window follows Tavern depth regex summary layers', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(source, /const SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES = 10;/);
  assert.match(source, /const SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES = 96;/);
  assert.match(source, /const SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS = 120_000;/);
  assert.match(
    flowBody,
    /const hiddenMessages = preGenerationMessageMetas[\s\S]*messageLength: item\.messageLength \?\? 0[\s\S]*hasDepthSummary: item\.hasDepthSummary === true[\s\S]*depthSummaryLength: item\.depthSummaryLength \?\? 0/,
    'reveal selection should use lightweight host metadata including depth-summary estimates',
  );
  assert.match(
    flowBody,
    /collectGenerationRevealMessageIds\(\{[\s\S]*hiddenMessages,[\s\S]*nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,[\s\S]*maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,[\s\S]*maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,/,
    'generation prompt reveal should keep near raw floors and older summary floors for Tavern regex depth rules',
  );
  assert.match(
    flowBody,
    /revealStrategy: 'regex_depth_summary'[\s\S]*nearRawRevealCount:[\s\S]*farSummaryRevealCount:[\s\S]*summaryStructuredHiddenCount:[\s\S]*estimatedPromptCharacters/,
    'trace should report how much of the regex-aware reveal came from near raw floors versus far summaries',
  );
});

test('hide policy always reapplies post-container host hiding even when persisted hide state says ids are already hidden', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const hideBody = extractFunctionBody(source, 'applyHidePolicy');
  const persistBody = extractFunctionBody(source, 'persistHideStateNow');

  assert.match(
    hideBody,
    /const metas = readMessageMetasAfterContainer\(\);[\s\S]*const hidePatch = metas[\s\S]*\.map\(item => \(\{ message_id: item\.message_id, is_hidden: true \}\)\)/,
    'hide policy should derive actual host hide patches from current post-container metadata',
  );
  assert.doesNotMatch(
    hideBody,
    /readPersistedHiddenIdSetForActiveContainer\(\)/,
    'persisted hide_state is a desired state cache and must not suppress host re-hide patches',
  );
  assert.match(
    persistBody,
    /const hiddenIds = readMessageMetasAfterContainer\(\)[\s\S]*\.map\(item => item\.message_id\)/,
    'same-layer hide_state should persist the desired post-container hidden set without reading full story bodies',
  );
});

test('ordinary same-layer send delays assistant placeholder creation until the first stream token', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');
  const beforeGenerate = flowBody.slice(0, flowBody.indexOf('const generatePromise = generate'));

  assert.match(
    beforeGenerate,
    /if \(options\.detachedUserInput === true\) \{[\s\S]*await ensureAssistantPlaceholderReady\('first_token'\);[\s\S]*await options\.onAssistantPlaceholderCreated\?\.\(assistantMessageId\.value\);[\s\S]*\}/,
    'opening detached generation may still pre-create an assistant placeholder because the opening payload needs its id',
  );
  assert.doesNotMatch(
    beforeGenerate.replace(
      /if \(options\.detachedUserInput === true\) \{[\s\S]*?await options\.onAssistantPlaceholderCreated\?\.\(assistantMessageId\.value\);[\s\S]*?\}/,
      '',
    ),
    /await ensureAssistantPlaceholderReady\('first_token'\);/,
    'ordinary sends should not add a second host message write before Tavern Helper generate() starts',
  );
});

test('same-layer generate records stage timings around user creation, reveal, and Tavern Helper generate', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const flowBody = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    source,
    /function createStageTimingTrace\([\s\S]*debugKind: 'stage_timing'[\s\S]*elapsedMs[\s\S]*sinceStartMs/,
    'stage timing trace helper should record both per-stage and since-entry timing',
  );
  assert.match(flowBody, /markStageTiming\('create_user_message_start'\)[\s\S]*await createChatMessages/);
  assert.match(flowBody, /await createChatMessages[\s\S]*markStageTiming\('create_user_message_done'/);
  assert.match(flowBody, /markStageTiming\('hidden_reveal_start'[\s\S]*await setChatMessages/);
  assert.match(flowBody, /await setChatMessages[\s\S]*markStageTiming\('hidden_reveal_done'/);
  assert.match(
    flowBody,
    /markStageTiming\('generate_call_start'\)[\s\S]*const generateCallStartedAt = readTraceNowMs\(\)[\s\S]*const generatePromise = generate/,
  );
  assert.match(
    flowBody,
    /const generatePromise = generate[\s\S]*markStageTiming\('generate_call_returned',\s*\{[\s\S]*syncDurationMs:/,
    'trace should catch synchronous blocking inside Tavern Helper generate() before it returns its promise',
  );
  assert.match(
    flowBody,
    /markStageTiming\('generate_await_start'\)[\s\S]*Promise\.race\(\[generatePromise, cancelPromise\]\)/,
  );
  assert.match(
    flowBody,
    /Promise\.race\(\[generatePromise, cancelPromise\]\)[\s\S]*markStageTiming\('generate_await_resolved'/,
  );
});
