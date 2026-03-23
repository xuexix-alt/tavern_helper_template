const test = require('node:test');
const assert = require('node:assert/strict');

const { stripPluginNativePlaceholderHtml } = require('../pluginNativePlaceholderCleanup.ts');

test('stripPluginNativePlaceholderHtml preserves native placeholder/button chain while stripping debug prompt list', () => {
  const html = `
    <p>正文第一段。</p>
    <button class="image-tag-button" data-link="image###foo###">🎨</button>
    <span class="image-tag-placeholder image-tag-container" data-stable-id="abc"></span>
    <div class="ai-image-container"></div>
    <section class="assistant-image-prompt-list"><pre>debug</pre></section>
    <p>正文第二段。</p>
  `;

  const cleaned = stripPluginNativePlaceholderHtml(html);

  assert.match(cleaned, /正文第一段/);
  assert.match(cleaned, /正文第二段/);
  assert.match(cleaned, /image-tag-button/);
  assert.match(cleaned, /image-tag-placeholder/);
  assert.match(cleaned, /ai-image-container/);
  assert.doesNotMatch(cleaned, /assistant-image-prompt-list/);
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
