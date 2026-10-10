const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const playwrightRequire = createRequire(fs.realpathSync('node_modules/@playwright/cli/package.json'));
const { chromium } = playwrightRequire('playwright');

function browserModule(file) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `(() => { const exports = {}; ${js}; return exports; })()`;
}

test('web fullscreen preserves the host, plugins and Eden terminal', async t => {
  const sourceFile = path.join(__dirname, '../preWebFullscreen.ts');
  assert.ok(fs.existsSync(sourceFile), 'PRE needs a reversible host fullscreen controller');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(`<style>
    html { transform: translateZ(0); } body { margin:0; }
    #sheld { position:fixed; left:250px; top:80px; width:760px; height:600px; overflow:hidden; z-index:30; }
    #chat { height:500px; overflow:auto; transform:translateZ(0); contain:paint; }
    .mes { position:relative; isolation:isolate; } .mes_block { overflow:hidden; }
    iframe { width:100%; border:0; } #preview { position:fixed; inset:100px; z-index:10000; background:white; }
  </style><div id="top-bar" style="position:fixed;inset:0 0 auto;height:40px;z-index:3005">Tavern navigation</div><div id="sheld"><div id="chat"><div class="mes" mesid="0"><div class="mes_block"><div class="mes_text">
    <iframe id="pre" style="height:720px"></iframe>
  </div></div></div><div class="mes" mesid="5"><div class="mes_text" id="native">native plugin target</div></div></div></div>
  <button id="preview" hidden>plugin preview</button>`);
  await page.evaluate(() => {
    const frame = document.querySelector('#pre');
    frame.contentDocument.body.innerHTML = '<button id="launcher">伊甸终端</button><textarea>draft</textarea>';
    window.originalFrame = frame;
    window.originalWindow = frame.contentWindow;
    window.nativeNode = document.querySelector('#native');
    window.pluginClicks = 0;
    window.nativeNode.addEventListener('click', () => window.pluginClicks++);
  });
  await page.evaluate(module => {
    originalFrame.contentWindow.eval(
      `window.fullscreenModule = ${module}; window.fullscreen = fullscreenModule.createPreWebFullscreenController(window.frameElement);`,
    );
    window.fullscreen = originalFrame.contentWindow.fullscreen;
  }, browserModule(sourceFile));

  await t.test('fills viewport without moving or reloading the iframe or changing native nodes', async () => {
    assert.equal(await page.evaluate(() => window.fullscreen.enter()), true);
    assert.equal(await page.evaluate(() => document.elementFromPoint(640, 20).id), 'pre');
    assert.deepEqual(
      await page.evaluate(() => {
        const f = document.querySelector('#pre');
        const r = f.getBoundingClientRect();
        window.nativeNode.click();
        return {
          rect: [r.x, r.y, r.width, r.height],
          same: f === originalFrame && f.contentWindow === originalWindow,
          parent: f.parentElement.className,
          draft: f.contentDocument.querySelector('textarea').value,
          native: nativeNode === document.querySelector('#native'),
          clicks: pluginClicks,
        };
      }),
      { rect: [0, 0, 1280, 800], same: true, parent: 'mes_text', draft: 'draft', native: true, clicks: 1 },
    );
  });

  await t.test('host plugin preview remains clickable above PRE', async () => {
    await page.evaluate(() => {
      document.querySelector('#preview').hidden = false;
    });
    await page.locator('#preview').click();
    assert.equal(await page.evaluate(() => document.elementFromPoint(640, 400).id), 'preview');
    await page.evaluate(() => {
      document.querySelector('#preview').hidden = true;
    });
  });

  await t.test('Escape from the iframe reaches the host preview without exiting PRE', async () => {
    assert.equal(
      await page.evaluate(() => typeof originalFrame.contentWindow.fullscreenModule.forwardEscapeToHostOverlay),
      'function',
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const preview = document.querySelector('#preview');
        preview.hidden = false;
        document.addEventListener(
          'keydown',
          event => {
            if (event.key === 'Escape') preview.hidden = true;
          },
          { once: true },
        );
        originalFrame.contentDocument.querySelector('textarea').focus();
        const routed = originalFrame.contentWindow.fullscreenModule.forwardEscapeToHostOverlay(originalFrame);
        return { routed, hidden: preview.hidden, active: fullscreen.active };
      }),
      { routed: true, hidden: true, active: true },
    );
  });

  await t.test('actual Eden PhoneShell opens above PRE and Escape closes only the terminal', async () => {
    const shellFile = path.resolve('src/小手机平台/shell/phoneShell.ts');
    const phoneStyles = fs.readFileSync(path.resolve('src/小手机平台/shell/phoneShell.css'), 'utf8');
    await page.addScriptTag({ content: `window.phoneModule = ${browserModule(shellFile)};` });
    await page.evaluate(async styles => {
      window.phone = new phoneModule.PhoneShell({
        document,
        styles,
        apps: [],
        productName: '伊甸终端',
        onRequestClose: () => phone.close(),
      });
      await phone.open(undefined, originalFrame.contentDocument.querySelector('#launcher'));
    }, phoneStyles);
    assert.equal(
      await page.evaluate(() => document.elementFromPoint(640, 400).hasAttribute('data-tavern-phone-root')),
      true,
    );
    await page.keyboard.press('Escape');
    assert.deepEqual(
      await page.evaluate(() => ({
        phone: phone.isOpen(),
        full: fullscreen.active,
        focus: originalFrame.contentDocument.activeElement.id,
      })),
      { phone: false, full: true, focus: 'launcher' },
    );
    await page.evaluate(() => phone.dispose());
  });

  await t.test('short mobile viewport and viewport offsets use actual available size', async () => {
    await page.setViewportSize({ width: 390, height: 320 });
    await page.evaluate(() => fullscreen.updateViewport());
    assert.deepEqual(await page.locator('#pre').boundingBox(), { x: 0, y: 0, width: 390, height: 320 });
    await page.evaluate(() => {
      window.savedViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { width: 320, height: 210, offsetLeft: 7, offsetTop: 11 },
      });
      fullscreen.updateViewport();
    });
    assert.deepEqual(await page.locator('#pre').boundingBox(), { x: 7, y: 11, width: 320, height: 210 });
    await page.evaluate(() => {
      Object.defineProperty(window, 'visualViewport', savedViewport);
      fullscreen.updateViewport();
    });
  });

  await t.test('exit preserves newer host styles and repeat switching leaves no attributes behind', async () => {
    await page.evaluate(() => {
      originalFrame.style.height = '812px';
      fullscreen.exit();
    });
    assert.deepEqual(
      await page.evaluate(() => ({
        height: originalFrame.style.height,
        fixed: getComputedStyle(document.querySelector('#sheld')).position,
        transform: getComputedStyle(document.documentElement).transform,
        remaining: document.querySelectorAll('[data-eden-pre-fullscreen]').length,
      })),
      { height: '812px', fixed: 'fixed', transform: 'matrix(1, 0, 0, 1, 0, 0)', remaining: 0 },
    );
    await page.evaluate(() => {
      for (let i = 0; i < 3; i++) {
        fullscreen.enter();
        fullscreen.exit();
      }
    });
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-eden-pre-fullscreen]').length), 0);
  });

  await t.test('removing the carrier cleans host styles even if iframe unload never fires', async () => {
    await page.evaluate(() => {
      fullscreen.enter();
      originalFrame.closest('.mes').remove();
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-eden-pre-fullscreen]').length === 0, null, {
      timeout: 1500,
    });
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-eden-pre-fullscreen]').length), 0);
  });
});
