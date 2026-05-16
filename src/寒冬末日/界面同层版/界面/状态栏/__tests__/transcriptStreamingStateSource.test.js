const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('persisted stream-demo messages only stay in the streaming branch while the current same-layer session is actually busy', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function shouldTreatLatestAssistantAsStreaming\(input: \{[\s\S]{0,220}busy: boolean;[\s\S]{0,220}\}\)/,
    'useStreamingDemo should centralize latest-assistant streaming state behind a helper that also sees busy state',
  );
  assert.match(
    source,
    /if \(input\.isLatest !== true\) return false;[\s\S]{0,120}if \(input\.phase !== 'stream'\) return false;[\s\S]{0,120}return input\.status === 'streaming' \|\| input\.busy === true;/,
    'persisted `<demo_phase>stream</demo_phase>` should only keep the latest card in stream mode while the current session is still busy',
  );
  assert.doesNotMatch(
    source,
    /input\.latestAssistantId === input\.id && \(input\.status === 'streaming' \|\| phase === 'stream'\)/,
    'buildTranscriptItem should stop treating every persisted `phase=stream` latest assistant as actively streaming',
  );
  assert.doesNotMatch(
    source,
    /const isStreaming = isLatest && \(status\.value === 'streaming' \|\| item\.phase === 'stream'\);/,
    'syncTranscriptFlags should not keep a reloaded latest assistant in the streaming branch once the same-layer session is idle',
  );
});
