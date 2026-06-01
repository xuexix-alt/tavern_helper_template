const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('eden helper and mvu schema script expose bumped versions', () => {
  const helperSource = fs.readFileSync(path.resolve(__dirname, '../../../../脚本/伊甸后台数据辅助/index.ts'), 'utf8');
  const schemaSource = fs.readFileSync(path.resolve(__dirname, '../../../../脚本/变量结构/index.ts'), 'utf8');

  assert.match(helperSource, /const EDEN_HELPER_VERSION = '1\.6';/);
  assert.match(schemaSource, /const MVU_SCHEMA_VERSION = '1\.5';/);
});
