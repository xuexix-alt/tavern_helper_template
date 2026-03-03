import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const logs = [];
const pageErrors = [];

page.on('console', msg => {
  const text = msg.text() || '';
  const loc = msg.location();
  logs.push({ type: msg.type(), text, url: loc?.url, line: loc?.lineNumber, col: loc?.columnNumber });
});
page.on('pageerror', err => {
  pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
});

const jqClick = async (selector) => {
  await page.evaluate((sel) => {
    const jq = window.jQuery || window.$;
    const el = document.querySelector(sel);
    if (!el) return false;
    if (jq) jq(el).trigger('click');
    else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, selector);
};

await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

await jqClick('#rm_button_characters');
await page.waitForFunction(() => !!document.querySelector('#CharID5'), { timeout: 20000 });
await page.waitForTimeout(400);

await jqClick('#CharID5');
await page.waitForTimeout(1800);

const afterChar = await page.evaluate(() => {
  const st = window.SillyTavern || {};
  return {
    name2: st.name2 ?? null,
    this_chid: st.this_chid ?? null,
    chatId: typeof st.getCurrentChatId === 'function' ? st.getCurrentChatId() : null,
    hasChatOption: !!document.querySelector('#option_select_chat'),
  };
});

await jqClick('#option_select_chat');
await page.waitForTimeout(2500);

const afterChat = await page.evaluate(() => {
  const container = document.querySelector('#select_chat_div');
  const st = window.SillyTavern || {};
  return {
    name2: st.name2 ?? null,
    this_chid: st.this_chid ?? null,
    chatId: typeof st.getCurrentChatId === 'function' ? st.getCurrentChatId() : null,
    popupDisplay: (() => {
      const p = document.querySelector('#select_chat_popup');
      return p ? getComputedStyle(p).display : null;
    })(),
    containerLen: container && typeof container.innerHTML === 'string' ? container.innerHTML.length : -1,
    chatItems: container ? container.querySelectorAll('[id^="ChatID"], .select_chat_block, .chat_select').length : -1,
    containerPreview: container ? container.innerHTML.slice(0, 500) : null,
  };
});

// click first chat item if any
const clickedFirst = await page.evaluate(() => {
  const container = document.querySelector('#select_chat_div');
  if (!container) return { clicked: false, reason: 'no-container' };
  const candidate = container.querySelector('[id^="ChatID"], .select_chat_block, .chat_select, .character_select');
  if (!candidate) return { clicked: false, reason: 'no-item' };
  const jq = window.jQuery || window.$;
  if (jq) jq(candidate).trigger('click');
  else candidate.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return { clicked: true, tag: candidate.tagName, id: candidate.id || null, cls: candidate.className || null };
});
await page.waitForTimeout(1500);

const afterClickFirst = await page.evaluate(() => {
  const st = window.SillyTavern || {};
  return {
    name2: st.name2 ?? null,
    this_chid: st.this_chid ?? null,
    chatId: typeof st.getCurrentChatId === 'function' ? st.getCurrentChatId() : null,
  };
});

await page.screenshot({ path: '.tmp/playwright/repro-chatflow.png', fullPage: true });

const filteredLogs = logs.filter(l => /ReferenceError|st-chatu8|samelayer|Error|error|Failed to insert focus rule|select_chat|chat/i.test(l.text || ''));
console.log(JSON.stringify({ afterChar, afterChat, clickedFirst, afterClickFirst, pageErrors, filteredLogs: filteredLogs.slice(-200) }, null, 2));

await browser.close();
