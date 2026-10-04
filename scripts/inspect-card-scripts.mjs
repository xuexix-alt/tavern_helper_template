// 列出酒馆卡内 tavern_helper 脚本的加载方式（import URL 或内嵌长度）
import fs from 'node:fs';

const PNG_PATH = process.argv[2];

function extractCardJson(pngPath) {
  const buf = fs.readFileSync(pngPath);
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(offset + 8, offset + 8 + length);
      const nul = data.indexOf(0);
      const key = data.toString('ascii', 0, nul);
      if (key === 'chara' || key === 'ccv3') {
        return JSON.parse(Buffer.from(data.toString('ascii', nul + 1), 'base64').toString('utf8'));
      }
    }
    offset += 12 + length;
  }
  return null;
}

const card = extractCardJson(PNG_PATH);
if (!card) { console.log('no card data'); process.exit(1); }
const data = card.data ?? card;
const scripts = data.extensions?.tavern_helper?.scripts ?? [];
console.log(`card: ${data.name} | scripts: ${scripts.length}`);
for (const s of scripts) {
  const c = (s.content ?? '').trim();
  const importMatch = c.match(/import\s+['"]([^'"]+)['"]/);
  const marker = c.includes('已超过档案字符上限') ? ' [!!含旧版字符上限报错]' : '';
  console.log(`- [${s.enabled ? 'on' : 'off'}] ${s.name} | len=${c.length}${marker}`);
  if (importMatch) console.log(`    import: ${importMatch[1]}`);
  else console.log(`    head: ${c.slice(0, 100).replace(/\n/g, ' ')}`);
}
