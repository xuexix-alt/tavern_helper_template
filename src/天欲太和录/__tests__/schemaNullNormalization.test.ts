import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import _ from 'lodash';
import { parse as parseYaml } from 'yaml';

(globalThis as typeof globalThis & { _: typeof _ })._ = _;

// schema.ts intentionally consumes the repository-provided global lodash binding.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Schema } = require('../schema.ts') as typeof import('../schema');

const parsed = Schema.parse({
  世界: {
    地址: null,
    日期: '天和元年1月1日 14:00',
  },
});

assert.equal(parsed.世界.地址, '', 'opening should normalize a null address to an empty string');
assert.equal(
  Schema.safeParse({ 世界: { 地址: 1, 日期: '天和元年1月1日 14:00' } }).success,
  false,
  'non-null, non-string addresses must remain invalid',
);

const init = parseYaml(readFileSync('src/天欲太和录/世界书/天欲太和录/[initvar].yaml', 'utf8'));
assert.equal(Schema.parse(init).世界.地址, '');

console.log('天欲太和录 schema null normalization test passed');
