import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

const snap = async (label) => {
  return await page.evaluate((lbl) => {
    const block = document.querySelector('#rm_print_characters_block');
    const preview = block ? block.innerHTML.slice(0, 1000) : '';
    const items = block ? Array.from(block.querySelectorAll('*')).slice(0,120).map(el => ({
      tag: el.tagName,
      id: el.id || null,
      cls: (el.className || '').toString().slice(0,80),
      text: (el.textContent || '').replace(/\s+/g,' ').trim().slice(0,80),
      attrs: {
        chid: el.getAttribute('chid'),
        grid: el.getAttribute('grid'),
        avatar: el.getAttribute('avatar'),
        title: el.getAttribute('title'),
      }
    })) : [];
    return {
      label: lbl,
      blockExists: !!block,
      blockDisplay: block ? getComputedStyle(block).display : null,
      blockChildren: block ? block.children.length : -1,
      blockInnerLen: block ? block.innerHTML.length : -1,
      preview,
      targetTextCount: block ? (block.textContent || '').split('末世寒冬').length - 1 : 0,
      items,
    };
  }, label);
};

const before = await snap('before');
await page.evaluate(() => {
  const jq = window.jQuery || window.$;
  const btn = document.querySelector('#rm_button_characters');
  if (!btn) return;
  if (jq) jq(btn).trigger('click');
  else btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(1000);
const afterBtn = await snap('after_btn');
await page.evaluate(() => {
  const jq = window.jQuery || window.$;
  const block = document.querySelector('#rm_print_characters_block');
  if (block) block.scrollTop = 500;
  const target = Array.from(document.querySelectorAll('#rm_print_characters_block *')).find(el => (el.textContent || '').includes('末世寒冬'));
  if (target && jq) jq(target).trigger('click');
});
await page.waitForTimeout(1200);
const afterTryClick = await snap('after_try_click');

const state = await page.evaluate(() => {
  const st = window.SillyTavern || {};
  return { name2: st.name2, this_chid: st.this_chid, chatId: st.getCurrentChatId?.() ?? null };
});

console.log(JSON.stringify({ before, afterBtn, afterTryClick, state }, null, 2));
await browser.close();
