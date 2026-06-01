const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('mvu role store supports latest system snapshot reads without requiring displayable roles', () => {
  const sourcePath = path.resolve(__dirname, '../mvuRoleStore.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /allowSystemOnly\?: boolean/);
  assert.match(source, /const allowSystemOnly = options\?\.allowSystemOnly === true/);
  assert.match(source, /if \(result\.success && \(allowSystemOnly \|\| hasDisplayableRoles\(result\.data\)\)\)/);
  assert.match(source, /function readLatestMvuStatData\(/);
  assert.match(source, /const current = readLatestMvuStatData\(\{ allowSystemOnly: true \}\);/);
});

test('same-layer system panel reads shelter fields from latest system snapshot instead of role-only snapshot', () => {
  const sourcePath = path.resolve(__dirname, '../components/MvuRolePanel.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /useMvuSystemStore/);
  assert.match(source, /const \{\s*data: systemMvuData,/);
  assert.match(source, /\} = useMvuSystemStore\(\);/);
  assert.match(
    source,
    /const shelterLevel = computed\(\(\) => `\$\{String\(_\.get\(systemMvuData\.value, '庇护所\.庇护所等级', '--'\)\)\}`\);/,
  );
  assert.match(
    source,
    /const dailyRollText = computed\(\(\) => String\(_\.get\(systemMvuData\.value, '庇护所\.今日投掷点数', '--'\)\) \|\| '--'\);/,
  );
  assert.doesNotMatch(source, /const pityText = computed\(/);
});
