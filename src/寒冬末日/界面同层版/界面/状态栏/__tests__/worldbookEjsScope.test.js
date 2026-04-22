const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../../../../../..');

function compileEjsLikeToFunctionBody(template) {
  const ejsTagPattern = /<%([_=]?)([\s\S]*?)_?%>/g;
  let code = 'let __out = "";\n';
  let lastIndex = 0;

  for (const match of template.matchAll(ejsTagPattern)) {
    const literal = template.slice(lastIndex, match.index);
    if (literal) {
      code += `__out += ${JSON.stringify(literal)};\n`;
    }

    const kind = match[1];
    const body = match[2];
    if (kind === '=') {
      code += `__out += (${body.trim()});\n`;
    } else {
      code += `${body}\n`;
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = template.slice(lastIndex);
  if (tail) {
    code += `__out += ${JSON.stringify(tail)};\n`;
  }

  code += 'return __out;';
  return code;
}

test('opening worldbook EJS can be compiled together with 世界设定 without duplicate lexical declarations', () => {
  const worldViewSource = fs.readFileSync(path.resolve(repoRoot, 'src/寒冬末日/世界书/寒冬末日/世界观.txt'), 'utf8');
  const worldSettingSource = fs.readFileSync(
    path.resolve(repoRoot, 'src/寒冬末日/世界书/寒冬末日/世界设定.txt'),
    'utf8',
  );

  const combinedPromptLikeSource = `${worldViewSource}\n${worldSettingSource}`;
  const functionBody = compileEjsLikeToFunctionBody(combinedPromptLikeSource);

  assert.doesNotThrow(
    () => new Function('getvar', functionBody),
    'combined EJS worldbook entries should not redeclare const opening/worldModeId/routeId/meta/formValues in the same scope',
  );
});
