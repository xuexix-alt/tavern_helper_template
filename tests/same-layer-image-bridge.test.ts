const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildGeneratedImagePersistencePatch } = require('../src/寒冬末日/界面同层版/界面/状态栏/imagePersistencePatch.ts');
const { resolveGeneratedImageSource } = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageSourceResolver.ts');
const { buildGeneratedImageMarkerId } = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageMarker.ts');
const { selectGeneratedImageTriggerTarget } = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageTriggerTarget.ts');
const { shouldForceTranscriptDomRefresh, buildTranscriptEntryKey } = require('../src/寒冬末日/界面同层版/界面/状态栏/transcriptDomRefresh.ts');
const { buildHostTranscriptVisibilitySelector } = require('../src/寒冬末日/界面同层版/界面/状态栏/hostTranscriptVisibility.ts');
const { buildGeneratedImageMembership } = require('../src/寒冬末日/界面同层版/界面/状态栏/generatedImageMembership.ts');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('generated image trigger prefers host message root before iframe nodes during regenerate', () => {
  const hostMessageRoot = { id: 'host-message-root' };
  const iframeButton = { id: 'iframe-button' };
  const chosen = selectGeneratedImageTriggerTarget(
    {
      hostButton: null,
      hostImage: null,
      hostMessageRoot,
      iframeButton,
      iframeImage: null,
    },
    'regenerate',
  );

  assert.equal(chosen, hostMessageRoot);
});

test('generated image persistence patch writes stable markerId into message data entry', () => {
  const patch = buildGeneratedImagePersistencePatch({
    message: {
      message_id: 12,
      swipe_id: 0,
      data: { stream_demo: { generated_images: [] } },
      extra: {},
    },
    response: {
      requestId: 'req-1',
      prompt: '冬末###snow wolf###',
      promptToken: '冬末###snow wolf###',
      imageData: 'data:image/png;base64,abc',
    },
  });

  assert.equal(patch.nextData.stream_demo.generated_images.length, 1);
  assert.equal(
    patch.nextData.stream_demo.generated_images[0].markerId,
    buildGeneratedImageMarkerId({
      messageId: 12,
      requestId: 'req-1',
      promptToken: '冬末###snow wolf###',
      order: 0,
    }),
  );
});

test('generated image persistence patch keeps stream_demo as lightweight index without src payload', () => {
  const patch = buildGeneratedImagePersistencePatch({
    message: {
      message_id: 12,
      swipe_id: 0,
      data: { stream_demo: { generated_images: [] } },
      extra: {},
    },
    response: {
      requestId: 'req-1',
      prompt: '冬末###snow wolf###',
      promptToken: '冬末###snow wolf###',
      imageData: 'data:image/png;base64,abc',
    },
  });

  const entry = patch.nextData.stream_demo.generated_images[0];
  assert.equal(entry.src, undefined);
  assert.equal(entry.image, undefined);
  assert.equal(entry.imageData, undefined);
});

test('generated image source can resolve entity by markerId when requestId is unavailable', () => {
  const markerId = buildGeneratedImageMarkerId({
    messageId: 8,
    promptToken: '冬末###frozen city###',
    order: 0,
  });

  const resolved = resolveGeneratedImageSource(
    {
      messageId: 8,
      markerId,
    },
    {
      message_id: 8,
      swipe_id: 0,
      data: {
        stream_demo: {
          generated_images: [
            {
              markerId,
              promptToken: '冬末###frozen city###',
              src: 'data:image/png;base64,xyz',
              alt: 'generated image',
            },
          ],
        },
      },
      extra: {},
    },
    [],
  );

  assert.ok(resolved);
  assert.equal(resolved.markerId, markerId);
  assert.equal(resolved.src, 'data:image/png;base64,xyz');
});

test('image lifecycle forces transcript DOM refresh for request and persist stages', () => {
  assert.equal(shouldForceTranscriptDomRefresh('image:request:8'), true);
  assert.equal(shouldForceTranscriptDomRefresh('image:persist:8'), true);
  assert.equal(shouldForceTranscriptDomRefresh('host.plugin_native_dom_mutation'), true);
  assert.equal(shouldForceTranscriptDomRefresh('event:message_received'), false);
});

test('transcript entry key changes when dom revision changes', () => {
  assert.notEqual(buildTranscriptEntryKey(8, 0), buildTranscriptEntryKey(8, 1));
});

test('host transcript visibility selector keeps container visible and hides other messages', () => {
  assert.equal(
    buildHostTranscriptVisibilitySelector(0),
    "body.stream-demo-hide-host-chat #chat > .mes[mesid]:not([mesid='0'])",
  );
  assert.equal(
    buildHostTranscriptVisibilitySelector(7),
    "body.stream-demo-hide-host-chat #chat > .mes[mesid]:not([mesid='7'])",
  );
});

test('generated image membership ignores cache-only foreign entries when discovering members', () => {
  const membership = buildGeneratedImageMembership({
    messageId: 4,
    promptTokens: ['image###prompt-a###', 'image###prompt-b###'],
    persistedEntries: [
      {
        markerId: buildGeneratedImageMarkerId({ messageId: 4, promptToken: 'image###prompt-a###', order: 0 }),
        promptToken: 'image###prompt-a###',
        requestId: 'req-a',
      },
    ],
  });

  assert.equal(membership.length, 2);
  assert.equal(membership[0].promptToken, 'image###prompt-a###');
  assert.equal(membership[1].promptToken, 'image###prompt-b###');
});

