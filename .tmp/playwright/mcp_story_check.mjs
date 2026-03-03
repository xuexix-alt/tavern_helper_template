import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT_DIR = '.tmp/playwright';
fs.mkdirSync(OUT_DIR, { recursive: true });

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
      try {
        return await a.jsonValue();
      } catch {
        return '[unserializable]';
      }
    }));
  } catch {
    // ignore
  }
  logs.push({
    ts: Date.now(),
    type: msg.type(),
    text: msg.text(),
    url: loc?.url,
    line: loc?.lineNumber,
    col: loc?.columnNumber,
    args,
  });
});

page.on('pageerror', err => {
  pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jqClick(selector) {
  return page.evaluate(sel => {
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
}

async function findStoryFrame(maxWaitMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    for (const frame of page.frames()) {
      try {
        const has = await frame.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button.story-image-menu-btn'));
          if (buttons.length === 0) return false;
          const texts = buttons.map(b => (b.textContent || '').trim());
          return texts.some(t => t.includes('生图菜单')) && texts.some(t => t.includes('LLM'));
        });
        if (has) return frame;
      } catch {
        // ignore cross-origin / detached frames
      }
    }
    await sleep(300);
  }
  return null;
}

async function clickStoryButton(frame, keyword) {
  return frame.evaluate(key => {
    const buttons = Array.from(document.querySelectorAll('button.story-image-menu-btn'));
    const btn = buttons.find(b => (b.textContent || '').includes(key));
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, keyword);
}

async function getStoryState(frame) {
  return frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button.story-image-menu-btn')).map(b => ({
      text: (b.textContent || '').trim(),
      disabled: (b).disabled === true,
    }));
    const status = Array.from(document.querySelectorAll('.image-prompt-status')).map(el => (el.textContent || '').trim());
    const loadingTips = Array.from(document.querySelectorAll('.image-prompt-loading-tip')).map(el => (el.textContent || '').trim());
    const imageCount = document.querySelectorAll('img.story-image').length;
    return { buttons, status, loadingTips, imageCount };
  });
}

async function readRecentToasts() {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#toast-container .toast, #toast-container .toast-message, .toast-message'));
    return nodes.map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-10);
  });
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(2500);
await page.screenshot({ path: `${OUT_DIR}/mcp_check_00_home.png`, fullPage: true });

// Navigate to target character/chat
await jqClick('#rm_button_characters');
await page.waitForFunction(() => !!document.querySelector('#CharID5'), { timeout: 20000 });
await sleep(500);
await jqClick('#CharID5');
await sleep(1200);
await jqClick('#option_select_chat');
await sleep(2000);

