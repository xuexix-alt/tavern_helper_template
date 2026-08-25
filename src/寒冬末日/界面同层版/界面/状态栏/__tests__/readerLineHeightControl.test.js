const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register/transpile-only');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  const sourcePath = path.join(statusBarDir, relativePath);
  return fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
}

test('reader body line height normalizes custom values and resolves density defaults', () => {
  const { normalizeReaderBodyLineHeight, resolveReaderBodyLineHeight } = require('../readerLineHeight.ts');

  assert.equal(normalizeReaderBodyLineHeight(null), null);
  assert.equal(normalizeReaderBodyLineHeight(''), null);
  assert.equal(normalizeReaderBodyLineHeight('nope'), null);
  assert.equal(normalizeReaderBodyLineHeight(1.34), 1.35);
  assert.equal(normalizeReaderBodyLineHeight(9), 2.1);
  assert.equal(normalizeReaderBodyLineHeight(0), 1.3);
  assert.equal(resolveReaderBodyLineHeight('comfortable', null), 1.9);
  assert.equal(resolveReaderBodyLineHeight('minimal', null), 1.7);
  assert.equal(resolveReaderBodyLineHeight('minimal', 1.55), 1.55);
});

test('reader chat state stores nullable body line height with a versioned migration', () => {
  const typesSource = readSource('types.ts');
  const readerStateSource = readSource('readerState.ts');

  assert.match(typesSource, /body_line_height: number \| null;/);
  assert.match(readerStateSource, /READER_CHAT_STATE_VERSION = 5/);
  assert.match(readerStateSource, /body_line_height: normalizeReaderBodyLineHeight\(raw\?\.body_line_height\)/);
  assert.match(readerStateSource, /Object\.prototype\.hasOwnProperty\.call\(patch, 'body_line_height'\)/);
  assert.match(readerStateSource, /normalizeReaderBodyLineHeight\(patch\.body_line_height\)/);
  assert.match(readerStateSource, /normalizeReaderBodyLineHeight\(current\.body_line_height\)/);
});
