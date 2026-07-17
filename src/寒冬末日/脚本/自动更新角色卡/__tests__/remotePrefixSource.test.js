const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('auto update character script targets the published Winter character card and version manifest', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');

  assert.match(
    source,
    /const CHARACTER_NAME = '末世寒冬 - 星穹秩序';/,
  );
  assert.match(
    source,
    /const BASE_URL = 'https:\/\/testingcf\.jsdelivr\.net\/gh\/xuexix-alt\/tavern_helper_template@20260211';/,
  );
  assert.match(source, /const REMOTE_VERSION_PATH = 'src\/寒冬末日\/自动更新角色卡版本\.yaml';/);
  assert.match(source, /const CHARACTER_CARD_PATH = 'src\/末世寒冬 - 星穹秩序\.png';/);
  assert.match(source, /version_url: `\$\{BASE_URL\}\/\$\{REMOTE_VERSION_PATH\}`/);
  assert.match(source, /png_url: `\$\{BASE_URL\}\/\$\{CHARACTER_CARD_PATH\}`/);
  assert.match(source, /await importRawCharacter\(`\$\{CHARACTER_NAME\}\.png`, pngBlob\);/);
  assert.match(source, /last_applied_remote_version: z\.string\(\)\.prefault\(''\)/);
  assert.match(source, /String\(current\?\.version \?\? ''\)\.trim\(\) \|\| settings\.last_applied_remote_version \|\| '0\.0\.0'/);
  assert.match(source, /last_applied_remote_version: remoteVersion/);
});
