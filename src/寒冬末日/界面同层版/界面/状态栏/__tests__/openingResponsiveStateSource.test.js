const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('useStreamingDemo only applies compact opening auto-collapse when no explicit opening preference has been restored or chosen', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(source, /const hasExplicitOpeningExpandedPreference = ref\(false\);/);
  assert.match(
    source,
    /if \(typeof state\.opening_expanded === 'boolean'\) \{\s*openingExpanded\.value = state\.opening_expanded;\s*hasExplicitOpeningExpandedPreference\.value = true;\s*\}/,
    'restored reader chat state should mark opening-expanded preference as explicit so layout auto-defaults stop overriding it',
  );
  assert.match(
    source,
    /function syncOpeningExpandedForLayout\(layoutMode: 'compact' \| 'reader_desktop' \| 'wide'\) \{\s*if \(hasExplicitOpeningExpandedPreference\.value\) return;\s*openingExpanded\.value = layoutMode !== 'compact';\s*\}/,
    'layout sync should auto-collapse only compact mode and leave explicit user/restored choices untouched',
  );
  assert.match(
    source,
    /function toggleOpeningExpanded\(\) \{\s*openingExpanded\.value = !openingExpanded\.value;\s*hasExplicitOpeningExpandedPreference\.value = true;\s*queuePersistReaderChatState\(\);\s*\}/,
    'manual toggle should promote the current opening state into an explicit preference before persisting',
  );
});

test('StoryPage syncs opening expanded state from shellLayoutMode on layout changes', () => {
  const source = readSource('pages/StoryPage.vue');

  assert.match(source, /syncOpeningExpandedForLayout,/);
  assert.match(
    source,
    /watch\(\s*shellLayoutMode,\s*mode => \{\s*syncOpeningExpandedForLayout\(mode\);\s*\},\s*\{ immediate: true \},\s*\);/,
    'StoryPage should feed the current iframe layout mode into the opening-expanded layout sync immediately and on future width changes',
  );
});
