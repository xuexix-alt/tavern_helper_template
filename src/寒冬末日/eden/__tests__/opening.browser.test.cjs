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

test('opening controlled editor previews, saves, reopens, and locks existing stories', async t => {
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eden-editor-test-'));
  const repo = path.resolve(__dirname, '../../../..');
  const source = path.resolve(__dirname, '../components/EdenOpeningSetup.vue');
  const runtime = path.resolve(__dirname, '../runtime.ts');
  const entry = path.join(taskDir, 'entry.js');
  fs.writeFileSync(
    entry,
    `import {createApp,ref,h} from 'vue';
    import Editor from ${JSON.stringify(source)};
    import {useEdenOpening} from ${JSON.stringify(path.resolve(__dirname, '../useEdenOpening.ts'))};
    import {RuntimeOpeningPresetSchema} from ${JSON.stringify(path.resolve(__dirname, '../../界面同层版/shared/runtimeOpeningPreset.schema.ts'))};
    const preset=RuntimeOpeningPresetSchema.parse({version:2,integrations:{eden:true},preset_id:'test',ui:{title:'测试'},meta_template:{},default_meta:{},fields:[],prompt:{task:'生成开局'},output:{}});
    window.hasStory=ref(false);window.setupKey=ref('first');
    window.mountEditor=()=>{window.editorApp=createApp({setup(){
      const c=useEdenOpening({enabled:ref(true),worldModeId:ref('B'),payload:ref({meta:{character:'测试',time:'灾前',location:'伊甸'},form:{}}),hasStory:window.hasStory,buildPreset:()=>preset});window.controller=c;const ui=ref();
      return()=>h('main',{},[c.loading.value?h('p','加载中'):h(Editor,{ref:ui,document:c.draft.value,startDay:c.startDay.value,setupKey:window.setupKey.value,locked:window.hasStory.value,'onUpdate:document':v=>c.draft.value=v,'onUpdate:startDay':c.setStartDay}),h('button',{onClick:async()=>{try{if(ui.value.requestConfirmation())await c.confirm()}catch(e){window.saveError=String(e)}}},'生成')]);
    }});window.editorApp.mount('#app')};
    window.reopenEditor=()=>{window.editorApp.unmount();window.mountEditor()};window.mountEditor();`,
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
            { test: /\.(txt|yaml)$/, type: 'asset/source' },
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
    window.books = {
      'book-a': [
        { uid: 1, name: 'phone1', content: '保留' },
        { uid: 2, name: 'phone2', content: '保留' },
      ],
    };
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
    window.getCurrentMessageId = () => 0;
    window.getLastMessageId = () => 0;
    window.getChatMessages = () => [
      { message_id: 0, data: { stat_data: { 世界: { 末日天数: window.day }, 庇护所: { 庇护所等级: 1 } } } },
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
      replaceMvuData: async data => {
        if (window.failMvu) {
          window.failMvu = false;
          throw new Error('模拟MVU同步失败');
        }
        window.mvuWrites = (window.mvuWrites || 0) + 1;
        window.day = data.stat_data.世界.末日天数;
      },
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
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(await page.locator('input:visible,select:visible,textarea:visible').count(), 0);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('起始灾变天数', { exact: true }).fill('-90');
  await page.getByLabel('本体等级').selectOption('2');
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  assert.equal(await page.evaluate(() => window.controller.startDay.value), 372);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('起始灾变天数', { exact: true }).fill('-90');
  await page.getByLabel('本体等级').selectOption('2');
  await page.getByLabel('技术名称', { exact: true }).fill('营养技术');
  await page.getByRole('button', { name: '添加初始技术', exact: true }).click();
  await page.getByRole('button', { name: '完成编辑', exact: true }).click();
  assert.equal(await page.evaluate(() => window.controller.draft.value.initialTechnologies.length), 1);
  assert.equal(await page.evaluate(() => Object.keys(window.controller.draft.value.achievements).length), 0);
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('heading', { name: '开局配置预览', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.writes), 0);
  await page.evaluate(() => (window.setupKey.value = 'changed'));
  await page.getByRole('heading', { name: '开局配置预览', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.waitForFunction(() => window.controller.loaded.value);
  assert.equal(await page.evaluate(() => window.books['book-a'].length), 9);
  assert.equal(await page.evaluate(() => window.day), -90);
  const revision = await page.evaluate(() => window.controller.loaded.value.document.revision);
  await page.evaluate(() => window.controller.confirm());
  assert.equal(await page.evaluate(() => window.controller.loaded.value.document.revision), revision);
  await page.evaluate(() => window.reopenEditor());
  await page.waitForFunction(() => window.controller.loaded.value);
  assert.equal(await page.evaluate(() => window.controller.draft.value.level), 2);
  // A pending draft against the same formal revision survives a full remount.
  await page.evaluate(() => {
    const c = window.controller;
    const config = c.exportConfig();
    config.level = 3;
    c.installConfig(config);
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.reopenEditor());
  await page.waitForFunction(() => !window.controller.loading.value);
  assert.equal(await page.evaluate(() => window.controller.draft.value.level), 3);
  assert.equal(await page.evaluate(() => window.controller.loaded.value.document.level), 2);
  await page.evaluate(() => {
    delete window.chatVars.stream_demo.opening_eden_draft;
    window.reopenEditor();
  });
  await page.waitForFunction(() => !window.controller.loading.value);
  assert.equal(await page.evaluate(() => window.controller.draft.value.level), 2);
  // A committed worldbook remains retryable after a later MVU failure.
  const partial = await page.evaluate(async () => {
    const c = window.controller;
    const config = c.exportConfig();
    config.level = 3;
    c.installConfig(config);
    window.failMvu = true;
    let error = '';
    try {
      await c.confirm();
    } catch (e) {
      error = String(e);
    }
    return { error, revision: c.loaded.value.document.revision, start: c.loaded.value.document.rescueStartDay };
  });
  assert.match(partial.error, /模拟MVU同步失败/);
  await page.evaluate(() => window.controller.confirm());
  assert.equal(await page.evaluate(() => window.controller.loaded.value.document.revision), partial.revision);
  assert.equal(await page.evaluate(() => window.controller.loaded.value.document.rescueStartDay), partial.start);
  // Changing the preview date retains the already-started formal rescue clock.
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('起始灾变天数', { exact: true }).fill('10');
  await page.getByRole('button', { name: '完成编辑', exact: true }).click();
  await page.getByRole('button', { name: '生成', exact: true }).click();
  await page.getByRole('heading', { name: '开局配置预览', exact: true }).waitFor();
  assert.match(await page.locator('.preview').innerText(), /首次期限：第 30 天/);
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.evaluate(() => (window.hasStory.value = true));
  assert.match(
    await page.evaluate(async () => {
      try {
        await window.controller.confirm();
        return '';
      } catch (e) {
        return String(e);
      }
    }),
    /已有剧情/,
  );
  // A chat switch while waiting for MVU cannot write into the next chat.
  await page.evaluate(() => {
    window.hasStory.value = false;
    window.waitGlobalInitialized = () =>
      new Promise(resolve => {
        window.releaseMvu = resolve;
      });
    window.pendingConfirm = window.controller.confirm().then(
      () => '',
      e => String(e),
    );
  });
  await page.waitForFunction(() => !!window.releaseMvu);
  const beforeSwitch = await page.evaluate(() => window.mvuWrites);
  await page.evaluate(async () => {
    window.chatId = 'b';
    window.boundBook = null;
    await window.eventEmit('chat-changed');
    window.releaseMvu();
  });
  assert.match(await page.evaluate(() => window.pendingConfirm), /聊天已切换|聊天.*改变|配置.*改变/);
  assert.equal(await page.evaluate(() => window.mvuWrites), beforeSwitch);
  assert.deepEqual(errors, []);
});
