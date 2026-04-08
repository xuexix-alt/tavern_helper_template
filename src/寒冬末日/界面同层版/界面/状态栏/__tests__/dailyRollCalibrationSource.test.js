const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('same-layer role panel exposes daily roll calibration action', () => {
  const sourcePath = path.resolve(__dirname, '../components/MvuRolePanel.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /\(event: 'calibrate-daily-roll'\): void;/);
  assert.match(source, /class="mini-pill"[^>]*@click="\$emit\('calibrate-daily-roll'\)"/);
});

test('story page wires daily roll calibration from sidebar into useStreamingDemo', () => {
  const sourcePath = path.resolve(__dirname, '../pages/StoryPage.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /@calibrate-daily-roll="calibrateDailyRollDate"/);
  assert.match(source, /calibrateDailyRollDate,/);
});

test('useStreamingDemo calibrates roll against latest message stat_data instead of current history floor', () => {
  const sourcePath = path.resolve(__dirname, '../useStreamingDemo.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /async function calibrateDailyRollDate\(\)/);
  assert.match(source, /const latestMessage = listAllChatMessages\(\)\.at\(-1\)/);
  assert.match(source, /const targetMessageId = Math\.trunc\(Number\(latestMessage\?\.message_id\)\)/);
  assert.match(source, /const latestMvuData = Mvu\.getMvuData\(\{ type: 'message', message_id: targetMessageId \}\)/);
  assert.match(source, /await Mvu\.replaceMvuData\(latestMvuData, \{ type: 'message', message_id: targetMessageId \}\)/);
  assert.match(source, /CHAT_VAR_KEYS\.EDEN_SHELTER_UPGRADE|eden\.shelter_upgrade/);
});
