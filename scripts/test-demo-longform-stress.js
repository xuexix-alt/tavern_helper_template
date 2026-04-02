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

const transcriptManager = read('src/demo/界面/状态栏/lib/TranscriptManager.ts');
const fixturePath = 'src/demo/界面/状态栏/lib/longformStressFixture.ts';

assert(fs.existsSync(path.join(process.cwd(), fixturePath)), '必须提供 5000+ 中文正文压测样本文件。');

const fixture = read(fixturePath);
const match = fixture.match(/export const LONGFORM_STRESS_TEXT = `([\s\S]*)`;/);
assert(match, '压测样本应使用模板字符串导出为 LONGFORM_STRESS_TEXT。');

const text = match[1].replace(/\r/g, '');
const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;

assert(chineseChars >= 5000, `压测样本文字量不足，当前仅 ${chineseChars} 个中文字符。`);
assert(
  transcriptManager.includes("localStorage.getItem('demo.longform.stress')"),
  'TranscriptManager 需要支持从 localStorage 触发长正文压测注入。',
);
assert(
  transcriptManager.includes('LONGFORM_STRESS_TEXT'),
  'TranscriptManager 需要在压测模式下注入 LONGFORM_STRESS_TEXT。',
);

console.log('demo longform stress test passed');
