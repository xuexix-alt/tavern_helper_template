const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { preGalleryRefToReaderGalleryEntry, scanLatestPreGalleryImageRefs } = require('../preGalleryImageRefs.ts');

const statusBarDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(statusBarDir, '../../../../..');

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

test('pre gallery scan merges host dom, extra.images, mes tags, and cache into one light ref', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'unit',
    messages: [
      {
        message_id: 9,
        message: 'no image here',
      },
      {
        message_id: 10,
        message: 'image###city street###',
        swipe_id: 0,
        extra: {
          images: [
            [
              {
                promptToken: 'image###city street###',
                requestId: 'req-city',
                src: 'idb://10/req-city',
              },
            ],
          ],
        },
      },
    ],
    context: {
      chatMetadata: {
        'st-chatu8': {
          data: {
            image_groups: {
              10: [
                {
                  prompt: 'city street',
                  requestId: 'req-city',
                  src: 'https://cache.example/city.png',
                },
              ],
            },
          },
        },
      },
    },
    hostArtifacts: [
      {
        messageId: 10,
        kind: 'prompt-button',
        className: 'image-tag-button',
        tag: 'image###city street###',
        link: 'image###city street###',
        requestId: 'req-city',
        src: '',
      },
    ],
  });

  assert.equal(result.selectedMessageId, 10);
  assert.equal(result.refs.length, 1);
  assert.deepEqual(result.refs[0].sources, ['host-dom', 'extra.images', 'mes_tag', 'cache']);
  assert.equal(result.refs[0].src, 'idb://10/req-city');
  assert.equal(result.refs[0].lightKey.includes('idb://'), false);
  assert.equal(result.refs[0].gestureTargetHint, 'prompt-button');
});

test('pre gallery targeted scan only refreshes requested message ids', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'MESSAGE_UPDATED',
    messageIds: [10],
    messages: [
      {
        message_id: 10,
        message: 'image###old target###',
        extra: {
          images: [
            [{ promptToken: 'image###old target###', requestId: 'req-target', src: 'data:image/png;base64,target' }],
          ],
        },
      },
      {
        message_id: 11,
        message: 'image###newer image###',
        extra: {
          images: [
            [{ promptToken: 'image###newer image###', requestId: 'req-newer', src: 'data:image/png;base64,newer' }],
          ],
        },
      },
    ],
    hostArtifacts: [],
    now: 123,
  });

  assert.equal(result.selectedMessageId, 10);
  assert.equal(result.reason, 'MESSAGE_UPDATED');
  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].requestId, 'req-target');
  assert.match(result.diagnostics.join('\n'), /定向刷新楼层 #10/);
});

test('pre gallery scan limit collects multiple recent image floors for wall mode', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'drawer_open',
    scanLimit: 2,
    messages: [
      {
        message_id: 4,
        message: 'image###old one###',
        extra: {
          images: [[{ promptToken: 'image###old one###', requestId: 'req-old', src: 'idb://4/req-old' }]],
        },
      },
      {
        message_id: 5,
        message: 'image###middle one###',
        extra: {
          images: [[{ promptToken: 'image###middle one###', requestId: 'req-middle', src: 'idb://5/req-middle' }]],
        },
      },
      {
        message_id: 6,
        message: 'image###latest prompt only###',
      },
      {
        message_id: 7,
        message: 'image###latest ready###',
        extra: {
          images: [[{ promptToken: 'image###latest ready###', requestId: 'req-latest', src: 'idb://7/req-latest' }]],
        },
      },
    ],
    hostArtifacts: [],
    now: 234,
  });

  assert.equal(result.selectedMessageId, 7);
  assert.equal(result.refs.length, 2);
  assert.deepEqual(
    result.refs.map(ref => ref.messageId),
    [7, 5],
  );
  assert.equal(result.scannedMessageCount, 3);
  assert.match(result.diagnostics.join('\n'), /图片墙范围：最近 2 个含图楼层/);
});

test('pre gallery scan prefers displayable native refs over newer prompt-only tags', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'drawer_open',
    messages: [
      {
        message_id: 4,
        message: 'older persisted image',
        extra: {
          images: [[{ promptToken: 'image###persisted old###', requestId: 'req-old', src: 'idb://4/req-old' }]],
        },
      },
      {
        message_id: 5,
        message: 'image###new prompt only###',
      },
    ],
    hostArtifacts: [],
    now: 456,
  });

  assert.equal(result.selectedMessageId, 4);
  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].src, 'idb://4/req-old');
  assert.match(result.diagnostics.join('\n'), /跳过楼层 #5/);
});

