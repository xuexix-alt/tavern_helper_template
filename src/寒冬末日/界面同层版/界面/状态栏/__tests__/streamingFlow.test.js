const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
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

test('runDemo routes normal sends through the same-layer submit owner instead of native send proxy', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'runDemo');

  assert.equal(
    body.includes("await submitPromptViaSameLayer(prompt, 'ui');"),
    true,
    'runDemo should delegate to the shared same-layer submit owner so stream tokens can patch the visible card',
  );
  assert.equal(
    body.includes('runNativeSendProxy(prompt)'),
    false,
    'runDemo should no longer bypass the local streaming pipeline via runNativeSendProxy',
  );
});

test('rebuildTranscript no longer synthesizes a payload-backed opening card after the detached opening refactor', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const shouldRenderOpeningFromPayload ='),
    false,
    'opening rebuild logic should not keep the old payload-result synthetic branch anymore',
  );
  assert.equal(
    source.includes('buildOpeningTranscriptItem(openingPayload.value, openingPreset.value, status.value)'),
    false,
    'opening rebuild logic should not build a synthetic opening transcript card anymore',
  );
  assert.equal(
    source.includes('findOpeningResultChatMessage('),
    false,
    'opening rebuild logic should no longer search for a dedicated opening result floor',
  );
  assert.equal(
    source.includes('if (containerId === 0 && all.length === 0) {'),
    false,
    'opening rebuild logic should leave the transcript empty until a real first assistant floor exists',
  );
});

test('buildStreamStageHtml keeps streaming output in a readable preformatted block instead of final html formatting', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'buildStreamStageHtml');

  assert.equal(
    body.includes('buildFinalHtml(source, message_id)'),
    false,
    'stream-stage rendering should not reuse final-html formatting on partial token output',
  );
  assert.equal(
    body.includes('return `<pre class="stream-stage-pre">${escapeHtml('),
    true,
    'stream-stage rendering should escape and render readable preformatted text',
  );
  assert.equal(
    body.includes(".replace(/<[^>]+>/g, '')"),
    false,
    'stream-stage rendering should not strip generic tag-like content such as <content> blocks',
  );
});

test('rebuildTranscript allows the persisted opening result to enter the normal transcript loop as the first assistant floor', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('if (containerId === 0 && isOpeningResult) continue;'),
    false,
    'opening workbench should no longer drop the persisted opening result from the normal transcript loop',
  );
});

test('generateOpening no longer creates a dedicated opening result placeholder before detached generation', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const placeholderResultId = await upsertOpeningResultMessage(\'\', \'none\');'),
    false,
    'simplified opening generation should no longer maintain a dedicated opening result placeholder',
  );
});

test('opening setup visibility stays tied to successful opening completion instead of generic story-floor existence', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('const result = hasStoryMessagesBeyondOpening.value === false;'),
    false,
    'opening modal visibility should not be turned off simply because a failed assistant floor exists',
  );
  assert.equal(
    source.includes('if (hasSuccessfulOpeningAssistant.value) return false;'),
    true,
    'opening modal visibility should continue to hinge on whether a successful assistant truly exists',
  );
});

test('normal assistant streaming uses displayed-message html instead of escaping regex output as raw code', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes(
      'const streamHtml = isDemoAssistant\n    ? buildFinalHtml(renderSource, input.id, strippedRenderSource)\n    : buildFinalHtml(displayRenderSource, input.id, strippedRenderSource);',
    ),
    true,
    'normal assistant streaming should render through the standard displayed-message html path so regex replacements show their effect',
  );
});

test('stream-demo wrapped assistant streaming also uses displayed-message html for extracted content instead of raw preformatted code', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes(
      'const streamHtml = isDemoAssistant\n    ? buildFinalHtml(renderSource, input.id, strippedRenderSource)\n    : buildFinalHtml(displayRenderSource, input.id, strippedRenderSource);',
    ),
    true,
    'stream-demo assistant streaming should render extracted content through displayed-message html so regenerate/send flows do not expose regex code',
  );
});
