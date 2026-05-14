/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('buildFinalHtml routes raw `<image>` tags through sanitizeRawImageTagsInHtml so they never render as literal text', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function sanitizeRawImageTagsInHtml\(html: string\): string/,
    'a dedicated sanitize helper should handle the raw `<image>` → placeholder conversion',
  );
  assert.match(
    source,
    /const sanitizedForRuntime = sanitizeAssistantRuntimeTagsForDisplay\(renderSource \|\| '\(空回复\)'\);/,
    'runtime tag cleanup should produce the source that is then prepared for display',
  );
  assert.match(
    source,
    /const renderSourceForDisplay = sanitizeRawImageTagsInHtml\(sanitizedForRuntime\);/,
    'raw `<image>` tags should be sanitized after runtime tag cleanup and before Tavern display formatting',
  );
  assert.match(
    source,
    /formatAsDisplayedMessage\(renderSourceForDisplay, \{ message_id \}\)/,
    'buildFinalHtml should pass the sanitized display source into formatAsDisplayedMessage',
  );
  assert.match(
    source,
    /html = sanitizeRawImageTagsInHtml\(html\);/,
    'buildFinalHtml should keep the post-format sanitize pass as a defensive cleanup',
  );
  assert.match(
    source,
    /renderSource: artifactSource \?\? renderSource,/,
    'artifact injection should still see the original raw source for prompt-token matching',
  );

  // helper 的两个分支：有 src 的 <image> 转 <img>；其他情况用 st-chatu8-image-pending span 占位。
  const helperBody = source.match(/function sanitizeRawImageTagsInHtml[\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(helperBody, '', 'helper body should be parsable');
  assert.match(helperBody, /<img class="st-chatu8-image-pending"/);
  assert.match(helperBody, /<span class="st-chatu8-image-pending"/);
});

test('st-chatu8 raw image tag styling is registered in theme-tokens', () => {
  const css = readSource('theme-tokens.css');

  assert.match(
    css,
    /\.st-chatu8-image-pending\[data-raw-image-tag='true'\]/,
    'placeholder span should have a dashed loading style',
  );
  assert.match(
    css,
    /\.custom-st-chatu8-image-pending\[data-raw-image-tag='true'\]/,
    'Tavern formatter may prefix custom classes, so the pending span style should cover that variant too',
  );
  assert.match(
    css,
    /img\.st-chatu8-image-pending/,
    'placeholder img variant should have a neutral aspect-ratio background',
  );
  assert.match(
    css,
    /img\.custom-st-chatu8-image-pending/,
    'prefixed pending img variant should share the same neutral image style',
  );
  assert.match(
    css,
    /@keyframes st-chatu8-image-pending-breath/,
    'placeholder breathing animation should be registered so users see the pending hint',
  );
});

test('transcript image injection does not filter plugin-native images against themselves', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const pluginNativeSources = new Set<string>\(\);/,
    'plugin/native image sources should be tracked separately from the active injection list',
  );
  assert.match(
    source,
    /if \(image\.source === 'cache' && pluginNativeSources\.has\(normalizedSrc\)\) continue;/,
    'only cache fallback images should be skipped when a plugin-native image already owns the same src',
  );
  assert.doesNotMatch(
    source,
    /for \(const img of nativeFirstImages\)[\s\S]{0,240}if \(extraSources\.has\(normalizedSrc\)\) continue;/,
    'plugin-native images must not be skipped merely because their own src is known',
  );
});

test('transcript image injection fills raw image placeholders before anchor fallback', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /const rawImagePlaceholders = Array\.from\(doc\.body\.querySelectorAll\('\[data-raw-image-tag="true"\]'\)\)/,
    'injected images should first look for placeholder spans created from raw <image> tags',
  );
  assert.match(
    source,
    /const placeholderTarget = rawImagePlaceholders\.shift\(\);/,
    'placeholder matching should preserve message order between raw <image> tags and generated images',
  );
  assert.match(
    source,
    /placeholderTarget\.replaceWith\(figure\);/,
    'matched generated images should replace the pending placeholder instead of being dropped as unanchored',
  );
});

test('host-rendered transcript html still passes through image artifact injection without reformatting', () => {
  const source = readSource('useStreamingDemo.ts');

  assert.match(
    source,
    /function buildHostRenderedHtml\(\s*hostRenderedHtml: string,\s*renderSource: string,\s*message_id: number,\s*artifactSource\?: string,/,
    'host-rendered HTML should have a dedicated image-artifact hydration path',
  );
  const helperBody = source.match(/function buildHostRenderedHtml[\s\S]*?\n\}/)?.[0] ?? '';
  assert.notEqual(helperBody, '', 'buildHostRenderedHtml body should be parsable');
  assert.match(
    helperBody,
    /applyTranscriptArtifacts\(\{[\s\S]*appendArtifacts: appendChatu8ArtifactsToHtml,/,
    'host-rendered HTML should still hydrate prompt placeholders and ready generated images in the transcript body',
  );
  assert.doesNotMatch(
    helperBody,
    /formatAsDisplayedMessage\(/,
    'host-rendered HTML must not be sent through Tavern formatting a second time',
  );
  assert.match(
    source,
    /const hostRenderedHtml = buildHostRenderedHtml\(\s*readHostRenderedMessageHtml\(input\.id\),\s*displayRenderSource,\s*input\.id,\s*input\.raw,\s*\);/,
    'buildTranscriptItem should hydrate host-rendered HTML before using it as streamHtml/finalHtml',
  );
});
