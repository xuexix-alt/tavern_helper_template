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

test('runDemo routes normal sends through the same-layer generate flow', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'runDemo');
  const submitBody = extractFunctionBody(source, 'submitPromptViaSameLayer');

  assert.equal(
    body.includes("await submitPromptViaSameLayer(prompt, 'ui');"),
    true,
    'runDemo should delegate normal sends to the same-layer submit helper',
  );
  assert.equal(
    body.includes('runNativeSendProxy(prompt)'),
    false,
    'runDemo should not use the native /send + /trigger proxy as the ordinary send path',
  );
  assert.equal(
    submitBody.includes('await runGenerationFlow({ prompt: text, createUser: true });'),
    true,
    'submitPromptViaSameLayer should create the user floor and generate through runGenerationFlow',
  );
  assert.equal(
    submitBody.includes('runNativeSendProxy(text)'),
    false,
    'same-layer submit should not enter the native send proxy',
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
    source.includes("const placeholderResultId = await upsertOpeningResultMessage('', 'none');"),
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

test('normal assistant streaming renders a throttled regex preview without final display formatting', () => {
  const useStreamingSource = readSource('useStreamingDemo.ts');
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(
    useStreamingSource,
    /const STREAMING_PREVIEW_RENDER_INTERVAL_MS = 320;/,
    'streaming regex preview should have a slower render cadence than host chat patching',
  );
  assert.match(
    useStreamingSource,
    /const streamHtml = isCurrentStreamingItem[\s\S]{0,220}buildStreamingPreviewHtml/,
    'current streaming items should build a lightweight regex preview html payload',
  );
  assert.doesNotMatch(
    extractFunctionBody(useStreamingSource, 'buildStreamingPreviewHtml'),
    /formatAsDisplayedMessage|buildFinalHtml|appendChatu8ArtifactsToHtml|applyTranscriptArtifacts/,
    'streaming preview must not use final display formatting or image artifact attachment',
  );
  assert.match(
    cardSource,
    /v-if="item\.isStreaming"[\s\S]{0,300}<StreamRenderer/,
    'TranscriptMessageCard streaming branch should delegate the preview to the StreamRenderer component',
  );
  assert.match(
    cardSource,
    /import StreamRenderer from '\.\/StreamRenderer\.vue';/,
    'TranscriptMessageCard should import the dedicated StreamRenderer preview component',
  );
});

test('transcript item html prefers host-rendered mes_text when available', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function readHostRenderedMessageHtml\(/,
    'same-layer transcript should have a helper for reading Tavern-rendered message HTML',
  );
  assert.match(
    source,
    /const hostRenderedHtml = buildHostRenderedHtml\(\s*readHostRenderedMessageHtml\(input\.id\),\s*displayRenderSource,\s*input\.id,\s*input\.raw,\s*\);/,
    'buildTranscriptItem should read and hydrate the host-rendered mes_text HTML for the target floor',
  );
  assert.match(
    source,
    /hostRenderedHtml\s*\|\|\s*\(isCurrentStreamingItem \? streamHtml : buildFinalHtml/,
    'final display HTML should prefer Tavern-rendered HTML before falling back to local formatting',
  );
  assert.match(
    source,
    /html\.includes\(STREAM_DEMO_MARKER\)/,
    'host-rendered stream-demo wrapper HTML should be ignored so local fallback can sanitize wrapper tags',
  );
  assert.match(
    source,
    /isHostRenderedStreamDemoWrapperOnlyHtml\(html\)/,
    'host-rendered stream-demo phase-only wrapper residue should be ignored so regenerate/MVU refresh cannot replace正文 with streaming done',
  );
});

test('stream-demo wrapped assistant streaming keeps the runtime-tag sanitizer for the streamHtml fallback path', () => {
  const useStreamingSource = readSource('useStreamingDemo.ts');

  assert.match(
    useStreamingSource,
    /function sanitizeAssistantRuntimeTagsForStreamingPreview/,
    'the streamHtml fallback path should still have a dedicated runtime-tag sanitizer',
  );
  assert.match(
    extractFunctionBody(useStreamingSource, 'sanitizeAssistantRuntimeTagsForStreamingPreview'),
    /buildStreamingPendingDetails\('thinking'[\s\S]{0,260}buildStreamingPendingDetails\('variable'[\s\S]{0,260}buildStreamingPendingDetails\('generic'/,
    'unfinished XML/runtime blocks should become a pending placeholder instead of leaking raw tags',
  );
});

test('StreamRenderer streaming preview faithfully reflects output and strips chatu8 prompt tokens', () => {
  const streamRendererSource = readSource('streamRendererDisplay.ts');
  const componentSource = readSource('components/StreamRenderer.vue');

  // 模式 B：流式预览只跑酒馆 display 正则 + 防御性剥离 image### token，不自维护业务标签解析。
  assert.match(
    streamRendererSource,
    /applyRegexForDisplay\(source, role\)/,
    'the streaming preview helper should apply the Tavern display regex so regex-driven HTML wins',
  );
  assert.match(
    streamRendererSource,
    /stripVisibleChatu8PromptTokensHtml\(/,
    'the streaming preview helper should strip visible chatu8 prompt tokens before reaching the DOM',
  );
  assert.doesNotMatch(
    streamRendererSource,
    /sanitizeAssistantRuntimeTagsForStreamingPreview|buildStreamingPendingDetails/,
    'StreamRenderer must not maintain its own business-tag rendering set',
  );
  assert.match(
    componentSource,
    /buildStreamRendererHtml\(props\.message, props\.role\)/,
    'StreamRenderer.vue should consume the snapshot message via the pure render helper',
  );
});

test('opening stream-demo system floors still build stream html instead of waiting forever', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const isDemoAssistant = isStreamDemoMessage\(input\.raw\);/,
    'stream-demo parsing should be driven by message content, not only assistant role',
  );
  assert.doesNotMatch(
    source,
    /const isDemoAssistant = input\.role === 'assistant' && isStreamDemoMessage\(input\.raw\);/,
    'system opening stream-demo floors must not be excluded from stream html construction',
  );
  assert.doesNotMatch(
    source,
    /const isCurrentStreamingItem =\s*input\.role === 'assistant' &&/,
    'current streaming item detection should include opening/system stream floors',
  );
});

test('incremental stream tokens are coalesced before patching host chat and transcript html', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'bindGenerationEvents');

  assert.match(
    source,
    /const STREAM_TRANSCRIPT_PATCH_INTERVAL_MS = 80;/,
    'streaming should have an explicit low-latency coalescing interval instead of patching every token',
  );
  assert.match(
    source,
    /function scheduleStreamTranscriptPatch\(/,
    'streaming should schedule a coalesced transcript patch for token bursts',
  );
  assert.match(
    body,
    /scheduleStreamTranscriptPatch\(\);/,
    'incremental token listener should schedule a coalesced patch',
  );
  assert.doesNotMatch(
    body,
    /await patchAssistantMessage\('stream'\);/,
    'incremental token listener should not write host chat and rebuild html once per token',
  );
});

test('finalization cancels any pending coalesced stream patch before writing the done message', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    body,
    /cancelScheduledStreamTranscriptPatch\(\);[\s\S]*await patchAssistantMessage\('done'\);/,
    'done patch should not race with a delayed stream patch after generation has completed',
  );
});

