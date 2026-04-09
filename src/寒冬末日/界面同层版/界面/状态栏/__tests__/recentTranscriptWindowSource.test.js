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

test('same-layer transcript rebuild reads only the newest four host floors for UI reconstruction', () => {
  const source = read('../useStreamingDemo.ts');
  const rebuildBody = extractFunctionBody(source, 'rebuildTranscript');

  assert.match(source, /const TRANSCRIPT_UI_WINDOW_SIZE = 4;/);
  assert.match(source, /function readRecentChatMessagesForUi\(\)/);
  assert.match(source, /const range = transcriptWindowRange\.value;/);
  assert.match(source, /const \{ startId, endId \} = range;/);
  assert.match(source, /callHostGetChatMessages\(`\$\{startId\}-\$\{endId\}`, \{ hide_state: 'all' \}\)/);
  assert.match(rebuildBody, /const list = readRecentChatMessagesForUi\(\);/);
  assert.doesNotMatch(rebuildBody, /readAllChatMessagesRaw\(\)/);
  assert.doesNotMatch(rebuildBody, /callHostGetChatMessages\(`0-\$\{lastId\}`, \{ hide_state: 'all' \}\)/);
});

test('mvu source options align with the recent transcript window instead of assistant-only floors', () => {
  const source = read('../mvuSourceOptions.ts');

  assert.match(
    source,
    /function isReadableTranscriptLike\(item: TranscriptLike, hasStatData: \(messageId: number\) => boolean\): boolean/,
  );
  assert.match(source, /return hasStatData\(messageId\);/);
  assert.doesNotMatch(source, /item\?\.role === 'assistant'/);
});
