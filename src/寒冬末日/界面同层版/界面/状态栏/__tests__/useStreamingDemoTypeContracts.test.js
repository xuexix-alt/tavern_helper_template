const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('useStreamingDemo keeps host runtime fields and placeholder reasons typed explicitly', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /type AssistantPlaceholderEnsureReason =[\s\S]*'first_token'[\s\S]*'finalize_fallback'[\s\S]*'native_reasoning'[\s\S]*`signal_\$\{string\}`/,
    'placeholder creation reasons should include native reasoning and signal finalization paths',
  );
  assert.match(
    source,
    /async function ensureAssistantPlaceholderReady\(reason: AssistantPlaceholderEnsureReason\)/,
    'ensureAssistantPlaceholderReady should use the shared reason union instead of a narrow inline union',
  );
  assert.match(
    source,
    /const generationCancelRequested = ref<boolean>\(false\);/,
    'generation cancel state should stay boolean after reset assignments',
  );
  assert.match(
    source,
    /const chatMessage = getChatMessages\(normalizedId, \{ hide_state: 'all' \}\)\?\.\[0\] as[\s\S]*\{\s*message\?: unknown;\s*mes\?: unknown\s*\}[\s\S]*undefined;/,
    'MVU writeback merge should explicitly type the host mes fallback field',
  );
  assert.match(
    source,
    /function hasGenerationSignalFinalizedVisibleContent\(\): boolean/,
    'signal-finalized catch recovery should be hidden behind a boolean helper so TS does not narrow it to false',
  );
  assert.doesNotMatch(
    source,
    /const signalFinalizedVisibleContent =\s*generationSignalFinalized === true &&/,
    'runGenerationFlow catch block should not compare a locally narrowed false literal against true',
  );
  assert.doesNotMatch(
    source,
    /generationCancelRequested\.value === true/,
    'runGenerationFlow catch block should not compare a reset cancel ref against true',
  );
});
