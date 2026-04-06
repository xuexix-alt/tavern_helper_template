const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../../../shared/opening.ts');

test('opening content and option extraction no longer pre-cleans raw text via stripOpeningMetaBlocks', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.doesNotMatch(
    source,
    /export function extractOpeningContent[\s\S]*?const cleaned = stripOpeningMetaBlocks\(raw\);/,
  );
  assert.doesNotMatch(
    source,
    /export function extractOpeningContentLoose[\s\S]*?const cleaned = stripOpeningMetaBlocks\(raw\);/,
  );
  assert.doesNotMatch(
    source,
    /export function extractOpeningOptions[\s\S]*?const cleaned = stripOpeningMetaBlocks\(raw\);/,
  );
});
