const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const startToken = `function ${functionName}(`;
  let startIndex = source.indexOf(startToken);
  if (startIndex < 0) {
    const match = new RegExp(`function\\s+${functionName}\\s*\\(`).exec(source);
    startIndex = match?.index ?? -1;
  }
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

function extractConstComputedBody(source, constName) {
  const startToken = `const ${constName} = computed(() =>`;
  const startIndex = source.indexOf(startToken);
  assert.notEqual(startIndex, -1, `should find computed ${constName}`);

  const braceStart = source.indexOf('{', startIndex);
  assert.notEqual(braceStart, -1, `should find opening brace for computed ${constName}`);

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

  assert.fail(`should find closing brace for computed ${constName}`);
}

test('BottomComposer choice modal exposes a dedicated MVU variable reroll action with hintable disabled state', () => {
  const source = read('../components/BottomComposer.vue');

  assert.match(
    source,
    /const props = defineProps<\{[\s\S]*canReprocessVariables\?: boolean;[\s\S]*reprocessVariablesHint\?: string;[\s\S]*reprocessVariablesPending\?: boolean;[\s\S]*\}>/,
    'BottomComposer should accept reroll availability, hint, and pending props for the choice modal action',
  );
  assert.match(
    source,
    /defineEmits<\{[\s\S]*\(event: 'reprocess-variables'\): void;[\s\S]*\}>/,
    'BottomComposer should emit a dedicated reprocess-variables event',
  );
  assert.match(
    source,
    /choice-modal-footer[\s\S]*handleReprocessVariablesClick[\s\S]*重试额外模型解析/,
    'BottomComposer should render the native MVU retry action inside the choice modal footer',
  );
  assert.match(
    source,
    /:title="reprocessVariablesHint"/,
    'BottomComposer should surface the disabled-state hint on the reroll button',
  );
});

test('choice modal can be opened even before options are available so reroll remains reachable', () => {
  const composerSource = read('../components/BottomComposer.vue');
  const storyPageSource = read('../pages/StoryPage.vue');

  assert.doesNotMatch(
    composerSource,
    /:disabled="choiceOptions\.length === 0"/,
    'BottomComposer option trigger should not be disabled solely because extracted options are empty',
  );
  assert.match(
    composerSource,
    /:title="choiceOptions\.length > 0 \? `查看选项（\$\{choiceOptions\.length\}）` : '打开选项弹窗，可重试额外模型解析'"/,
    'empty options should still explain that the modal can be opened for the reroll action',
  );
  assert.doesNotMatch(
    storyPageSource,
    /:disabled="\(\s*latestAssistantItem\?\.options \?\? \[\]\s*\)\.length === 0"/,
    'StoryPage toolbar option button should not be disabled while options are still being extracted',
  );
  assert.match(
    storyPageSource,
    /:disabled="!latestAssistantItem"/,
    'StoryPage should only require an assistant floor before opening the option modal',
  );
});

test('choice modal closes immediately after clicking the MVU reroll action', () => {
  const source = read('../components/BottomComposer.vue');
  const handlerBody = extractFunctionBody(source, 'handleReprocessVariablesClick');

  assert.match(
    source,
    /@click="handleReprocessVariablesClick"/,
    'choice modal reroll button should use a local click handler instead of only emitting upward',
  );
  assert.match(
    handlerBody,
    /emit\('reprocess-variables'\)[\s\S]*closeChoiceModal\(\)/,
    'reroll click should emit the parent action and then close the choice modal',
  );
});

test('choice modal exposes a direct latest-assistant image generation action', () => {
  const source = read('../components/BottomComposer.vue');

  assert.match(
    source,
    /canGenerateLatestImage\?: boolean;/,
    'BottomComposer should accept latest-assistant image generation availability',
  );
  assert.match(
    source,
    /\(event: 'generate-latest-image'\): void;/,
    'BottomComposer should emit a dedicated latest-assistant image generation event',
  );
  assert.match(
    source,
    /choice-modal-footer[\s\S]*handleGenerateLatestImageClick[\s\S]*生图/,
    'choice modal footer should render a direct image generation button',
  );
  assert.match(
    source,
    /:disabled="busy \|\| choiceSending \|\| !canGenerateLatestImage"/,
    'direct image generation should be disabled while busy/sending or without a latest assistant floor',
  );
});

