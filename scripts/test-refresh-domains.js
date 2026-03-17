require('ts-node/register/transpile-only');

const { resolveRefreshDomainsForEvent } = require('../src/寒冬末日/界面同层版/界面/状态栏/refreshDomains.ts');

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual: ${actualJson}`);
  }
}

assertDeepEqual(
  resolveRefreshDomainsForEvent({
    type: 'mvu.variable_update_ended',
    messageId: 12,
    selectedSourceMessageId: 12,
    affectsTranscript: true,
  }),
  ['mvuSources', 'roleSidebar', 'transcript'],
  'mvu variable update should refresh source list, active sidebar, and transcript when message content changed',
);

assertDeepEqual(
  resolveRefreshDomainsForEvent({
    type: 'host.message_deleted',
  }),
  ['transcript', 'mvuSources', 'gallery'],
  'message deletion should refresh transcript, source list, and gallery',
);

assertDeepEqual(
  resolveRefreshDomainsForEvent({
    type: 'host.stream_token_received',
  }),
  ['transcript'],
  'stream token should only refresh transcript',
);

console.log('refresh domains test passed');
