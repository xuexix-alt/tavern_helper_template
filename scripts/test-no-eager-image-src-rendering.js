const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gallerySource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    '寒冬末日',
    '界面同层版',
    '界面',
    '状态栏',
    'components',
    'ImageGalleryPanel.vue',
  ),
  'utf8',
);

const streamingSource = fs.readFileSync(
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
  !gallerySource.includes(':src="entry.src"'),
  'gallery should not eagerly bind base64 src from metadata entries',
);

assert(
  !streamingSource.includes('return appendChatu8ArtifactsToHtml(html, renderSource, message_id);'),
  'transcript final html should not eagerly inject generated image payloads into assistant body html',
);

console.log('no eager image src rendering test passed');
