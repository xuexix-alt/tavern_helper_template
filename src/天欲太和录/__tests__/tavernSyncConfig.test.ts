import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const settings = parseYaml(readFileSync('tavern_sync.yaml', 'utf8'));

assert.deepEqual(settings?.配置?.天欲太和录, {
  类型: '世界书',
  酒馆中的名称: '天欲太和录',
  本地文件路径: 'src/天欲太和录/世界书/index.yaml',
  导出文件路径: 'src/天欲太和录',
});

console.log('天欲太和录 tavern_sync config test passed');
