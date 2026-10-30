const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { parse, compileScript } = require('vue/compiler-sfc');
const playwrightRequire = createRequire(fs.realpathSync('node_modules/@playwright/cli/package.json'));
const { chromium } = playwrightRequire('playwright');

function replaceVueUseImports(js) {
  return js.replace(
    /import\s*\{[^}]+\}\s*from\s*["']@vueuse\/core["'];?/g,
    `
    const useThrottleFn = callback => callback;
    const useEventListener = (target, event, callback, options) => {
      target.addEventListener(event, callback, options);
      Vue.onBeforeUnmount(() => target.removeEventListener(event, callback, options));
    };`,
  );
}

for (const nested of [false, true])
  test(`viewer controls follow the visible part of ${nested ? 'nested' : 'single'} scrolled host iframes`, async t => {
    const file = path.join(__dirname, '../components/PreGalleryViewer.vue');
    const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
    const compiled = compileScript(descriptor, { id: 'viewer-test', inlineTemplate: true, genDefaultAs: 'Viewer' });
    const js = ts
      .transpileModule(compiled.content, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      .outputText.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']vue["'];?/g,
        (_, imports) => `const {${imports.replace(/\bas\b/g, ':')}} = Vue;`,
      );
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 600, height: 720 } });
    await page.setContent(
      '<div id="chat" style="position:absolute;top:100px;left:40px;width:500px;height:500px;overflow:auto"><iframe style="width:100%;height:1400px;border:0"></iframe></div>',
    );
    let frame = page.frames()[1];
    if (nested) {
      await frame.setContent('<iframe style="width:100%;height:1400px;border:0"></iframe>');
      frame = frame.childFrames()[0];
    }
    await frame.setContent('<div id="app"></div>');
    await frame.addScriptTag({ path: require.resolve('vue/dist/vue.global.js') });
    await frame.addStyleTag({ content: descriptor.styles[0].content });
    await page.locator('#chat').evaluate(el => {
      el.scrollTop = 350;
    });
    await frame.addScriptTag({
      content: `${replaceVueUseImports(js)}\nVue.createApp({ setup() { const open = Vue.ref(true); return () => open.value ? Vue.h(Viewer, { entries: [{src:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}], initialIndex:0, onClose: () => open.value = false }) : null; } }).mount('#app');`,
    });
    const visibleBounds = async () =>
      page.evaluate(() => {
        const chat = document.querySelector('#chat').getBoundingClientRect();
        let frame = document.querySelector('iframe');
        let top = frame.getBoundingClientRect().top;
        let left = frame.getBoundingClientRect().left;
        while (frame.contentDocument.querySelector('iframe')) {
          frame = frame.contentDocument.querySelector('iframe');
          top += frame.getBoundingClientRect().top;
          left += frame.getBoundingClientRect().left;
        }
        const close = frame.contentDocument.querySelector('[aria-label="关闭大图"]').getBoundingClientRect();
        return {
          top: top + close.top,
          bottom: top + close.bottom,
          left: left + close.left,
          right: left + close.right,
          clipLeft: chat.left,
          clipRight: chat.right,
          clipTop: chat.top,
          clipBottom: chat.bottom,
        };
      });
    const first = await visibleBounds();
    assert.ok(first.top >= first.clipTop && first.bottom <= first.clipBottom, JSON.stringify(first));
    await page.locator('#chat').evaluate(el => {
      el.scrollTop = 600;
    });
    await page.waitForTimeout(150);
    const second = await visibleBounds();
    assert.ok(second.top >= second.clipTop && second.bottom <= second.clipBottom, JSON.stringify(second));
    await page.locator('#chat').evaluate(el => {
      el.style.width = '280px';
      el.querySelector('iframe').style.width = '500px';
      el.scrollLeft = 100;
    });
    await page.waitForTimeout(150);
    const narrow = await visibleBounds();
    assert.ok(narrow.left >= narrow.clipLeft && narrow.right <= narrow.clipRight, JSON.stringify(narrow));
    assert.ok(narrow.top >= narrow.clipTop && narrow.bottom <= narrow.clipBottom, JSON.stringify(narrow));
    const button = await frame.locator('[aria-label="关闭大图"]').boundingBox();
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    assert.equal(await frame.locator('[role="dialog"]').count(), 0);
  });

