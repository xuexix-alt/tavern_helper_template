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

test('runNativeSendProxy should stop widening the host transcript during normal sends', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const body = extractFunctionBody(source, 'runNativeSendProxy');

  assert.doesNotMatch(
    body,
    /withHostTranscriptVisible\(async \(\) => \{/,
    'native send proxy should not toggle host transcript visibility once lease-backed sending exists',
  );
});

test('native send keeps hidden story floors visible until host generation ends', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sendBody = extractFunctionBody(source, 'runNativeSendProxy');
  const finishBody = extractFunctionBody(source, 'finishNativeSendProxy');
  const hideBody = extractFunctionBody(source, 'queueHidePolicy');

  assert.match(
    source,
    /let nativeGenerationRevealActive = false;/,
    'same-layer native sends need a generation-wide reveal guard for ST prompt assembly and MVU parsing',
  );
  assert.match(
    sendBody,
    /await revealHiddenStoryMessagesForNativeGeneration\('native_send_proxy'\);[\s\S]*await sendToNativeChat\(text, false\);/,
    'normal sends should reveal hidden context before /send + /trigger enters the host native pipeline',
  );
  assert.match(
    finishBody,
    /nativeGenerationRevealActive = false;[\s\S]*queueHidePolicy\(reason\);/,
    'hidden context should stay visible until host generation_end and only then resume same-layer hiding',
  );
  assert.match(
    hideBody,
    /if \(nativeGenerationRevealActive\) return;/,
    'queued hide policy must not hide the just-sent user floor before /trigger builds context',
  );
});

test('native send reveals data for host prompt assembly without visually flashing hidden floors', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const revealBody = extractFunctionBody(source, 'revealHiddenStoryMessagesForNativeGeneration');

  assert.match(
    revealBody,
    /await setChatMessages\(/,
    'hidden message data should still be revealed so native generation can assemble full context',
  );
  assert.doesNotMatch(
    revealBody,
    /hostVisualHideController\.suspend/,
    'native generation should not suspend visual hiding; same-layer transcript owns visible rendering',
  );
});
