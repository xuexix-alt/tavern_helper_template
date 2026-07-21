require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');
const { reactive, effect } = require('vue');
const { upsertPhoneApp } = require('../小手机主程序/phoneAppRegistry.ts');

test('upsertPhoneApp adds, sorts, and replaces metadata without duplicate icons', () => {
  const apps = reactive([]);
  let observed = [];
  effect(() => {
    observed = apps.map(app => app.name);
  });

  upsertPhoneApp(apps, { id: 'weather', name: '天气', icon: '☀️', color: '#09f', order: 2 });
  upsertPhoneApp(apps, { id: 'chat', name: '微信', icon: '💬', color: '#0c6', order: 1 });
  assert.deepEqual(observed, ['微信', '天气']);

  upsertPhoneApp(apps, { id: 'chat', name: '聊天', icon: '💭', color: '#0b5', order: 3 });
  assert.deepEqual(
    apps.map(app => app.id),
    ['weather', 'chat'],
  );
  assert.equal(apps.filter(app => app.id === 'chat').length, 1);
  assert.equal(observed.at(-1), '聊天');
});
