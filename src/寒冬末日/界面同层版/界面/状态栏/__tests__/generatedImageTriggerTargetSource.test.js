const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../generatedImageTriggerTarget.ts');

test('generated image regenerate never falls back to same-layer iframe targets', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const regenerateBranch = source.match(/if \(action === 'regenerate'\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';

  assert.match(regenerateBranch, /return input\.hostButton \?\? input\.hostImage \?\? null;/);
  assert.doesNotMatch(
    regenerateBranch,
    /iframeButton|iframeImage/,
    'regenerate clicks must target the real host plugin node or do nothing; iframe fallback can recurse into same-layer UI',
  );
});
