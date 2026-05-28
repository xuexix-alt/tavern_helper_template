const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function extractFunctionBody(text, functionName) {
  const start = text.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const parenStart = text.indexOf('(', start);
  assert.notEqual(parenStart, -1, `${functionName} should have a parameter list`);
  let parenDepth = 0;
  let searchStart = parenStart;
  for (let index = parenStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        searchStart = index + 1;
        break;
      }
    }
  }
  const braceStart = text.indexOf('{', searchStart);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart + 1, index);
    }
  }
  throw new Error(`${functionName} body not found`);
}

test('StoryPage derives layout mode from iframe shell width instead of browser window width', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /const shellRef = ref<HTMLElement \| null>\(null\);/);
  assert.match(source, /useElementSize\(shellRef\)/);
  assert.match(source, /const shellLayoutMode = computed\(\(\) => \{/);
  assert.match(source, /return 'compact';/);
  assert.match(source, /return 'reader_desktop';/);
  assert.match(source, /return 'wide';/);
  assert.doesNotMatch(source, /window\.innerWidth <= 960/);
});

test('StoryPage keeps only primary actions in the top bar and moves secondary actions into a more menu', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /class="ui-icon-btn ui-more-trigger"/);
  assert.match(source, /topbarMoreMenuOpen/);
  assert.match(source, /class="ui-more-menu-list clip-corner-sm"/);
  assert.match(source, /openRoleDrawerFromMoreMenu/);
  assert.match(source, /toggleGalleryDrawer/);
  assert.match(source, /openSettingsModal/);
  assert.match(source, /toggleFullscreen/);
  assert.match(source, /handleDisableSameLayer/);
  assert.doesNotMatch(source, /<button type="button" class="ui-icon-btn" @click="openRoleDrawer">角色<\/button>/);
});

