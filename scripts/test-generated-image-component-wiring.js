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

const transcriptSource = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'src',
    '寒冬末日',
    '界面同层版',
    '界面',
    '状态栏',
    'components',
    'TranscriptMessageCard.vue',
  ),
  'utf8',
);

assert(
  gallerySource.includes('GeneratedImageAsset'),
  'gallery panel should render a shared generated image asset component instead of placeholder-only markup',
);

assert(
  transcriptSource.includes('GeneratedImageAsset'),
  'transcript message card should render a shared generated image asset component instead of placeholder-only markup',
);

console.log('generated image component wiring test passed');
