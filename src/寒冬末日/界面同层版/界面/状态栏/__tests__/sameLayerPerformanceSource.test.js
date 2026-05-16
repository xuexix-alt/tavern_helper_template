const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

function assertNoConsoleLog(relativePath) {
  const source = readSource(relativePath);
  assert.equal(source.includes('console.log('), false, `${relativePath} should not log in UI hot paths`);
}

test('image gesture hot paths do not emit console.log noise', () => {
  assertNoConsoleLog('generatedImageGestureController.ts');
  assertNoConsoleLog('components/GeneratedImageAsset.vue');
  assertNoConsoleLog('components/TranscriptMessageCard.vue');
});

test('gallery and transcript images share the generated image gesture controller', () => {
  const gallerySource = readSource('components/GeneratedImageAsset.vue');
  const transcriptSource = readSource('components/TranscriptMessageCard.vue');

  for (const [name, source] of [
    ['GeneratedImageAsset', gallerySource],
    ['TranscriptMessageCard', transcriptSource],
  ]) {
    assert.equal(
      source.includes('createGeneratedImageGestureController'),
      true,
      `${name} should use the shared controller for click, double click and touch gestures`,
    );
    assert.equal(source.includes('handleTouchStart'), true, `${name} should support mobile touch start`);
    assert.equal(source.includes('handleTouchEnd'), true, `${name} should support mobile touch end`);
    assert.equal(source.includes('handleDoubleClick'), true, `${name} should support desktop double click`);
  }
});

test('TranscriptList pre-aggregates gallery image counts by message id', () => {
  const source = readSource('components/TranscriptList.vue');

  assert.equal(
    source.includes('const imageCountsByMessageId = computed'),
    true,
    'gallery image counts should be aggregated once per galleryEntries change',
  );

  const filterCount = (source.match(/\.filter\(e => e\.messageId === messageId\)/g) ?? []).length;
  assert.equal(filterCount, 0, 'messageImageCount should not scan galleryEntries for every template read');
});

test('TranscriptMessageCard only hydrates and rebinds assistant body when body html changes', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.equal(
    source.includes('const assistantBodySignature = computed'),
    true,
    'assistant body work should be keyed by a stable html signature',
  );
  assert.equal(
    /watch\(\s*assistantBodySignature/.test(source),
    true,
    'assistant body work should be driven by signature changes',
  );
  assert.equal(
    source.includes('onUpdated(() =>'),
    false,
    'unrelated prop updates should not rescan and rebind assistant body DOM',
  );
});

test('streaming transcript items use lightweight regex preview and avoid eager final image artifact rebuilds', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const isCurrentStreamingItem =[\s\S]{0,240}input\.status === 'streaming'/,
    'buildTranscriptItem should explicitly distinguish the current streaming item',
  );
  assert.match(
    source,
    /const streamHtml = isCurrentStreamingItem[\s\S]{0,220}buildStreamingPreviewHtml/,
    'streaming html should be a lightweight preview instead of empty plain text',
  );
  const previewBlock = source.match(/function buildStreamingPreviewHtml[\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(previewBlock, '', 'buildStreamingPreviewHtml should exist');
  assert.doesNotMatch(
    previewBlock,
    /formatAsDisplayedMessage|appendChatu8ArtifactsToHtml|applyTranscriptArtifacts/,
    'streaming preview should not run final display formatting or attach plugin image artifacts',
  );
  // finalHtml 不再因 isCurrentStreamingItem 被置空（见 syncTranscriptFlags 失衡 bug 的修复）：
  // 当前流式项优先复用酒馆宿主已渲染 HTML，其次复用已节流的 streamHtml 预览，非流式项才走完整路径。
  assert.match(
    source,
    /const finalHtml =\s*hostRenderedHtml\s*\|\|\s*\(isCurrentStreamingItem \? streamHtml : buildFinalHtml\(displayRenderSource, input\.id, input\.raw\)\)/,
    'current streaming item should prefer host-rendered html or reuse preview html without running full display formatting',
  );
});

test('transcript sync keeps unchanged item references stable during stream patches', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /if \(item\.isLatest === isLatest && item\.isStreaming === isStreaming\) return item;/,
    'syncTranscriptFlags should preserve object identity when flags do not change',
  );
});

