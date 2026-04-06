const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

test('runDemo delegates normal sends to runNativeSendProxy instead of the old createUser generation chain', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /async function runDemo\(nextPrompt\?: string\)[\s\S]*await runNativeSendProxy\(prompt\);/);
  assert.doesNotMatch(source, /async function runDemo\(nextPrompt\?: string\)[\s\S]*runGenerationFlow\(\{ prompt, createUser: true \}\);/);
});
