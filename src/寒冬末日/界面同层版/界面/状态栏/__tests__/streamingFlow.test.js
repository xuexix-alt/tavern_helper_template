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

test('stream-demo wrapped assistant streaming leaves runtime XML to Tavern display regex', () => {
  const useStreamingSource = readSource('useStreamingDemo.ts');
  const previewBody = extractFunctionBody(useStreamingSource, 'sanitizeAssistantRuntimeTagsForStreamingPreview');

  assert.match(
    useStreamingSource,
    /function sanitizeAssistantRuntimeTagsForStreamingPreview/,
    'the streamHtml fallback path should keep a narrow hook for preview normalization',
  );
  assert.doesNotMatch(
    previewBody,
    /buildStreamingPendingDetails|assistant-runtime-variable|assistant-runtime-thinking|<UpdateVariable|<thinking|<content/,
    'same-layer preview should not maintain business XML rendering rules',
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
  assert.match(
    componentSource,
    /<div class="stream-renderer__body" v-html="displayHtml"><\/div>/,
    'StreamRenderer v-html boundary should be a block-capable container for Tavern regex HTML',
  );
  assert.doesNotMatch(
    componentSource,
    /<span class="stream-renderer__body" v-html="displayHtml">/,
    'StreamRenderer must not mount block-level Tavern regex HTML inside an inline span',
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

test('same-layer stream patches use Tavern reasoning visible text instead of raw think blocks', () => {
  const source = readSource('useStreamingDemo.ts');
  const patchBody = extractFunctionBody(source, 'patchAssistantMessage');
  const runBody = extractFunctionBody(source, 'runGenerationFlow');
  const bindBody = extractFunctionBody(source, 'bindGenerationEvents');

  assert.match(
    source,
    /import \{[\s\S]{0,260}createReasoningStreamState[\s\S]{0,260}extractNativeReasoningText[\s\S]{0,260}readTavernReasoningConfig[\s\S]{0,260}resolveReasoningVisibleText[\s\S]{0,260}\} from '\.\/reasoningStreamBridge';/,
    'same-layer streaming should import the reasoning bridge instead of parsing think blocks in the renderer',
  );
  assert.match(
    runBody,
    /reasoningStreamState\.reset\(readTavernReasoningConfig\(\)\);/,
    'each generation should refresh the Tavern reasoning prefix/suffix settings',
  );
  assert.match(
    bindBody,
    /reasoningStreamState\.appendRawToken\(tokenText\);/,
    'incremental raw tokens should update the reasoning bridge before the coalesced patch',
  );
  assert.match(
    bindBody,
    /iframe_events\.STREAM_TOKEN_RECEIVED_FULLY/,
    'full streaming text should be observed because Tavern may temporarily move reasoning out of message.mes',
  );
  assert.match(
    bindBody,
    /reasoningStreamState\.setRawText\(fullText\);/,
    'full streaming text should replace the reasoning bridge raw buffer instead of relying only on token increments',
  );
  assert.match(
    patchBody,
    /resolveReasoningVisibleText\(\s*reasoningStreamState,\s*phase === 'done' \? finalText\.value : '',\s*phase,\s*\)/,
    'stream-demo patches should write the reasoning-visible body into the assistant message wrapper',
  );
  assert.match(
    bindBody,
    /tavern_events\.STREAM_REASONING_DONE/,
    'same-layer should listen to Tavern native reasoning completion because reasoning may not arrive as visible tokens',
  );
  assert.match(
    patchBody,
    /nativeReasoningText\.value\.trim\(\)/,
    'patchAssistantMessage should use Tavern parsed reasoning state when no visible body is available',
  );
  assert.match(
    patchBody,
    /phase === 'stream' && \(hasNativeReasoning \|\| reasoningStreamState\.reasoningState === 'thinking'\) \? '思考中' : ''/,
    'reasoning-only streaming should display thinking only after reasoning tokens or native reasoning arrive',
  );
  assert.doesNotMatch(
    patchBody,
    /phase === 'stream' \? '思考中' : ''/,
    'initial stream placeholder should not say thinking before any reasoning evidence arrives',
  );
  assert.match(
    source,
    /buildStreamDemoMessage\('流式请求中', 'stream'\)/,
    'fresh assistant placeholders should say the stream request is pending before any token arrives',
  );
  assert.doesNotMatch(
    patchBody,
    /思考完成，等待正文/,
    'done patches should not persist a synthetic waiting-for-content sentence into the assistant story body',
  );
  assert.doesNotMatch(
    patchBody,
    /phase === 'done' \? finalText\.value \|\| streamText\.value : streamText\.value/,
    'patchAssistantMessage must not write raw think stream text directly into the visible assistant body',
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
    source,
    /function isVariableUpdateOnlyGenerationText/,
    'same-layer generation-ended handling should detect MVU extra-analysis payloads that contain only UpdateVariable XML',
  );
  assert.match(
    extractFunctionBody(source, 'normalizeSignalFinalText'),
    /isVariableUpdateOnlyGenerationText\(normalized\)/,
    'MVU extra-analysis UpdateVariable output must not overwrite the already streamed assistant正文',
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

test('native MVU writeback is merged inside the stream-demo content wrapper so image anchors keep the same raw message shape', () => {
  const source = readSource('useStreamingDemo.ts');
  const mergeBody = extractFunctionBody(source, 'mergeMvuWritebackBlocksIntoAssistantText');

  assert.match(
    mergeBody,
    /isStreamDemoMessage\(existing\)/,
    'MVU writeback merging should detect same-layer stream-demo wrapped assistant floors',
  );
  assert.match(
    mergeBody,
    /lastIndexOf\(['"]<\/content>['"]\)/,
    'MVU writeback should be inserted before the stream-demo closing content tag',
  );
  assert.match(
    mergeBody,
    /if \(closingContentIndex >= 0\) \{[\s\S]*return \[prefix, blocks\.join\('\\n\\n'\), suffix\]\.filter\(Boolean\)\.join\('\\n\\n'\);[\s\S]*\}/,
    'wrapped assistant floors should insert MVU writeback before </content> instead of falling through to the fallback append',
  );
});

test('same-layer final rendering no longer handles business XML blocks before Tavern display regex', () => {
  const source = readSource('useStreamingDemo.ts');
  const finalBody = extractFunctionBody(source, 'buildFinalHtml');
  const previewBody = extractFunctionBody(source, 'sanitizeAssistantRuntimeTagsForStreamingPreview');

  assert.equal(
    source.includes('function sanitizeAssistantRuntimeTagsForDisplay'),
    false,
    'same-layer done rendering should not maintain its own business XML sanitizer',
  );
  assert.doesNotMatch(
    finalBody,
    /<UpdateVariable|<thinking|<content|assistant-runtime-variable|assistant-runtime-thinking/,
    'done rendering should leave XML block structure to Tavern regex instead of folding or stripping it locally',
  );
  assert.doesNotMatch(
    previewBody,
    /<UpdateVariable|<thinking|<content|assistant-runtime-variable|assistant-runtime-thinking/,
    'streaming preview should also avoid same-layer business XML parsing',
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

test('same-layer internal generate calls are silent until the done patch emits the official lifecycle', () => {
  const source = readSource('useStreamingDemo.ts');
  const body = extractFunctionBody(source, 'runGenerationFlow');

  assert.match(
    body,
    /generate\(\s*[\s\S]{0,360}should_silence:\s*true,[\s\S]{0,360}should_stream:\s*true/,
    'internal same-layer generate() calls should be silent so native generation_ended cannot race ahead of the final done patch',
  );
  assert.match(
    body,
    /await patchAssistantMessage\('done'\);[\s\S]{0,420}await runQueuedPostDoneAssistantSideEffects/,
    'the official lifecycle should still be emitted only after the final done message is written',
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
