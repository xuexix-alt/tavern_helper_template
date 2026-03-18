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
  !source.includes("if (!(target instanceof HTMLImageElement)) return;"),
  'generated image bridge should no longer require IMG targets only',
);

assert(
  source.includes('const carrier = target?.closest?.(PLUGIN_NATIVE_IMAGE_CARRIER_SELECTOR) as HTMLElement | null;'),
  'generated image bridge should resolve carrier nodes directly from any event target',
);

console.log('generated image carrier events test passed');
