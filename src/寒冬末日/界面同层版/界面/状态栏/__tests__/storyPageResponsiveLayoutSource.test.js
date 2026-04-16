const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
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
    /if \(activeRoleKey\.value && !roles\.some\(role => role\.key === activeRoleKey\.value\)\) \{/,
    'selected side-panel role should only reset when it leaves the full roster, not when it is merely filtered out of visible/active quick tabs',
  );
  assert.doesNotMatch(
    source,
    /if \(activeRoleKey\.value && !visibleRoles\.some\(role => role\.key === activeRoleKey\.value\)\) \{/,
  );
});
