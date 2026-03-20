const test = require('node:test');
const assert = require('node:assert/strict');

const { stripPluginNativePlaceholderHtml } = require('../pluginNativePlaceholderCleanup.ts');

test('stripPluginNativePlaceholderHtml removes native placeholder buttons and empty containers from transcript html', () => {
  const html = `
    <p>正文第一段。</p>
    <button class="image-tag-button" data-link="image###foo###">🎨</button>
    <span class="image-tag-placeholder image-tag-container" data-stable-id="abc"></span>
    <div class="ai-image-container"></div>
    <p>正文第二段。</p>
  `;

  const cleaned = stripPluginNativePlaceholderHtml(html);

  assert.match(cleaned, /正文第一段/);
  assert.match(cleaned, /正文第二段/);
  assert.doesNotMatch(cleaned, /image-tag-button/);
  assert.doesNotMatch(cleaned, /image-tag-placeholder/);
  assert.doesNotMatch(cleaned, /ai-image-container/);
});

test('stripPluginNativePlaceholderHtml keeps unrelated content intact', () => {
  const html = `
    <p>普通正文。</p>
    <figure class="assistant-fallback-generated-image"><img src="https://example.com/a.png"></figure>
  `;

  const cleaned = stripPluginNativePlaceholderHtml(html);

  assert.match(cleaned, /assistant-fallback-generated-image/);
  assert.match(cleaned, /https:\/\/example.com\/a\.png/);
});