test('TranscriptList item signature ignores streaming content length', () => {
  const source = readSource('components/TranscriptList.vue');
  const signatureBlock = source.match(/const itemsSignature = computed\(\(\) =>[\s\S]*?\n\);\n/)?.[0] ?? '';

  assert.notEqual(signatureBlock, '', 'itemsSignature block should be present');
  assert.equal(
    signatureBlock.includes('content.length'),
    false,
    'scroll anchoring signature should not change for every streamed token',
  );
});

test('TranscriptMessageCard assistant body signature avoids full html string comparison while streaming', () => {
  const source = readSource('components/TranscriptMessageCard.vue');
  const signatureBlock = source.match(/const assistantBodySignature = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0] ?? '';

  assert.notEqual(signatureBlock, '', 'assistantBodySignature block should be present');
  assert.equal(
    signatureBlock.includes("String(html ?? '')"),
    false,
    'assistant body watcher should not build and compare the full html string on every stream tick',
  );
});

test('lifecycle trace supports lazy payloads for expensive stream summaries', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /payload: Record<string, unknown> \| \(\(\) => Record<string, unknown>\) = \{\}/,
    'recordLifecycleTrace should accept a lazy payload function',
  );
  assert.match(
    source,
    /if \(!debugTraceRuntime\.enabled\) return null;/,
    'recordLifecycleTrace should return before resolving payload while tracing is disabled',
  );
  assert.match(
    source,
    /transcriptAssistantSummary: summarizeTranscriptForDebug\(transcript\.value\)/,
    'debug summaries should remain available when tracing is enabled',
  );
  assert.match(
    source,
    /recordLifecycleTrace\([\s\S]{0,140}'commit_done'[\s\S]{0,180}\(\) => \(/,
    'hot stream commit trace should construct transcript summary lazily',
  );
});

test('mobile streaming disables costly transcript blur layers', () => {
  const listSource = readSource('components/TranscriptList.vue');
  const cardSource = readSource('components/TranscriptMessageCard.vue');

  assert.match(
    listSource,
    /:class="\[\s*'transcript-card'/,
    'TranscriptList root should expose streaming state as a class',
  );
  assert.match(
    listSource,
    /\.transcript-card\.is-streaming[\s\S]{0,220}backdrop-filter: none;/,
    'TranscriptList should disable FAB backdrop blur while streaming on mobile',
  );
  assert.match(
    cardSource,
    /\.assistant-card\.is-streaming[\s\S]{0,220}backdrop-filter: none;/,
    'TranscriptMessageCard should disable image button backdrop blur while streaming on mobile',
  );
});

test('StoryPage lazy mounts the image gallery drawer content while closed', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('<ImageGalleryPanel\n            v-if="galleryDrawerOpen"'),
    true,
    'closed gallery drawer should not mount gallery grouping and image asset components',
  );
});

test('StoryPage lets mobile mes-path touch events reach the native plugin after prewarming data', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('async function startTranscriptHostImageProxy'),
    true,
    'mobile transcript double tap should prewarm host mes_text without synthetic dispatch',
  );
  assert.equal(
    source.includes('void ensureHostMesTextRendered(messageId);'),
    true,
    'first mobile tap should prewarm host mes_text before the second tap triggers native plugin handling',
  );
  assert.equal(
    /void ensureHostMesTextRendered\(messageId\);[\s\S]{0,260}void startTranscriptHostImageProxy\(messageId, event, \{ preferPointTarget: true \}\);[\s\S]{0,120}return;/.test(
      source,
    ),
    true,
    'mobile transcript double tap should prewarm on first tap and let the proxy handle the second tap',
  );
});

test('StoryPage keeps a lightweight role data provider and lazy mounts the full role panel', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.equal(
    source.includes('const roleProviderStore = useMvuRoleStore'),
    true,
    'StoryPage should keep role data available without mounting the full role panel',
  );
  assert.equal(
    source.includes('<MvuRolePanel\n            v-if="roleDrawerOpen"'),
    true,
    'closed role drawer should not mount the full role panel UI',
  );
  assert.equal(
    source.includes('function buildRoleTabItemsFromProvider'),
    true,
    'bottom role shortcuts should be derived from the lightweight provider',
  );
});

