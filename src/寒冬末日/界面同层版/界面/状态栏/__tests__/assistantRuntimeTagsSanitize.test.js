/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readSource(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const startToken = `function ${functionName}(`;
  const startIndex = source.indexOf(startToken);
  assert.notEqual(startIndex, -1, `should find ${functionName}`);
  const paramsStart = startIndex + startToken.length - 1;
  let parenDepth = 0;
  let paramsClosed = false;
  let braceStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) paramsClosed = true;
    }
    if (paramsClosed && char === '{') {
      braceStart = index;
      break;
    }
  }
  assert.notEqual(braceStart, -1, `should find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, index);
    }
  }
  assert.fail(`should find closing brace for ${functionName}`);
}

test('buildFinalHtml leaves assistant runtime tags to Tavern display regex instead of local details wrappers', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'buildFinalHtml');

  assert.doesNotMatch(
    source,
    /function sanitizeAssistantRuntimeTagsForDisplay\(/,
    'same-layer should not own <content>/<thinking>/<UpdateVariable> display formatting',
  );
  assert.doesNotMatch(
    body,
    /sanitizeAssistantRuntimeTagsForDisplay\(/,
    'buildFinalHtml should pass runtime tags through for Tavern native display regexes',
  );
  assert.match(
    body,
    /const renderSourceForDisplay = sanitizeRawImageTagsInHtml\(renderSource \|\| '\(空回复\)'\);/,
    'only raw <image> tags should be pre-sanitized before Tavern display formatting',
  );
  assert.match(
    body,
    /formatAsDisplayedMessage\(renderSourceForDisplay, \{ message_id \}\)/,
    'Tavern display formatting should remain the owner of runtime-tag beautification',
  );
  assert.match(
    body,
    /renderSource: artifactSource \?\? renderSource,/,
    'artifact injection should still see the original raw source for prompt-token matching',
  );
});

test('streaming preview does not collapse runtime tags into custom assistant-runtime-details blocks', () => {
  const source = readSource('useStreamingDemo.ts');
  const previewSanitizerBody = extractFunctionBody(source, 'sanitizeAssistantRuntimeTagsForStreamingPreview');
  const previewBody = extractFunctionBody(source, 'buildStreamingPreviewHtml');

  assert.match(
    previewSanitizerBody,
    /return String\(source \?\? ''\);/,
    'streaming preview should leave runtime tags available to the regex/display layer',
  );
  assert.doesNotMatch(
    previewBody,
    /assistant-runtime-details|assistant-runtime-thinking|assistant-runtime-variable/,
    'streaming preview should not create sparse custom runtime detail blocks',
  );
});
