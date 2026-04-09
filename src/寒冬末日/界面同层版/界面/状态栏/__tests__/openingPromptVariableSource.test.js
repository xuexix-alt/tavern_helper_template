const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('opening prompt builder injects current message stat_data for MVU output grounding', () => {
  const sourcePath = path.resolve(__dirname, '../../../shared/opening.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /function readCurrentMessageStatDataForPrompt\(/);
  assert.match(source, /getVariables(?:\?\.)?\(\{ type: 'message' \}\)/);
  assert.match(source, /<status_current_variable>/);
  assert.match(source, /formatCurrentMessageStatDataForPrompt\(/);
});

test('story page wires current MVU anchor floor into MvuRolePanel target source', () => {
  const sourcePath = path.resolve(__dirname, '../pages/StoryPage.vue');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.match(source, /:target-message-id="currentMvuAnchorMessageId"/);
});