await page.evaluate(() => {
  const container = document.querySelector('#select_chat_div');
  if (!container) return;
  const candidate = container.querySelector('[id^="ChatID"], .select_chat_block, .chat_select, .character_select, [data-chat-id]');
  if (!candidate) return;
  const jq = window.jQuery || window.$;
  if (jq) jq(candidate).trigger('click');
  else candidate.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
await sleep(2200);

const storyFrame = await findStoryFrame(18000);
const results = {
  meta: {
    url,
    frameFound: !!storyFrame,
    frameUrl: storyFrame?.url?.() ?? null,
    generatedAt: new Date().toISOString(),
  },
  checklist: {
    image_button: {},
    llm_button: {},
    cache_backfill: {},
    timeout_hint: {},
    concurrency_join: {},
  },
  pageErrors,
  logsFiltered: [],
};

if (!storyFrame) {
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_FAIL_no_story_frame.png`, fullPage: true });
  results.checklist.image_button = { ok: false, reason: 'story frame not found' };
  results.checklist.llm_button = { ok: false, reason: 'story frame not found' };
  results.checklist.cache_backfill = { ok: false, reason: 'story frame not found' };
  results.checklist.timeout_hint = { ok: false, reason: 'story frame not found' };
  results.checklist.concurrency_join = { ok: false, reason: 'story frame not found' };
} else {
  // Enable debug switch if exposed
  const debugEnabled = await page.evaluate(() => {
    const cands = [window.__edenStoryChatu8Debug, window.parent?.__edenStoryChatu8Debug, window.top?.__edenStoryChatu8Debug];
    const fn = cands.find(x => typeof x === 'function');
    if (!fn) return false;
    try {
      fn(true);
      return true;
    } catch {
      return false;
    }
  });

  await sleep(600);
  const stateReady = await getStoryState(storyFrame);
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_01_story_ready.png`, fullPage: true });

  // 1) 生图按钮
  const imageClickOk = await clickStoryButton(storyFrame, '生图菜单');
  await sleep(1200);
  const imageToasts = await readRecentToasts();
  const stateAfterImage = await getStoryState(storyFrame);
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_02_image_button.png`, fullPage: true });
  results.checklist.image_button = {
    ok: imageClickOk,
    debugEnabled,
    toasts: imageToasts,
    before: stateReady,
    after: stateAfterImage,
    screenshot: `${OUT_DIR}/mcp_check_02_image_button.png`,
  };

  // 2) LLM提示词按钮
  const llmClickOk = await clickStoryButton(storyFrame, 'LLM提示词');
  await sleep(2200);
  const llmToasts = await readRecentToasts();
  const stateAfterLlm = await getStoryState(storyFrame);
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_03_llm_button.png`, fullPage: true });
  results.checklist.llm_button = {
    ok: llmClickOk,
    toasts: llmToasts,
    state: stateAfterLlm,
    screenshot: `${OUT_DIR}/mcp_check_03_llm_button.png`,
  };

  // 3) 缓存回填（观测日志 + UI）
  await sleep(2500);
  const stateAfterCacheWait = await getStoryState(storyFrame);
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_04_cache_backfill.png`, fullPage: true });
  results.checklist.cache_backfill = {
    ok: true,
    state: stateAfterCacheWait,
    screenshot: `${OUT_DIR}/mcp_check_04_cache_backfill.png`,
  };

  // 4) 超时提示（通过 monkey patch 将 45s 缩短并吞掉 llm 请求响应）
  await storyFrame.evaluate(() => {
    const w = window;
    if (w.__edenTimeoutPatchApplied) return;
    w.__edenTimeoutPatchApplied = true;
    w.__edenOrigSetTimeout = w.setTimeout;
    w.__edenOrigEventEmit = w.eventEmit;
    w.setTimeout = function (fn, delay, ...args) {
      const n = Number(delay);
      const d = Number.isFinite(n) && n > 5000 ? 2000 : delay;
      return w.__edenOrigSetTimeout(fn, d, ...args);
    };
    w.eventEmit = function (eventName, payload, ...rest) {
      if (eventName === 'eden:samelayer:command-request' && payload && payload.command === 'get_llm_prompt') {
        return Promise.resolve();
      }
      return w.__edenOrigEventEmit.call(this, eventName, payload, ...rest);
    };
  });

  const timeoutClickOk = await clickStoryButton(storyFrame, 'LLM提示词');
  await sleep(3200);
  const timeoutToasts = await readRecentToasts();
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_05_timeout_hint.png`, fullPage: true });

  await storyFrame.evaluate(() => {
    const w = window;
    if (w.__edenOrigSetTimeout) w.setTimeout = w.__edenOrigSetTimeout;
    if (w.__edenOrigEventEmit) w.eventEmit = w.__edenOrigEventEmit;
    delete w.__edenOrigSetTimeout;
    delete w.__edenOrigEventEmit;
    delete w.__edenTimeoutPatchApplied;
  });

  results.checklist.timeout_hint = {
    ok: timeoutClickOk,
    toasts: timeoutToasts,
    screenshot: `${OUT_DIR}/mcp_check_05_timeout_hint.png`,
  };

  // 5) 并发 join 行为（同 key 双击只发一次 get_llm_prompt）
  await storyFrame.evaluate(() => {
    const w = window;
    w.__edenJoinCount = 0;
    w.__edenJoinPatchApplied = true;
    w.__edenJoinOrigSetTimeout = w.setTimeout;
    w.__edenJoinOrigEventEmit = w.eventEmit;
    w.setTimeout = function (fn, delay, ...args) {
      const n = Number(delay);
      const d = Number.isFinite(n) && n > 5000 ? 2000 : delay;
      return w.__edenJoinOrigSetTimeout(fn, d, ...args);
    };
    w.eventEmit = function (eventName, payload, ...rest) {
      if (eventName === 'eden:samelayer:command-request' && payload && payload.command === 'get_llm_prompt') {
        w.__edenJoinCount += 1;
        return Promise.resolve();
      }
      return w.__edenJoinOrigEventEmit.call(this, eventName, payload, ...rest);
    };
  });

  await clickStoryButton(storyFrame, 'LLM提示词');
  await clickStoryButton(storyFrame, 'LLM提示词');
  await sleep(300);
  const joinCount = await storyFrame.evaluate(() => Number(window.__edenJoinCount ?? -1));
  await sleep(2300);
  const joinToasts = await readRecentToasts();
  await page.screenshot({ path: `${OUT_DIR}/mcp_check_06_concurrency_join.png`, fullPage: true });

  await storyFrame.evaluate(() => {
    const w = window;
    if (w.__edenJoinOrigSetTimeout) w.setTimeout = w.__edenJoinOrigSetTimeout;
    if (w.__edenJoinOrigEventEmit) w.eventEmit = w.__edenJoinOrigEventEmit;
    delete w.__edenJoinOrigSetTimeout;
    delete w.__edenJoinOrigEventEmit;
    delete w.__edenJoinPatchApplied;
  });

  results.checklist.concurrency_join = {
    ok: joinCount === 1,
    commandEmitCount: joinCount,
    toasts: joinToasts,
    screenshot: `${OUT_DIR}/mcp_check_06_concurrency_join.png`,
  };
}

const logRegex = /StorySection|st-chatu8|bridge_probe|image_request|llm_prompt|cache_query|command-request|command-response|TIMEOUT|timed out|Error|error|failed/i;
results.logsFiltered = logs.filter(l => logRegex.test(l.text || '')).slice(-500);

fs.writeFileSync(`${OUT_DIR}/mcp_story_report.json`, JSON.stringify(results, null, 2), 'utf8');
console.log(JSON.stringify({ report: `${OUT_DIR}/mcp_story_report.json`, summary: results.checklist, frame: results.meta }, null, 2));

await browser.close();