test('StoryPage compact and reader desktop top bar keep actions on one row and keep mobile drawer toggles on opposite edges', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /\.ui-host-shell\.layout-compact \.ui-topbar-actions,[\s\S]*flex:\s*1 1 auto;/);
  assert.match(source, /\.ui-host-shell\.layout-compact \.ui-topbar-actions,[\s\S]*width:\s*auto;/);
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar\s*\{[\s\S]*?left:\s*6px;[\s\S]*?right:\s*auto;[\s\S]*?transform:\s*translateX\(-100%\);/,
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar\.open\s*\{[\s\S]*?transform:\s*translateX\(0\);/,
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar-right\s*\{[\s\S]*?left:\s*auto;[\s\S]*?right:\s*6px;[\s\S]*?transform:\s*translateX\(100%\);/,
  );
  assert.match(source, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar-toggle\s*\{[\s\S]*?left:\s*0;/);
  assert.match(source, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar-toggle-right\s*\{[\s\S]*?right:\s*0;/);
});

test('StoryPage mobile drawer toggles use the same compact tab dimensions and short labels', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(
    source,
    /<span class="ui-sidebar-toggle-label">{{ shellLayoutMode === 'wide' \? '\[ 角色&系统 \]' : '角色' }}<\/span>/,
  );
  assert.match(
    source,
    /<span class="ui-sidebar-toggle-label">{{ shellLayoutMode === 'wide' \? '\[ 画廊&图片 \]' : '画廊' }}<\/span>/,
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.ui-sidebar-toggle,\s*\.ui-sidebar-toggle-right\s*\{[\s\S]*?width:\s*18px;[\s\S]*?height:\s*88px;/,
  );
});

test('MvuRolePanel compresses role metadata into the source nav and order metric area', () => {
  const source = read('../components/MvuRolePanel.vue');

  assert.match(
    source,
    /<div class="source-nav-main">[\s\S]*<strong>{{ currentSourcePill }}<\/strong>[\s\S]*<span>{{ currentSourcePosition }}<\/span>[\s\S]*<span class="source-status">{{ statusText\(entry\) }}<\/span>/,
  );
  assert.match(
    source,
    /<section class="metric-card clip-corner-sm">[\s\S]*<div class="metric-meta-inline">[\s\S]*关系[\s\S]*倾向[\s\S]*<\/div>[\s\S]*秩序刻印/,
  );
  assert.doesNotMatch(source, /meta-box meta-box-code/);
  assert.doesNotMatch(source, /#\{\{ characterCode\(entry\) \}\}/);
});

test('StoryPage keeps a manually selected departed role active while it remains in the full roster', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(
    source,
    /if \(activeRoleKey\.value && !roleKeys\.has\(activeRoleKey\.value\)\) \{/,
    'selected side-panel role should only reset when it leaves the full roster, not when it is merely filtered out of visible/active quick tabs',
  );
  assert.doesNotMatch(
    source,
    /if \(activeRoleKey\.value && !visibleRoles\.some\(role => role\.key === activeRoleKey\.value\)\) \{/,
  );
});

test('StoryPage keeps fullscreen active while plugin image menus are triggered', () => {
  const source = read('../pages/StoryPage.vue');
  const proxyBody = extractFunctionBody(source, 'proxyImageMenuToHostWithOptions');
  const regenerateBody = extractFunctionBody(source, 'activateGeneratedImageRegenerate');

  assert.doesNotMatch(source, /function withFullscreenSuspended\(/);
  assert.doesNotMatch(source, /withFullscreenSuspended\(/);
  assert.match(source, /function preparePluginMenuForFullscreen\(\): void/);
  assert.match(
    source,
    /function movePluginMenuIntoFullscreen\(node: HTMLElement, fullscreenEl: HTMLElement\): void[\s\S]*fullscreenEl\.appendChild\(node\)/,
  );
  assert.match(
    source,
    /function preparePluginMenuForFullscreen\(\): void[\s\S]*document\.fullscreenElement[\s\S]*movePluginMenuIntoFullscreen\(node, fullscreenEl\)/,
  );
  assert.match(source, /function guardPluginMenuViewport\(\): void[\s\S]*preparePluginMenuForFullscreen\(\);/);
  assert.match(proxyBody, /preparePluginMenuForFullscreen\(\);[\s\S]*dispatchHostDoubleClick/);
  assert.match(regenerateBody, /preparePluginMenuForFullscreen\(\);[\s\S]*dispatchHostImageRegenerateTrigger/);
  assert.match(source, /function toggleFullscreen\(\)[\s\S]*document\.exitFullscreen\?\.\(\);/);
});

test('StoryPage resolves existing image actions inside a target-message plugin-native lease', () => {
  const source = read('../pages/StoryPage.vue');
  const viewBody = extractFunctionBody(source, 'activateGeneratedImageView');
  const tagBody = extractFunctionBody(source, 'activateGeneratedImageTag');
  const regenerateBody = extractFunctionBody(source, 'activateGeneratedImageRegenerate');

  assert.match(source, /withPluginNativeMessageLease,/);
  assert.match(source, /ensureHostMesTextRendered,/);
  assert.match(source, /triggerImageGenerationForMessage,/);
  assert.match(
    source,
    /\} = useStreamingDemo\(\);/,
    'StoryPage should receive the targeted plugin-native lease from useStreamingDemo with the host render helpers',
  );
  assert.match(
    viewBody,
    /await withPluginNativeMessageLease\(\s*Math\.trunc\(messageId\),[\s\S]*await ensureHostMesTextRendered\(Math\.trunc\(messageId\)\);[\s\S]*triggerHostElementClick\(targetNode\)/,
    'single-click view should lease the host message before resolving and clicking the native image target',
  );
  assert.match(
    tagBody,
    /await withPluginNativeMessageLease\(\s*Math\.trunc\(messageId\),[\s\S]*await ensureHostMesTextRendered\(Math\.trunc\(messageId\)\);[\s\S]*dispatchHostImageTagTrigger\(targetNode\)/,
    'image tag gestures should lease the host message before dispatching native long-press/contextmenu events',
  );
  assert.match(
    regenerateBody,
    /await withPluginNativeMessageLease\(\s*Math\.trunc\(messageId\),[\s\S]*await ensureHostMesTextRendered\(Math\.trunc\(messageId\)\);[\s\S]*dispatchHostImageRegenerateTrigger\(targetNode\)/,
    'double-click regenerate should lease the host message before resolving the host-only regenerate target',
  );
});
