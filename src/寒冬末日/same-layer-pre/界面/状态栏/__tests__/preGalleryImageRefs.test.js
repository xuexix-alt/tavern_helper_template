const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  classifyPreGalleryImageRef,
  preGalleryRefToReaderGalleryEntry,
  scanLatestPreGalleryImageRefs,
} = require('../preGalleryImageRefs.ts');

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

test('pre gallery scan records a safe host-versus-iframe probe for current image floors', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /function collectPreGalleryRuntimeProbe\(messageId: number\)/);
  assert.match(source, /宿主节点:/);
  assert.match(source, /pre正文节点:/);
  assert.match(source, /data-url|blob-url|url|empty/);
  assert.doesNotMatch(source, /JSON\.stringify\(.*currentSrc|JSON\.stringify\(.*\.src/);
});

test('pre gallery can use visible pre-body images as temporary refs without treating them as host gesture targets', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /'pre-render'/);
  assert.match(source, /function collectPreVisibleGalleryArtifacts\(messageId: number, rawMessage: string\)/);
  assert.match(source, /\.pre-message-card\[data-message-id=/);
  assert.match(source, /source: 'pre-render'/);
  assert.match(source, /if \(source === 'host-dom'\)/);
  assert.match(source, /promptTokens\[index\]/);
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

test('pre gallery assigns distinct stable orders to same-floor images without plugin identities', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'unit',
    messages: [
      {
        message_id: 24,
        message: '',
        swipe_id: 0,
        extra: {
          images: [[{ src: 'data:image/png;base64,first' }, { src: 'data:image/png;base64,second' }]],
        },
      },
    ],
    hostArtifacts: [],
  });

  assert.equal(result.refs.length, 2);
  assert.deepEqual(
    result.refs.map(ref => ref.createdOrder),
    [0, 1],
  );
  assert.deepEqual(
    result.refs.map(preGalleryRefToReaderGalleryEntry).map(entry => entry.createdOrder),
    [0, 1],
  );
});

test('pre gallery keeps the plugin regex fingerprint separate from the prompt token', () => {
  const result = scanLatestPreGalleryImageRefs({
    reason: 'beta_regex',
    messages: [
      {
        message_id: 31,
        message: 'image###city street###',
        extra: {
          images: [
            [
              {
                regex: 'city\\s+street',
                tag: 'image###city street###',
                link: 'image###city street###',
                requestId: 'req-regex',
                src: 'idb://31/req-regex',
              },
            ],
          ],
        },
      },
    ],
    hostArtifacts: [],
  });

  assert.equal(result.refs.length, 1);
  assert.equal(result.refs[0].regex, 'city\\s+street');
  assert.equal(result.refs[0].promptToken, 'image###city street###');
  assert.equal(result.refs[0].requestId, 'req-regex');
});

test('pre gallery beta classifies media readiness and native interaction target separately', () => {
  const ready = classifyPreGalleryImageRef(
    {
      src: 'idb://ready',
      requestId: 'req-ready',
      imageId: '',
      tag: 'image###ready###',
      link: 'image###ready###',
      promptToken: 'image###ready###',
      regex: 'ready',
      sources: ['extra.images'],
    },
    { targetKind: 'ready-image', longPressTargetKind: 'ready-image' },
  );
  const placeholder = classifyPreGalleryImageRef(
    {
      src: '',
      requestId: 'req-pending',
      imageId: '',
      tag: 'image###pending###',
      link: 'image###pending###',
      promptToken: 'image###pending###',
      regex: 'pending',
      sources: ['host-dom'],
    },
    { targetKind: 'prompt-button', longPressTargetKind: 'prompt-button' },
  );
  const tagOnly = classifyPreGalleryImageRef(
    {
      src: '',
      requestId: '',
      imageId: '',
      tag: 'image###tag-only###',
      link: 'image###tag-only###',
      promptToken: 'image###tag-only###',
      regex: 'tag-only',
      sources: ['mes_tag'],
    },
    { targetKind: 'none', longPressTargetKind: 'none' },
  );

  assert.deepEqual([ready.stage, ready.mediaState, ready.hostTargetKind], ['ready', 'media-ready', 'ready-image']);
  assert.deepEqual(
    [placeholder.stage, placeholder.mediaState, placeholder.hostTargetKind],
    ['placeholder', 'placeholder-only', 'prompt-button'],
  );
  assert.deepEqual([tagOnly.stage, tagOnly.mediaState, tagOnly.hostTargetKind], ['tag-only', 'token-only', 'none']);
});

test('pre gallery beta stays lazy and scans only while drawer is active', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(panelSource, /defineProps<\{\s*active:\s*boolean;\s*\}>/);
  assert.match(panelSource, /if \(!props\.active\) return;/);
  assert.match(panelSource, /scheduleScan\('drawer_open'/);
  assert.match(pageSource, /<PreGalleryPanel[\s\S]*:active="galleryDrawerOpen"[\s\S]*@gallery-log="appendGalleryLog"/);
});

