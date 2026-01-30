import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const targetUrl = process.env.PW_URL || 'http://127.0.0.1:8000/';
const cdpUrl = process.env.PW_CDP_URL || 'http://127.0.0.1:9222';
const useCdp = process.env.PW_CDP === '1' || process.env.PW_CDP === 'true';
const outDir = path.resolve('.tmp', 'playwright');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const screenshotPath = path.join(outDir, `debug-${stamp}.png`);
const logPath = path.join(outDir, `console-${stamp}.log`);

fs.mkdirSync(outDir, { recursive: true });

const browser = useCdp
  ? await chromium.connectOverCDP(cdpUrl)
  : await chromium.launch({
      headless: false,
      slowMo: 50,
      args: ['--auto-open-devtools-for-tabs'],
    });

const context = useCdp
  ? browser.contexts()[0]
  : await browser.newContext({ viewport: { width: 1400, height: 900 } });

const page = useCdp
  ? (context?.pages().find(p => p.url() && p.url() !== 'about:blank') ||
      context?.pages()[0])
  : await context.newPage();

const consoleLines = [];
const pageErrors = [];
const requestFails = [];

page.on('console', msg => {
  const loc = msg.location();
  const locText = loc?.url ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})` : '';
  const line = `[${msg.type()}] ${msg.text()}${locText}`;
  consoleLines.push(line);
  console.log(line);
});
page.on('pageerror', err => {
  const line = `${err.name}: ${err.message}`;
  pageErrors.push(line);
  console.error(line);
});
page.on('requestfailed', req => {
  const failure = req.failure();
  const line = `${req.method()} ${req.url()} - ${failure?.errorText || 'unknown error'}`;
  requestFails.push(line);
  console.error(line);
});

let finalized = false;
const finalize = async (reason = 'manual') => {
  if (finalized) return;
  finalized = true;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (err) {
    pageErrors.push(`ScreenshotError: ${err?.message || err}`);
  }

  const output = [
    `URL: ${targetUrl}`,
    `Exit: ${reason}`,
    '',
    '== Console ==',
    consoleLines.length ? consoleLines.join('\n') : '(empty)',
    '',
    '== Page Errors ==',
    pageErrors.length ? pageErrors.join('\n') : '(empty)',
    '',
    '== Request Failed ==',
    requestFails.length ? requestFails.join('\n') : '(empty)',
    '',
  ];

  fs.writeFileSync(logPath, output.join('\n'), 'utf8');
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Console log: ${logPath}`);

  if (!useCdp) {
    await browser.close();
  }
  process.exit(0);
};

process.on('SIGINT', () => {
  void finalize('SIGINT');
});
process.on('SIGTERM', () => {
  void finalize('SIGTERM');
});

try {
  if (!useCdp || page.url() === 'about:blank') {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
  }
  await page.waitForTimeout(2000);
} catch (err) {
  pageErrors.push(`NavigationError: ${err?.message || err}`);
}

console.log(
  useCdp
    ? `已接入 CDP: ${cdpUrl}，正在监听当前页面控制台。`
    : '可交互调试模式已启动：请在打开的浏览器中操作。'
);
console.log('完成后按 Ctrl+C 生成截图与日志并退出。');
await page.waitForTimeout(24 * 60 * 60 * 1000);
