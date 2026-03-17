const { readFileSync } = require('fs');

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(`${message}\nmissing: ${needle}`);
  }
}

const filePath = 'src/寒冬末日/界面同层版/界面/状态栏/pages/StoryPage.vue';
const source = readFileSync(filePath, 'utf8');

const bottomDockBlockMatch = source.match(/\.ui-bottom-dock\s*\{[\s\S]*?\n\}/);
if (!bottomDockBlockMatch) {
  throw new Error('Could not find .ui-bottom-dock style block');
}

assertIncludes(
  bottomDockBlockMatch[0],
  'flex: 0 0 auto;',
  'bottom dock should opt out of flex shrinking so tool buttons stay fully visible',
);

const consoleStripBlockMatch = source.match(/\.ui-bottom-console-strip\s*\{[\s\S]*?\n\}/);
if (!consoleStripBlockMatch) {
  throw new Error('Could not find .ui-bottom-console-strip style block');
}

assertIncludes(
  consoleStripBlockMatch[0],
  'flex-shrink: 0;',
  'bottom console strip should keep its own height instead of being squeezed by sibling panels',
);

console.log('story bottom dock layout test passed');