test('generated image membership appends persisted-only entries after prompt-derived members', () => {
  const extraMarker = buildGeneratedImageMarkerId({ messageId: 4, requestId: 'req-extra', order: 2 });
  const membership = buildGeneratedImageMembership({
    messageId: 4,
    promptTokens: ['image###prompt-a###'],
    persistedEntries: [
      {
        markerId: buildGeneratedImageMarkerId({ messageId: 4, promptToken: 'image###prompt-a###', order: 0 }),
        promptToken: 'image###prompt-a###',
        requestId: 'req-a',
      },
      {
        markerId: extraMarker,
        promptToken: 'image###prompt-extra###',
        requestId: 'req-extra',
      },
    ],
  });

  assert.equal(membership.length, 2);
  assert.equal(membership[1].markerId, extraMarker);
});

test('generated image asset re-resolves when shared entity revision changes', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/GeneratedImageAsset.vue'),
    'utf8',
  );
  assert.match(source, /generatedImageEntityRevision/);
});

test('generated image asset exposes direct open and regenerate interactions', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/GeneratedImageAsset.vue'),
    'utf8',
  );
  assert.match(source, /defineEmits<\{/);
  assert.match(source, /@click(?:\.stop)?=/);
  assert.match(source, /@dblclick(?:\.[a-z]+)*=/);
});

test('transcript and gallery forward generated image open and regenerate events', () => {
  const transcriptSource = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue'),
    'utf8',
  );
  const gallerySource = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/ImageGalleryPanel.vue'),
    'utf8',
  );
  assert.match(transcriptSource, /@open=/);
  assert.match(transcriptSource, /@regenerate=/);
  assert.match(gallerySource, /@open=/);
  assert.match(gallerySource, /@regenerate=/);
});

test('story page handles direct generated image open and regenerate events', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue'),
    'utf8',
  );
  assert.match(source, /@open-image=/);
  assert.match(source, /@regenerate-image=/);
  assert.match(source, /function handleGeneratedImageOpen/);
  assert.match(source, /function handleGeneratedImageRegenerate/);
});

test('story page bypasses bridge for already resolved generated images', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue'),
    'utf8',
  );
  assert.match(source, /shouldBypassGeneratedImageBridge/);
});

test('transcript message card source no longer uses body proxy overlay for image interactions', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/TranscriptMessageCard.vue'),
    'utf8',
  );
  assert.equal(source.includes('assistant-body-proxy'), false);
  assert.match(source, /\.assistant-body\s*\{[\s\S]*pointer-events:\s*auto;/);
});

test('useStreamingDemo buildFinalHtml integrates persisted image decoration into final html', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts'),
    'utf8',
  );
  assert.match(source, /function buildFinalHtml\([\s\S]*appendChatu8ArtifactsToHtml\(html, renderSource, message_id\)/);
});

test('generated image persistence patch stores anchorText and keeps extra prompt fields slim', () => {
  const patch = buildGeneratedImagePersistencePatch({
    message: {
      message_id: 12,
      swipe_id: 0,
      data: { stream_demo: { generated_images: [] } },
      extra: {},
    },
    response: {
      requestId: 'req-1',
      prompt: '冬末雪原 raw prompt',
      promptToken: '冬末###snow wolf###',
      imageData: 'data:image/png;base64,abc',
    },
    anchorText: '他抬头看向风雪里的街道',
  });

  const dataEntry = patch.nextData.stream_demo.generated_images[0];
  const extraEntry = patch.nextExtra.images[0][0];
  assert.equal(dataEntry.anchorText, '他抬头看向风雪里的街道');
  assert.equal(extraEntry.regex, '他抬头看向风雪里的街道');
  assert.equal(extraEntry.promptToken, '冬末###snow wolf###');
  assert.equal(extraEntry.prompt, undefined);
  assert.deepEqual(patch.nextExtra.lockedTags ?? [], []);
});

test('desktop app shell does not clip teleported utility drawers', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/App.vue'),
    'utf8',
  );
  assert.match(source, /@media \(min-width: 761px\)[\s\S]*\.doc-shell-root\s*\{[\s\S]*overflow:\s*visible;/);
});

test('choice modal layer stays above desktop utility drawer overlays', () => {
  const storySource = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue'),
    'utf8',
  );
  const composerSource = fs.readFileSync(
    path.join(process.cwd(), 'src/寒冬末日/界面同层版/界面/状态栏/components/BottomComposer.vue'),
    'utf8',
  );

  const drawerZIndex = Number(storySource.match(/\.ui-bottom-drawer\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1] ?? NaN);
  const maskZIndex = Number(storySource.match(/\.ui-utility-mask\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1] ?? NaN);
  const choiceModalZIndex = Number(
    composerSource.match(/\.choice-modal-mask\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1] ?? NaN,
  );

  assert.ok(Number.isFinite(drawerZIndex));
  assert.ok(Number.isFinite(maskZIndex));
  assert.ok(Number.isFinite(choiceModalZIndex));
  assert.ok(choiceModalZIndex > drawerZIndex);
  assert.ok(choiceModalZIndex > maskZIndex);
});
