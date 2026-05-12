const test = require('node:test');
const assert = require('node:assert/strict');

const {
  stripVisibleChatu8PromptTokensHtml,
  stripVisibleChatu8PromptTokensText,
} = require('../chatu8PromptTokenDisplay.ts');

test('stripVisibleChatu8PromptTokensHtml hides visible prompt tokens during streaming display', () => {
  const html = [
    '<p>正文前 image###sfw, 1girl, ${"name":"fujii yukino"}$### 正文后</p>',
    '<button class="image-tag-button" data-link="image###sfw, 1girl###">生成图片</button>',
  ].join('');

  const cleaned = stripVisibleChatu8PromptTokensHtml(html);

  assert.equal(cleaned.includes('正文前'), true);
  assert.equal(cleaned.includes('正文后'), true);
  assert.equal(cleaned.includes('fujii yukino'), false);
  assert.match(cleaned, /data-link="image###sfw, 1girl###"/);
});

test('stripVisibleChatu8PromptTokensText removes visible prompt tokens from plain text while leaving other content intact', () => {
  const input = '正文前 image###sfw, 1girl, ${"name":"fujii yukino"}$### 正文后 image###coat, winter### 正文末';

  const cleaned = stripVisibleChatu8PromptTokensText(input);

  assert.equal(cleaned.includes('正文前'), true);
  assert.equal(cleaned.includes('正文末'), true);
  assert.equal(cleaned.includes('fujii yukino'), false);
  assert.equal(cleaned.includes('coat, winter'), false);
});

test('stripVisibleChatu8PromptTokensText short circuits when the text has no marker at all', () => {
  const input = '正文完全不含提示词，什么都不该改动。';
  assert.equal(stripVisibleChatu8PromptTokensText(input), input);
});

test('TranscriptMessageCard sanitizes assistant html at the v-html boundary', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../components/TranscriptMessageCard.vue'),
    'utf8',
  );

  assert.match(
    source,
    /import \{[\s\S]{0,200}stripVisibleChatu8PromptTokensHtml[\s\S]{0,200}\} from '\.\.\/chatu8PromptTokenDisplay';/,
    'message card should import the display sanitizer instead of trusting upstream html',
  );
  assert.match(
    source,
    /const displayedAssistantHtml = computed/,
    'message card should compute sanitized assistant html for the completed state',
  );
  // 完成态仍然用 v-html 渲染完整 Markdown/图片锚点 HTML。
  assert.match(
    source,
    /v-else[\s\S]{0,260}v-html="displayedAssistantHtml"/,
    'completed assistant body should render sanitized html instead of raw item.finalHtml',
  );
  // 流式态用轻量 HTML 预览，但仍在 v-html 边界清理可见 image### 提示词。
  assert.match(
    source,
    /v-if="item\.isStreaming"[\s\S]{0,260}v-html="streamingAssistantHtml"/,
    'streaming assistant body should render the sanitized lightweight preview html',
  );
  assert.match(
    source,
    /const streamingAssistantHtml = computed\([\s\S]{0,800}stripVisibleChatu8PromptTokensHtml/,
    'streamingAssistantHtml should run the html sanitizer before rendering',
  );
});