test('pre gallery Beta diagnostic modal is wired as a read-only right-side test surface', () => {
  const modalSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryBetaModal.vue');
  const pageSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/pages/StoryPagePre.vue');

  assert.match(pageSource, /aria-label="打开 Beta 画廊诊断"/);
  assert.match(pageSource, /<PreGalleryBetaModal[\s\S]*:open="betaModalOpen"/);
  assert.match(modalSource, /scanLatestPreGalleryImageRefs/);
  assert.match(modalSource, /dispatchPreGalleryImageRefGesture/);
  assert.match(modalSource, /beginPreGalleryImageRefLongPress/);
  assert.match(modalSource, /finishPreGalleryImageRefLongPress/);
  assert.match(modalSource, /classifyPreGalleryImageRef/);
  assert.match(modalSource, /messageId|requestId|imageId|regex|tag|link/);
  assert.match(modalSource, /PLACEHOLDER/);
  assert.match(modalSource, /generate-image-request/);
  assert.doesNotMatch(modalSource, /message\s*\.\s*extra\s*\.\s*images/);
  assert.doesNotMatch(modalSource, /emitGenerate|triggerGeneration/);
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

test('pre gallery displayed images prefer the exact plugin-bound iframe media target before host fallback', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /const HOST_IMAGE_ELEMENT_REF_CACHE = new Map<string, HTMLElement>\(\)/);
  assert.match(source, /rememberHostImageElementRef\(existing, artifact\.element\)/);
  assert.match(source, /function findPreNativeImageElementForRef\(ref: PreGalleryImageRef\)/);
  assert.match(source, /const preImageTarget = findPreNativeImageElementForRef\(ref\);/);
  assert.match(
    source,
    /const imageTarget = findCachedHostImageElementForRef\(ref\) \?\? findHostImageElementForRef\(ref\)/,
  );
  assert.match(source, /export function resolvePreGalleryHostInteraction\(ref: PreGalleryImageRef\)/);
  assert.match(source, /const target = ref\.src \? \(?preImageTarget \?\? imageTarget\)? : buttonTarget/);
  assert.match(source, /targetKind: 'iframe-ready-image'/);
  assert.doesNotMatch(source, /if \(element\.matches\('img,video'\)\) score \+= 4;/);
  assert.doesNotMatch(source, /mode === 'click' && hostTarget\?\.matches\('button\.image-tag-button/);
});

test('pre gallery resolves parent-window host media without iframe realm instanceof checks', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /function isElementLike\(/);
  assert.match(source, /if \(element\.matches\('img,video'\)\)/);
  assert.match(source, /if \(isElementLike\(mesText\)\) return mesText;/);
  assert.match(source, /\.filter\(isElementLike\)/);
  assert.doesNotMatch(source, /mesText instanceof HTMLElement/);
  assert.doesNotMatch(source, /element\): element is HTMLElement => element instanceof HTMLElement/);
  assert.doesNotMatch(source, /instanceof HTMLImageElement/);
});

test('pre gallery longpress mirrors the real press duration on the exact plugin button before falling back to media', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(source, /longPressTarget: HTMLElement \| null;/);
  assert.match(source, /const longPressTarget = buttonTarget \?\? preImageTarget \?\? imageTarget;/);
  assert.match(source, /export function beginPreGalleryImageRefLongPress\(ref: PreGalleryImageRef\)/);
  assert.match(source, /export function finishPreGalleryImageRefLongPress\(session: PreGalleryLongPressSession\)/);
  assert.match(panelSource, /@pointerdown="startLongPress\(entry, \$event\)"/);
  assert.match(panelSource, /beginPreGalleryImageRefLongPress\(entry\)/);
  assert.match(panelSource, /finishPreGalleryImageRefLongPress\(session\)/);
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

test('pre gallery only dispatches to an exact native target and keeps host fallback strictly identity-bound', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /export function resolvePreGalleryHostInteraction\(ref: PreGalleryImageRef\)/);
  assert.match(source, /const target = ref\.src \? \(?preImageTarget \?\? imageTarget\)? : buttonTarget;/);
  assert.match(source, /const hasExactIdentity = Boolean\(/);
  assert.match(source, /if \(!hasExactIdentity\) return 0;/);
  assert.doesNotMatch(source, /const target = hostTarget \?\? mesText;/);
  assert.match(source, /const strategy: HostGestureDispatchStrategy = 'auto';/);
  assert.match(source, /宿主未找到与该图片精确对应的原生节点/);
});

