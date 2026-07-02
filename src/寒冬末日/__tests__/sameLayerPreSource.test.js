const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PRE_ROOT = path.join(ROOT, 'src', '寒冬末日', 'same-layer-pre', '界面', '状态栏');

function readPre(relativePath) {
  return fs.readFileSync(path.join(PRE_ROOT, relativePath), 'utf8');
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.ok(start >= 0, `${functionName} should exist`);

  const bodyStart = source.indexOf('{', start);
  assert.ok(bodyStart >= 0, `${functionName} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`${functionName} body should be balanced`);
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walkFiles(fullPath);
    }
    return [fullPath];
  });
}

test('same-layer-pre is a standalone status-bar frontend entry', () => {
  assert.equal(fs.existsSync(path.join(PRE_ROOT, 'index.ts')), true);
  assert.equal(fs.existsSync(path.join(PRE_ROOT, 'index.html')), true);
  assert.match(readPre('App.vue'), /StoryPagePre/);
});

test('same-layer-pre strips old image persistence while allowing beta light image refs', () => {
  const forbiddenFiles = [
    'imageStore.ts',
    'imagePersistencePatch.ts',
    'imageGenerationEventBridge.ts',
    'imagePendingTaskManager.ts',
    'transcriptImagePersistence.ts',
    'transcriptImageHydrationMode.ts',
    'generatedImageSourceResolver.ts',
    'GeneratedImageAsset.vue',
    'GalleryImageRoleAssignPicker.vue',
    'generatedImagePromptMetadata.ts',
    'chatu8PromptTokenDisplay.ts',
    'promptTokenPersistence.ts',
    'hostMesTextRender.ts',
    'hostVisualHide.ts',
    'pluginNativeImageSelectors.ts',
  ];

  for (const relativePath of forbiddenFiles) {
    assert.equal(fs.existsSync(path.join(PRE_ROOT, relativePath)), false, `${relativePath} should not ship in pre`);
    assert.equal(
      fs.existsSync(path.join(PRE_ROOT, 'components', relativePath)),
      false,
      `components/${relativePath} should not ship in pre`,
    );
  }

  const forbiddenRuntimePatterns = [
    /stream_demo\.generated_images/,
    /persistGeneratedImageResponse/,
    /buildGeneratedImagePersistencePatch/,
    /startGalleryImageCacheSession/,
    /discoverRecentNativeGalleryImages/,
    /hydrateVisibleImageMessages/,
    /readGeneratedImageSource/,
    /GeneratedImageAsset/,
    /triggerImageGenerationForMessage/,
    /generatedImages/,
    /stripVisibleChatu8PromptTokens/,
    /resolveHostImageNodeByPromptToken/,
  ];

  const searchableFiles = walkFiles(PRE_ROOT).filter(file => /\.(ts|vue|js|css|html)$/.test(file));
  for (const file of searchableFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenRuntimePatterns) {
      assert.doesNotMatch(source, pattern, `${path.relative(PRE_ROOT, file)} should not contain ${pattern}`);
    }
  }
});

test('same-layer-pre beta gallery uses light refs without owning image persistence', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const gallerySource = readPre(path.join('components', 'PreGalleryPanel.vue'));
  const refSource = readPre('preGalleryImageRefs.ts');

  assert.match(storySource, /PreGalleryPanel/);
  assert.match(storySource, /<PreGalleryPanel[\s\S]*:active="galleryDrawerOpen"[\s\S]*@gallery-log="appendGalleryLog"/);
  assert.match(storySource, /@gallery-entries="updatePreGalleryEntries"/);
  assert.match(storySource, /@assign-portrait="openPreGalleryRoleAssign"/);
  assert.doesNotMatch(storySource, /:entries=/);
  assert.doesNotMatch(storySource, /@view-image=/);
  assert.doesNotMatch(storySource, /@load-older=/);
  assert.match(storySource, /function appendGalleryLog/);
  assert.match(gallerySource, /data-pre-gallery-beta="true"/);
  assert.match(gallerySource, /scanLatestPreGalleryImageRefs/);
  assert.match(gallerySource, /refreshImageRef/);
  assert.match(gallerySource, /hydrateImageDom/);
  assert.match(refSource, /extra\.images/);
  assert.match(refSource, /collectChatu8PromptTokens/);
  assert.match(refSource, /chatMetadata\?\.\['st-chatu8'\]/);
  assert.match(refSource, /collectHostPreGalleryArtifacts\(messageId\)/);
  assert.match(refSource, /图片 src 仅用于本次渲染，不进入 lightKey/);
  assert.doesNotMatch(refSource, /indexedDB|stream_demo\.generated_images|persistGeneratedImageResponse/i);
  assert.doesNotMatch(gallerySource, /GeneratedImageAsset/);
});

test('same-layer-pre beta gallery documents the native image-ref model', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'same-layer-pre画廊beta实证模型.md'), 'utf8');

  assert.match(doc, /MESSAGE_UPDATED[\s\S]*refreshImageRef/);
  assert.match(doc, /MESSAGE_EDITED[\s\S]*refreshImageRef/);
  assert.match(doc, /USER_MESSAGE_RENDERED[\s\S]*hydrateImageDom/);
  assert.match(doc, /CHARACTER_MESSAGE_RENDERED[\s\S]*hydrateImageDom/);
  assert.match(doc, /chat\[messageId\]\.extra\.images\[swipeId\]/);
  assert.match(doc, /chatMetadata\['st-chatu8'\]/);
  assert.match(doc, /data-chatu8-image-ref/);
  assert.match(doc, /data-image-tag/);
  assert.match(doc, /lightKey[\s\S]*base64/);
  assert.match(doc, /placeholder\.js[\s\S]*data-link[\s\S]*data-image-tag[\s\S]*triggerGeneration/);
});

test('same-layer-pre mounts the same-layer map panel beside the system utility drawer', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(storySource, /import MapBusinessPanel from ['"].*MapBusinessPanel\.vue['"]/);
  assert.match(storySource, /const activeUtilityDrawer = ref<null \| 'system' \| 'map'>\(null\)/);
  assert.match(storySource, /<MapBusinessPanel\s+v-else-if="activeUtilityDrawer === 'map'"\s*\/>/);
  assert.match(storySource, /@click="toggleUtilityDrawer\('map'\)"/);
  assert.match(storySource, /<span>地图<\/span>/);
  assert.match(storySource, /title:\s*'战术地图'/);
  assert.match(storySource, /eyebrow:\s*'MAP \/\/ TACTICAL'/);
  assert.match(storySource, /\.ui-bottom-drawer\.is-map/);
  assert.match(storySource, /\.ui-bottom-drawer-body\.is-map/);

  const gallerySidebarStart = storySource.indexOf('<aside class="ui-sidebar ui-sidebar-right"');
  const gallerySidebarEnd = storySource.indexOf('</aside>', gallerySidebarStart);
  assert.ok(gallerySidebarStart > -1, 'gallery sidebar should exist');
  assert.ok(gallerySidebarEnd > gallerySidebarStart, 'gallery sidebar should be bounded');
  assert.doesNotMatch(storySource.slice(gallerySidebarStart, gallerySidebarEnd), /MapBusinessPanel/);
});

test('same-layer-pre visually hides host chat floors while preserving host DOM', () => {
  const controllerSource = readPre('preHostVisualHide.ts');
  const hookSource = readPre('useSameLayerPre.ts');

  assert.match(controllerSource, /data-eden-host-hidden/);
  assert.match(controllerSource, /resolveHostMessageRoot/);
  assert.match(controllerSource, /height:\s*0\s*!important/);
  assert.match(controllerSource, /visibility:\s*hidden\s*!important/);
  assert.match(controllerSource, /applyToMessageIds/);
  assert.match(hookSource, /createPreHostVisualHideController/);
  assert.match(hookSource, /syncHostVisualHide/);
  assert.match(hookSource, /hostVisualHideController\.applyToMessageIds/);
  assert.match(hookSource, /hostVisualHideController\.destroy\(\)/);
  assert.doesNotMatch(controllerSource, /pluginNative/i);
  assert.doesNotMatch(controllerSource, /HOST_PLUGIN_NATIVE/);
});

test('same-layer-pre keeps the frontend carrier message visible when hiding host floors', () => {
  const controllerSource = readPre('preHostVisualHide.ts');
  const hookSource = readPre('useSameLayerPre.ts');

  assert.match(controllerSource, /excludeMessageIds/);
  assert.match(controllerSource, /nextIds\.delete\(id\)/);
  assert.match(hookSource, /readPreCarrierMessageId/);
  assert.match(hookSource, /getCurrentMessageId/);
  assert.match(hookSource, /excludeMessageIds:\s*carrierMessageId/);
});

test('same-layer-pre inherits same-layer theme tokens and restores symmetric edge handles', () => {
  const entrySource = readPre('index.ts');
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.equal(fs.existsSync(path.join(PRE_ROOT, 'theme-tokens.css')), false);
  assert.match(entrySource, /界面同层版\/界面\/状态栏\/theme-tokens\.css/);
  assert.doesNotMatch(entrySource, /from '\.\/theme-tokens\.css'/);

  assert.match(storySource, /ui-sidebar-mask/);
  assert.match(storySource, /closeSideDrawers/);
  assert.match(storySource, /ui-sidebar-toggle/);
  assert.match(storySource, /ui-sidebar-toggle-right/);
  assert.match(storySource, /ui-sidebar-toggle-label/);
  assert.match(storySource, /translateX\(-100%\)/);
  assert.match(storySource, /translateX\(100%\)/);
  assert.match(storySource, /writing-mode:\s*horizontal-tb/);
  assert.match(storySource, /rotate\(-90deg\)/);
  assert.match(storySource, /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
});

test('same-layer-pre gives inherited AGENTS drawer a full-height shell', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  const layoutStart = storySource.indexOf('<div class="ui-host-body">');
  const readerStart = storySource.indexOf('<main class="ui-main-panel">');
  const leftSidebarStart = storySource.indexOf('<aside class="ui-sidebar"');
  const footerStart = storySource.indexOf('<section class="ui-bottom-dock">');

  assert.ok(layoutStart > -1, 'same-layer host body should exist');
  assert.ok(readerStart > -1, 'same-layer reader panel should exist');
  assert.ok(leftSidebarStart > -1, 'left sidebar should exist');
  assert.ok(footerStart > -1, 'same-layer bottom dock should exist');
  assert.ok(leftSidebarStart > layoutStart, 'role drawer should live in the same-layer host body shell');
  assert.ok(leftSidebarStart < readerStart, 'role drawer should be a shell sibling before the reader panel');
  assert.ok(footerStart > readerStart, 'bottom dock should remain below the reader transcript panel');

  assert.match(storySource, /<section\s+class="ui-host-shell same-layer-pre-host layout-reader-desktop"/);
  assert.match(storySource, /const readerShellHeight = ref/);
  assert.match(storySource, /function readHostViewportHeight\(\)/);
  assert.match(storySource, /window\.top\?\.visualViewport\?\.height/);
  assert.match(storySource, /function updateReaderShellHeight\(\)/);
  assert.match(storySource, /readerShellHeight\.value = `\$\{targetHeight}px`/);
  assert.match(storySource, /height:\s*var\(--reader-shell-height,\s*min\(92vh,\s*960px\)\)/);
  assert.match(storySource, /max-height:\s*var\(--reader-shell-height,\s*min\(92vh,\s*960px\)\)/);
  assert.match(storySource, /min-height:\s*720px/);
  assert.match(storySource, /\.ui-sidebar\s*\{[\s\S]*?height:\s*100%;/);
});

test('same-layer-pre adopts same-layer reader chrome and option menu without image action wiring', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const hookSource = readPre('useSameLayerPre.ts');
  const toTranscriptItemSource = extractFunctionSource(hookSource, 'toTranscriptItem');

  assert.match(storySource, /BottomComposer/);
  assert.match(storySource, /界面同层版\/界面\/状态栏\/components\/BottomComposer\.vue/);

  for (const className of [
    'ui-host-shell',
    'ui-topbar',
    'ui-page-menu',
    'ui-host-body',
    'ui-main-panel',
    'ui-transcript-panel',
    'ui-bottom-dock',
    'ui-bottom-console-strip',
    'ui-bottom-tools',
    'ui-bottom-tool-row',
    'ui-sidebar',
    'ui-sidebar-right',
  ]) {
    assert.match(storySource, new RegExp(className), `StoryPagePre should use ${className}`);
  }

  assert.match(storySource, /ref="composerRef"/);
  assert.match(storySource, /openChoiceModalFromToolbar/);
  assert.match(storySource, /:choice-options="latestAssistantItem\?\.options \?\? \[\]"/);
  assert.match(storySource, /:can-generate-latest-image="false"/);
  assert.doesNotMatch(storySource, /@generate-latest-image/);
  assert.doesNotMatch(
    storySource,
    /handleChoiceModalGenerateLatestImage|triggerImageGenerationForMessage|GENERATE_IMAGE_REQUEST/,
  );

  assert.match(hookSource, /function extractChoiceOptions/);
  assert.match(toTranscriptItemSource, /options:\s*extractChoiceOptions\(raw,\s*finalHtml\)/);
});

test('same-layer-pre wires the option modal reprocess button to native MVU extra analysis retry', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(
    storySource,
    /import\s+\{\s*retryMessageExtraAnalysisByNativeMvu\s*\}\s+from ['"]\.\.\/\.\.\/\.\.\/\.\.\/mvu_reprocess['"]/,
  );
  assert.match(storySource, /type MvuVariableUpdateMode = 'extra_analysis' \| 'inline' \| 'unknown'/);
  assert.match(storySource, /const mvuVariableUpdateMode = ref<MvuVariableUpdateMode>\('unknown'\)/);
  assert.match(storySource, /const reprocessVariablesPending = ref\(false\)/);
  assert.match(storySource, /const canReprocessVariables = computed/);
  assert.match(storySource, /const reprocessVariablesHint = computed/);
  assert.match(storySource, /function readMvuVariableUpdateMode\(\): MvuVariableUpdateMode/);
  assert.match(storySource, /function refreshMvuVariableUpdateMode\(\)/);
  assert.match(storySource, /function openChoiceModalFromToolbar\(\)\s*\{[\s\S]*?refreshMvuVariableUpdateMode\(\)/);
  assert.match(storySource, /async function handleReprocessVariablesFromChoiceModal\(\)/);
  assert.match(
    storySource,
    /await\s+retryMessageExtraAnalysisByNativeMvu\(latestAssistant\.message_id,\s*\{\s*refreshMessage:\s*true\s*,?\s*\}\)/,
  );
  assert.match(storySource, /refreshTranscript\('mvu_extra_analysis_retry'\)/);

  assert.match(storySource, /:can-reprocess-variables="canReprocessVariables"/);
  assert.match(storySource, /:reprocess-variables-hint="reprocessVariablesHint"/);
  assert.match(storySource, /:reprocess-variables-pending="reprocessVariablesPending"/);
  assert.match(storySource, /@reprocess-variables="handleReprocessVariablesFromChoiceModal"/);
  assert.doesNotMatch(storySource, /same-layer-pre 暂不接入变量重试/);
  assert.doesNotMatch(storySource, /revealHiddenStoryMessagesForNativeGeneration|withHostTranscriptVisible/);
});

test('same-layer-pre reuses the original same-layer opening setup form through the pre host flow', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(storySource, /import HudModal from ['"].*HudModal\.vue['"]/);
  assert.match(storySource, /import OpeningSetupPanel from ['"].*OpeningSetupPanel\.vue['"]/);
  assert.match(storySource, /import openingModalIcon from ['"].*opening-modal-icon\.webp\?url['"]/);
  assert.match(storySource, /getDefaultOpeningPreset/);
  assert.match(storySource, /getDefaultOpeningPayload/);
  assert.match(storySource, /buildOpeningGeneratePrompt/);
  assert.match(storySource, /readOpeningPayloadFromChat/);
  assert.match(storySource, /replaceOpeningPayloadInChat/);

  assert.match(storySource, /<HudModal[\s\S]*:open="openingModalOpen \|\| shouldShowOpeningSetup"/);
  assert.match(storySource, /title="世界观自定义 \/ Opening Start"/);
  assert.match(storySource, /:icon-src="openingModalIcon"/);
  assert.match(storySource, /<OpeningSetupPanel[\s\S]*:preset="openingPreset"[\s\S]*:payload="openingPayload"/);
  assert.match(storySource, /@update-meta="updateOpeningMeta"/);
  assert.match(storySource, /@update-field="updateOpeningField"/);
  assert.match(storySource, /@update-world-mode="updateOpeningWorldMode"/);
  assert.match(storySource, /@update-route="updateOpeningRoute"/);
  assert.match(storySource, /@update-stream="updateOpeningStream"/);
  assert.match(storySource, /@submit="handleOpeningSubmit"/);

  assert.match(storySource, /const openingPreset = ref\(getDefaultOpeningPreset\(\)\)/);
  assert.match(storySource, /const openingPayload = ref\(readOpeningPayloadFromChat\(\) \?\? getDefaultOpeningPayload/);
  assert.match(storySource, /const openingWorldModes = getOpeningWorldModes\(\)/);
  assert.match(storySource, /const openingRoutes = getOpeningRoutes\(\)/);
  assert.match(storySource, /const shouldShowOpeningSetup = computed/);
  assert.match(storySource, /latestAssistantItem\.value\?\.raw/);
  assert.match(storySource, /baseTranscriptItems\.value\.some\(item => item\.role === 'user'/);
  assert.match(storySource, /function persistOpeningPayloadNow\(\)/);
  assert.match(storySource, /function hydrateOpeningPayloadDefaults\(\)/);
  assert.match(storySource, /function updateOpeningMeta/);
  assert.match(storySource, /function updateOpeningWorldMode/);
  assert.match(storySource, /function updateOpeningRoute/);
  assert.match(storySource, /function updateOpeningStream/);
  assert.match(storySource, /function updateOpeningField/);
  assert.match(storySource, /async function handleOpeningSubmit\(\)/);
  assert.match(
    storySource,
    /const compiledPromptSnapshot = buildOpeningGeneratePrompt\(openingPreset\.value, openingPayload\.value\)/,
  );
  assert.match(storySource, /await submitPrompt\(compiledPromptSnapshot\)/);
  assert.match(
    storySource,
    /openingPayload\.value = \{[\s\S]*state:\s*'ready'[\s\S]*opening_assistant_message_id:\s*latestAssistantId/,
  );
  assert.doesNotMatch(storySource, /runOpeningDetachedGeneration|runOpeningNativeGeneration|sendToNativeChat/);
});

test('same-layer-pre keeps the right gallery drawer fixed height even when empty', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const gallerySource = readPre(path.join('components', 'PreGalleryPanel.vue'));

  assert.match(
    storySource,
    /@media \(max-width:\s*760px\)[\s\S]*?\.ui-sidebar\s*\{[\s\S]*?height:\s*min\(94%,\s*46rem\);[\s\S]*?max-height:\s*min\(94%,\s*46rem\);/,
    'mobile sidebars should use the same fixed overlay height instead of shrinking to content',
  );
  assert.doesNotMatch(
    storySource,
    /@media \(max-width:\s*760px\)[\s\S]*?\.ui-sidebar\s*\{[\s\S]*?height:\s*auto;/,
    'mobile sidebars should not shrink when the gallery has no images',
  );
  assert.doesNotMatch(
    storySource,
    /\.ui-sidebar-right\s*\{[\s\S]*?height:\s*auto;/,
    'the right drawer should not override the shared sidebar height',
  );
  assert.match(
    gallerySource,
    /\.pre-gallery-panel\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
    'the empty gallery placeholder should fill the fixed drawer body',
  );
});

test('same-layer-pre removes duplicated controls and inherits the input-adjacent system drawer', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const topbarSource = storySource.slice(
    storySource.indexOf('<header class="ui-topbar">'),
    storySource.indexOf('</header>') + '</header>'.length,
  );

  assert.match(storySource, /WorkbenchTabs/);
  assert.match(storySource, /界面同层版\/界面\/状态栏\/components\/WorkbenchTabs\.vue/);
  assert.match(storySource, /<Teleport to="body">/);
  assert.match(storySource, /activeUtilityDrawer/);
  assert.match(storySource, /class="ui-bottom-drawer clip-corner"/);
  assert.match(storySource, /ui-utility-mask/);
  assert.match(storySource, /toggleUtilityDrawer\('system'\)/);
  assert.match(storySource, /<WorkbenchTabs/);
  assert.match(storySource, /:logs="logItems"/);
  assert.match(storySource, /:transcript-total="readerSummary\.turnCount"/);

  assert.doesNotMatch(topbarSource, /@click="toggleRoleDrawer"/);
  assert.doesNotMatch(topbarSource, /@click="toggleGalleryDrawer"/);
  assert.doesNotMatch(topbarSource, /@click="refreshTranscript\('manual'\)"/);
  assert.doesNotMatch(topbarSource, /openChoiceModalFromMoreMenu/);
  assert.match(topbarSource, /openRoleDrawerFromMoreMenu/);
  assert.match(topbarSource, /openGalleryDrawerFromMoreMenu/);
  assert.match(topbarSource, /refreshFromMoreMenu/);

  assert.doesNotMatch(storySource, /<span>日志<\/span>/);
  assert.doesNotMatch(storySource, /<span class="ui-role-name">AGENTS<\/span>/);
  assert.doesNotMatch(storySource, /<span class="ui-role-name">GALLERY<\/span>/);
  assert.match(storySource, /<span>系统<\/span>/);
  assert.match(storySource, /<span>选项<\/span>/);
});

test('same-layer-pre wires native-style regenerate and rollback actions through Tavern Helper APIs', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const listSource = readPre(path.join('components', 'PreTranscriptList.vue'));
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));
  const hookSource = readPre('useSameLayerPre.ts');

  assert.match(storySource, /canRegenerateLatestMessage/);
  assert.match(storySource, /regenerateLatestMessage/);
  assert.match(storySource, /rollbackConfirmMessageId/);
  assert.match(storySource, /@request-rollback="requestRollbackDelete"/);
  assert.match(storySource, /@confirm-rollback="confirmRollbackDelete"/);
  assert.match(storySource, /@cancel-rollback="cancelRollbackDelete"/);
  assert.match(storySource, /@regenerate-message="regenerateMessage"/);
  assert.match(storySource, /aria-label="重新生成最新可重生楼层"/);

  assert.match(listSource, /request-rollback/);
  assert.match(listSource, /confirm-rollback/);
  assert.match(listSource, /cancel-rollback/);
  assert.match(listSource, /regenerate-message/);

  assert.match(cardSource, /重新生成/);
  assert.match(cardSource, /回退删除/);
  assert.match(cardSource, /删除当前及后续楼层/);
  assert.match(cardSource, /确认回退/);

  assert.match(hookSource, /rollbackConfirmMessageId/);
  assert.match(hookSource, /function collectDeletableMessageIdsFrom/);
  assert.match(hookSource, /async function deleteFromMessageId/);
  assert.match(hookSource, /await deleteChatMessages\(ids,\s*\{\s*refresh:\s*'all'\s*\}\)/);
  assert.match(hookSource, /async function regenerateMessage/);
  assert.match(hookSource, /async function regenerateLatestMessage/);
  assert.match(hookSource, /function resolveRegenerateTarget/);
  assert.match(hookSource, /findUserPromptBefore/);
  assert.match(hookSource, /await deleteChatMessages\(trailingIds,\s*\{\s*refresh:\s*'none'\s*\}\)/);
  assert.match(
    hookSource,
    /await generate\(\{\s*user_input:\s*prompt,\s*should_stream:\s*true,\s*generation_id:\s*generationId\s*\}\)/,
  );
  assert.match(hookSource, /await createChatMessages\(\[\{\s*role:\s*'assistant'/);
  assert.match(hookSource, /canDeleteFrom,/);
  assert.match(hookSource, /canReroll:\s*canDeleteFrom && \(role === 'assistant' \|\| role === 'user'\)/);
  assert.match(hookSource, /target\.role === 'user'/);
  assert.match(hookSource, /collectDeletableMessageIdsAfter/);

  assert.doesNotMatch(hookSource, /SillyTavern\.getContext\(\)\.deleteLastMessage/);
  assert.doesNotMatch(hookSource, /sendGenerationRequest/);
  assert.doesNotMatch(hookSource, /triggerSlash/);
});

test('same-layer-pre polishes typography, button affordance, and drawer readability', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(storySource, /--pre-font-sans/);
  assert.match(storySource, /--pre-font-mono/);
  assert.match(storySource, /font-size:\s*14px/);
  assert.match(storySource, /line-height:\s*1\.6/);
  assert.match(storySource, /letter-spacing:\s*0\.06em/);

  assert.match(storySource, /:aria-expanded="transcriptWindowMenuOpen"/);
  assert.match(storySource, /:aria-expanded="topbarMoreMenuOpen"/);
  assert.match(storySource, /:aria-expanded="activeUtilityDrawer === 'system'"/);
  assert.match(storySource, /aria-haspopup="menu"/);
  assert.match(storySource, /aria-haspopup="dialog"/);
  assert.match(storySource, /aria-label="打开系统面板"/);
  assert.match(storySource, /aria-label="打开剧情选项"/);

  assert.match(storySource, /cursor:\s*pointer/);
  assert.match(storySource, /:focus-visible/);
  assert.match(storySource, /outline:\s*2px solid/);
  assert.match(storySource, /min-height:\s*36px/);
  assert.match(storySource, /transition:[\s\S]*?border-color 0\.18s ease/);

  assert.match(storySource, /\.ui-bottom-tool-row\s*\{[\s\S]*?padding:\s*4px;/);
  assert.match(storySource, /\.ui-bottom-tool-row\s*\{[\s\S]*?border:\s*1px solid/);
  assert.match(storySource, /\.ui-bottom-tool-row\s*\{[\s\S]*?border-radius:\s*14px/);
  assert.match(storySource, /\.ui-bottom-tool-row \.ui-signal-btn\s*\{[\s\S]*?min-width:\s*96px/);
  assert.match(storySource, /\.ui-bottom-drawer-body\s*\{[\s\S]*?line-height:\s*1\.6/);
  assert.match(storySource, /\.ui-bottom-drawer-body\s*:deep\(\.workbench-card\)/);
});

test('same-layer-pre restores original theme choices and corrected stacking order', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const hookSource = readPre('useSameLayerPre.ts');

  for (const theme of ['tech', 'dark', 'gold', 'ios', 'ipod', 'amber']) {
    assert.match(storySource, new RegExp(`value:\\s*'${theme}'`), `theme ${theme} should be selectable`);
    assert.match(hookSource, new RegExp(`'theme-${theme}'`), `theme-${theme} should be applied to host roots`);
  }

  assert.match(storySource, /主题/);
  assert.match(storySource, /themeItems/);
  assert.match(storySource, /selectTheme/);
  assert.match(storySource, /:class="\{ active: theme === item\.value \}"/);
  assert.match(storySource, /@click="selectTheme\(item\.value\)"/);
  assert.match(hookSource, /const theme = ref<DemoTheme>\('amber'\)/);
  assert.match(hookSource, /function applyDemoTheme\(theme: DemoTheme\)/);
  assert.match(hookSource, /watch\(\s*theme,\s*value =>/);

  assert.match(storySource, /Z-INDEX 层级表/);
  assert.match(storySource, /24\s+— ui-sidebar-mask/);
  assert.match(storySource, /25\s+— ui-sidebar（侧边抽屉）/);
  assert.match(storySource, /5\s+— ui-bottom-dock/);
  assert.match(storySource, /30\s+— ui-sidebar-toggle/);
  assert.match(storySource, /2600\s+— ui-bottom-drawer/);
  assert.match(storySource, /\.ui-sidebar-mask\s*\{[\s\S]*?z-index:\s*24;/);
  assert.match(storySource, /\.ui-sidebar\s*\{[\s\S]*?z-index:\s*25;/);
  assert.match(storySource, /\.ui-bottom-dock\s*\{[\s\S]*?z-index:\s*5;/);
  assert.match(storySource, /\.ui-sidebar-toggle\s*\{[\s\S]*?z-index:\s*30;/);
  assert.match(storySource, /\.ui-bottom-drawer\s*\{[\s\S]*?z-index:\s*2600;/);
});

test('same-layer-pre left sidebar inherits the full same-layer AGENTS page without SYSTEM', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));
  const inheritedPanelSource = fs.readFileSync(
    path.join(ROOT, 'src', '寒冬末日', '界面同层版', '界面', '状态栏', 'components', 'MvuRolePanel.vue'),
    'utf8',
  );

  assert.match(storySource, /MvuRolePanel/);
  assert.match(storySource, /界面同层版\/界面\/状态栏\/components\/MvuRolePanel\.vue/);
  assert.match(storySource, /<MvuRolePanel\s*\n\s*v-if="roleDrawerOpen"/);
  assert.match(storySource, /agents-only/);
  assert.match(storySource, /:target-message-id="latestAssistantMessageId"/);
  assert.match(storySource, /:transcript-items="baseTranscriptItems"/);
  assert.match(storySource, /@collapse="closeRoleDrawer"/);
  assert.doesNotMatch(storySource, /PreMvuPanel/);
  assert.doesNotMatch(storySource, /roleTabs/);
  assert.doesNotMatch(storySource, /activeRoleKey/);

  assert.equal(fs.existsSync(path.join(PRE_ROOT, 'components', 'PreMvuPanel.vue')), false);
  assert.equal(fs.existsSync(path.join(PRE_ROOT, 'preMvuStore.ts')), false);

  assert.match(inheritedPanelSource, /agentsOnly\?:\s*boolean/);
  assert.match(inheritedPanelSource, /v-if="!agentsOnly"/);
  assert.match(inheritedPanelSource, /props\.agentsOnly === true \? null : useMvuSystemStore\(\)/);
  assert.match(inheritedPanelSource, /role-detail-portrait/);
  assert.match(inheritedPanelSource, /rolePortraitForEntry/);
  assert.match(inheritedPanelSource, /entry\.role\.内心想法/);
  assert.match(inheritedPanelSource, /entry\.role\.动作姿势/);
  assert.match(inheritedPanelSource, /entry\.role\.衣着/);
  assert.match(inheritedPanelSource, /entry\.role\.神态样貌/);
});

test('same-layer-pre wires inherited AGENTS portrait switching through light gallery entries', () => {
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(storySource, /:gallery-entries="preGalleryEntries"/);
  assert.match(storySource, /:role-portrait-overrides="rolePortraitOverrides"/);
  assert.match(storySource, /@select-role-portrait="selectRolePortraitForRole"/);
  assert.match(storySource, /@add-role-portrait-set-image="addRolePortraitSetImageForRole"/);
  assert.match(storySource, /@clear-role-portrait="clearRolePortraitForRole"/);
  assert.match(storySource, /@portrait-error="handleRolePortraitError"/);

  assert.match(storySource, /readRolePortraitOverrides/);
  assert.match(storySource, /setPrimaryRolePortraitOverride/);
  assert.match(storySource, /addRolePortraitSetImage/);
  assert.match(storySource, /clearRolePortraitOverride/);
  assert.match(storySource, /writeRolePortraitOverrides/);
  assert.match(
    storySource,
    /const rolePortraitOverrides = ref<RolePortraitOverrideMap>\(readRolePortraitOverrides\(\)\)/,
  );
  assert.match(storySource, /const preGalleryEntries = ref<ReaderGalleryEntry\[\]>\(\[\]\)/);
  assert.match(storySource, /<GalleryImageRoleAssignPicker/);
  assert.match(storySource, /:roles="preGalleryRoleAssignRoleOptions"/);
  assert.match(
    storySource,
    /function addRolePortraitEntryForRole\(roleKey: string, entry: ReaderGalleryEntry, mode: 'primary' \| 'set'/,
  );
  assert.match(storySource, /function selectRolePortraitForRole\(roleKey: string, entry: ReaderGalleryEntry\)/);
  assert.match(storySource, /function addRolePortraitSetImageForRole\(roleKey: string, entry: ReaderGalleryEntry\)/);
  assert.match(storySource, /function assignPreGalleryImageToRole\(roleKey: string\)/);
  assert.match(storySource, /function clearRolePortraitForRole\(roleKey: string\)/);
  assert.match(storySource, /function handleRolePortraitError\(key: string\)/);

  assert.doesNotMatch(storySource, /const galleryEntries =/);
  assert.doesNotMatch(storySource, /startGalleryImageCacheSession|discoverRecentNativeGalleryImages/);
});

test('same-layer-pre host visual hide survives host DOM refresh without MVU reveal work', () => {
  const controllerSource = readPre('preHostVisualHide.ts');
  const hookSource = readPre('useSameLayerPre.ts');
  const refreshTranscriptSource = extractFunctionSource(hookSource, 'refreshTranscript');

  assert.match(controllerSource, /new MutationObserver/);
  assert.match(controllerSource, /scheduleReapplyHostVisualHide/);
  assert.match(controllerSource, /for \(const id of hiddenMessageIds\) \{\s*applyOne\(id\);/);
  assert.match(controllerSource, /observer\.observe\(doc\.body,\s*\{[\s\S]*childList:\s*true,[\s\S]*subtree:\s*true,/);
  assert.match(controllerSource, /observer\.disconnect\(\)/);

  assert.match(hookSource, /collectHostVisibleMessageIds/);
  assert.match(refreshTranscriptSource, /readRecentChatMessagesForUi\(\)/);
  assert.doesNotMatch(refreshTranscriptSource, /getChatMessages\('0-\{\{lastMessageId\}\}'/);
  assert.doesNotMatch(hookSource, /retryMessageExtraAnalysisByNativeMvu/);
  assert.doesNotMatch(hookSource, /revealHiddenStoryMessagesForNativeGeneration/);
  assert.doesNotMatch(hookSource, /withHostTranscriptVisible/);
  assert.doesNotMatch(controllerSource, /\.suspend\(/);
});

test('same-layer-pre targeted message refresh preserves the existing host visual hide set', () => {
  const controllerSource = readPre('preHostVisualHide.ts');
  const hookSource = readPre('useSameLayerPre.ts');
  const applySource = extractFunctionSource(controllerSource, 'applyToMessageIds');
  const replaceSource = extractFunctionSource(controllerSource, 'replaceWithMessageIds');
  const refreshTranscriptSource = extractFunctionSource(hookSource, 'refreshTranscript');
  const targetedRefreshSource = extractFunctionSource(hookSource, 'refreshTranscriptItemsByIds');

  assert.match(controllerSource, /function replaceWithMessageIds/);
  assert.match(controllerSource, /replaceWithMessageIds,/);
  assert.doesNotMatch(applySource, /for \(const id of hiddenMessageIds\)[\s\S]*?clearOne\(id\)/);
  assert.match(replaceSource, /for \(const id of Array\.from\(hiddenMessageIds\)\)/);
  assert.match(replaceSource, /clearOne\(id\)/);
  assert.match(
    refreshTranscriptSource,
    /replaceHostVisualHide\(hostMessageIds\.length > 0 \? hostMessageIds : visibleIds\)/,
  );
  assert.match(targetedRefreshSource, /syncHostVisualHide\(targetIds\)/);
  assert.doesNotMatch(targetedRefreshSource, /replaceHostVisualHide\(/);
});

test('same-layer-pre coalesces refresh events and avoids full transcript rerender on hot paths', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const refreshTranscriptSource = extractFunctionSource(hookSource, 'refreshTranscript');
  const readRecentSource = extractFunctionSource(hookSource, 'readRecentChatMessagesForUi');

  assert.match(hookSource, /const PRE_TRANSCRIPT_TAIL_PAIR_COUNT\s*=\s*3;/);
  assert.match(hookSource, /const PRE_TRANSCRIPT_WINDOW_SIZE\s*=\s*PRE_TRANSCRIPT_TAIL_PAIR_COUNT \* 2;/);
  assert.match(hookSource, /const PRE_EVENT_REFRESH_DELAY_MS\s*=/);
  assert.match(hookSource, /const preTranscriptItemCache = new Map/);
  assert.match(hookSource, /function buildCachedTranscriptItem/);
  assert.match(hookSource, /function scheduleTranscriptRefresh/);
  assert.match(readRecentSource, /const startId = Math\.max\(1,\s*lastId - PRE_TRANSCRIPT_WINDOW_SIZE \+ 1\)/);
  assert.match(readRecentSource, /getChatMessages\(`\$\{startId\}-\$\{lastId\}`,\s*\{\s*hide_state:\s*'all'\s*\}\)/);
  assert.match(readRecentSource, /selectPreTranscriptWindow\(normalizeChatMessages\(list,\s*startId\)\)/);
  assert.doesNotMatch(readRecentSource, /Math\.max\(0,\s*lastId - PRE_TRANSCRIPT_WINDOW_SIZE \+ 1\)/);
  assert.match(hookSource, /function selectPreTranscriptWindow\(messages: ChatMessage\[\]\)/);
  assert.match(hookSource, /message\.message_id > 0/);
  assert.match(hookSource, /message\.role === 'user' \|\| message\.role === 'assistant'/);
  assert.match(hookSource, /\.slice\(-PRE_TRANSCRIPT_WINDOW_SIZE\)/);
  assert.match(refreshTranscriptSource, /visibleMessages\.map\(message =>\s*buildCachedTranscriptItem/);
  assert.match(refreshTranscriptSource, /pruneTranscriptItemCache/);
  assert.doesNotMatch(refreshTranscriptSource, /readAllChatMessages\(\)/);
  assert.doesNotMatch(refreshTranscriptSource, /getChatMessages\('0-\{\{lastMessageId\}\}'/);
  assert.doesNotMatch(hookSource, /eventOn\(eventName as any,\s*\(\) => refreshTranscript/);
  assert.match(hookSource, /eventOn\(eventName as any,\s*\(\) => scheduleTranscriptRefresh/);
});

test('same-layer-pre refreshes updated message floors without rebuilding the transcript window', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const readMessageSource = extractFunctionSource(hookSource, 'readChatMessageById');
  const targetedRefreshSource = extractFunctionSource(hookSource, 'refreshTranscriptItemsByIds');
  const scheduleTargetedSource = extractFunctionSource(hookSource, 'scheduleTargetedTranscriptRefresh');
  const flushSource = extractFunctionSource(hookSource, 'flushScheduledTranscriptRefresh');

  assert.match(readMessageSource, /getChatMessages\(`\$\{messageId\}`,\s*\{\s*hide_state:\s*'all'\s*\}\)/);
  assert.doesNotMatch(readMessageSource, /readRecentChatMessagesForUi\(\)/);
  assert.doesNotMatch(readMessageSource, /0-\{\{lastMessageId\}\}/);

  assert.match(targetedRefreshSource, /const currentItems = transcriptItems\.value/);
  assert.match(targetedRefreshSource, /readChatMessageById\(messageId\)/);
  assert.match(targetedRefreshSource, /buildCachedTranscriptItem\(message,\s*latestId,\s*carrierMessageId\)/);
  assert.doesNotMatch(targetedRefreshSource, /scheduleFullHostVisualHideSweep/);
  assert.match(
    targetedRefreshSource,
    /transcriptItems\.value = currentItems\.map\(item => updatedItems\.get\(item\.message_id\) \?\? item\)/,
  );
  assert.doesNotMatch(targetedRefreshSource, /readRecentChatMessagesForUi\(\)/);
  assert.doesNotMatch(targetedRefreshSource, /collectHostVisibleMessageIds\(\)/);

  assert.match(scheduleTargetedSource, /pendingTargetedRefreshIds/);
  assert.match(scheduleTargetedSource, /flushScheduledTranscriptRefresh\(reason\)/);
  assert.match(scheduleTargetedSource, /if \(normalizedIds\.length === 0\) \{\s*return;\s*\}/);
  assert.doesNotMatch(scheduleTargetedSource, /scheduleFullHostVisualHideSweep/);
  assert.doesNotMatch(scheduleTargetedSource, /refreshTranscript\(nextReason\)/);
  assert.match(flushSource, /const nextTargetedIds = Array\.from\(pendingTargetedRefreshIds\)/);
  assert.match(flushSource, /if \(nextMode === 'full'\)[\s\S]*?refreshTranscript\(nextReason\)/);
  assert.match(flushSource, /refreshTranscriptItemsByIds\(nextTargetedIds,\s*nextReason\)/);

  assert.match(hookSource, /const messageRefreshEvents = \[/);
  assert.match(hookSource, /tavern_events\.MESSAGE_UPDATED/);
  assert.match(hookSource, /tavern_events\.MESSAGE_EDITED/);
  assert.match(hookSource, /const messageIds = normalizeEventMessageIds\(eventArgs\)/);
  assert.match(hookSource, /scheduleTargetedTranscriptRefresh\(messageIds,\s*String\(eventName\)\)/);
});

test('same-layer-pre drops the MVU full-sweep visual recovery experiment', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const scheduleTargetedSource = extractFunctionSource(hookSource, 'scheduleTargetedTranscriptRefresh');
  const mountedSource = hookSource.slice(
    hookSource.indexOf('onMounted(() => {'),
    hookSource.indexOf('onBeforeUnmount(() => {'),
  );
  const messageRefreshStart = mountedSource.indexOf('const messageRefreshEvents = [');
  const streamEventStart = mountedSource.indexOf(
    'eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY',
    messageRefreshStart,
  );
  const messageRefreshBinding = mountedSource.slice(messageRefreshStart, streamEventStart);

  assert.doesNotMatch(hookSource, /type HostScrollSnapshot/);
  assert.doesNotMatch(hookSource, /function captureHostScrollPosition/);
  assert.doesNotMatch(hookSource, /function restoreHostScrollPosition/);
  assert.doesNotMatch(hookSource, /function runFullHostVisualHideSweep/);
  assert.doesNotMatch(hookSource, /function scheduleFullHostVisualHideSweep/);
  assert.doesNotMatch(hookSource, /PRE_HOST_VISUAL_HIDE_SWEEP_DELAY_MS/);
  assert.match(scheduleTargetedSource, /if \(normalizedIds\.length === 0\) \{\s*return;\s*\}/);
  assert.doesNotMatch(scheduleTargetedSource, /scheduleTranscriptRefresh\(reason\)/);
  assert.match(messageRefreshBinding, /scheduleTargetedTranscriptRefresh\(messageIds,\s*String\(eventName\)\)/);
  assert.doesNotMatch(messageRefreshBinding, /else\s*\{\s*scheduleTranscriptRefresh\(String\(eventName\)\)/);
  assert.doesNotMatch(hookSource, /function bindMvuHostVisualHideSweepsWhenReady/);
  assert.doesNotMatch(hookSource, /waitGlobalInitialized\('Mvu'\)/);
  assert.doesNotMatch(hookSource, /Mvu\.events\.VARIABLE_INITIALIZED/);
  assert.doesNotMatch(hookSource, /Mvu\.events\.VARIABLE_UPDATE_STARTED/);
  assert.doesNotMatch(hookSource, /Mvu\.events\.VARIABLE_UPDATE_ENDED/);
  assert.doesNotMatch(hookSource, /Mvu\.events\.BEFORE_MESSAGE_UPDATE/);
});

test('same-layer-pre createChatMessages stays free of post-create visual recovery retries', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const submitSource = extractFunctionSource(hookSource, 'submitPrompt');
  const regenerateSource = extractFunctionSource(hookSource, 'regenerateMessage');

  assert.doesNotMatch(hookSource, /PRE_POST_CREATE_HOST_VISUAL_RECOVERY_DELAYS_MS|PRE_HOST_VISUAL_HIDE_SWEEP_DELAY_MS/);
  assert.doesNotMatch(hookSource, /schedulePostCreateHostVisualRecovery/);
  assert.doesNotMatch(submitSource, /captureHostScrollPosition\(\)/);
  assert.doesNotMatch(submitSource, /post_create|scheduleFullHostVisualHideSweep/);
  assert.doesNotMatch(regenerateSource, /captureHostScrollPosition\(\)/);
  assert.doesNotMatch(regenerateSource, /post_create|scheduleFullHostVisualHideSweep/);
});

test('same-layer-pre materializes the submitted user message in host DOM for plugin-native image persistence', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const submitSource = extractFunctionSource(hookSource, 'submitPrompt');

  assert.match(
    submitSource,
    /await createChatMessages\(\[\{\s*role:\s*'user'[\s\S]*?\}\],\s*\{\s*refresh:\s*'affected'\s*\}\)/,
  );
  assert.match(submitSource, /refreshTranscript\('user_submitted'\)/);
  assert.doesNotMatch(submitSource, /appendLocalUserTranscriptItem\(text\)/);
  assert.doesNotMatch(hookSource, /function appendLocalUserTranscriptItem/);
  assert.doesNotMatch(submitSource, /scheduleTranscriptRefresh\('user_submitted'\)/);
});

test('same-layer-pre keeps user body literal so existing quotes are not wrapped again', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const renderMessageSource = extractFunctionSource(hookSource, 'renderMessageHtml');
  const userLiteralIndex = renderMessageSource.indexOf("if (role === 'user') return escapeHtml(raw);");
  const displayedFormatterIndex = renderMessageSource.indexOf(
    'formatAsDisplayedMessage(raw, { message_id: messageId })',
  );

  assert.ok(userLiteralIndex > -1, 'user floors should render escaped raw text like non-pre');
  assert.ok(displayedFormatterIndex > -1, 'assistant floors should still use Tavern displayed formatting');
  assert.ok(userLiteralIndex < displayedFormatterIndex, 'user literal render should bypass display formatting');
});

test('same-layer-pre does not run the extra Tavern regex fallback that double-wraps quoted body text', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const renderMessageSource = extractFunctionSource(hookSource, 'renderMessageHtml');

  assert.doesNotMatch(hookSource, /function regexSourceForRole/);
  assert.doesNotMatch(renderMessageSource, /formatAsTavernRegexedString/);
  assert.match(renderMessageSource, /formatAsDisplayedMessage\(raw, \{ message_id: messageId \}\)/);
  assert.match(renderMessageSource, /return escapeHtml\(raw\);/);
});

test('same-layer-pre prefers host rendered message HTML before re-running display formatting', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const hostRenderedSource = extractFunctionSource(hookSource, 'readHostRenderedMessageHtml');
  const toTranscriptItemSource = extractFunctionSource(hookSource, 'toTranscriptItem');

  assert.match(hostRenderedSource, /\.mes_text/);
  assert.match(hostRenderedSource, /normalizeDisplayedHtml/);
  assert.doesNotMatch(hostRenderedSource, /formatAsDisplayedMessage/);
  assert.match(toTranscriptItemSource, /const hostRenderedHtml = readHostRenderedMessageHtml\(message\.message_id\)/);
  assert.match(
    toTranscriptItemSource,
    /const finalHtml = hostRenderedHtml \|\| renderMessageHtml\(raw,\s*role,\s*message\.message_id\)/,
  );
});

test('same-layer-pre normalizes loose prose into Chinese reading paragraphs', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const normalizeSource = extractFunctionSource(hookSource, 'normalizeDisplayedHtml');
  const wrapSource = extractFunctionSource(hookSource, 'wrapLooseReadingParagraphs');
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));

  assert.match(normalizeSource, /wrapLooseReadingParagraphs/);
  assert.match(wrapSource, /LOOSE_PARAGRAPH_BREAK_RE/);
  assert.match(wrapSource, /pre-reading-paragraph/);
  assert.match(wrapSource, /STRUCTURED_DISPLAY_BLOCK_RE/);
  assert.match(wrapSource, /return html;/);
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(:where\(p,\s*\.pre-reading-paragraph,\s*blockquote\)\)\s*\{[\s\S]*?text-indent:\s*2em;[\s\S]*?margin-block:/,
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body\s*:deep\(:where\(p,\s*\.pre-reading-paragraph,\s*blockquote\) \+ :where\(p,\s*\.pre-reading-paragraph,\s*blockquote\)\)/,
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(:where\(ul,\s*ol,\s*pre,\s*table,\s*figure\)\)\s*\{[\s\S]*?text-indent:\s*0;/,
  );
});

test('same-layer-pre keeps body images out of prose indentation and centers them', () => {
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));

  for (const selector of [
    'figure',
    '.assistant-fallback-inline-image',
    '.assistant-fallback-generated-image',
    '.st-chatu8-image-span',
    'span.image-tag-placeholder',
    '.st-chatu8-image-container',
    '.ai-image-container',
  ]) {
    assert.match(cardSource, new RegExp(selector.replaceAll('.', '\\.')), `${selector} should be treated as media`);
  }
  assert.match(cardSource, /text-indent:\s*0;[\s\S]*?display:\s*flex;[\s\S]*?justify-content:\s*center;/);
  assert.match(cardSource, /margin-inline:\s*auto;[\s\S]*?margin-block:\s*0\.75em;/);
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(:where\(img,[\s\S]*?video,[\s\S]*?canvas,[\s\S]*?svg,[\s\S]*?iframe\)\)\s*\{[\s\S]*?display:\s*block;[\s\S]*?margin-inline:\s*auto;[\s\S]*?text-indent:\s*0;/,
    'media elements should center themselves even when Tavern wraps them in a paragraph',
  );
});

test('same-layer-pre does not masquerade as native Tavern message DOM for plugin image persistence', () => {
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));

  assert.doesNotMatch(cardSource, /class="pre-message-card mes"/);
  assert.doesNotMatch(cardSource, /:mesid="item\.message_id"/);
  assert.doesNotMatch(cardSource, /class="pre-message-card__body mes_text"/);
  assert.doesNotMatch(cardSource, /pre-message-card__plugin-block/);
  assert.doesNotMatch(cardSource, /chatMetadata|extra\.images|saveImageGroup|setChatMessages/);
});

test('same-layer-pre enables the host image gesture forwarder without owning image persistence', () => {
  const listSource = readPre(path.join('components', 'PreTranscriptList.vue'));
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));
  const forwarderSource = readPre('preHostImageGestureForwarder.ts');

  assert.doesNotMatch(cardSource, /class="pre-message-card mes"/);
  assert.doesNotMatch(cardSource, /class="pre-message-card__body mes_text"/);

  assert.match(listSource, /^\s*import\s*\{\s*installPreHostImageGestureForwarder\s*\}/m);
  assert.match(listSource, /^\s*const\s+hostImageGestureForwarder\s*=/m);
  assert.match(listSource, /^\s*useEventListener\(window,\s*'dblclick'/m);
  assert.match(listSource, /^\s*useEventListener\(window,\s*'touchend'/m);

  assert.match(forwarderSource, /from '..\/..\/..\/界面同层版\/界面\/状态栏\/hostGestureDispatch'/);
  assert.match(forwarderSource, /PRE_MESSAGE_BODY_SELECTOR\s*=\s*'\.pre-message-card__body'/);
  assert.match(forwarderSource, /dispatchHostPrimaryTrigger\(hostMesText/);
  assert.match(forwarderSource, /resolveHostMessageText/);
  assert.match(forwarderSource, /window\.frameElement/);
  assert.match(forwarderSource, /stopImmediatePropagation/);
  assert.doesNotMatch(forwarderSource, /chatMetadata|extra\.images|saveImageGroup|setChatMessages/);
});

test('same-layer-pre streaming preview stays lightweight until the done transcript render', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const rendererSource = readPre('streamRendererDisplay.ts');
  const streamComponentSource = readPre(path.join('components', 'StreamRenderer.vue'));
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));
  const streamingItemSource = hookSource.slice(
    hookSource.indexOf('const streamingItem = computed'),
    hookSource.indexOf('const visibleTranscriptItems = computed'),
  );

  assert.doesNotMatch(rendererSource, /applyRegexForDisplay/);
  assert.match(rendererSource, /formatAsDisplayedMessage\(source,\s*\{\s*message_id:\s*messageId\s*\}\)/);
  assert.match(rendererSource, /catch \(error\)[\s\S]*?escapeHtml\(source\)/);
  assert.match(cardSource, /:message-id="item\.message_id"/);
  assert.match(streamComponentSource, /buildStreamRendererHtml\(props\.message,\s*props\.role,\s*props\.messageId\)/);
  assert.match(streamingItemSource, /options:\s*\[\]/);
  assert.doesNotMatch(streamingItemSource, /extractChoiceOptions\(raw\)/);
});

test('same-layer-pre keeps the latest assistant visible in the pre transcript while host floors stay visually hidden', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.doesNotMatch(
    hookSource,
    /function shouldRenderPreTranscriptItem|latestDoneAssistantMessageId|filter\(shouldRenderPreTranscriptItem/,
    'the pre UI must not hide the latest assistant body to solve a host-floor release bug',
  );
  assert.match(
    hookSource,
    /const visibleTranscriptItems = computed\(\(\) => \{[\s\S]*return item \? \[\.\.\.transcriptItems\.value,\s*item\] : transcriptItems\.value;/,
    'the main transcript list should render the persisted latest assistant after generation completes',
  );
  assert.match(hookSource, /baseTranscriptItems:\s*transcriptItems/);
  assert.match(
    storySource,
    /const latestAssistantItem = computed\([\s\S]*baseTranscriptItems\.value[\s\S]*item => item\.role === 'assistant'/,
    'MVU, choices, and side panels should still resolve the real latest assistant from the full base transcript',
  );
  assert.doesNotMatch(
    storySource,
    /const latestAssistantItem = computed\([\s\S]*transcriptItems\.value[\s\S]*item => item\.role === 'assistant'/,
    'the visible transcript copy must not become the source of truth for latest assistant state',
  );
});

test('same-layer-pre transcript prose wraps unbroken body text without horizontal scrolling', () => {
  const listSource = readPre(path.join('components', 'PreTranscriptList.vue'));
  const cardSource = readPre(path.join('components', 'PreTranscriptMessageCard.vue'));
  const streamSource = readPre(path.join('components', 'StreamRenderer.vue'));
  const storySource = readPre(path.join('pages', 'StoryPagePre.vue'));

  assert.match(
    listSource,
    /\.pre-transcript-list\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*hidden;/,
    'the transcript rail should never let a child card create a page-level horizontal scrollbar',
  );

  assert.match(
    cardSource,
    /\.pre-message-card\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/,
    'message cards should shrink within the transcript rail instead of widening the flex column',
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/,
    'the v-html body should force ordinary unbroken strings to wrap inside the card',
  );
  assert.doesNotMatch(
    cardSource,
    /\.pre-message-card(?:__body)?\s*\{[^}]*?contain:\s*inline-size;|\.pre-message-card(?:__body)?\s*\{[^}]*?overflow-x:\s*hidden;/,
    'card containers must not use inline containment or hidden overflow because that collapses long prose height on mobile',
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(\*\)\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/,
    'all regex-generated descendants should inherit the no-widening text contract',
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(pre\),[\s\S]*?\.pre-message-card__body :deep\(code\)[\s\S]*?\{[\s\S]*?white-space:\s*pre-wrap\s*!important;[\s\S]*?overflow-x:\s*hidden;/,
    'pre/code blocks should wrap instead of requiring a local horizontal scrollbar in pre UI',
  );
  assert.match(
    cardSource,
    /\.pre-message-card__body :deep\(table\)\s*\{[\s\S]*?table-layout:\s*fixed;[\s\S]*?overflow-wrap:\s*anywhere;/,
    'tables should be constrained to the prose width when present in rendered body HTML',
  );

  assert.match(
    streamSource,
    /\.stream-renderer__body\s*\{[\s\S]*?display:\s*block;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-wrap:\s*anywhere;/,
    'streaming body should establish its own wrapping box before done rendering takes over',
  );
  assert.doesNotMatch(
    streamSource,
    /\.stream-renderer(?:__body)?\s*\{[^}]*?contain:\s*inline-size;|\.stream-renderer(?:__body)?\s*\{[^}]*?overflow-x:\s*hidden;/,
    'streaming containers must also let wrapped prose define height naturally',
  );
  assert.match(
    streamSource,
    /\.stream-renderer__body :deep\(\*\)\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/,
    'streaming regex descendants should also be prevented from widening the reader',
  );
  assert.match(
    storySource,
    /@media \(max-width:\s*760px\)[\s\S]*?\.ui-sidebar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?\}/,
    'mobile sidebars should be viewport overlays so hidden drawers do not widen ui-host-body',
  );
  assert.match(
    storySource,
    /@media \(max-width:\s*760px\)[\s\S]*?\.ui-sidebar:not\(\.open\)\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;/,
    'closed mobile sidebars should be non-visible overlays while their edge handles remain available',
  );
});

test('same-layer-pre plugin image client follows the plugin author event protocol only', () => {
  const source = readPre('pluginImageClient.ts');
  const entrySource = readPre('index.ts');

  assert.match(source, /GENERATE_IMAGE_REQUEST\s*=\s*'generate-image-request'/);
  assert.match(source, /GENERATE_IMAGE_RESPONSE\s*=\s*'generate-image-response'/);
  assert.match(source, /eventOn\(EventType\.GENERATE_IMAGE_RESPONSE/);
  assert.match(source, /eventEmit\(EventType\.GENERATE_IMAGE_REQUEST/);
  assert.match(source, /eventRemoveListener\(EventType\.GENERATE_IMAGE_RESPONSE/);
  assert.match(source, /responseData\.id !== requestId/);
  assert.doesNotMatch(source, /extra\.images/);
  assert.doesNotMatch(source, /stream_demo/);
  assert.doesNotMatch(source, /indexedDB|idb:\/\//i);
  assert.match(entrySource, /from '.\/pluginImageClient'/);
  assert.match(entrySource, /EdenSameLayerPre/);
});

test('same-layer-pre bridges host and targeted MVU writeback lifecycle without full-sweep retries', () => {
  const hookSource = readPre('useSameLayerPre.ts');
  const bridgeSource = readPre('preHostLifecycleBridge.ts');
  const controllerSource = readPre('preHostVisualHide.ts');
  const mountedSource = hookSource.slice(
    hookSource.indexOf('onMounted(() => {'),
    hookSource.indexOf('onBeforeUnmount(() => {'),
  );

  assert.match(hookSource, /from '.\/preHostLifecycleBridge'/);
  assert.match(mountedSource, /bindPreHostLifecycleBridge\(/);
  assert.match(mountedSource, /hostVisualHideController\.reapply/);
  assert.match(mountedSource, /updateStreamingPreviewText/);

  assert.match(bridgeSource, /export function bindPreHostLifecycleBridge/);
  assert.match(bridgeSource, /eventMakeFirst\(\s*tavern_events\.CHARACTER_MESSAGE_RENDERED/);
  assert.match(bridgeSource, /tavern_events\.STREAM_TOKEN_RECEIVED/);
  assert.match(bridgeSource, /tavern_events\.MORE_MESSAGES_LOADED/);
  assert.match(bridgeSource, /'chatLoaded'/);
  assert.match(bridgeSource, /#curEditTextarea/);
  assert.match(bridgeSource, /readHostLastMessageId/);
  assert.match(bridgeSource, /applyHostVisualHide\(\[messageId\]/);
  assert.match(bridgeSource, /scheduleTargetedTranscriptRefresh\(\[messageId\]/);
  assert.match(bridgeSource, /waitGlobalInitialized\('Mvu'\)/);
  assert.match(bridgeSource, /eventMakeFirst\(\s*Mvu\.events\.BEFORE_MESSAGE_UPDATE/);
  assert.match(bridgeSource, /mvu_before_message_update/);
  assert.match(bridgeSource, /requestAnimationFrame|setTimeout/);
  assert.doesNotMatch(bridgeSource, /VARIABLE_UPDATE_STARTED|VARIABLE_UPDATE_ENDED|scheduleFullHostVisualHideSweep/);
  assert.doesNotMatch(bridgeSource, /\[0,\s*80,\s*240,\s*600,\s*1200\]/);

  assert.match(controllerSource, /HOST_VISUAL_HIDE_DYNAMIC_STYLE_ID/);
  assert.match(controllerSource, /syncDynamicHostVisualHideStyles/);
  assert.match(controllerSource, /buildDynamicHostVisualHideCss/);
  assert.match(controllerSource, /mesid='\$\{messageId\}'/);
  assert.match(controllerSource, /function reapply\(\)/);
  assert.match(controllerSource, /reapply,/);
});