test('host generation-ended signals can finalize the active streaming message before generate promise settles', () => {
  const source = readSource('useStreamingDemo.ts');
  const bindBody = extractFunctionBody(source, 'bindGenerationEvents');
  const hostBody = extractFunctionBody(source, 'handleHostRefreshEvent');

  assert.match(
    source,
    /async function finalizeAssistantMessageFromSignal/,
    'same-layer runtime should expose an idempotent signal finalizer for truncated or delayed generate() flows',
  );
  assert.match(
    source,
    /function normalizeSignalFinalText[\s\S]{0,220}\^\\d\{1,8\}\$/,
    'host generation-ended numeric payloads should not be mistaken for final assistant text',
  );
  assert.match(
    bindBody,
    /queueGenerationFinalizeFromSignal\('iframe\.generation_ended'/,
    'iframe generation-ended should queue a done patch instead of only recording finalText',
  );
  assert.match(
    hostBody,
    /queueGenerationFinalizeFromSignal\('host\.generation_ended'/,
    'host generation-ended should also queue a done patch when busy refresh events arrive',
  );
  assert.match(
    source,
    /if \(generationSignalFinalizeTimer\) \{[\s\S]{0,320}await finalizeAssistantMessageFromSignal\(queuedReason\);/,
    'runGenerationFlow should flush a queued ended signal before treating a late generate() rejection as a real error',
  );
});

test('runGenerationFlow triggers one explicit chat save after the lifecycle emit so done + MVU + images land atomically', () => {
  const source = readSource('useStreamingDemo.ts');

  // done 分支：runQueuedPostDoneAssistantSideEffects 之后紧接着一次显式 save，
  // 避免 saveChatConditionalDebounced 的 1s 窗口丢失。
  assert.match(
    source,
    /await runQueuedPostDoneAssistantSideEffects[\s\S]{0,800}await flushExplicitChatSave\('generation_done'\)/,
    'runGenerationFlow should flush an explicit save after the lifecycle emit so done + MVU + image writes land together',
  );

  // error 分支：失败 done patch 也要 flush，保证 "生成失败：xxx" 不会停留在 <demo_phase>stream>。
  assert.match(
    source,
    /await patchAssistantMessage\('done'\);\s*await flushExplicitChatSave\('generation_error'\)/,
    'error recovery should also flush an explicit save so the "生成失败" message is persisted',
  );
});

test('useStreamingDemo installs a save guardian at mount and uninstalls at unmount or same-layer disable', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /saveGuardian = installSameLayerSaveGuardian\(\{\s*onStateChange: handleSaveGuardianHealth,?\s*\}\);/,
    'save guardian should be installed inside onMounted with an onStateChange callback',
  );
  assert.match(source, /saveGuardian\?\.uninstall\(\);/, 'save guardian should be uninstalled on same-layer teardown');
  assert.match(
    source,
    /import \{[\s\S]{0,160}installSameLayerSaveGuardian[\s\S]{0,160}\} from '\.\/samelayerSaveGuardian'/,
    'useStreamingDemo should import the guardian helpers from the guardian module',
  );
});

test('useStreamingDemo installs the image generation event bridge so plugin failures surface as toasts instead of silent console errors', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /imageGenerationBridge = createImageGenerationEventBridge\(\{/,
    'image generation bridge should be installed in onMounted',
  );
  assert.match(
    source,
    /toastr\?\.warning\?\.\(message, '生图失败'/,
    'failure toast should be dispatched through the bridge notifyError callback',
  );
  assert.match(
    source,
    /imageGenerationBridge\?\.uninstall\(\);/,
    'bridge should be uninstalled on teardown to avoid leaking event listeners',
  );
});
