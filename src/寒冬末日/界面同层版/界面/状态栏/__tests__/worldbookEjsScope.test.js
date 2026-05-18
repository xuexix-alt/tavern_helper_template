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

test('opening worldbook reads world mode profiles from the synced config instead of stale inline presets', () => {
  const worldViewSource = fs.readFileSync(path.resolve(repoRoot, 'src/寒冬末日/世界书/寒冬末日/世界观.txt'), 'utf8');

  assert.match(
    worldViewSource,
    /getvar\('stream_demo\.opening'/,
    'worldbook should continue to read the current opening chat variable',
  );
  assert.match(
    worldViewSource,
    /getvar\('world_mode_profiles'/,
    'worldbook should use the bundled world mode profile config instead of hard-coded old档位',
  );
  assert.doesNotMatch(worldViewSource, /围猎堡垒型|极寒守成型|窗口秩序型/);
  assert.match(worldViewSource, /灾变前3个月/);
  assert.match(worldViewSource, /末日后1年-生存压力/);
  assert.match(worldViewSource, /末日后1年-秩序重建/);
});

test('Eden one-shot task worldbook EJS compiles without an unclosed outer scope', () => {
  const edenTaskSource = fs.readFileSync(
    path.resolve(repoRoot, 'src/寒冬末日/世界书/寒冬末日/伊甸一次性指令和主线任务.txt'),
    'utf8',
  );
  const functionBody = compileEjsLikeToFunctionBody(edenTaskSource);

  assert.doesNotThrow(
    () => new Function('getvar', functionBody),
    'Eden one-shot task EJS should not leave a raw block open before the template wrapper catch',
  );
  assert.doesNotMatch(edenTaskSource, /<%_\s*\{\s*[\r\n]+(?:const|var)\s+.*stream_demo\.opening/);
  assert.match(edenTaskSource, /edenTaskWorldModeId === 'A'/);
});
