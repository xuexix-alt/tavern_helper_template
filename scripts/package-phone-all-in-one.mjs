import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDirectory = new URL('../dist/小手机平台/一体化/', import.meta.url);
const content = await readFile(new URL('index.js', outputDirectory), 'utf8');
if (!content.trim()) throw new Error('一体化构建产物为空，请先构建 src/小手机平台/一体化');
const script = {
  type: 'script',
  enabled: true,
  name: '小手机一体化（寒冬）',
  id: 'd9d2a605-64f7-4b3e-8d79-310b6bf87051',
  content,
  info: '内含全部 10 个小手机组件入口及寒冬适配器。启用前关闭旧小手机散装脚本和平台总成，然后刷新酒馆页面。适用于角色卡：末世寒冬 - 星穹秩序。',
  button: { enabled: true, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
};
const output = new URL('小手机一体化.json', outputDirectory);
await writeFile(output, JSON.stringify(script, null, 2) + '\n', 'utf8');
console.log('已生成可导入脚本：' + fileURLToPath(output));
