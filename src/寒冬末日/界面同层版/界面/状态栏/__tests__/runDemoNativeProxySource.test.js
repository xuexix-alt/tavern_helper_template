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
    /const result = String\(await generatePromise\)\.trim\(\);[\s\S]*is_hidden: true/,
    'hidden story floors should be restored after generate() resolves',
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
