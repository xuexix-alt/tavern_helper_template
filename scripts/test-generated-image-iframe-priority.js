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
  source.includes('function resolveIframeImageButtonByRequestId(') &&
    source.includes('function resolveIframeImageNodeByRequestId('),
  'generated image bridge should be able to resolve plugin-native image targets from the iframe document',
);

assert(
  source.includes('const fallbackMessageId = Number(') &&
    source.includes("carrier.closest('[data-message-id]')"),
  'generated image bridge should recover message ids from surrounding iframe nodes when plugin-native spans lack explicit payload metadata',
);

console.log('generated image iframe priority test passed');
