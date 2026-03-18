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
  source.includes('const directTarget = resolveHostMessageTriggerTarget(messageId);') &&
    source.includes('if (directTarget) return directTarget;'),
  'host message trigger resolution should prefer direct message-id lookup before coordinate probing',
);

assert(
  !source.includes('pushDoc(document);'),
  'host message resolution should not treat the current iframe document as the outer host document',
);

console.log('host target prefers message-id test passed');
