import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

const found = await page.evaluate(() => {
  const keyword = '末世寒冬';
  const out = [];
  const all = Array.from(document.querySelectorAll('*'));
  for (const el of all) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || !t.includes(keyword)) continue;
    out.push({
      tag: el.tagName,
      id: el.id,
      cls: el.className,
      text: t.slice(0, 180),
    });
    if (out.length >= 40) break;
  }
  return { count: out.length, out };
});

const ids = await page.evaluate(() => Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => /char|chat|select|rm_button/i.test(id)).slice(0, 300));

console.log(JSON.stringify({ found, ids }, null, 2));
await browser.close();
