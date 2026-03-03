import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const OUT_DIR = '.tmp/playwright';
fs.mkdirSync(OUT_DIR, { recursive: true });

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function startStaticServer(rootDir, port = 5500) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      let pathname = decodeURIComponent(url.pathname || '/');
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.join(rootDir, pathname.replace(/^\/+/, '').replace(/\.\./g, ''));

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (!filePath.startsWith(rootDir)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }

      res.setHeader('Content-Type', contentType(filePath));
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });

  return new Promise(resolve => {
    server.on('error', error => {
      if (error && error.code === 'EADDRINUSE') {
        resolve({ server: null, mode: 'reuse-existing' });
        return;
      }
      throw error;
    });
    server.listen(port, '0.0.0.0', () => resolve({ server, mode: 'started' }));
  });
}

const logs = [];
const pageErrors = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clickRecentChat(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.recentChat'));
    const target = rows.find(row => (row.textContent || '').includes('末世寒冬')) || rows[0] || null;
    if (!target) return { ok: false, reason: 'no .recentChat found' };

    const text = (target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const jq = window.jQuery || window.$;
    if (jq) jq(target).trigger('click');
    else target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    return { ok: true, text, total: rows.length };
  });
}

async function getMessageFrameCandidates(page) {
  const out = [];
  for (const frame of page.frames()) {
    if (!frame.name().startsWith('TH-message--')) continue;
    try {
      const state = await frame.evaluate(() => ({
        ready: document.readyState,
        bodyChildren: document.body ? document.body.children.length : -1,
        bodyTextLen: (document.body?.innerText || '').trim().length,
        hasApp: !!document.querySelector('#app'),
        appInnerLen: (document.querySelector('#app')?.innerHTML || '').trim().length,
        hasStoryBtnDom: !!document.querySelector('button.story-image-menu-btn'),
        hasLlmBtnTextDom: (document.body?.innerText || '').includes('LLM'),
        hasEventEmit: typeof window.eventEmit === 'function',
        hasEventOn: typeof window.eventOn === 'function',
        hasGetCurrentMessageId: typeof window.getCurrentMessageId === 'function',
      }));

      const html = await frame.content();
      const hasStoryCode =
        html.includes('story-image-menu-btn') ||
        html.includes('StorySection') ||
        html.includes('eden:samelayer:command-request');

      out.push({
        name: frame.name(),
        url: frame.url(),
        hasStoryCode,
        ...state,
      });
    } catch (error) {
      out.push({ name: frame.name(), url: frame.url(), error: String(error) });
    }
  }
  return out;
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
      disabled: b.disabled === true,
    }));
    const status = Array.from(document.querySelectorAll('.image-prompt-status')).map(el => (el.textContent || '').trim());
    const loadingTips = Array.from(document.querySelectorAll('.image-prompt-loading-tip')).map(el => (el.textContent || '').trim());
    const imageCount = document.querySelectorAll('img.story-image').length;
    return { buttons, status, loadingTips, imageCount };
  });
}

async function readRecentToasts(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#toast-container .toast, #toast-container .toast-message, .toast-message'));
    return nodes.map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-10);
  });
}

const { server: localServer, mode: serverMode } = await startStaticServer(process.cwd(), 5500);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

page.on('console', async msg => {
  const loc = msg.location();
  logs.push({
    ts: Date.now(),
    type: msg.type(),
    text: msg.text(),
    url: loc?.url,
    line: loc?.lineNumber,
    col: loc?.columnNumber,
  });
});
page.on('pageerror', err => {
  pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
});