test('choice modal direct image action closes the modal and delegates upward', () => {
  const source = read('../components/BottomComposer.vue');
  const handlerBody = extractFunctionBody(source, 'handleGenerateLatestImageClick');

  assert.match(
    handlerBody,
    /emit\('generate-latest-image'\)[\s\S]*closeChoiceModal\(\)/,
    'direct image action should emit upward and close the choice modal immediately',
  );
});

test('StoryPage wires the choice modal reroll button to same-layer MVU state and host mode detection', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(
    source,
    /:can-reprocess-variables="canReprocessVariables"[\s\S]*:reprocess-variables-hint="reprocessVariablesHint"[\s\S]*:reprocess-variables-pending="reprocessVariablesPending"[\s\S]*@reprocess-variables="handleReprocessVariablesFromChoiceModal"/,
    'StoryPage should pass reroll state, hint, pending status, and click handling into BottomComposer',
  );
  assert.match(
    source,
    /function readMvuVariableUpdateMode\(\)[\s\S]*变量更新方式[\s\S]*额外模型解析/,
    'StoryPage should read the host MVU update-mode selector and detect the extra-analysis option',
  );
});

test('StoryPage wires choice-modal direct image generation to latest assistant plugin LLM image flow', () => {
  const source = read('../pages/StoryPage.vue');
  const handlerBody = extractFunctionBody(source, 'handleChoiceModalGenerateLatestImage');

  assert.match(
    source,
    /:can-generate-latest-image="Boolean\(latestAssistantItem\)"/,
    'StoryPage should enable choice-modal direct image generation only when a latest assistant floor exists',
  );
  assert.match(
    source,
    /@generate-latest-image="handleChoiceModalGenerateLatestImage"/,
    'StoryPage should wire the choice modal image button to a local handler',
  );
  assert.match(
    handlerBody,
    /latestAssistantItem\.value\?\.message_id/,
    'handler should target the latest assistant floor instead of composer text',
  );
  assert.match(
    handlerBody,
    /await triggerImageGenerationForMessage\(messageId, \{[\s\S]*hostPoint: null,[\s\S]*afterPrimaryTrigger: async \(\) => \{/,
    'handler should still open the validated native plugin image menu chain',
  );
  assert.match(
    handlerBody,
    /await clickPluginImageGenerationMenuItem\(\)/,
    'handler should auto-select the plugin 图片生成 menu item to trigger LLM image generation directly',
  );
});

test('StoryPage selects the plugin 图片生成 menu item by stable text after opening the native menu', () => {
  const source = read('../pages/StoryPage.vue');
  const findBody = extractFunctionBody(source, 'findPluginImageGenerationMenuItem');
  const clickBody = extractFunctionBody(source, 'clickPluginImageGenerationMenuItem');

  assert.match(
    findBody,
    /\.st-chatu8-click-trigger-bubble[\s\S]*\.st-chatu8-click-trigger-button/,
    'menu selection should search inside the plugin click-trigger bubble/buttons',
  );
  assert.match(findBody, /textContent[\s\S]*includes\('图片生成'\)/, 'selection should target the 图片生成 item text');
  assert.match(clickBody, /\.click\(\)/, 'selection should invoke the plugin button click path');
});

test('StoryPage detects MVU update mode from selected control value, not from both labels appearing nearby', () => {
  const source = read('../pages/StoryPage.vue');
  const body = extractFunctionBody(source, 'readMvuVariableUpdateMode');

  assert.match(body, /const inlineLabel = '随AI输出'/, 'mode detection should know the inline label');
  assert.match(
    body,
    /valueText\.includes\(inlineLabel\)[\s\S]*return 'inline'/,
    'selected “随AI输出” value/text should be classified as inline mode',
  );
  assert.match(
    body,
    /valueText\.includes\(extraAnalysisLabel\)[\s\S]*return 'extra_analysis'/,
    'selected “额外模型解析” value/text should be classified as extra-analysis mode',
  );
  assert.match(
    body,
    /extraAnalysisEnabled\s*===\s*false[\s\S]*return 'inline'/,
    'explicit global extra_analysis=false should be treated as inline mode when available',
  );
  assert.equal(
    /pageText\.includes\(updateModeLabel\)[\s\S]*return 'extra_analysis'/.test(body),
    false,
    'mode detection must not infer extra-analysis just because a section lists both options',
  );
});

test('StoryPage keeps the retry button clickable in inline mode and shows an explanatory toast', () => {
  const source = read('../pages/StoryPage.vue');
  const availabilityBody = extractConstComputedBody(source, 'canReprocessVariables');
  const handlerBody = extractFunctionBody(source, 'handleReprocessVariablesFromChoiceModal');

  assert.equal(
    availabilityBody.includes("mvuVariableUpdateMode.value === 'extra_analysis'"),
    false,
    'choice modal button availability should not be gated solely by extra-analysis mode',
  );
  assert.match(
    handlerBody,
    /mvuVariableUpdateMode\.value\s*===\s*'inline'[\s\S]*toastr\?\.info\?\.[\s\S]*随AI输出[\s\S]*额外模型解析/,
    'inline mode clicks should show an info toast explaining that there is no extra-analysis retry',
  );
  assert.match(
    handlerBody,
    /mvuVariableUpdateMode\.value\s*!==\s*'extra_analysis'[\s\S]*toastr\?\.warning\?/,
    'unknown or unsupported mode should still warn instead of triggering native retry',
  );
});

test('useStreamingDemo exposes a latest-assistant MVU reroll action that triggers the native extra-analysis retry', () => {
  const source = read('../useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'reprocessLatestAssistantVariables');

  assert.match(
    body,
    /await retryMessageExtraAnalysisByNativeMvu\(latestAssistant\.message_id,\s*\{[\s\S]*refreshMessage:\s*true,[\s\S]*\}\)/,
    'reprocessLatestAssistantVariables should call the native MVU extra-analysis retry helper against the latest assistant floor',
  );
  assert.equal(body.includes('regenerateMessageVariablesByModel'), false);
  assert.equal(body.includes('reprocessMessageVariablesById'), false);
  assert.equal(source.includes('reprocessVariablesPending,'), true);
  assert.equal(source.includes('reprocessLatestAssistantVariables,'), true);
});

test('latest-assistant MVU reroll reveals hidden same-layer story floors before native retry builds prompt context', () => {
  const source = read('../useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'reprocessLatestAssistantVariables');
  const revealBody = extractFunctionBody(source, 'revealHiddenStoryMessagesForNativeGeneration');

  assert.match(
    body,
    /await revealHiddenStoryMessagesForNativeGeneration\('mvu_extra_analysis_retry'\)[\s\S]*await retryMessageExtraAnalysisByNativeMvu/,
    'native MVU retry must run after same-layer story floors are temporarily visible to Tavern prompt assembly',
  );
  assert.match(
    body,
    /nativeGenerationRevealActive = false;[\s\S]*releaseHiddenStoryMessagesForNativeGeneration\(\);[\s\S]*queueHidePolicy\('mvu_extra_analysis_retry_done'\)/,
    'manual MVU retry should release the reveal window and restore the same-layer hide policy afterward',
  );
  assert.match(
    revealBody,
    /const messagesToReveal = collectBoundedNativeGenerationRevealIds\(reason\)/,
    'native extra-analysis retry should use the same bounded reveal window as same-layer generation',
  );
});

test('latest-assistant MVU reroll records stage timings around reveal, native retry, and writeback wait', () => {
  const source = read('../useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'reprocessLatestAssistantVariables');

  assert.match(
    body,
    /const traceId = createTraceId\('mvu-extra-analysis'\)[\s\S]*createStageTimingTrace\('reprocessLatestAssistantVariables', traceId\)/,
    'manual extra-analysis retry should have its own trace id and stage timing scope',
  );
  assert.match(
    body,
    /markStageTiming\('hidden_reveal_start'[\s\S]*await revealHiddenStoryMessagesForNativeGeneration\('mvu_extra_analysis_retry'\)[\s\S]*markStageTiming\('hidden_reveal_done'/,
    'trace should bracket the hidden-floor reveal that can block before native retry',
  );
  assert.match(
    body,
    /markStageTiming\('native_retry_click_start'[\s\S]*await retryMessageExtraAnalysisByNativeMvu\(latestAssistant\.message_id,[\s\S]*markStageTiming\('native_retry_click_done'/,
    'trace should bracket the native MVU retry click path where prompt assembly starts',
  );
  assert.match(
    body,
    /markStageTiming\('mvu_writeback_wait_start'[\s\S]*await waitForNativeMvuMessageWriteback\(latestAssistant\.message_id\)[\s\S]*markStageTiming\('mvu_writeback_wait_done'/,
    'trace should separate native retry dispatch from MVU writeback waiting',
  );
});

test('latest-assistant MVU reroll reveal is bounded before native prompt assembly', () => {
  const source = read('../useStreamingDemo.ts');
  const helperBody = extractFunctionBody(source, 'collectBoundedNativeGenerationRevealIds');

  assert.match(
    helperBody,
    /readMessageMetasAfterContainer\(\)[\s\S]*messageLength: item\.messageLength \?\? 0[\s\S]*hasDepthSummary: item\.hasDepthSummary === true[\s\S]*depthSummaryLength: item\.depthSummaryLength \?\? 0/,
    'bounded native reveal should rely on lightweight metadata and depth-summary estimates rather than full helper reads',
  );
  assert.match(
    helperBody,
    /collectGenerationRevealMessageIds\(\{[\s\S]*hiddenMessages,[\s\S]*nearRawRevealMessages: SAME_LAYER_GENERATION_REVEAL_NEAR_RAW_MESSAGES,[\s\S]*maxFarSummaryMessages: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_MESSAGES,[\s\S]*maxFarSummaryCharacters: SAME_LAYER_GENERATION_REVEAL_MAX_FAR_SUMMARY_CHARS,/,
    'manual extra-analysis retry should reveal near raw floors plus older summary floors before clicking native retry',
  );
  assert.match(
    helperBody,
    /recordLifecycleTrace\('nativeGenerationReveal', 'bounded_reveal_prepared'[\s\S]*revealStrategy: 'regex_depth_summary'[\s\S]*nearRawRevealCount:[\s\S]*farSummaryRevealCount:/,
    'bounded native reveal should leave trace evidence for the selected regex-aware window',
  );
});

test('mvu_reprocess native retry helper clicks MVU own retry button instead of generating or parsing manually', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../mvu_reprocess.ts'), 'utf8');
  const start = source.indexOf('export async function retryMessageExtraAnalysisByNativeMvu');
  const end = source.indexOf('export async function reprocessMessageVariablesById', start);
  assert.notEqual(start, -1, 'should find retryMessageExtraAnalysisByNativeMvu');
  assert.notEqual(end, -1, 'should find following reprocessMessageVariablesById');
  const body = source.slice(start, end);

  assert.match(source, /重试额外模型解析/, 'helper should target the native MVU retry label');
  assert.match(source, /#qr--bar[\s\S]*\.qr--button/, 'helper should prefer the live Quick Reply bar button');
  assert.match(
    body,
    /getChatMessages\(targetMessageId,\s*\{\s*hide_state:\s*'all'\s*\}\)/,
    'native retry helper should read the target assistant with hidden messages included before clicking retry',
  );
  assert.match(
    body,
    /messageText[\s\S]*trim\(\)[\s\S]*return \{ status: 'blocked', reason: 'empty_message'/,
    'native retry helper should block empty assistant text instead of sending an empty story to extra analysis',
  );
  assert.match(body, /\.click\(\)/, 'helper should trigger the native UI click path');
  assert.equal(body.includes('await generate('), false, 'native retry helper must not call Tavern Helper generate');
  assert.equal(body.includes('generateRaw('), false, 'native retry helper must not call generateRaw');
  assert.equal(body.includes('Mvu.parseMessage('), false, 'native retry helper must not manually parse model output');
  assert.equal(
    body.includes('Mvu.replaceMvuData('),
    false,
    'native retry helper must not manually rewrite message variables',
  );
});
