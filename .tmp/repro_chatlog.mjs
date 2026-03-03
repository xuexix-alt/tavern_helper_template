import { chromium } from 'playwright';

const url = 'http://127.0.0.1:8002/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const logs = [];
const pageErrors = [];

page.on('console', async msg => {
  const loc = msg.location();
  let args = [];
  try {
    args = await Promise.all(msg.args().map(async a => {
      try { return await a.jsonValue(); } catch { return '[unserializable]'; }
    }));
  } catch {}
  logs.push({ type: msg.type(), text: msg.text(), loc, args });
});

page.on('pageerror', err => {
  pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
});

const jqClick = async (selector) => {
  await page.evaluate((sel) => {
    const jq = window.jQuery || window.$;
    const el = document.querySelector(sel);
    if (!el) return { ok: false, reason: 'not-found' };
    if (jq) {
      jq(el).trigger('click');
      return { ok: true, via: 'jquery' };
    }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return { ok: true, via: 'dom' };
  }, selector);
};

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

await jqClick('#rm_button_characters');
await page.waitForTimeout(800);

await jqClick('#CharID5');
await page.waitForTimeout(1200);

await jqClick('#option_select_chat');
await page.waitForTimeout(2200);

const state = await page.evaluate(() => {
  const container = document.querySelector('#select_chat_div');
  const popup = document.querySelector('#select_chat_popup');
  const st = window.SillyTavern || {};
  return {
    name2: st.name2,
    characterId: st.this_chid,
    chatId: typeof st.getCurrentChatId === 'function' ? st.getCurrentChatId() : null,
    popupVisible: !!popup && getComputedStyle(popup).display !== 'none',
    selectChatInnerLength: container && typeof container.innerHTML === 'string' ? container.innerHTML.length : -1,
    selectChatNodeCount: container ? container.querySelectorAll('*').length : -1,
    optionSelectExists: !!document.querySelector('#option_select_chat'),
  };
});

await page.screenshot({ path: '.tmp/playwright/repro-chatlog.png', fullPage: true });
console.log(JSON.stringify({ state, pageErrors, logs: logs.slice(-300) }, null, 2));

await browser.close();
