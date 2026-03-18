const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
  !source.includes('bindDisplayedImagePromptObserver'),
  'same-layer image bridge should not keep DOM observer based prompt persistence',
);

assert(
  !source.includes('persistDisplayedImagePrompts'),
  'same-layer image bridge should not persist image prompts by rescanning rendered DOM',
);

assert(
  !source.includes('queuePersistDisplayedImagePrompts'),
  'same-layer image bridge should not queue DOM writeback persistence',
);

assert(
  !source.includes('sanitizePluginImageExtrasInCurrentChat'),
  'same-layer image bridge should not bulk sanitize chat image extras during runtime',
);

assert(
  !source.includes('sanitizePluginImageCacheMeta'),
  'same-layer image bridge should not rewrite plugin cache metadata during runtime',
);

console.log('image bridge no DOM writeback test passed');
