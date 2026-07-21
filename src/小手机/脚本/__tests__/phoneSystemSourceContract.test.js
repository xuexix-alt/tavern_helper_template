const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../小手机主程序/index.ts'), 'utf8');

function extractFunctionBody(functionName) {
  const match = source.match(new RegExp(`function ${functionName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`));
  assert.ok(match, `expected function ${functionName}`);
  return match[1];
}

test('PhoneSystem owns responsive app metadata and renderer APIs', () => {
  assert.match(source, /reactive<PhoneApp\[\]>\(\[\]\)/);
  assert.match(source, /upsertPhoneApp\(registeredApps, app\)/);
  for (const name of ['registerRenderer', 'unregisterRenderer', 'openApp', 'goHome']) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
  const exported = source.match(/const PhoneSystem\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(exported, 'expected exported PhoneSystem object');
  for (const name of ['registerRenderer', 'unregisterRenderer', 'openApp', 'goHome']) {
    assert.match(exported[1], new RegExp(`\\b${name}\\b`));
  }
});

test('desktop clicks use openApp and renderer containers come from the owned phone iframe', () => {
  assert.match(source, /onClick:\s*\(\)\s*=>\s*openApp\(app\.id\)/);
  assert.match(source, /phoneIframe\?\.\[0\][\s\S]*contentDocument/);
  assert.doesNotMatch(source, /querySelector\(['"]iframe\[script_id\]/);
});

test('temporary hide preserves renderer while permanent destroy tears it down', () => {
  const toggleBody = extractFunctionBody('togglePhoneVisibility');
  assert.match(toggleBody, /phoneIframe\.hide\(\)/);
  assert.match(toggleBody, /phoneIframe\.show\(\)/);
  assert.doesNotMatch(toggleBody, /controller\.(?:goHome|destroy)/);
  const destroyBody = extractFunctionBody('destroy');
  assert.match(destroyBody, /controller\.destroy\(\)/);
  assert.match(destroyBody, /phoneApp\.unmount\(\)/);
  assert.match(source, /pagehide[\s\S]*destroy/);
});
