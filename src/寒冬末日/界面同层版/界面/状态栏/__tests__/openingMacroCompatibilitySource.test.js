const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');

function readSource() {
  return fs.readFileSync(sourcePath, 'utf8');
}

function extractFunctionBody(source, functionName) {
  const startToken = `function ${functionName}(`;
  const startIndex = source.indexOf(startToken);
  assert.notEqual(startIndex, -1, `should find ${functionName}`);

  let signatureDepth = 0;
  let argsClosedAt = -1;
  for (let index = startIndex + startToken.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') signatureDepth += 1;
    if (char === ')') {
      signatureDepth -= 1;
      if (signatureDepth === 0) {
        argsClosedAt = index;
        break;
      }
    }
  }
  assert.notEqual(argsClosedAt, -1, `should find closing paren for ${functionName}`);

  const braceStart = source.indexOf('{', argsClosedAt);
  assert.notEqual(braceStart, -1, `should find opening brace for ${functionName}`);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }

  assert.fail(`should find closing brace for ${functionName}`);
}

test('buildOpeningCompiledUserInput runs explicit macro expansion inside latest-user visibility compatibility window', () => {
  const source = readSource();
  const body = extractFunctionBody(source, 'buildOpeningCompiledUserInput');

  assert.match(body, /withLatestUserUnhidden\(/);
  assert.match(body, /substitudeMacros\(compiledTemplate\)/);
});
