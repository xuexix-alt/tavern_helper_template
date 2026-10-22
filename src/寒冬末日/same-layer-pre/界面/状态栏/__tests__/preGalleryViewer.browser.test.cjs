const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { parse, compileScript } = require('vue/compiler-sfc');
const playwrightRequire = createRequire(fs.realpathSync('node_modules/@playwright/cli/package.json'));
const { chromium } = playwrightRequire('playwright');

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
    content: `${js}
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
