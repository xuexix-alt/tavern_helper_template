const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
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
    /choice-modal-footer[\s\S]*reprocess-variables[\s\S]*重新roll变量/,
    'BottomComposer should render the reroll button inside the choice modal footer',
  );
  assert.match(
    source,
    /:title="reprocessVariablesHint"/,
    'BottomComposer should surface the disabled-state hint on the reroll button',
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

test('useStreamingDemo exposes a latest-assistant MVU reroll action that reuses local reprocessMessageVariablesById', () => {
  const source = read('../useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'reprocessLatestAssistantVariables');

  assert.match(
    body,
    /await reprocessMessageVariablesById\(latestAssistant\.message_id,\s*\{[\s\S]*force:\s*true,[\s\S]*refreshMessage:\s*true,[\s\S]*\}\)/,
    'reprocessLatestAssistantVariables should call the local MVU reprocess helper against the latest assistant floor',
  );
  assert.equal(source.includes('reprocessVariablesPending,'), true);
  assert.equal(source.includes('reprocessLatestAssistantVariables,'), true);
});