const results = {
  meta: {
    url: 'http://127.0.0.1:8002/',
    generatedAt: new Date().toISOString(),
    local5500: serverMode,
    frameFound: false,
    frameUsable: false,
    frameName: null,
    frameUrl: null,
  },
  diagnosis: {
    recentChatClick: null,
    messageFrames: [],
    blocker: null,
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

try {
  await page.goto('http://127.0.0.1:8002/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(24000);
  await page.screenshot({ path: `${OUT_DIR}/mcp2_00_home.png`, fullPage: true });

  const clickRes = await clickRecentChat(page);
  results.diagnosis.recentChatClick = clickRes;
  await sleep(14000);
  await page.screenshot({ path: `${OUT_DIR}/mcp2_01_after_recent_click.png`, fullPage: true });

  const frames = await getMessageFrameCandidates(page);
  results.diagnosis.messageFrames = frames;

  const usable = frames.find(f => f.hasStoryBtnDom === true);
  const codeOnly = frames.find(f => f.hasStoryCode === true);

  if (!usable) {
    results.meta.frameFound = !!codeOnly;
    results.meta.frameUsable = false;
    results.meta.frameName = codeOnly?.name ?? null;
    results.meta.frameUrl = codeOnly?.url ?? null;

    if (codeOnly) {
      results.diagnosis.blocker = {
        reason: 'story code exists in TH-message frame, but UI not mounted (no story-image-menu-btn in DOM)',
        frame: codeOnly,
      };
    } else {
      results.diagnosis.blocker = {
        reason: 'no TH-message frame contains StorySection code markers',
      };
    }

    const reason = results.diagnosis.blocker.reason;
    results.checklist.image_button = { ok: false, reason };
    results.checklist.llm_button = { ok: false, reason };
    results.checklist.cache_backfill = { ok: false, reason };
    results.checklist.timeout_hint = { ok: false, reason };
    results.checklist.concurrency_join = { ok: false, reason };

    await page.screenshot({ path: `${OUT_DIR}/mcp2_FAIL_frame_not_usable.png`, fullPage: true });
  } else {
    // Fully usable path (not hit in current environment)
    const storyFrame = page.frames().find(f => f.name() === usable.name);
    results.meta.frameFound = true;
    results.meta.frameUsable = true;
    results.meta.frameName = usable.name;
    results.meta.frameUrl = usable.url;

    const stateReady = await getStoryState(storyFrame);
    await page.screenshot({ path: `${OUT_DIR}/mcp2_02_story_ready.png`, fullPage: true });

    const imageClickOk = await clickStoryButton(storyFrame, '生图菜单');
    await sleep(1200);
    results.checklist.image_button = {
      ok: imageClickOk,
      state: await getStoryState(storyFrame),
      toasts: await readRecentToasts(page),
      screenshot: `${OUT_DIR}/mcp2_03_image_button.png`,
    };
    await page.screenshot({ path: `${OUT_DIR}/mcp2_03_image_button.png`, fullPage: true });

    const llmClickOk = await clickStoryButton(storyFrame, 'LLM提示词');
    await sleep(2200);
    results.checklist.llm_button = {
      ok: llmClickOk,
      state: await getStoryState(storyFrame),
      toasts: await readRecentToasts(page),
      screenshot: `${OUT_DIR}/mcp2_04_llm_button.png`,
    };
    await page.screenshot({ path: `${OUT_DIR}/mcp2_04_llm_button.png`, fullPage: true });

    await sleep(2500);
    results.checklist.cache_backfill = {
      ok: true,
      state: await getStoryState(storyFrame),
      screenshot: `${OUT_DIR}/mcp2_05_cache_backfill.png`,
    };
    await page.screenshot({ path: `${OUT_DIR}/mcp2_05_cache_backfill.png`, fullPage: true });

    results.checklist.timeout_hint = { ok: null, reason: 'not executed in this run' };
    results.checklist.concurrency_join = { ok: null, reason: 'not executed in this run' };
  }

  const logRegex = /eden:samelayer|command-request|command-response|story|chatu8|failed|error|timeout|llm|cache/i;
  results.logsFiltered = logs.filter(l => logRegex.test(l.text || '')).slice(-500);
  results.pageErrors = pageErrors;

  fs.writeFileSync(`${OUT_DIR}/mcp_story_report_v2.json`, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify({ report: `${OUT_DIR}/mcp_story_report_v2.json`, summary: results.checklist, meta: results.meta, blocker: results.diagnosis.blocker }, null, 2));
} finally {
  await browser.close();
  if (localServer) {
    await new Promise(resolve => localServer.close(resolve));
  }
}