test('pre gallery maps regenerate to the current plugin delegated dblclick protocol', () => {
  const source = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/preGalleryImageRefs.ts');

  assert.match(source, /function dispatchPluginReadyImageClickSequence\(target: HTMLElement\): boolean/);
  assert.match(
    source,
    /interaction\.targetKind === 'iframe-ready-image' \|\| interaction\.targetKind === 'ready-image'/,
  );
  assert.match(source, /method: iframeNative \? 'iframe-native-click' : 'host-click'/);
  assert.match(source, /method: iframeNative \? 'iframe-native-longpress' : 'host-longpress'/);
  assert.match(
    source,
    /method:\s*interaction\.targetKind === 'iframe-ready-image'\s*\?\s*'iframe-native-click-sequence'\s*:\s*'host-native-click-sequence'/,
  );
  assert.match(source, /target\.dispatchEvent\(firstClick\)/);
  assert.match(source, /target\.dispatchEvent\(secondClick\)/);
  assert.match(source, /PRE_GALLERY_NATIVE_LONG_PRESS_MS = 1200/);
  assert.doesNotMatch(source, /new view\.MouseEvent\('dblclick'/);
  assert.match(source, /已按插件当前 click-click 委托协议派发图片重生/);
});

test('pre gallery uses pointer-up for mobile taps and the native plugin hold duration', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /@dblclick\.prevent="handleCardDoubleClick\(entry, \$event\)"/);
  assert.match(panelSource, /@pointerup="handleCardPointerUp\(entry, \$event\)"/);
  assert.doesNotMatch(panelSource, /@pointerup="cancelLongPress"/);
  assert.match(panelSource, /const LONG_PRESS_MS = PRE_GALLERY_NATIVE_LONG_PRESS_MS;/);
  assert.match(panelSource, /function handleCardPointerUp\(entry: PreGalleryImageRef, event: PointerEvent\)/);
  assert.match(panelSource, /function recordMobilePointerTap\(entry: PreGalleryImageRef\)/);
  assert.match(panelSource, /event\.pointerType === 'touch'/);
  assert.match(
    panelSource,
    /function recordMobilePointerTap\([\s\S]*?clearPendingClick\(\);[\s\S]*?resetMobileTapState\(\);/,
  );
  assert.match(
    panelSource,
    /function startLongPress\([\s\S]*?if \(event\.pointerType !== 'touch'\) resetMobileTapState\(\);/,
  );
  assert.match(panelSource, /event\.preventDefault\(\)/);
  assert.match(panelSource, /touch-action: manipulation;/);
  assert.match(panelSource, /const DESKTOP_DOUBLE_CLICK_WINDOW_MS = 260;/);
  assert.match(panelSource, /const MOBILE_DOUBLE_TAP_COUNT = 2;/);
  assert.match(panelSource, /elapsedMs <= MOBILE_DOUBLE_TAP_WINDOW_MS/);
  assert.doesNotMatch(panelSource, /MOBILE_TRIPLE_TAP_WINDOW_MS/);
  assert.match(panelSource, /function schedulePendingClick\(/);
  assert.match(panelSource, /function handleCardDoubleClick\(/);
  assert.match(
    panelSource,
    /if \(count < MOBILE_DOUBLE_TAP_COUNT\) \{[\s\S]*schedulePendingClick\(entry, MOBILE_DOUBLE_TAP_WINDOW_MS\)/,
  );
  assert.match(panelSource, /画廊手势识别/);
  assert.match(panelSource, /mobile pointer tap #\$\{count\}\/\$\{MOBILE_DOUBLE_TAP_COUNT\}/);
  assert.match(panelSource, /desktop click -> waiting native dblclick/);
  assert.match(panelSource, /mobile pointer tap #\$\{count\} -> click sequence/);
  assert.match(panelSource, /dispatchGesture\(entry, 'dblclick'\)/);
});

test('pre gallery performs one bounded active rescan when an image event carries no message id', () => {
  const panelSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryPanel.vue');

  assert.match(panelSource, /scheduleScan\(`\$\{eventName\}:idless`, LAZY_RESCAN_DELAY_MS\)/);
  assert.match(panelSource, /scheduleRenderRescan\(`\$\{eventName\}:idless`\)/);
  assert.doesNotMatch(panelSource, /MESSAGE_RECEIVED|CHAT_CHANGED/);
});

test('pre gallery beta audit records evidence boundaries and native delegation semantics', () => {
  const audit = readSource('docs/same-layer-pre画廊beta全量审计说明.md');
  const modalSource = readSource('src/寒冬末日/same-layer-pre/界面/状态栏/components/PreGalleryBetaModal.vue');

  assert.match(audit, /对自身状态只读/);
  assert.match(audit, /可以委托宿主原生节点/);
  assert.match(audit, /#1\/2; same=false/);
  assert.match(audit, /无条件调用 `resetMobileTapState\(\)`/);
  assert.match(audit, /1200ms/);
  assert.match(audit, /旧版[^\n]*500ms/);
  assert.match(audit, /派发到.*目标/);
  assert.match(audit, /尚需设备现场复验/);
  assert.doesNotMatch(modalSource, /eventEmit\(['"]generate-image-request/);
});
