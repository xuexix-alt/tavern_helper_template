/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Node test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node' } });
const { getEdenHostDeps } = require('../runtime.ts');

test('shared worldbook queue calls native host API rather than an iframe reply channel', async () => {
  let nativeWrites = 0,
    iframeWrites = 0;
  global.window = {
    top: {
      Promise,
      TavernHelper: {
        updateWorldbookWith: async (_book, update) => {
          nativeWrites++;
          return update([]);
        },
      },
    },
  };
  global.updateWorldbookWith = async () => {
    iframeWrites++;
    return [];
  };
  await getEdenHostDeps().update('book', entries => entries);
  assert.equal(nativeWrites, 1);
  assert.equal(iframeWrites, 0);
});
