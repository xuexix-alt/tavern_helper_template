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

test('runDemo routes normal sends through controlled generation flow instead of native send proxy', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'runDemo');

  assert.equal(
    body.includes('await runGenerationFlow({ prompt, createUser: true });'),
    true,
    'runDemo should use the controlled generation flow so stream tokens can patch the visible card',
  );
  assert.equal(
    body.includes('runNativeSendProxy(prompt)'),
    false,
    'runDemo should no longer bypass the local streaming pipeline via runNativeSendProxy',
  );
});

test('rebuildTranscript keeps opening on payload-backed rendering while opening generation is active', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("const shouldRenderOpeningFromPayload =\n          openingPayload.value.state === 'generating' ||"),
    true,
    'opening rebuild logic should prioritize payload-backed rendering during generating state',
  );
  assert.equal(
    source.includes(
      "const shouldRenderOpeningFromPayload =\n          openingPayload.value.state === 'generating' ||\n          openingPayload.value.state === 'ready';",
    ),
    false,
    'opening rebuild logic should not blindly force payload-backed rendering for every ready state',
  );
  assert.equal(
    source.includes('openingPayload.value.state === \'ready\' && hasRenderableOpeningPayloadResult'),
    true,
    'opening rebuild logic should only keep payload-backed rendering in ready state when the payload still carries a renderable result',
  );
  assert.equal(
    source.includes('if (shouldRenderOpeningFromPayload) {'),
    true,
    'opening rebuild logic should branch on the payload-backed rendering flag',
  );
  assert.equal(
    source.includes("(openingPayload.value.state !== 'placeholder' && !hasPersistedOpeningResult)"),
    false,
    'opening rebuild logic should not keep rendering a synthetic opening card during configuring reload states with no result',
  );
  assert.equal(
    source.includes(
      'const opening =\n            findOpeningResultChatMessage(all) ?? all.find(message => Math.trunc(Number(message?.message_id)) === containerId);',
    ),
    true,
    'opening rebuild fallback should prefer the real persisted opening result message when payload-backed rendering is unavailable',
  );
});

test('bindOpeningGenerationListeners listens to incremental iframe token events used by controlled generation', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'bindOpeningGenerationListeners');

  assert.equal(
    body.includes('iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY'),
    true,
    'opening generation listeners should subscribe to incremental iframe token events',
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

test('rebuildTranscript skips persisted opening result message in normal transcript loop for opening workbench', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes('if (containerId === 0 && isOpeningResult) continue;'),
    true,
    'opening workbench should keep the visible opening card anchored at #0 instead of showing the persisted result as a normal later floor',
  );
});

test('buildOpeningTranscriptItem does not fall back to a synthetic empty opening sentence when no opening result exists', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.equal(
    source.includes("const openingRaw = String(payload.result?.raw ?? '').trim();"),
    true,
    'opening transcript item should read the full raw output first',
  );
  assert.equal(
    source.includes("const renderSource = openingRaw || (isOpeningStreaming ? '（流式）等待中' : '');"),
    true,
    'opening transcript item should not invent a non-stream placeholder sentence during reload or configuring states',
  );
  assert.equal(
    source.includes('开局尚未生成，请先完成开局配置。'),
    false,
    'opening transcript item should no longer hardcode the synthetic empty opening sentence',
  );
  assert.equal(
    source.includes("const regexText = applyRegexForDisplay(renderSource, 'assistant');"),
    true,
    'opening transcript item should still pass full raw opening text through display regex handling',
  );
  assert.equal(
    source.includes('const displayedHtml = buildFinalHtml(renderSource, 0, renderSource);'),
    true,
    'opening transcript item should prepare standard displayed-message html for the raw opening source',
  );
  assert.equal(
    source.includes('streamHtml: displayedHtml,'),
    true,
    'opening transcript item should reuse the normal displayed-message html during streaming',
  );
  assert.equal(
    source.includes('finalHtml: displayedHtml,'),
    true,
    'opening transcript item should reuse the normal displayed-message html after generation completes',
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
      "const streamHtml = isDemoAssistant\n    ? buildFinalHtml(renderSource, input.id, strippedRenderSource)\n    : buildFinalHtml(displayRenderSource, input.id, strippedRenderSource);",
    ),
    true,
    'stream-demo assistant streaming should render extracted content through displayed-message html so regenerate/send flows do not expose regex code',
  );
});
