/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('StoryPage keeps the bottom role rack as plain quick buttons and passes portrait data to MvuRolePanel', () => {
  const source = read('../pages/StoryPage.vue');

  assert.doesNotMatch(source, /import RoleFlipTab from '\.\.\/components\/RoleFlipTab\.vue';/);
  assert.doesNotMatch(source, /<RoleFlipTab/);
  assert.match(source, /class="ui-role-card clip-corner-sm"/);
  assert.match(source, /const activeRoleTabs = roleTabs\.value\.filter/);
  assert.match(source, /return activeRoleTabs\.length > 0 \? activeRoleTabs : roleTabs\.value;/);
  assert.match(source, /:gallery-entries="galleryEntries"/);
  assert.match(source, /:role-portrait-overrides="rolePortraitOverrides"/);
  assert.match(source, /@select-role-portrait="selectRolePortraitForRole"/);
  assert.match(source, /@add-role-portrait-set-image="addRolePortraitSetImageForRole"/);
  assert.match(source, /@clear-role-portrait="clearRolePortraitForRole"/);
  assert.match(source, /setPrimaryRolePortraitOverride/);
  assert.match(source, /addRolePortraitSetImage/);
  assert.match(source, /clearRolePortraitOverride/);
});

test('StoryPage does not mount the old radial role wheel', () => {
  const source = read('../pages/StoryPage.vue');

  assert.doesNotMatch(source, /<RadialQuickMenu/);
});

test('MvuRolePanel owns the role detail flip portrait surface', () => {
  const source = read('../components/MvuRolePanel.vue');

  assert.match(source, /import RolePortraitPicker from '\.\/RolePortraitPicker\.vue';/);
  assert.match(source, /resolveRolePortrait\(/);
  assert.match(source, /class="role-detail-flip"/);
  assert.match(source, /class="role-detail-face role-detail-front"/);
  assert.match(source, /class="role-detail-face role-detail-back"/);
  assert.match(source, /class="role-detail-set-strip"/);
  assert.match(source, /v-for="setEntry in rolePortraitSetForEntry\(entry\)"/);
  assert.match(source, /@click="toggleRolePortraitFlip\(entry\.key\)"/);
  assert.match(source, /@click\.stop="openRolePortraitPicker\(entry\.key\)"/);
  assert.match(source, /@click\.stop="selectRolePortraitForRole\(entry, setEntry\)"/);
  assert.match(source, /@click\.stop="clearRolePortraitForEntry\(entry\)"/);
  assert.match(source, /function hasRolePortraitOverride/);
});

test('gallery role assignment uses the full role tab roster so offstage roles stay searchable', () => {
  const source = read('../pages/StoryPage.vue');

  assert.match(source, /const portraitAssignableRoleTabs = computed/);
  assert.match(source, /buildPortraitAssignableRoleTabsFromProvider/);
  assert.match(source, /roleProviderHasName/);
  assert.match(source, /roleProviderStore\.mainRoleEntries\.value,[\s\S]*roleProviderStore\.tempNpcEntries\.value/);
  assert.match(source, /return portraitAssignableRoleTabs\.value\.map/);
  assert.doesNotMatch(source, /return visibleRoleTabs\.value\.map\(role => \(\{/);
  assert.doesNotMatch(
    source,
    /galleryRoleAssignRoleOptions[\s\S]{0,800}galleryRoleAssignEntry\.value[\s\S]{0,800}characterName/,
    'gallery assignment target roster should come from MVU role cards, not the selected image recognized character name',
  );
});

test('MvuRolePanel sanitizes generated image labels in the portrait set strip', () => {
  const source = read('../components/MvuRolePanel.vue');

  assert.match(source, /import \{ formatImageDisplayName \} from '\.\.\/generatedImagePromptMetadata';/);
  assert.match(source, /:title="rolePortraitSetEntryLabel\(entry, setEntry\)"/);
  assert.match(source, /:alt="rolePortraitSetEntryLabel\(entry, setEntry\)"/);
  assert.match(source, /function rolePortraitSetEntryLabel/);
  assert.match(source, /formatImageDisplayName\(setEntry\.title \|\| setEntry\.characterName \|\| roleName\(entry\)/);
  assert.doesNotMatch(source, /:title="setEntry\.title \|\| setEntry\.characterName \|\| roleName\(entry\)"/);
});

test('RolePortraitPicker filters gallery candidates by selected role without mutating gallery state', () => {
  const source = read('../components/RolePortraitPicker.vue');

  assert.match(source, /const roleEntries = computed/);
  assert.match(source, /findGalleryEntriesForRole/);
  assert.match(source, /\(event: 'select', entry: ReaderGalleryEntry\): void;/);
  assert.match(source, /\(event: 'add', entry: ReaderGalleryEntry\): void;/);
  assert.match(source, /class="portrait-add-btn/);
  assert.match(source, /displayImageName\(entry\.title \|\| entry\.characterName \|\| roleLabel\)/);
  assert.doesNotMatch(source, /writeGalleryManifestRecord|storeGalleryBinary|galleryCatalogPersistence/);
});

test('gallery image portrait assignment is a compact icon beside the image name', () => {
  const source = read('../components/GeneratedImageAsset.vue');

  assert.match(source, /class="generated-image-caption-main"/);
  assert.match(source, /class="generated-image-assign-icon-btn clip-corner-sm"/);
  assert.match(source, /aria-hidden="true"/);
  assert.doesNotMatch(source, />\s*设为立绘\s*</);
  assert.doesNotMatch(
    source,
    /<strong>\{\{ entry\.characterName \|\| entry\.title \}\}<\/strong>\s*<small>\{\{ entry\.title \}\}<\/small>/,
  );
});

test('gallery images expose the compact refresh icon only when the entry can target native regenerate', () => {
  const source = read('../components/GeneratedImageAsset.vue');
  const typesSource = read('../types.ts');
  const streamingSource = read('../useStreamingDemo.ts');

  assert.match(source, /class="generated-image-caption-actions"/);
  assert.match(
    source,
    /v-if="showRegenerateAction"[\s\S]{0,180}class="generated-image-regenerate-icon-btn clip-corner-sm"/,
  );
  assert.match(source, /title="重新生成图片"/);
  assert.match(source, /aria-label="重新生成图片"/);
  assert.match(source, /@click\.stop\.capture="handleRegenerateClick"/);
  assert.match(source, /const canRegenerate = computed\(\(\) => props\.entry\.canRegenerate === true\);/);
  assert.match(source, /const showRegenerateAction = computed\(\(\) => props\.variant === 'gallery' && canRegenerate\.value\);/);
  assert.match(source, /if \(!canRegenerate\.value\) return;/);
  assert.match(source, /emit\('regenerate', activationPayload\.value\)/);
  assert.match(source, /source: props\.variant === 'gallery' \? 'gallery' : 'transcript'/);
  assert.match(typesSource, /canRegenerate\?: boolean;/);
  assert.match(streamingSource, /canRegenerate: canRegenerateFromHostDomArtifacts\(/);
  assert.match(streamingSource, /const hasNativeRegenerateIdentity = Boolean\(requestId \|\| promptTokenCompare\);/);
  assert.match(streamingSource, /if \(!hasNativeRegenerateIdentity\) return false;/);
  assert.match(streamingSource, /canRegenerate: true,/);
});
