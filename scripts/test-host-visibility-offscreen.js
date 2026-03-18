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
    'useStreamingDemo.ts',
  ),
  'utf8',
);

assert(
  !source.includes('display: none !important;'),
  'host transcript visibility should not remove host messages from DOM with display:none',
);

assert(
  source.includes('position: absolute !important;') &&
    source.includes('left: -200vw !important;') &&
    source.includes('pointer-events: none !important;'),
  'host transcript visibility should move host messages offscreen while keeping them rendered',
);

console.log('host visibility offscreen test passed');
