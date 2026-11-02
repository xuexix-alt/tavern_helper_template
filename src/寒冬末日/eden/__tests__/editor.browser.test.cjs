/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules -- Local browser test harness. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader');
const playwrightRequire = createRequire(fs.realpathSync('node_modules/@playwright/cli/package.json'));
const { chromium } = playwrightRequire('playwright');

test('real editor confirms worldbook writes, survives reopening, rejects failures, and fits mobile', async t => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-editor-test-'));
  const repo = path.resolve(__dirname, '../../../..');
  const source = path.resolve(__dirname, '../components/EdenSystemPanel.vue');
  const runtime = path.resolve(__dirname, '../runtime.ts');
  const entry = path.join(taskDir, 'entry.js');
  fs.writeFileSync(
    entry,
    `import {createApp,ref,h} from 'vue';
    import Editor from ${JSON.stringify(source)};
    import {prepareEdenGeneration} from ${JSON.stringify(runtime)};
    window.edenTab=ref('abilities');
    window.mountEditor=()=>{window.editorApp=createApp({setup(){return()=>h(Editor,{tab:window.edenTab.value})}});window.editorApp.mount('#app')};
    window.reopenEditor=()=>{window.editorApp.unmount();window.mountEditor()};
    window.prepareEdenGeneration=prepareEdenGeneration;window.mountEditor();`,
  );
  await new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'development',
        context: repo,
        entry,
        devtool: false,
        output: { path: taskDir, filename: 'editor.js' },
        resolve: { extensions: ['.ts', '.js', '.vue'], modules: ['node_modules', path.join(repo, 'node_modules')] },
        resolveLoader: { modules: [path.join(repo, 'node_modules')] },
        module: {
          rules: [
            { test: /\.vue$/, loader: 'vue-loader' },
            {
              test: /\.ts$/,
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                appendTsSuffixTo: [/\.vue$/],
                configFile: path.join(repo, 'tsconfig.json'),
              },
            },
            { test: /\.txt$/, type: 'asset/source' },
            { test: /\.css$/, type: 'asset/source' },
          ],
        },
        plugins: [new VueLoaderPlugin()],
      },
      (error, stats) =>
        error || stats.hasErrors()
          ? reject(
              error ??
                new Error(
                  stats
                    .toJson({ all: false, errors: true })
                    .errors.slice(0, 3)
                    .map(item => item.message)
                    .join('\n'),
                ),
            )
          : resolve(),
    );
  });
  new (require('node:vm').Script)(fs.readFileSync(path.join(taskDir, 'editor.js'), 'utf8'), { filename: 'editor.js' });
  const server = http.createServer((request, response) => {
    if (request.url === '/editor.js') {
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      response.end(fs.readFileSync(path.join(taskDir, 'editor.js')));
    } else {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script src="/editor.js"></script></body></html>',
      );
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (
      path.resolve(taskDir).startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(taskDir).startsWith('eden-editor-test-')
    )
      fs.rmSync(taskDir, { recursive: true });
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.chatId = 'a';
    window.boundBook = null;
    window.day = 2;
    window.failWrite = false;
    window.writes = 0;
    window.chatVars = {};
    window.books = { 'book-a': [{ uid: 1, name: '[微信-私聊]纪宁', content: '原手机内容' }] };
    const listeners = new Map();
    window._ = {
      get: (object, key, fallback) => key.split('.').reduce((value, part) => value?.[part], object) ?? fallback,
      set: (object, key, value) => {
        const parts = key.split('.');
        let cursor = object;
        for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
        cursor[parts.at(-1)] = value;
        return object;
      },
    };
    window.SillyTavern = { getCurrentChatId: () => window.chatId };
    window.getVariables = () => window.chatVars;
    window.updateVariablesWith = callback => {
      window.chatVars = callback(window.chatVars);
    };
    window.getLastMessageId = () => 4;
    window.getChatMessages = () => [
      { message_id: 4, data: { stat_data: { 世界: { 末日天数: window.day }, 庇护所: { 庇护所等级: 1 } } } },
    ];
    window.getChatWorldbookName = () => window.boundBook;
    window.getOrCreateChatWorldbook = async () => {
      window.boundBook = 'book-' + window.chatId;
      return window.boundBook;
    };
    window.getWorldbook = async name => structuredClone(window.books[name] ?? []);
    window.updateWorldbookWith = async (name, updater) => {
      if (window.failWrite) throw new Error('模拟写入失败');
      window.books[name] = structuredClone(await updater(structuredClone(window.books[name] ?? []))).map(
        (item, index) => ({ uid: index + 1, ...item }),
      );
      window.writes++;
      return window.books[name];
    };
    window.waitGlobalInitialized = async () => {};
    window.Mvu = {
      getMvuData: () => ({ stat_data: { 世界: { 末日天数: window.day }, 庇护所: {} } }),
      replaceMvuData: async () => {},
    };
    window.tavern_events = {
      CHAT_CHANGED: 'chat-changed',
      MESSAGE_UPDATED: 'message-updated',
      MESSAGE_RECEIVED: 'message-received',
      MESSAGE_DELETED: 'message-deleted',
      MESSAGE_SWIPED: 'message-swiped',
    };
    window.eventOn = (name, callback) => {
      const set = listeners.get(name) ?? new Set();
      set.add(callback);
      listeners.set(name, set);
      return { stop: () => set.delete(callback) };
    };
    window.eventEmit = async (name, ...args) => {
      for (const callback of listeners.get(name) ?? []) await callback(...args);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addStyleTag({
    content: require('vue/compiler-sfc').parse(fs.readFileSync(source, 'utf8')).descriptor.styles[0].content,
  });
  assert.deepEqual(errors, [], 'component boot errors');
  await page.evaluate(() => {
    window.day = 60;
    window.edenTab.value = 'rescue';
    window.reopenEditor();
  });
  await page.getByRole('heading', { name: '待确认任务预览', exact: true }).waitFor();
  assert.equal(
    await page.getByText('救亡期限已逾期', { exact: true }).count(),
    0,
    'an uninitialized legacy chat cannot be shut down by a preview',
  );
  await page.evaluate(() => {
    window.day = 2;
    window.edenTab.value = 'abilities';
    window.reopenEditor();
  });
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(
    await page.locator('input:visible,textarea:visible,select:visible').count(),
    0,
    'the default ability board must be read-only',
  );
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await page.evaluate(() => window.writes), 0);
  await page.getByRole('button', { name: '预览世界书', exact: true }).click();
  await page.getByRole('button', { name: '确认写入', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.writes), 0);

  // Editing after preview invalidates confirmation.
  await page
    .locator('article')
    .filter({ has: page.locator('strong', { hasText: '基础供暖供电' }) })
    .locator('summary')
    .click();
  const nameInput = page.getByLabel('名称', { exact: true }).first();
  await nameInput.fill('我的供暖');
  assert.equal(await page.getByRole('button', { name: '确认写入', exact: true }).count(), 0);
  await page.getByRole('button', { name: '预览世界书', exact: true }).click();
  await page.evaluate(() => {
    window.failWrite = true;
  });
  await page.getByRole('button', { name: '确认写入', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '模拟写入失败' }).waitFor();
  assert.equal(await nameInput.inputValue(), '我的供暖');
  assert.equal(await page.evaluate(() => window.writes), 0);
  await page.evaluate(() => {
    window.failWrite = false;
  });
  await page.getByRole('button', { name: '确认写入', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存至世界书' }).waitFor();
  assert.equal(await page.evaluate(() => window.books['book-a'][0].content), '原手机内容');
  assert.equal(await page.evaluate(() => window.books['book-a'].length), 7);

  await page.evaluate(() => window.reopenEditor());
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(await page.locator('strong').filter({ hasText: '我的供暖' }).count(), 1);
  assert.equal(await page.locator('input:visible,textarea:visible,select:visible').count(), 0);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '添加自定义能力' }).first().click();
  assert.equal(await page.locator('strong').filter({ hasText: '新能力' }).count(), 1);
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  assert.equal(await page.locator('strong').filter({ hasText: '新能力' }).count(), 0);

  await page.evaluate(() => {
    window.edenTab.value = 'rescue';
  });
  await page.getByRole('heading', { name: '当前任务', exact: true }).waitFor();
  await page.getByRole('heading', { name: '已知线索', exact: true }).waitFor();
  assert.equal(
    await page.locator('input:visible,textarea:visible,select:visible').count(),
    0,
    'mission dashboard must not expose setting editors',
  );
  assert.equal(
    await page.getByText('天气编辑器', { exact: false }).count(),
    0,
    'future technology settings are not a dashboard',
  );
  await page.evaluate(() => {
    window.edenTab.value = 'technology';
  });
  await page.getByRole('heading', { name: '当前任务', exact: true }).waitFor();
  assert.equal(await page.locator('input:visible,textarea:visible,select:visible').count(), 0);
  await page.getByRole('button', { name: '登记成果', exact: true }).click();
  const progressDialog = page.locator('dialog[open]');
  await progressDialog.getByLabel('名称', { exact: true }).fill('万能营养液');
  await progressDialog.getByLabel('剧情依据').fill('取得农业lv0存储器并获得制备知识');
  await progressDialog.getByRole('button', { name: '确认成果', exact: true }).click();
  await progressDialog.waitFor({ state: 'hidden' });
  await page.getByText('建立首套自持生产体系', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      window.books['book-a'].find(item => item.name === '当前伊甸技术').content.includes('农业lv0'),
    ),
    true,
  );
  await page.getByRole('button', { name: '登记成果', exact: true }).click();
  await progressDialog.getByRole('button', { name: '确认成果', exact: true }).click();
  await progressDialog.getByRole('status').filter({ hasText: '重复' }).waitFor();
  await progressDialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(async () => {
    window.day = 1;
    await window.eventEmit('message-swiped');
  });
  await page.getByText('寻找农业 lv0 · 万能营养液', { exact: true }).waitFor();
  await page.evaluate(async () => {
    window.day = 2;
    await window.eventEmit('message-updated');
  });
  await page.getByText('建立首套自持生产体系', { exact: true }).waitFor();

  // Actual generation refresh reads confirmed settings and enforces catastrophe-only deadline.
  await page.evaluate(async () => {
    window.day = 33;
    await window.prepareEdenGeneration();
  });
  assert.equal(
    await page.evaluate(() =>
      window.books['book-a'].find(item => item.name === '当前伊甸').content.includes('停机（救亡逾期）'),
    ),
    true,
  );
  await page.evaluate(() => window.reopenEditor());
  await page.getByText('救亡期限已逾期', { exact: true }).waitFor();
  await page.evaluate(() => {
    window.edenTab.value = 'abilities';
  });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '人工确认恢复（预览后写入）', exact: true }).click();
  await page.getByRole('button', { name: '预览世界书', exact: true }).click();
  await page.getByRole('button', { name: '确认写入', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  await page.evaluate(async () => {
    window.day = -2;
    await window.prepareEdenGeneration();
  });
  assert.equal(
    await page.evaluate(() =>
      window.books['book-a'].find(item => item.name === '当前救亡任务').content.includes('灾前准备'),
    ),
    true,
  );

  await page.addStyleTag({
    content:
      ':root{--surface:#f8f8fa;--demo-text-primary:#202124;--demo-text-secondary:#555;--demo-text-accent:#315f9a;--demo-border-accent-soft:#d4dae3;--demo-font-mono:system-ui} body{margin:16px;font:14px/1.5 system-ui}',
  });
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `horizontal overflow at ${width}`,
    );
  }
  if (process.env.EDEN_UI_SCREENSHOT) {
    await page.evaluate(() => {
      window.edenTab.value = 'abilities';
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: process.env.EDEN_UI_SCREENSHOT });
  }
  // Switching to a different chat never retains or saves the previous draft.
  await page.evaluate(async () => {
    window.chatId = 'b';
    window.boundBook = null;
    await window.eventEmit('chat-changed');
  });
  await page.evaluate(() => {
    window.edenTab.value = 'abilities';
  });
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.books['book-b'] ?? []), []);
  assert.deepEqual(errors, []);
});