test('pre gallery scan ignores empty host dom shells without image identity', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'manual',
    messages: [
      {
        message_id: 5,
        message: 'image###first prompt### image###second prompt###',
      },
    ],
    hostArtifacts: [
      {
        messageId: 5,
        kind: 'prompt-button',
        className: 'image-tag-button',
        tag: 'image###first prompt###',
        link: 'image###first prompt###',
        requestId: 'chatu8-id-first',
        src: 'https://images.example/first.png',
      },
      {
        messageId: 5,
        kind: 'ready-image',
        className: 'st-chatu8-image-span',
        src: '',
      },
      {
        messageId: 5,
        kind: 'ready-image',
        className: 'st-chatu8-image-span',
        tag: 'image###second prompt###',
        link: 'image###second prompt###',
        requestId: 'chatu8-id-second',
        src: 'https://images.example/second.png',
      },
    ],
  });

  assert.equal(result.selectedMessageId, 5);
  assert.equal(result.refs.length, 2);
  assert.equal(result.sourceCounts['host-dom'], 2);
  assert.deepEqual(
    result.refs.map(ref => ref.requestId),
    ['chatu8-id-first', 'chatu8-id-second'],
  );
  assert.equal(
    result.refs.some(ref => ref.lightKey === 'mes:5|swipe:0'),
    false,
  );
});

test('pre gallery scan hides tag-only placeholders once native host refs are displayable', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'drawer_open',
    messages: [
      {
        message_id: 1,
        message: [
          'image###raw prompt one###',
          'image###raw prompt two###',
          'image###raw prompt three###',
          'image###raw prompt four###',
        ].join(' '),
      },
    ],
    hostArtifacts: [
      {
        messageId: 1,
        kind: 'prompt-button',
        className: 'image-tag-button st-chatu8-image-button',
        tag: 'button prompt one',
        link: 'button prompt one',
        requestId: 'chatu8-id-one',
      },
      {
        messageId: 1,
        kind: 'ready-image',
        className: 'st-chatu8-image-span',
        requestId: 'chatu8-id-one',
        src: 'data:image/png;base64,one',
      },
      {
        messageId: 1,
        kind: 'prompt-button',
        className: 'image-tag-button st-chatu8-image-button',
        tag: 'button prompt two',
        link: 'button prompt two',
        requestId: 'chatu8-id-two',
      },
      {
        messageId: 1,
        kind: 'ready-image',
        className: 'st-chatu8-image-span',
        requestId: 'chatu8-id-two',
        src: 'data:image/png;base64,two',
      },
    ],
  });

  assert.equal(result.selectedMessageId, 1);
  assert.equal(result.refs.length, 2);
  assert.equal(
    result.refs.every(ref => ref.src),
    true,
  );
  assert.equal(
    result.refs.some(ref => ref.sources.length === 1 && ref.sources[0] === 'mes_tag'),
    false,
  );
  assert.match(result.diagnostics.join('\n'), /隐藏正文 tag-only 空占位 4 条/);
});

test('pre gallery lightKey never stores image src data', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'unit',
    messages: [
      {
        message_id: 12,
        message: '',
        extra: {
          images: [[{ src: 'data:image/png;base64,VERY_HEAVY_IMAGE_DATA' }]],
        },
      },
    ],
    hostArtifacts: [],
  });

  assert.equal(result.selectedMessageId, 12);
  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].src.includes('VERY_HEAVY_IMAGE_DATA'), true);
  assert.doesNotMatch(result.refs[0].lightKey, /VERY_HEAVY_IMAGE_DATA|base64|data:image|srcHash/);
});

test('pre gallery refs convert to reader gallery entries for portrait assignment without changing light key', () => {
  const longPrompt =
    'image###sfw, 1girl, solo, Lin Yuehua, mature female, black hair, updo, hair clip, pale skin, navy silk shirt, pencil skirt###';
  const result = scanLatestPreGalleryImageRefs({
    reason: 'unit',
    messages: [
      {
        message_id: 8,
        message: longPrompt,
        extra: {
          images: [
            [
              {
                promptToken: longPrompt,
                requestId: 'req-lin',
                imageId: 'img-lin',
                src: 'idb://8/req-lin',
              },
            ],
          ],
        },
      },
    ],
    hostArtifacts: [],
  });

  const entry = preGalleryRefToReaderGalleryEntry(result.refs[0]);
  assert.equal(entry.id, result.refs[0].id);
  assert.equal(entry.messageId, 8);
  assert.equal(entry.requestId, 'req-lin');
  assert.equal(entry.imageId, 'img-lin');
  assert.equal(entry.promptToken, longPrompt);
  assert.equal(entry.anchorText, longPrompt);
  assert.equal(entry.src, 'idb://8/req-lin');
  assert.equal(entry.title, '楼层 #8 · 图片 1');
  assert.equal(entry.title.includes('sfw'), false);
  assert.ok(entry.title.length <= 18);
  assert.doesNotMatch(result.refs[0].lightKey, /idb:\/\/8\/req-lin/);
});

