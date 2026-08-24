import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import _ from 'lodash';

(globalThis as typeof globalThis & { _: typeof _ })._ = _;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TIANYU_PROLOGUE, ensureTianyuPrologue } =
  require('../脚本/变量结构/openingBootstrap.ts') as typeof import('../脚本/变量结构/openingBootstrap');

async function main() {
  const sourceMvuData = {
    initialized_lorebooks: { 天欲太和录: ['init'] },
    stat_data: {
      世界: { 地址: null, 日期: '天和元年1月1日 14:00' },
    },
  };
  const created: Array<Record<string, any>> = [];
  let lastMessageId = 0;
  let releaseCreate!: () => void;
  const createGate = new Promise<void>(resolve => {
    releaseCreate = resolve;
  });

  const dependencies = {
    getLastMessageId: () => lastMessageId,
    getMvuData: () => sourceMvuData,
    createMessage: async (message: Record<string, any>) => {
      created.push(message);
      await createGate;
      lastMessageId = 1;
    },
  };

  const firstRun = ensureTianyuPrologue(dependencies);
  const concurrentRun = await ensureTianyuPrologue(dependencies);
  assert.equal(concurrentRun, 'skipped', 'a concurrent bootstrap must not create a duplicate prologue');
  assert.equal(created.length, 1);

  releaseCreate();
  assert.equal(await firstRun, 'created');
  assert.equal(await ensureTianyuPrologue(dependencies), 'skipped', 'an existing mes=1 must remain untouched');

  const message = created[0];
  assert.equal(message.role, 'assistant');
  assert.equal(message.is_hidden, false);
  assert.equal(message.message, TIANYU_PROLOGUE);
  assert.ok(TIANYU_PROLOGUE.startsWith('阴阳江湖序章\n太和山入冬以后，常有雾。'));
  assert.ok(TIANYU_PROLOGUE.endsWith('太和山的钟声。\n因此响了一夜。'));
  assert.ok(TIANYU_PROLOGUE.includes('苏晚晴。\n叶红绡。\n沈玉娘。'));
  assert.ok(TIANYU_PROLOGUE.includes('《天欲阴阳录》'));
  assert.ok(TIANYU_PROLOGUE.split('\n').length > 150, 'the complete approved prologue must be preserved');

  assert.notEqual(message.data, sourceMvuData, 'mes=1 data must be cloned instead of aliasing mes=0');
  assert.equal(message.data.stat_data.世界.地址, '');
  assert.equal(sourceMvuData.stat_data.世界.地址, null, 'normalization must not mutate mes=0');
  assert.deepEqual(message.data.initialized_lorebooks, sourceMvuData.initialized_lorebooks);

  const entrySource = readFileSync('src/天欲太和录/脚本/变量结构/index.ts', 'utf8');
  assert.match(entrySource, /import \{ ensureTianyuPrologue \} from '.\/openingBootstrap'/);
  assert.match(entrySource, /await waitGlobalInitialized\('Mvu'\)/);
  assert.match(entrySource, /eventOn\(tavern_events\.CHAT_CHANGED/);
  assert.match(entrySource, /Mvu\.getMvuData\(\{ type: 'message', message_id: messageId \}\)/);
  assert.match(entrySource, /createChatMessages\(\[message\], \{ refresh: 'all' \}\)/);

  console.log('天欲太和录 opening bootstrap test passed');
}

void main();
