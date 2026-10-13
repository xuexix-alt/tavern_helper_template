/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const source = ts.createSourceFile(
  'adapter.ts',
  fs.readFileSync('src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);

// Execute the real nested adapter functions with controlled host/DB boundaries.
function functions(...names) {
  const found = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
      found.set(node.name.text, node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const name of names) assert.ok(found.has(name), `missing adapter function: ${name}`);
  return ts.transpileModule([...found.values()].join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

test('adapter sorts newest first and returns matching unread, preview, time and delivery state', async () => {
  const records = [
    { id: 'empty', kind: 'private', title: '空会话' },
    { id: 'old', kind: 'private', title: '纪宁' },
    { id: 'new', kind: 'eden-group', title: '伊甸住户群' },
  ];
  const messages = {
    empty: [],
    old: [{ id: 'o1', content: '较早消息', createdAt: 10 }],
    new: [{ id: 'n1', content: '最新群消息', createdAt: 20, gameDate: '剧情日期', gameTime: '08:30' }],
  };
  const getList = Function(
    'requireSession',
    'requireDb',
    'isConversationRecord',
    'conversationState',
    'inboxByMessage',
    `${functions('listConversations')} return listConversations;`,
  )(
    () => ({ sessionKey: 'a' }),
    () => ({ listRecords: async () => records, listMessages: async ({ conversationId }) => messages[conversationId] }),
    () => true,
    { unread: async () => [{ conversationId: 'new', id: 'n1' }] },
    async () => new Map([['o1', { status: 'failed' }]]),
  );
  const list = await getList();
  assert.deepEqual(
    list.map(item => item.id),
    ['new', 'old', 'empty'],
  );
  assert.equal(list[0].unread, 1);
  assert.equal(list[0].preview, '最新群消息');
  assert.equal(list[0].timeLabel, '剧情日期 08:30');
  assert.equal(list[1].status, 'failed');
  assert.equal(list[2].unread, 0);
});

test('session transition disposes old chat and waits for the new snapshot before reopening', async () => {
  let resolveSnapshot;
  const events = [];
  const snapshotReady = new Promise(resolve => {
    resolveSnapshot = resolve;
  });
  const run = Function(
    'events',
    'snapshotReady',
    `
    let shellSessionReady = true, activeSessionKey = 'old', activeHostCapture, activeChatWorldbookName;
    let pendingConfirmedChanges = [], activeProfileWorldbookNames = [], snapshot = null;
    const shell = { close: () => events.push('close'), open: async () => events.push('open') };
    const profileCoordinator = { cancelSession() {} };
    const context = { runtime: {
      setSession: () => { events.push('set-session'); syncShellVisibility(true); },
      getSession: () => ({sessionKey:'new'}), getStatus: () => ({isOpen:true})
    } };
    const conversationState = {initialize: async () => events.push('initialize')};
    const assertHostCapture = () => {}, invalidateSnapshot = () => {}, recordDiagnostic = () => {};
    const refreshUnread = async () => {}, captureActiveWorldbooks = async () => events.push('worldbooks');
    const refreshInitialSnapshot = () => snapshotReady;
    ${functions('switchSession', 'syncShellVisibility')}
    return switchSession;
  `,
  )(events, snapshotReady);
  const switching = run({ host: { chatId: 'new' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[0], 'close');
  assert.ok(events.includes('worldbooks'));
  assert.ok(!events.includes('open'), 'status emitted by setSession must not reopen early');
  resolveSnapshot();
  await switching;
  assert.equal(events.at(-1), 'open');
  assert.equal(events.filter(event => event === 'open').length, 1);
});