test('pre gallery beta stays lazy and scans only while drawer is active', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(panelSource, /defineProps<\{\s*active:\s*boolean;\s*\}>/);
  assert.match(panelSource, /if \(!props\.active\) return;/);
  assert.match(panelSource, /scheduleScan\('drawer_open'/);
  assert.match(pageSource, /<PreGalleryPanel[\s\S]*:active="galleryDrawerOpen"[\s\S]*@gallery-log="appendGalleryLog"/);
});

test('pre gallery beta event model targets refs first and hydrates DOM after render', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /function refreshImageRef\(eventName: string, \.\.\.eventArgs: unknown\[\]\)/);
  assert.match(panelSource, /function hydrateImageDom\(eventName: string, \.\.\.eventArgs: unknown\[\]\)/);
  assert.match(panelSource, /const messageIds = normalizeEventMessageIds\(eventArgs\)/);
  assert.match(
    panelSource,
    /scanLatestPreGalleryImageRefs\(\{\s*reason,\s*messageIds,\s*scanLimit: activeScanLimit\.value\s*\}\)/,
  );
  assert.match(panelSource, /tavern_events\.MESSAGE_UPDATED[\s\S]*refreshImageRef/);
  assert.match(panelSource, /tavern_events\.MESSAGE_EDITED[\s\S]*refreshImageRef/);
  assert.match(panelSource, /tavern_events\.USER_MESSAGE_RENDERED[\s\S]*hydrateImageDom/);
  assert.match(panelSource, /tavern_events\.CHARACTER_MESSAGE_RENDERED[\s\S]*hydrateImageDom/);
  assert.match(panelSource, /scheduleRenderRescan\(eventName,\s*messageIds\)/);
  assert.doesNotMatch(panelSource, /MESSAGE_RECEIVED|CHAT_CHANGED/);
});

test('pre gallery panel exposes bounded wall scan selector', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /<select v-model="scanLimitValue" @change="scanNow\('scope_change'\)">/);
  assert.match(panelSource, /value: '50'[\s\S]*scanLimit: 50/);
  assert.match(panelSource, /value: 'all'[\s\S]*scanLimit: 'all'/);
});

test('pre gallery desktop wall keeps large two to three column cards', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(pageSource, /\.ui-sidebar-right\s*\{[\s\S]*width:\s*min\(52vw, 640px\)/);
  assert.match(pageSource, /\.ui-sidebar-toggle-right\.open\s*\{[\s\S]*translateX\(calc\(-1 \* min\(52vw, 640px\)\)\)/);
  assert.match(panelSource, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%, 260px\), 1fr\)\)/);
  assert.match(
    panelSource,
    /@media \(max-width: 520px\)[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(104px, 1fr\)\)/,
  );
});