test('PRE independent viewer navigation and gesture boundaries', async t => {
  const file = path.join(__dirname, '../components/PreGalleryViewer.vue');
  const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
  const compiled = compileScript(descriptor, { id: 'viewer-test', inlineTemplate: true, genDefaultAs: 'Viewer' });
  const js = ts
    .transpileModule(compiled.content, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(
      /import\s*\{([^}]+)\}\s*from\s*["']vue["'];?/g,
      (_, imports) => `const {${imports.replace(/\bas\b/g, ':')}} = Vue;`,
    );
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<button id="opener">画廊</button><div id="app"></div>');
  await page.addScriptTag({ path: require.resolve('vue/dist/vue.global.js') });
  await page.addStyleTag({ content: descriptor.styles[0].content });
  await page.locator('#opener').focus();
  await page.addScriptTag({
    content: `${replaceVueUseImports(js)}
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="teal"/></svg>');
    window.app = Vue.createApp({ setup() {
      const open = Vue.ref(true);
      return () => open.value ? Vue.h(Viewer, { entries: [1,2,3].map(n => ({src:image, title:'图片'+n})), initialIndex:0, onClose:() => open.value=false }) : null;
    }}).mount('#app');`,
  });
  const counter = () => page.locator('[aria-live]').textContent();
  async function gesture(points) {
    await page.locator('.pre-viewer__stage').evaluate((element, points) => {
      // Synthetic pointers exercise Vue handlers without relying on device availability.
      element.setPointerCapture = () => {};
      for (const [type, id, x, y] of points) {
        element.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            clientX: x,
            clientY: y,
            button: 0,
            bubbles: true,
            pointerType: 'touch',
          }),
        );
      }
    }, points);
  }
  const swipe = (dx, dy = 0) =>
    gesture([
      ['pointerdown', 1, 180, 200],
      ['pointermove', 1, 180 + dx, 200 + dy],
      ['pointerup', 1, 180 + dx, 200 + dy],
    ]);

  await t.test('horizontal swipes navigate; short and vertical movements do not', async () => {
    await swipe(-100);
    assert.equal(await counter(), '2 / 3');
    await swipe(-20);
    await swipe(-60, 150);
    assert.equal(await counter(), '2 / 3');
    await swipe(100);
    assert.equal(await counter(), '1 / 3');
    await swipe(100);
    assert.equal(await counter(), '1 / 3');
  });
  await t.test('zoom pans instead of navigating; reset restores swiping', async () => {
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await swipe(-100);
    assert.equal(await counter(), '1 / 3');
    assert.match(await page.locator('.pre-viewer__stage img').getAttribute('style'), /translate\(-/);
    await page.getByRole('button', { name: '恢复适应大小' }).click();
    await swipe(-100);
    assert.equal(await counter(), '2 / 3');
  });
  await t.test('pinch and pointer cancellation never become page turns', async () => {
    await gesture([
      ['pointerdown', 1, 100, 200],
      ['pointerdown', 2, 200, 200],
      ['pointermove', 2, 300, 200],
      ['pointerup', 2, 300, 200],
      ['pointermove', 1, 20, 200],
      ['pointerup', 1, 20, 200],
    ]);
    assert.equal(await counter(), '2 / 3');
    assert.equal(await page.getByRole('button', { name: '恢复适应大小' }).textContent(), '200%');
    await page.getByRole('button', { name: '恢复适应大小' }).click();
    await gesture([
      ['pointerdown', 1, 180, 200],
      ['pointercancel', 1, 80, 200],
      ['pointerup', 1, 80, 200],
    ]);
    assert.equal(await counter(), '2 / 3');
  });
  await t.test('keyboard navigation stops at the end and Escape restores focus', async () => {
    await page.keyboard.press('ArrowRight');
    assert.equal(await counter(), '3 / 3');
    await page.keyboard.press('ArrowRight');
    assert.equal(await counter(), '3 / 3');
    assert.equal(await page.getByRole('button', { name: '下一张', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('#opener').evaluate(el => el === document.activeElement), true);
  });
  assert.deepEqual(errors, []);
});
