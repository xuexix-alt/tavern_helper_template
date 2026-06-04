const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/寒冬末日/界面同层版/界面/状态栏/useStreamingDemo.ts'),
  'utf8',
);

function assertMatch(pattern, message) {
  if (!pattern.test(source)) {
    throw new Error(message);
  }
}

assertMatch(
  /async function hydrateVisibleImageMessages\(reason: string\): Promise<void>/,
  'same-layer should centralize visible image hydration in an async helper',
);
assertMatch(
  /hydrateVisibleImageMessages\('mounted\.image_hydration_500'\)/,
  'mounted boot should hydrate visible images without waiting for fullscreen',
);
assertMatch(
  /hydrateVisibleImageMessages\(`visibility_restored\.\$\{reason\}:visible_image_hydration`\)/,
  'visibility/fullscreen recovery should reuse the same visible image hydration helper',
);
assertMatch(
  /const messageUpdatedEvent = \(globalThis as any\)\.tavern_events\?\.MESSAGE_UPDATED \?\? 'MESSAGE_UPDATED';[\s\S]*await eventEmit\(messageUpdatedEvent as any, messageId\);/,
  'image DOM repair should await MESSAGE_UPDATED from an async helper',
);

console.log('same-layer mobile image hydration source test passed');
