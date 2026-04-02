const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appVue = read('src/demo/界面/状态栏/App.vue');
const topBarVue = read('src/demo/界面/状态栏/components/TopBar.vue');
const transcriptListVue = read('src/demo/界面/状态栏/components/TranscriptList.vue');
const messageItemVue = read('src/demo/界面/状态栏/components/MessageItem.vue');
const bottomInputVue = read('src/demo/界面/状态栏/components/BottomInput.vue');

assert(!appVue.includes('h-screen'), 'App 根容器不应继续使用 h-screen；iframe 长正文需要避免 100vh 方案。');
assert(
  transcriptListVue.includes('max-w-[760px]'),
  'TranscriptList 需要进一步收窄到更适合长中文阅读的稳定列宽。',
);
assert(
  !transcriptListVue.includes('overflow-y-auto'),
  'TranscriptList 不应继续依赖内部纵向滚动；长正文需要自然展开给宿主滚动。',
);
assert(
  messageItemVue.includes('text-[16px]') || messageItemVue.includes('sm:text-[17px]'),
  'assistant 正文需要提升到长文阅读基线字号。',
);
assert(
  !bottomInputVue.includes('absolute bottom-0 left-0 right-0'),
  'BottomInput 不应继续以绝对定位覆盖正文区域。',
);
assert(
  bottomInputVue.includes('min-h-[56px]'),
  'BottomInput 需要继续压缩默认高度，给正文腾出更多可视空间。',
);
assert(
  topBarVue.includes('阅读') && topBarVue.includes('更多'),
  'TopBar 需要压缩成阅读优先结构，并暴露“更多”收纳入口。',
);

console.log('demo longform layout test passed');
