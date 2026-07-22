import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import _ from 'lodash';
import { parse as parseYaml } from 'yaml';

(globalThis as typeof globalThis & { _: typeof _ })._ = _;

// schema.ts intentionally consumes the repository-provided global lodash binding.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Schema } = require('../schema.ts') as typeof import('../schema');

const defaultNetwork = {
  公共通信网: '在线',
  伊甸内网: '受限',
  外部链路: '受限',
  覆盖说明: '',
  状态原因: '',
} as const;

const parsedDefaults = Schema.parse({ 世界: {}, 纪宁: { 姓名: '纪宁' } });
assert.equal(Object.hasOwn(parsedDefaults.纪宁, '通讯'), false);
assert.deepEqual(parsedDefaults.通讯网络, defaultNetwork);

const parsedTemporaryNpc = Schema.parse({
  世界: {},
  临时NPC: { 陌生拾荒者: { 姓名: '陌生拾荒者' } },
});
assert.equal(Object.hasOwn(parsedTemporaryNpc.临时NPC.陌生拾荒者, '通讯'), false);

const legal = Schema.parse({
  世界: {},
  通讯网络: {
    公共通信网: '受限',
    伊甸内网: '在线',
    外部链路: '中断',
    覆盖说明: '公寓中继可用',
    状态原因: '城市骨干网受损',
  },
  普通联系人: { 姓名: '普通联系人' },
});
assert.equal(legal.通讯网络.外部链路, '中断');

assert.equal(Schema.safeParse({ 世界: {}, 通讯网络: { 公共通信网: '全通' } }).success, false);

const legacy = Schema.parse({
  世界: {},
  旧角色: {
    姓名: '旧角色',
    登场状态: '离场',
    通讯: {
      已建立联系: true,
      终端类型: '普通手机',
      终端状态: '正常',
      信号状态: '在线',
      状态原因: '旧版本遗留字段',
    },
  },
});
assert.equal(Object.hasOwn(legacy.旧角色, '通讯'), false, 'legacy role communication data must be ignored safely');

const dynamicRole = Schema.parse({ 世界: {}, 新动态角色: { 姓名: '新动态角色' } });
assert.equal(dynamicRole.新动态角色.姓名, '新动态角色');
assert.deepEqual(Schema.parse(Schema.parse(legal)), Schema.parse(legal));

const init = parseYaml(readFileSync('src/寒冬末日/世界书/寒冬末日/[initvar].yaml', 'utf8'));
const parsedInit = Schema.parse(init);
assert.deepEqual(parsedInit.通讯网络, defaultNetwork);
assert.deepEqual(Schema.parse(parsedInit), parsedInit);
for (const roleName of [
  '纪宁',
  '陈宇',
  '林月华',
  '赵卫国',
  '佐伯诗织',
  '佐伯惠理',
  '佐伯龙一',
  '雪乃',
  '凌音',
  '慕小小',
]) {
  assert.equal(
    Object.hasOwn(init[roleName], '通讯'),
    false,
    `${roleName} must not maintain redundant communication data`,
  );
  assert.equal(Object.hasOwn(parsedInit[roleName], '通讯'), false);
}

const generatedSchema = JSON.parse(readFileSync('src/寒冬末日/schema.json', 'utf8'));
const generatedText = JSON.stringify(generatedSchema);
for (const requiredText of ['通讯网络', '公共通信网', '伊甸内网', '外部链路']) {
  assert.ok(generatedText.includes(requiredText), `generated schema must contain ${requiredText}`);
}
for (const removedText of ['已建立联系', '普通手机', '伊甸终端T2', '终端状态', '信号状态']) {
  assert.ok(!generatedText.includes(removedText), `generated schema must not contain ${removedText}`);
}

const initWrapperSchema = JSON.parse(readFileSync('src/寒冬末日/世界书/寒冬末日/initvar.schema.json', 'utf8'));
assert.equal(initWrapperSchema.oneOf[0].properties.stat_data.$ref, '../../schema.json');
assert.equal(initWrapperSchema.oneOf[1].$ref, '../../schema.json');

console.log('winter phone schema tests passed');
