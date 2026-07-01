const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('opening prompt builder does not auto-send current stat_data in the opening first user floor', () => {
  const sourcePath = path.resolve(__dirname, '../../../shared/opening.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const buildPromptStart = source.indexOf('export function buildOpeningGeneratePrompt(');
  assert.notEqual(buildPromptStart, -1, 'should find buildOpeningGeneratePrompt');
  const buildPromptBody = source.slice(
    buildPromptStart,
    source.indexOf('export function extractTaggedBlock', buildPromptStart),
  );

  assert.match(source, /function readCurrentMessageStatDataForPrompt\(/);
  assert.match(source, /getVariables(?:\?\.)?\(\{ type: 'message' \}\)/);
  assert.match(source, /<status_current_variable>/);
  assert.doesNotMatch(buildPromptBody, /formatCurrentMessageStatDataForPrompt\(/);
  assert.doesNotMatch(buildPromptBody, /currentVariablePrompt/);
  assert.doesNotMatch(source, /status_current_variable:\s*currentVariablePrompt/);
  assert.doesNotMatch(source, /当前变量列表:\s*currentVariablePrompt/);
});

test('story page wires current MVU anchor floor into MvuRolePanel target source', () => {
  const sourcePath = path.resolve(__dirname, '../pages/StoryPage.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /:target-message-id="currentMvuAnchorMessageId"/);
});
