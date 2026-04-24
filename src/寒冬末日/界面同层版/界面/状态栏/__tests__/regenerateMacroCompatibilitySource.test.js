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

test('runGenerationFlow collects a forced latest hidden user reveal id for regenerate compatibility', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(body, /collectGenerationRevealMessageIds\(/);
  assert.match(body, /latestUserItem\.value\?\.hidden === true/);
  assert.match(body, /latestUserItem\.value\.message_id/);
});

test('runGenerationFlow emits reveal-window diagnostics with raw hidden ids and final reveal ids', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(body, /recordLifecycleTrace\(\s*'runGenerationFlow',\s*'reveal_window_prepared'/);
  assert.match(body, /hiddenMessageIds/);
  assert.match(body, /latestHiddenUserMessageId/);
  assert.match(body, /revealMessageIds/);
  assert.match(body, /JSON\.stringify/);
});
