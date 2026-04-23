const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('role panel metric summary reasons should wrap inside their cards instead of forcing one-line overflow', () => {
  const source = readSource('components/MvuRolePanel.vue');

  assert.equal(
    source.includes('.metric-caption.inline-summary {\n  white-space: nowrap;'),
    false,
    'metric inline summaries should no longer force nowrap because long reason text can punch through the card width',
  );
  assert.equal(
    source.includes('.metric-caption.inline-summary {\n  white-space: normal;'),
    true,
    'metric inline summaries should allow normal wrapping for long reason text',
  );
  assert.equal(
    source.includes('overflow-wrap: anywhere;'),
    true,
    'metric inline summaries should break long contiguous text inside the card',
  );
  assert.equal(
    source.includes('word-break: break-word;'),
    true,
    'metric inline summaries should keep pathological text from overflowing the metric card',
  );
  assert.equal(
    source.includes(
      '.metric-card,\n.detail-card {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  min-width: 0;',
    ),
    true,
    'metric/detail cards should explicitly allow inner text to shrink and wrap within the grid cell',
  );
});
