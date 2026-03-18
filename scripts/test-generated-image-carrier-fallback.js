const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    '寒冬末日',
    '界面同层版',
    '界面',
    '状态栏',
    'pages',
    'StoryPage.vue',
  ),
  'utf8',
);

assert(
  source.includes('function resolveGeneratedImageTriggerTarget('),
  'generated image interaction should define a shared trigger target resolver',
);

assert(
  source.includes('return input.hostButton ?? input.iframeButton ?? input.hostImage ?? input.iframeImage ?? null;'),
  'generated image interaction should prefer real plugin-native button/image nodes over falling back to the current carrier',
);

assert(
  source.includes('const targetNode = resolveGeneratedImageTriggerTarget({'),
  'generated image handlers should use the shared trigger target resolver',
);

assert(
  source.includes('if (!triggerHostElementClick(targetNode))'),
  'generated image click handler should execute through the resolved fallback target node',
);

assert(
  source.includes('const BRIDGED_EVENT_FLAG = \'__streamDemoBridge\';') &&
    source.includes('if (isBridgedEvent(event)) return;'),
  'generated image bridge should ignore synthetic re-dispatched events to avoid recursion',
);

console.log('generated image carrier fallback test passed');