test('rebuildTranscript resolves latestAssistantId before building items so streaming html matches the later sync flag', () => {
  const source = readSource('useStreamingDemo.ts');

  // 两遍归一化：先确定 nextLatestAssistantId，再用它 build item，避免 syncTranscriptFlags 翻出
  // `isStreaming: true` 时对应的 `streamHtml` 仍是空串。
  assert.match(
    source,
    /for \(const entry of normalizedEntries\)[\s\S]{0,400}latestAssistantId: nextLatestAssistantId/,
    'rebuildTranscript should pass the resolved latestAssistantId to buildTranscriptItem',
  );
  assert.doesNotMatch(
    source,
    /normalized\.push\(\s*buildTranscriptItem\(\{[\s\S]{0,260}latestAssistantId: null/,
    'rebuildTranscript must not pass null latestAssistantId, otherwise stale phase=stream floors render empty stream html',
  );
});

test('refreshTranscriptItemsByIds preserves latestAssistantId so patched streaming items keep their stream html', () => {
  const source = readSource('useStreamingDemo.ts');

  const refreshBlock = source.match(/function refreshTranscriptItemsByIds[\s\S]*?\n  \}\n/)?.[0] ?? '';
  assert.notEqual(refreshBlock, '', 'refreshTranscriptItemsByIds block should be present');
  assert.match(
    refreshBlock,
    /latestAssistantId: latestAssistantItem\.value\?\.message_id \?\? assistantMessageId\.value/,
    'refreshTranscriptItemsByIds should pass the live latestAssistantId so rebuilt items keep their streaming html',
  );
  assert.doesNotMatch(
    refreshBlock,
    /latestAssistantId: null/,
    'refreshTranscriptItemsByIds must not drop latestAssistantId to null while rebuilding individual items',
  );
});

test('MvuRolePanel memoizes role portrait resolution once per dependency change instead of per template read', () => {
  const source = readSource('components/MvuRolePanel.vue');

  assert.match(
    source,
    /const rolePortraitSummaries = computed\(\(\) => \{[\s\S]{0,800}prepareRolePortraitLookup\(entries\)/,
    'MvuRolePanel should build a reactive map of role summaries keyed by role, reusing a single prepared lookup',
  );
  assert.match(
    source,
    /function rolePortraitForEntry\([\s\S]{0,200}rolePortraitSummaryForEntry\(entry\)\.portrait/,
    'rolePortraitForEntry should read from the memoized summary map',
  );
  assert.match(
    source,
    /function rolePortraitSetForEntry\([\s\S]{0,200}rolePortraitSummaryForEntry\(entry\)\.set/,
    'rolePortraitSetForEntry should read from the memoized summary map',
  );
  // 确认旧的"每次模板读取都 resolveRolePortrait"写法已移除。
  assert.doesNotMatch(
    source,
    /function rolePortraitForEntry\([\s\S]{0,80}\{\s*return resolveRolePortrait\(/,
    'per-call resolveRolePortrait in rolePortraitForEntry should be replaced by the memo lookup',
  );
});

test('rolePortraits exposes a shared readyEntries lookup so per-role resolves do not re-sort the gallery', () => {
  const source = readSource('rolePortraits.ts');

  assert.match(
    source,
    /export type RolePortraitLookup = \{\s*readyEntries: ReaderGalleryEntry\[\];\s*\};/,
    'rolePortraits should expose a RolePortraitLookup type describing the shared prepared entries',
  );
  assert.match(
    source,
    /export function prepareRolePortraitLookup\(entries: ReaderGalleryEntry\[\]\): RolePortraitLookup/,
    'prepareRolePortraitLookup should be exported so callers can filter+sort once for a whole panel render',
  );
  assert.match(
    source,
    /function resolveLookup\([\s\S]{0,160}prepareRolePortraitLookup\(entries\)/,
    'internal resolvers should accept an optional lookup and fall back to preparing it when absent',
  );
});

test('rolePortraits precomputes an alias group index instead of scanning the alias list per lookup', () => {
  const source = readSource('rolePortraits.ts');

  assert.match(
    source,
    /const ALIAS_GROUP_INDEX: Map<string, Set<string>> =/,
    'PROJECT_ROLE_NAME_ALIASES should be expanded into a fast lookup index at module load',
  );
  assert.match(
    source,
    /function buildNameCandidates\([\s\S]{0,600}ALIAS_GROUP_INDEX\.get\(/,
    'buildNameCandidates should consult the precomputed alias index instead of iterating all alias groups',
  );
  assert.doesNotMatch(
    source,
    /for \(const aliasGroup of PROJECT_ROLE_NAME_ALIASES\) \{\s*const normalizedGroup = aliasGroup\.flatMap/,
    'the old per-candidate full alias scan should be replaced by the precomputed index',
  );
});

test('mobile and reduced-motion users do not pay for backdrop-filter layers on the same-layer UI', () => {
  const themeSource = readSource('theme-tokens.css');

  // 手机端（<=760px）应当整体关闭已知 blur 容器的 backdrop-filter。
  const mobileBlock = themeSource.match(/@media \(max-width: 760px\) \{[\s\S]*?\}\s*\}/g) ?? [];
  assert.ok(
    mobileBlock.some(
      block =>
        /\.hud-panel/.test(block) &&
        /\.ui-topbar/.test(block) &&
        /\.ui-side-drawer/.test(block) &&
        /\.ui-bottom-drawer/.test(block) &&
        /\.hud-modal-backdrop/.test(block) &&
        /backdrop-filter: none !important/.test(block),
    ),
    'mobile media query should opt major blur containers out of backdrop-filter',
  );

  // prefers-reduced-motion 的用户也应该一起降级（施工说明里要求的兜底）。
  const reducedMotionBlock = themeSource.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\}\s*\}/g) ?? [];
  assert.ok(
    reducedMotionBlock.some(block => /backdrop-filter: none !important/.test(block)),
    'prefers-reduced-motion should also disable backdrop-filter to avoid accessibility regressions',
  );
});

test('buildTranscriptItem always produces a finalHtml so older floors do not blank out when a new placeholder becomes the latest assistant', () => {
  const source = readSource('useStreamingDemo.ts');

  // 旧 bug：流式项被置 finalHtml = ''；新一轮 gen 创建占位后 `assistantMessageId` 变成
  // 新 id，`syncTranscriptFlags` 只翻 `isLatest/isStreaming`，老楼层保留空 finalHtml，
  // 在 UI 上落回 "(空回复)"。这个断言钉住新的两路 finalHtml 构造，保证它不再回退。
  assert.doesNotMatch(
    source,
    /const finalHtml = isCurrentStreamingItem\s*\?\s*''\s*:/,
    'finalHtml must not be placeholder-empty during streaming; previously-latest floors need their html to survive isStreaming flag flips',
  );
  assert.match(
    source,
    /const finalHtml =\s*hostRenderedHtml\s*\|\|\s*\(isCurrentStreamingItem \? streamHtml : buildFinalHtml\(displayRenderSource,/,
    'streaming items should still produce host-rendered or lightweight finalHtml fallback once the item stops being the latest assistant',
  );
});

test('stream display html prefers item.streamHtml so stream-demo wrapper tags are sanitized before preview rendering', () => {
  const messageCardSource = readSource('components/TranscriptMessageCard.vue');
  const openingCardSource = readSource('components/TranscriptOpeningCard.vue');

  // TranscriptMessageCard 流式分支已下沉到 StreamRenderer：消费 item.content 快照，
  // 由 streamRendererDisplay.ts 跑 display 正则 + 防御性剥离 image### token。
  assert.match(
    messageCardSource,
    /<StreamRenderer[\s\S]{0,200}:message="item\.content"/,
    'TranscriptMessageCard should delegate the streaming preview to StreamRenderer with item.content',
  );
  assert.match(
    openingCardSource,
    /const streamingOpeningHtml = computed\([\s\S]{0,800}props\.item\.streamHtml/,
    'TranscriptOpeningCard should render the sanitized streaming html preview from item.streamHtml',
  );
});
