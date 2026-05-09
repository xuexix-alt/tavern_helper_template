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
  assert.match(source, /setPrimaryRolePortraitOverride/);
  assert.match(source, /addRolePortraitSetImage/);
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