test('pre gallery and MVU role panel share portrait assignment entries', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(pageSource, /import GalleryImageRoleAssignPicker from/);
  assert.match(pageSource, /:gallery-entries="preGalleryEntries"/);
  assert.match(pageSource, /<GalleryImageRoleAssignPicker/);
  assert.match(pageSource, /:entry="galleryRoleAssignEntry"/);
  assert.match(pageSource, /:roles="preGalleryRoleAssignRoleOptions"/);
  assert.match(pageSource, /@assign="assignPreGalleryImageToRole"/);
  assert.match(
    pageSource,
    /function addRolePortraitEntryForRole\(roleKey: string, entry: ReaderGalleryEntry, mode: 'primary' \| 'set'/,
  );
  assert.match(pageSource, /addRolePortraitEntryForRole\(roleKey,\s*entry,\s*asPrimary \? 'primary' : 'set'\)/);
  assert.match(panelSource, /defineEmits<\{[\s\S]*\(event: 'assign-portrait', entry: ReaderGalleryEntry\): void/);
  assert.match(panelSource, /@click\.stop="emit\('assign-portrait', toReaderGalleryEntry\(entry\)\)"/);
  assert.match(pageSource, /@gallery-entries="updatePreGalleryEntries"/);
  assert.match(panelSource, /emit\('gallery-entries', refs\.filter\(ref => ref\.src\)\.map\(toReaderGalleryEntry\)\)/);
});

test('pre gallery portrait assignment keeps all role-list entries searchable by key fallback', () => {
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(pageSource, /function buildPrePortraitAssignableRoleTabs\(\)/);
  assert.match(pageSource, /roleProviderStore\.mainRoleEntries\.value,[\s\S]*roleProviderStore\.tempNpcEntries\.value/);
  assert.match(pageSource, /label: roleProviderName\(entry\)/);
  assert.doesNotMatch(pageSource, /filter\(roleProviderHasName\)/);
  assert.doesNotMatch(pageSource, /function roleProviderHasName/);
});

test('gallery image role assignment modal constrains long prompt labels inside the dialog', () => {
  const pickerSource = readSource('src/寒冬末日/界面同层版/界面/状态栏/components/GalleryImageRoleAssignPicker.vue');

  assert.match(pickerSource, /\.role-assign-preview-copy\s*\{[\s\S]*min-width:\s*0/);
  assert.match(pickerSource, /\.role-assign-preview-copy small\s*\{[\s\S]*display:\s*block/);
  assert.match(pickerSource, /\.role-assign-preview-copy small\s*\{[\s\S]*max-width:\s*100%/);
});

test('pre gallery beta console logs never expose raw image src payloads', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /function summarizeLogRef\(entry: PreGalleryImageRef\)/);
  assert.match(panelSource, /function summarizeImageSrc\(src: string\)/);
  assert.match(panelSource, /kind: 'data-url'/);
  assert.match(panelSource, /const safeRefs = next\.refs\.map\(summarizeLogRef\)/);
  assert.match(panelSource, /ref: summarizeLogRef\(entry\)/);
  assert.doesNotMatch(panelSource, /console\.info\('\[same-layer-pre gallery beta\] scan', \{ \.\.\.next,/);
  assert.doesNotMatch(panelSource, /console\.info\('\[same-layer-pre gallery beta\] gesture', \{ entry,/);
});

test('pre gallery routes beta diagnostics into system logs instead of inline panel logs', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(
    panelSource,
    /const emit = defineEmits<\{[\s\S]*\(event: 'gallery-log', item: PreGalleryLogItem\): void;[\s\S]*\}>/,
  );
  assert.match(panelSource, /emit\('gallery-log'/);
  assert.match(pageSource, /function appendGalleryLog\(item: PreGalleryLogItem\)/);
  assert.match(pageSource, /logItems\.value = \[/);
  assert.doesNotMatch(panelSource, /<ol class="pre-gallery-panel__log"/);
  assert.doesNotMatch(panelSource, /v-for="item in logs"/);
});
test('pre gallery gesture prefers cached host elements captured during scan', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /const HOST_ELEMENT_REF_CACHE = new Map<string, HTMLElement>\(\)/);
  assert.match(source, /rememberHostElementRef\(existing, artifact\.element\)/);
  assert.match(source, /findCachedHostElementForRef\(ref\) \?\? findHostElementForRef\(ref\)/);
  assert.match(source, /HOST_ELEMENT_REF_CACHE\.get\(ref\.lightKey\)/);
});

test('pre gallery gesture keeps plugin prompt buttons ahead of image containers for click', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /function isPluginPromptButton\(element: Element \| null \| undefined\)/);
  assert.match(source, /if \(isPluginPromptButton\(current\) && !isPluginPromptButton\(element\)\) return;/);
  assert.match(
    source,
    /if \(ref\.gestureTargetHint === 'prompt-button' && isPluginPromptButton\(element\)\) score \+= 12;/,
  );
});

test('pre gallery displayed images use native media targets instead of prompt buttons for gestures', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /const HOST_IMAGE_ELEMENT_REF_CACHE = new Map<string, HTMLElement>\(\)/);
  assert.match(source, /rememberHostImageElementRef\(existing, artifact\.element\)/);
  assert.match(
    source,
    /const imageTarget = findCachedHostImageElementForRef\(ref\) \?\? findHostImageElementForRef\(ref\)/,
  );
  assert.match(source, /const hostTarget = ref\.src \? imageTarget : buttonTarget/);
  assert.doesNotMatch(source, /mode === 'click' && hostTarget\?\.matches\('button\.image-tag-button/);
});

test('pre gallery longpress mirrors plugin image press timing rather than triple tap generation', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /function dispatchHostLongPress\(target: HTMLElement\): boolean/);
  assert.match(source, /new view\.MouseEvent\('mousedown'/);
  assert.match(source, /view\.setTimeout\(\(\) => \{[\s\S]*new view\.MouseEvent\('mouseup'/);
  assert.doesNotMatch(source, /mode === 'longpress' \? 'mobile-touch-sequence'/);
});

test('pre gallery suppresses the synthetic click that follows a long press', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /@click="handleCardClick\(entry, \$event\)"/);
  assert.match(panelSource, /const suppressClickAfterLongPress = ref\(\{ key: '', until: 0 \}\)/);
  assert.match(
    panelSource,
    /suppressClickAfterLongPress\.value = \{ key: entry\.id, until: Date\.now\(\) \+ LONG_PRESS_CLICK_SUPPRESS_MS \}/,
  );
  assert.match(panelSource, /function handleCardClick\(entry: PreGalleryImageRef, event: MouseEvent\)/);
  assert.match(panelSource, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*return;/);
});
