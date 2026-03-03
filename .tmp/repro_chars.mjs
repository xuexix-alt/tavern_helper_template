import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const initial = await page.evaluate(() => {
  const btn = document.querySelector('#rm_button_characters');
  return {
    btnExists: !!btn,
    btnDisplay: btn ? getComputedStyle(btn).display : null,
    charCount: document.querySelectorAll('[id^="CharID"]').length,
    chars: Array.from(document.querySelectorAll('[id^="CharID"]')).slice(0,20).map(el => ({ id: el.id, text: (el.textContent || '').trim().slice(0,80) })),
  };
});

await page.evaluate(() => {
  const jq = window.jQuery || window.$;
  const btn = document.querySelector('#rm_button_characters');
  if (!btn) return;
  if (jq) jq(btn).trigger('click');
  else btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});

await page.waitForTimeout(1000);

const after = await page.evaluate(() => {
  const chars = Array.from(document.querySelectorAll('[id^="CharID"]'));
  return {
    charCount: chars.length,
    chars: chars.slice(0,50).map(el => ({ id: el.id, text: (el.textContent || '').trim().replace(/\s+/g,' ').slice(0,120) })),
    targetByText: chars.filter(el => (el.textContent || '').includes('末世寒冬')).map(el => el.id),
  };
});

console.log(JSON.stringify({ initial, after }, null, 2));
await browser.close();
