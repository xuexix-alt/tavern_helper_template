const test = require('node:test');
const assert = require('node:assert/strict');

const { isOpeningWorkbenchScopeActive, resolveActiveContainerMessageId } = require('../containerScope.ts');

test('opening workbench scope stays active when initial container id is 0 but current id is temporarily unavailable', () => {
  assert.equal(
    isOpeningWorkbenchScopeActive({
      initialContainerMessageId: 0,
      currentContainerMessageId: null,
    }),
    true,
  );
});

test('opening workbench scope is active when current container id is exactly 0', () => {
  assert.equal(
    isOpeningWorkbenchScopeActive({
      initialContainerMessageId: null,
      currentContainerMessageId: 0,
    }),
    true,
  );
});

test('opening workbench scope is inactive for non-zero containers', () => {
  assert.equal(
    isOpeningWorkbenchScopeActive({
      initialContainerMessageId: 0,
      currentContainerMessageId: 5,
    }),
    false,
  );
});

test('resolveActiveContainerMessageId falls back to initial container when current id is unavailable', () => {
  assert.equal(
    resolveActiveContainerMessageId({
      initialContainerMessageId: 0,
      currentContainerMessageId: null,
    }),
    0,
  );
});

test('resolveActiveContainerMessageId prefers the current container id when available', () => {
  assert.equal(
    resolveActiveContainerMessageId({
      initialContainerMessageId: 0,
      currentContainerMessageId: 6,
    }),
    6,
  );
});
