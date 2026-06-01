const test = require('node:test');
const assert = require('node:assert/strict');

const { stripPluginNativePlaceholderHtml } = require('../pluginNativePlaceholderCleanup.ts');

test('stripPluginNativePlaceholderHtml removes native plugin controls but keeps inline ready images inert', () => {
  const html = `
    <p>正文第一段。</p>
    <button class="image-tag-button" data-link="image###foo###">🎨</button>
    <span class="image-tag-placeholder image-tag-container" data-stable-id="abc"></span>
    <span class="st-chatu8-image-span" data-request-id="req-1" data-image-tag="image###foo###">
      <img src="data:image/png;base64,abc" alt="旧图">
    </span>
    <div class="ai-image-container"><img src="https://example.com/native.png"></div>
    <section class="assistant-image-prompt-list"><pre>debug</pre></section>
    <p>正文第二段。</p>
  `;

  const cleaned = stripPluginNativePlaceholderHtml(html);

  assert.match(cleaned, /正文第一段/);
  assert.match(cleaned, /正文第二段/);
  assert.match(cleaned, /assistant-fallback-inline-image/);
  assert.match(cleaned, /data:image\/png;base64,abc/);
  assert.match(cleaned, /https:\/\/example.com\/native\.png/);
  assert.doesNotMatch(cleaned, /image-tag-button/);
  assert.doesNotMatch(cleaned, /image-tag-placeholder/);
  assert.doesNotMatch(cleaned, /st-chatu8-image-span/);
  assert.doesNotMatch(cleaned, /ai-image-container/);
  assert.doesNotMatch(cleaned, /assistant-image-prompt-list/);
  assert.doesNotMatch(cleaned, /image###foo###/);
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
