const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('assistant cards drop HUD corner armor and heavy shadows on mobile', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.doesNotMatch(
    source,
    /class="assistant-card hud-panel clip-corner"/,
    'assistant cards should own their shell contract directly instead of inheriting theme-level hud-panel chrome',
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.assistant-card\s*\{[\s\S]*?padding:\s*10px 8px 8px;[\s\S]*?box-shadow:\s*none;/,
    'mobile assistant cards should tighten padding and remove heavy shell shadows',
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.assistant-corners\s*\{[\s\S]*?display:\s*none;/,
    'mobile assistant cards should not keep decorative HUD corner brackets around prose',
  );
  assert.match(
    source,
    /\.assistant-card\s*\{[\s\S]*?border:\s*1px solid color-mix\(in srgb, var\(--border\) 50%, transparent\);[\s\S]*?background:\s*var\(--demo-assistant-card-bg\);[\s\S]*?backdrop-filter:\s*blur\(16px\);/,
    'assistant cards should carry their own border and surface contract after removing hud-panel inheritance',
  );
});

test('opening cards merge nested banner and body boxes into a lighter single-shell mobile reading card', () => {
  const source = readSource('components/TranscriptOpeningCard.vue');

  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.transcript-item\s*\{[\s\S]*?box-shadow:\s*none;/,
    'mobile opening cards should remove the heavy outer shell shadow',
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.opening-banner\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-bottom:\s*1px solid color-mix\(in srgb, var\(--primary\) 10%, transparent\);/,
    'mobile opening banner should stop being a separate boxed card and become a lightweight header divider',
  );
  assert.match(
    source,
    /@media \(max-width: 760px\)\s*\{[\s\S]*?\.transcript-body\s*\{[\s\S]*?padding:\s*10px 0 0;[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/,
    'mobile opening body should read directly inside the main shell instead of another bordered panel',
  );
});
