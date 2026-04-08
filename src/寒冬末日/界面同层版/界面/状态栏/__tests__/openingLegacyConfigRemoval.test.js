const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../../../../../');

function read(relativePath) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8');
}

test('schema and initvar no longer define 世界.开局配置 legacy MVU placeholder', () => {
  const schemaSource = read('src/寒冬末日/schema.ts');
  const schemaJsonSource = read('src/寒冬末日/schema.json');
  const initvarSource = read('src/寒冬末日/世界书/寒冬末日/[initvar].yaml');

  assert.doesNotMatch(schemaSource, /开局配置:\s*z/);
  assert.doesNotMatch(schemaSource, /开局配置:\s*\{/);
  assert.doesNotMatch(schemaJsonSource, /"开局配置"/);
  assert.doesNotMatch(initvarSource, /\n\s*开局配置:/);
});

test('worldbook no longer registers or ships 世界观-开局配置注入 legacy entry', () => {
  const indexSource = read('src/寒冬末日/世界书/index.yaml');
  const bundledWorldbookSource = read('src/寒冬末日.json');
  const legacyWorldbookPath = path.resolve(repoRoot, 'src/寒冬末日/世界书/寒冬末日/世界观_开局配置注入.txt');

  assert.doesNotMatch(indexSource, /世界观-开局配置注入/);
  assert.equal(fs.existsSync(legacyWorldbookPath), false);
  assert.doesNotMatch(bundledWorldbookSource, /世界观-开局配置注入|世界观_开局配置注入|stat_data\.世界\.开局配置/);
});

test('opening integration doc no longer claims stat_data.世界.开局配置 is the runtime source of truth', () => {
  const docSource = read('docs/寒冬末日-Opening表单变量世界书集成开发文档.md');

  assert.doesNotMatch(docSource, /stat_data\.世界\.开局配置/);
  assert.doesNotMatch(docSource, /2层 stat_data/);
});
