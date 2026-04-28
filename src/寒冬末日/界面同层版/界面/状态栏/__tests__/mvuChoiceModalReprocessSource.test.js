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
  assert.equal(body.includes('Mvu.replaceMvuData('), false, 'native retry helper must not manually rewrite message variables');
});
