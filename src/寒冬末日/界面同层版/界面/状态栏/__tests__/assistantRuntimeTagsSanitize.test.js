/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function readSource(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

function extractFunctionBody(source, functionName) {
  const startToken = `function ${functionName}(`;
  const startIndex = source.indexOf(startToken);
  assert.notEqual(startIndex, -1, `should find ${functionName}`);
  const braceStart = source.indexOf('{', startIndex);
  assert.notEqual(braceStart, -1, `should find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart + 1, index);
    }
  }
  assert.fail(`should find closing brace for ${functionName}`);
}

/**
 * `sanitizeAssistantRuntimeTagsForDisplay` 在源码里是内部 helper（不导出）。
 * 为了避免装配 Vue/@types 环境，这里复制一份同构逻辑，作为对源码契约的"行为式"钉死：
 * - 如果源码里相应 regex 改动，这里的 oracle 也应该同步改动；不同步会被下面的结构校验拦住。
 */
function runSanitize(source) {
  let out = String(source ?? '');
  out = out.replace(
    /<thinking\b[^>]*>([\s\S]*?)<\/thinking>/gi,
    (_m, body) =>
      `<details class="assistant-runtime-details assistant-runtime-thinking"><summary>思考过程</summary>${body}</details>`,
  );
  out = out.replace(
    /<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable>/gi,
    (_m, body) =>
      `<details class="assistant-runtime-details assistant-runtime-variable"><summary>变量更新</summary>${body}</details>`,
  );
  out = out.replace(/<content\b[^>]*>([\s\S]*?)<\/content>/gi, (_m, body) => body);
  out = out.replace(/<content\b[^>]*>/gi, '');
  out = out.replace(/<\/content>/gi, '');
  out = out.replace(/<thinking\b[^>]*>(?![\s\S]*<\/thinking>)([\s\S]*)$/i, (_m, body) =>
    `<details class="assistant-runtime-details assistant-runtime-thinking assistant-runtime-pending" open><summary>思考过程生成中</summary>${body}</details>`,
  );
  out = out.replace(/<UpdateVariable\b[^>]*>(?![\s\S]*<\/UpdateVariable>)([\s\S]*)$/i, (_m, body) =>
    `<details class="assistant-runtime-details assistant-runtime-variable assistant-runtime-pending" open><summary>变量更新生成中</summary>${body}</details>`,
  );
  out = out.replace(/<StatusPlaceHolderImpl\b[^>]*\/\s*>/gi, '');
  out = out.replace(/<StatusPlaceHolderImpl\b[^>]*>[\s\S]*?<\/StatusPlaceHolderImpl>/gi, '');
  return out;
}

test('sanitizeAssistantRuntimeTagsForDisplay unwraps <content> so paragraphs no longer collapse into one block', () => {
  const input = ['<content>', '第一段。', '', '第二段——换行要保留。', '</content>'].join('\n');
  const out = runSanitize(input);
  assert.doesNotMatch(out, /<content/);
  assert.doesNotMatch(out, /<\/content>/);
  assert.ok(out.includes('第一段。'));
  assert.ok(out.includes('第二段——换行要保留。'));
  // 换行结构要保持——浏览器靠它生成段落 <p>。
  assert.ok(out.includes('\n\n'));
});

test('sanitizeAssistantRuntimeTagsForDisplay folds <thinking> into a <details> so thinking is collapsed by default', () => {
  const out = runSanitize('<thinking>这是一段思考过程。</thinking>');
  assert.match(out, /<details class="assistant-runtime-details assistant-runtime-thinking">/);
  assert.match(out, /<summary>思考过程<\/summary>/);
  assert.ok(out.includes('这是一段思考过程。'));
  assert.match(out, /<\/details>/);
});

test('sanitizeAssistantRuntimeTagsForDisplay folds <UpdateVariable> into a <details> so variable ops do not flood the body', () => {
  const out = runSanitize('<UpdateVariable>[{"op":"replace","path":"/a","value":1}]</UpdateVariable>');
  assert.match(out, /<details class="assistant-runtime-details assistant-runtime-variable">/);
  assert.match(out, /<summary>变量更新<\/summary>/);
  assert.ok(out.includes('"op":"replace"'));
});

test('sanitizeAssistantRuntimeTagsForDisplay strips stray </content> when the model closes content twice around recap/options/update blocks', () => {
  const input = [
    '<content>',
    '正文第一段。',
    '</content>',
    '<recap><details><summary>小总结</summary>总结</details></recap>',
    '<option>【A】继续</option>',
    '<UpdateVariable><Analysis>前置声明：以下分析严格',
    '</content>',
  ].join('\n');
  const out = runSanitize(input);
  assert.doesNotMatch(out, /<\/?content\b/i);
  assert.ok(out.includes('正文第一段。'));
  assert.ok(out.includes('<recap>'));
  assert.ok(out.includes('<option>【A】继续</option>'));
});

test('sanitizeAssistantRuntimeTagsForDisplay folds truncated <UpdateVariable> after stray </content> instead of leaking framework tags', () => {
  const input = '<UpdateVariable><Analysis>前置声明：以下分析严格\n</content>';
  const out = runSanitize(input);
  assert.doesNotMatch(out, /<\/?content\b/i);
  assert.doesNotMatch(out, /<UpdateVariable\b/i);
  assert.match(out, /assistant-runtime-variable assistant-runtime-pending/);
  assert.match(out, /变量更新生成中/);
  assert.ok(out.includes('<Analysis>前置声明'));
});

test('sanitizeAssistantRuntimeTagsForDisplay drops <StatusPlaceHolderImpl/> because it has no visual meaning', () => {
  const out1 = runSanitize('前<StatusPlaceHolderImpl/>后');
  assert.equal(out1, '前后');
  const out2 = runSanitize('前<StatusPlaceHolderImpl></StatusPlaceHolderImpl>后');
  assert.equal(out2, '前后');
});

test('sanitizeAssistantRuntimeTagsForDisplay leaves <criteria>, <option>, <time>, <recap> untouched so Tavern display regex can own them', () => {
  const input = '<time>14:00</time><criteria>只给酒馆正则清理</criteria><option>A.一</option><recap>小总结</recap>';
  const out = runSanitize(input);
  assert.ok(out.includes('<time>14:00</time>'));
  assert.ok(out.includes('<criteria>只给酒馆正则清理</criteria>'));
  assert.ok(out.includes('<option>A.一</option>'));
  assert.ok(out.includes('<recap>小总结</recap>'));
});

test('useStreamingDemo.buildFinalHtml invokes the runtime sanitizer before Tavern formatting so paragraph structure survives', () => {
  const source = readSource('useStreamingDemo.ts');
  const sanitizerBody = extractFunctionBody(source, 'sanitizeAssistantRuntimeTagsForDisplay');
  assert.match(
    source,
    /function sanitizeAssistantRuntimeTagsForDisplay\(source: string\): string/,
    'sanitizer helper should be defined in useStreamingDemo.ts',
  );
  assert.match(
    source,
    /sanitizeAssistantRuntimeTagsForDisplay\(renderSource \|\| '\(空回复\)'\)/,
    'buildFinalHtml should sanitize the runtime tags before the Tavern display pipeline',
  );
  // 折叠规则要覆盖 <thinking> / <UpdateVariable>
  assert.match(sanitizerBody, /<thinking\\b\[\^>\]\*>\(\[\\s\\S\]\*\?\)<\\\/thinking>/);
  assert.match(sanitizerBody, /<UpdateVariable\\b\[\^>\]\*>\(\[\\s\\S\]\*\?\)<\\\/UpdateVariable>/);
  // <content> 去壳
  assert.match(sanitizerBody, /<content\\b\[\^>\]\*>\(\[\\s\\S\]\*\?\)<\\\/content>/);
  assert.match(
    sanitizerBody,
    /out = out\.replace\(\s*\/<\\\/content>\/gi,\s*''\s*\)/,
    'completion sanitizer should remove stray </content> tags after unwrapping paired content blocks',
  );
  assert.match(
    sanitizerBody,
    /<UpdateVariable\\b\[\^>\]\*>\(\?!\[\\s\\S\]\*<\\\/UpdateVariable>\)/,
    'completion sanitizer should fold truncated variable blocks instead of leaking raw UpdateVariable tags',
  );
  // <StatusPlaceHolderImpl/> 删除
  assert.match(sanitizerBody, /<StatusPlaceHolderImpl\\b\[\^>\]\*\\\/\\s\*>/);
});

test('theme-tokens.css styles the collapsed runtime details block so it does not leak raw framework markup', () => {
  const css = readSource('theme-tokens.css');
  assert.match(css, /\.assistant-runtime-details/);
  assert.match(css, /\.assistant-runtime-thinking/);
  assert.match(css, /\.assistant-runtime-variable/);
  assert.match(css, /details\.assistant-runtime-details\[open\]|\.assistant-runtime-details\[open\]/);
});
