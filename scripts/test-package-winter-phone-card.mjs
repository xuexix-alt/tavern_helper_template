/* eslint-disable import-x/no-nodejs-modules */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHONE_SCRIPT_DEFINITIONS,
  RUNTIME_SCRIPT_DEFINITIONS,
  packageWinterPhoneCard,
  readCharacterCardPng,
} from './package-winter-phone-card.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PNG = path.join(ROOT, 'src', '末世寒冬 - 星穹秩序.png');
const WORLDBOOK = path.join(ROOT, 'src', '寒冬末日.json');
const PHONE_CDN_ROOT =
  'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/';
const PRE_UI_CDN_URL =
  'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@refs/heads/20260211/dist/寒冬末日/same-layer-pre/界面/状态栏/index.html';

const hash = value => createHash('sha256').update(value).digest('hex');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'winter-phone-card-'));

try {
  const original = await readFile(SOURCE_PNG);
  const originalHash = hash(original);
  const tempPng = path.join(tempRoot, '末世寒冬 - 星穹秩序.png');
  await writeFile(tempPng, original);

  const result = await packageWinterPhoneCard({ input: tempPng, worldbook: WORLDBOOK, write: true });
  assert.equal(result.scriptCount, PHONE_SCRIPT_DEFINITIONS.length);
  assert.equal(hash(await readFile(SOURCE_PNG)), originalHash, '临时往返不得修改仓库原 PNG');

  const card = await readCharacterCardPng(tempPng, 'chara');
  const ccv3Card = await readCharacterCardPng(tempPng, 'ccv3');
  assert.deepEqual(ccv3Card, card, 'chara 与 ccv3 必须写入同一份角色卡数据');
  assert.equal(
    ccv3Card.data.extensions.tavern_helper.scripts.length,
    RUNTIME_SCRIPT_DEFINITIONS.length + PHONE_SCRIPT_DEFINITIONS.length,
  );
  await assert.rejects(() => readCharacterCardPng(tempPng, 'missing'), /missing/);
  const productionPreRegexes = card.data.extensions.regex_scripts.filter(script =>
    script.replaceString?.includes('testingcf.jsdelivr.net') && script.replaceString.includes('same-layer-pre/界面/状态栏/index.html'),
  );
  assert.equal(productionPreRegexes.length, 2);
  assert.ok(productionPreRegexes.every(script => script.replaceString.includes(PRE_UI_CDN_URL)));
  assert.equal(card.data.name, '末世寒冬 - 星穹秩序');
  const scripts = card.data.extensions.tavern_helper.scripts;
  const findScript = name => {
    const matches = scripts.filter(script => script.name === name);
    assert.equal(matches.length, 1, `${name} 应当存在且唯一`);
    return matches[0];
  };
  const phoneIds = new Set(PHONE_SCRIPT_DEFINITIONS.map(script => script.id));
  const phoneScripts = scripts.filter(script => phoneIds.has(script.id));
  assert.equal(phoneScripts.length, PHONE_SCRIPT_DEFINITIONS.length);
  assert.equal(new Set(phoneScripts.map(script => script.id)).size, PHONE_SCRIPT_DEFINITIONS.length);
  assert.deepEqual(
    phoneScripts.map(script => script.id).sort(),
    [...phoneIds].sort(),
  );
  assert.ok(
    card.data.character_book.entries.some(
      entry => entry.comment === '变量列表' && entry.content.includes('通讯网络'),
    ),
  );
  assert.ok(phoneScripts.every(script => script.type === 'script' && script.enabled === true));
  assert.deepEqual(
    phoneScripts.map(script => script.content),
    PHONE_SCRIPT_DEFINITIONS.map(definition => `import\n'${PHONE_CDN_ROOT}${definition.distPath}'`),
  );
  assert.ok(phoneScripts.every(script => !script.content.includes('localhost')));

  assert.equal(findScript('zod mvu').enabled, true);
  assert.deepEqual(
    (({ enabled, content }) => ({ enabled, content }))(findScript('zod 定义')),
    {
      enabled: true,
      content:
        "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/变量结构/index.js'",
    },
  );
  assert.deepEqual(
    (({ enabled, content }) => ({ enabled, content }))(findScript('后台数据维护')),
    {
      enabled: true,
      content:
        "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/伊甸后台数据辅助/index.js'",
    },
  );
  assert.equal(findScript('脚本测试').enabled, false);
  assert.equal(findScript('变量结构测试').enabled, false);
  assert.deepEqual(
    (({ enabled, content }) => ({ enabled, content }))(findScript('自动更新角色卡')),
    {
      enabled: true,
      content:
        "import\n'https://testingcf.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211/dist/寒冬末日/脚本/自动更新角色卡/index.js'",
    },
  );
  assert.equal(new Set(RUNTIME_SCRIPT_DEFINITIONS.map(script => script.id)).size, RUNTIME_SCRIPT_DEFINITIONS.length);
  assert.deepEqual(
    scripts.slice(0, 6).map(script => script.name),
    ['zod mvu', 'zod 定义', '后台数据维护', '脚本测试', '变量结构测试', '自动更新角色卡'],
  );

  const beforeSecondPass = hash(await readFile(tempPng));
  await packageWinterPhoneCard({ input: tempPng, worldbook: WORLDBOOK, write: true });
  const secondCard = await readCharacterCardPng(tempPng);
  const secondPhoneScripts = secondCard.data.extensions.tavern_helper.scripts.filter(script => phoneIds.has(script.id));
  assert.equal(secondPhoneScripts.length, PHONE_SCRIPT_DEFINITIONS.length, '重复打包必须 upsert，不能复制脚本');
  assert.equal(hash(await readFile(tempPng)), beforeSecondPass, '相同输入重复打包应字节幂等');

  const invalidWorldbook = path.join(tempRoot, 'invalid-worldbook.json');
  await writeFile(invalidWorldbook, JSON.stringify({ entries: {} }));
  const beforeRejectedPass = hash(await readFile(tempPng));
  await assert.rejects(
    () => packageWinterPhoneCard({ input: tempPng, worldbook: invalidWorldbook, write: true }),
    /通讯网络|变量列表/,
  );
  assert.equal(hash(await readFile(tempPng)), beforeRejectedPass, '验证失败不得覆盖输入 PNG');

  console.log('winter phone card packaging test passed');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
