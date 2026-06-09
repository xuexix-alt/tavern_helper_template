const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statusBarDir = path.resolve(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(statusBarDir, relativePath), 'utf8');
}

test('TranscriptMessageCard exposes compact assistant controls above and below the prose body', () => {
  const source = readSource('components/TranscriptMessageCard.vue');

  assert.match(source, /expanded\?: boolean;/, 'assistant card should receive a per-floor expanded state');
  assert.match(source, /\(event: 'toggle-expanded', item: TranscriptItem\): void;/);
  assert.match(
    source,
    /class="assistant-card-controls is-top"[\s\S]*?\{\{ expanded \? '折叠' : '展开' \}\}[\s\S]*?详情[\s\S]*?class="assistant-body-wrap"/,
    'top controls should sit before the assistant body and include collapse plus detail buttons',
  );
  assert.match(
    source,
    /class="assistant-body-wrap"[\s\S]*?:class="\{ 'is-collapsed': !expanded \}"[\s\S]*?class="assistant-card-controls is-bottom"[\s\S]*?\{\{ expanded \? '折叠' : '展开' \}\}[\s\S]*?详情/,
    'bottom controls should sit after the assistant body and control the same expanded state',
  );
  assert.match(
    source,
    /\.assistant-body-wrap\.is-collapsed\s*\{[\s\S]*?max-height:\s*240px;[\s\S]*?overflow:\s*hidden;/,
    'collapsed assistant bodies should be visually clipped without unmounting the plugin-native DOM',
  );
  assert.match(
    source,
    /\.assistant-body-wrap\.is-collapsed::after\s*\{[\s\S]*?pointer-events:\s*none;/,
    'collapsed assistant bodies should use a non-interactive fade overlay',
  );
});

test('TranscriptList wires assistant expanded state by message id instead of sharing opening state', () => {
  const source = readSource('components/TranscriptList.vue');

  assert.match(source, /collapsedAssistantMessageIds\?: number\[];/);
  assert.match(source, /function isMessageExpanded\(item: TranscriptItem\): boolean/);
  assert.match(source, /function toggleMessageExpanded\(item: TranscriptItem\)/);
  assert.match(source, /:expanded="isMessageExpanded\(item\)"/);
  assert.match(source, /@toggle-expanded="toggleMessageExpanded"/);
  assert.match(source, /\(event: 'toggle-message-expanded', messageId: number\): void;/);
});

test('reader state persists per-assistant collapsed floor ids across reloads', () => {
  const typesSource = readSource('types.ts');
  const readerStateSource = readSource('readerState.ts');
  const demoSource = readSource('useStreamingDemo.ts');
  const storySource = readSource('pages/StoryPage.vue');

  assert.match(typesSource, /collapsed_assistant_message_ids: number\[];/);
  assert.match(readerStateSource, /normalizeCollapsedAssistantMessageIds/);
  assert.match(readerStateSource, /collapsed_assistant_message_ids:/);
  assert.match(demoSource, /const collapsedAssistantMessageIds = ref<number\[]>\(\[]\);/);
  assert.match(demoSource, /function toggleAssistantMessageExpanded\(messageId: number\)/);
  assert.match(demoSource, /collapsed_assistant_message_ids: collapsedAssistantMessageIds\.value,/);
  assert.match(storySource, /:collapsed-assistant-message-ids="collapsedAssistantMessageIds"/);
  assert.match(storySource, /@toggle-message-expanded="toggleAssistantMessageExpanded"/);
});
