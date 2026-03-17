require('ts-node/register/transpile-only');

const { resolveWithRetry } = require('../src/寒冬末日/界面同层版/界面/状态栏/hostTargetRetry.ts');

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

async function main() {
  let attempts = 0;
  const found = await resolveWithRetry(
    () => {
      attempts += 1;
      return attempts >= 3 ? 'target-node' : null;
    },
    { attempts: 4, delayMs: 5 },
  );

  assertEqual(found, 'target-node', 'resolveWithRetry should return value once resolver succeeds');
  assertEqual(attempts, 3, 'resolveWithRetry should stop after first successful resolution');

  let missAttempts = 0;
  const missed = await resolveWithRetry(
    () => {
      missAttempts += 1;
      return null;
    },
    { attempts: 3, delayMs: 1 },
  );

  assertEqual(missed, null, 'resolveWithRetry should return null after exhausting attempts');
  assertEqual(missAttempts, 3, 'resolveWithRetry should exhaust configured attempts');

  console.log('host target retry test passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
