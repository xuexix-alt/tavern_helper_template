/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, extname, resolve } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const shellPath = 'src/小手机平台/shell/phoneShell.ts';
const appsPath = 'src/小手机平台/apps/phoneApps.ts';
const cssPath = 'src/小手机平台/shell/phoneShell.css';
const wechatIconPath = 'src/小手机平台/assets/wechatIcon.ts';

function loadTypeScriptModule(path, cache = new Map()) {
  const absolutePath = resolve(path);
  const cached = cache.get(absolutePath);
  if (cached) return cached.exports;
  const source = readFileSync(absolutePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(absolutePath, module);
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier);
    const unresolved = resolve(dirname(absolutePath), specifier);
    const candidates = extname(unresolved)
      ? [unresolved]
      : [`${unresolved}.ts`, `${unresolved}.js`, resolve(unresolved, 'index.ts'), resolve(unresolved, 'index.js')];
    const dependency = candidates.find(existsSync);
    if (!dependency) throw new Error(`Cannot resolve ${specifier} from ${absolutePath}`);
    return dependency.endsWith('.ts') ? loadTypeScriptModule(dependency, cache) : require(dependency);
  };
  Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
  return module.exports;
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.textContent = '';
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name, listener) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter(candidate => candidate !== listener),
    );
  }

  click() {
    const event = {
      target: this,
      preventDefault() {},
      stopPropagation() {},
    };
    for (const listener of this.listeners.get('click') ?? []) listener(event);
  }
}

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(tagName);
  },
};

function collectText(node) {
  return [node.textContent, ...node.children.flatMap(collectText)];
}

function findByClass(node, className) {
  if (
    String(node.className ?? '')
      .split(/\s+/)
      .includes(className)
  )
    return node;
  for (const child of node.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return undefined;
}

function findByText(node, value) {
  if (node.textContent === value) return node;
  for (const child of node.children) {
    const found = findByText(child, value);
    if (found) return found;
  }
  return undefined;
}

function findAllByTag(node, tagName) {
  return [...(node.tagName === tagName ? [node] : []), ...node.children.flatMap(child => findAllByTag(child, tagName))];
}

function listen(target, event, listener) {
  target.addEventListener(event, listener);
}

test('shell renders untrusted business values as text only', () => {
  const source = readFileSync(shellPath, 'utf8');
  const apps = readFileSync(appsPath, 'utf8');
  const combined = `${source}\n${apps}`;

  assert.match(combined, /textContent\s*=/);
  assert.doesNotMatch(combined, /v-html|srcdoc/i);
  assert.doesNotMatch(combined, /\.innerHTML\s*=/);
  assert.doesNotMatch(combined, /insertAdjacentHTML|document\.write/i);
  assert.doesNotMatch(combined, /marked\(|showdown|markdown/i);
});

test('shell owns one top-document root and restores focus on Escape', () => {
  const source = readFileSync(shellPath, 'utf8');

  assert.match(source, /attachShadow\(/);
  assert.match(source, /event\.key\s*===\s*['"]Escape['"]/);
  assert.match(source, /returnFocus\.focus\(\)/);
  assert.match(source, /root\.remove\(\)/);
  assert.match(source, /disposers/);
});

test('shell accepts host-specific product and status branding', () => {
  const source = readFileSync(shellPath, 'utf8');
  const adapter = readFileSync('src/寒冬末日/脚本/小手机-90寒冬适配器/index.ts', 'utf8');

  assert.match(source, /productName\?:\s*string/);
  assert.match(source, /statusName\?:\s*string/);
  assert.match(source, /options\.productName\s*\?\?\s*['"]小手机['"]/);
  assert.match(source, /options\.statusName\s*\?\?\s*['"]星穹通信['"]/);
  assert.match(adapter, /productName:\s*['"]伊甸终端['"]/);
});

test('user close actions delegate to the runtime close callback', () => {
  const source = readFileSync(shellPath, 'utf8');

  assert.match(source, /onRequestClose\?:\s*\(\)\s*=>\s*void/);
  assert.match(source, /private\s+requestClose\(\)/);
  assert.match(source, /this\.onRequestClose\?\.\(\)/);
  assert.match(source, /closeButton,\s*['"]click['"],\s*\(\)\s*=>\s*this\.requestClose\(\)/);
  assert.match(source, /event\.target\s*===\s*overlay\)\s*this\.requestClose\(\)/);
  assert.match(source, /event\.key\s*===\s*['"]Escape['"][\s\S]*?this\.requestClose\(\)/);
});

test('Apple system styles include accessible themes and preferences', () => {
  const css = readFileSync(cssPath, 'utf8');

  assert.match(css, /system-ui/);
  assert.match(css, /--phone-blue:\s*#007aff/i);
  assert.match(css, /--phone-red:\s*#ff3b30/i);
  assert.match(css, /min-height:\s*44px/i);
  assert.match(css, /prefers-color-scheme:\s*dark/i);
  assert.match(css, /prefers-reduced-motion:\s*reduce/i);
  assert.match(css, /prefers-reduced-transparency:\s*reduce/i);
  assert.match(css, /prefers-contrast:\s*more/i);
  assert.match(css, /safe-area-inset/i);
  assert.match(css, /overflow-x:\s*hidden/i);
  assert.match(css, /:host\s*\{[\s\S]*?position:\s*fixed[\s\S]*?height:\s*100dvh/i);
  assert.match(css, /:host\s*\{[\s\S]*?z-index:\s*2147483647/i);
  assert.match(css, /\.phone-overlay\s*\{[\s\S]*?position:\s*absolute/i);
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?padding:\s*max\(8px,/i);
  assert.match(css, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.phone-shell\s*\{[\s\S]*?border-radius:\s*28px/i);
});

test('home WeChat entry uses the supplied PNG while other apps keep their glyphs', () => {
  const apps = readFileSync(appsPath, 'utf8');
  const css = readFileSync(cssPath, 'utf8');
  const { WECHAT_APP_ICON_SRC } = loadTypeScriptModule(wechatIconPath);
  const { createPhoneAppIcon } = loadTypeScriptModule(shellPath);
  const imageBytes = Buffer.from(WECHAT_APP_ICON_SRC.replace(/^data:image\/png;base64,/, ''), 'base64');

  assert.match(WECHAT_APP_ICON_SRC, /^data:image\/png;base64,/);
  assert.equal(
    createHash('sha256').update(imageBytes).digest('hex').toUpperCase(),
    '231218A7264273DC445FB158DD92BC5D34BEE32EF017827F666027E9CB01AD21',
  );
  assert.match(apps, /route:\s*['"]messages['"][\s\S]*?title:\s*['"]微信['"][\s\S]*?iconSrc:\s*WECHAT_APP_ICON_SRC/);
  assert.match(apps, /iconSrc\?:\s*string/);

  const imageContainer = createPhoneAppIcon(fakeDocument, {
    route: 'messages',
    title: '微信',
    glyph: '●',
    iconSrc: WECHAT_APP_ICON_SRC,
  });
  assert.equal(imageContainer.textContent, '');
  assert.equal(imageContainer.children.length, 1);
  assert.equal(imageContainer.children[0].tagName, 'img');
  assert.equal(imageContainer.children[0].src, WECHAT_APP_ICON_SRC);
  assert.equal(imageContainer.children[0].attributes.alt, '');
  assert.equal(imageContainer.children[0].attributes['aria-hidden'], 'true');

  const glyphContainer = createPhoneAppIcon(fakeDocument, {
    route: 'contacts',
    title: '通讯录',
    glyph: '人',
  });
  assert.equal(glyphContainer.textContent, '人');
  assert.equal(glyphContainer.children.length, 0);
  assert.match(css, /\.phone-app__icon\s*\{[\s\S]*?object-fit:\s*cover/i);
});

test('profile radio stays isolated from ChatLore and worldbook writers', () => {
  const source = readFileSync('src/小手机平台/profiles/profileBroadcast.ts', 'utf8');

  assert.doesNotMatch(source, /writeChatLoreEntry|createWorldbookEntries|updateWorldbookWith/);
  assert.match(source, /broadcastIssues/);
});

test('task actions stay structured and never generate or write MVU', () => {
  const apps = readFileSync(appsPath, 'utf8');

  assert.match(apps, /kind:\s*['"]composer\.insert['"]/);
  assert.match(apps, /submitActionToHost/);
  assert.doesNotMatch(apps, /generateRaw|generate\(|setMvu|replaceMvu|updateMvu/i);

  const { createTaskHostAction } = loadTypeScriptModule(appsPath);
  assert.deepEqual(
    createTaskHostAction({
      id: 'heat',
      title: '供暖',
      detail: '检查',
      sourceKey: 'task:heat',
      actionText: '检查供暖',
      actionMode: 'append',
    }),
    { kind: 'composer.insert', text: '检查供暖', sourceKey: 'task:heat', mode: 'append' },
  );
  assert.throws(
    () => createTaskHostAction({ id: 'x', title: 'x', detail: 'x', sourceKey: 'task:x', actionText: '   ' }),
    /不能为空/,
  );
});

test('contacts distinguish saved contacts from addable characters and manage Eden group membership', () => {
  const apps = readFileSync(appsPath, 'utf8');

  assert.match(apps, /addContact\(item\.id\)/);
  assert.match(apps, /setContactGroupMembership\(item\.id,\s*!item\.inEdenGroup\)/);
  assert.match(apps, /联系人/);
  assert.match(apps, /可添加人物/);
  assert.match(apps, /邀请入群/);
  assert.match(apps, /移出群聊/);
});

test('malicious message text remains an inert text value at runtime', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const apps = createPhoneApps({
    listConversations: () => [{ id: 'x', kind: 'private', title: attack, preview: attack, unread: 0 }],
    listContacts: () => [],
    listBroadcasts: () => [],
    listTasks: () => [],
    getSettings: () => ({}),
    getDiagnostics: () => ({}),
    submitActionToHost: async () => {},
  });
  const messages = apps.find(app => app.route === 'messages');
  const rendered = await messages.render(testContext());

  assert.equal(rendered.children.length, 1);
  assert.deepEqual(
    collectText(rendered).filter(value => value === attack),
    [attack, attack],
  );
  assert.equal(rendered.children[0].tagName, 'li');
});

test('route history keeps the current app across a close/open boundary', () => {
  const { PhoneRouteHistory } = loadTypeScriptModule(shellPath);
  const history = new PhoneRouteHistory();
  history.push('messages');
  history.push('tasks');

  // Closing the shell does not mutate route history; reopening therefore restores tasks.
  assert.equal(history.current(), 'tasks');
  assert.equal(history.back(), 'messages');
  assert.equal(history.back(), 'home');
  assert.equal(history.back(), 'home');
});

test('private and Eden group rows open while failed messages can retry', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const opened = [];
  const retried = [];
  const services = {
    listConversations: () => [
      { id: 'private:a', kind: 'private', title: '纪宁', preview: '你好', unread: 0, status: 'sent' },
      { id: 'eden', kind: 'eden-group', title: '伊甸住户群', preview: '失败', unread: 1, status: 'failed' },
    ],
    listContacts: () => [],
    listBroadcasts: () => [],
    listTasks: () => [],
    getSettings: () => ({}),
    getDiagnostics: () => ({}),
    openConversation: async id => opened.push(id),
    retryFailedMessage: async id => retried.push(id),
    saveSettings: async () => {},
    submitActionToHost: async () => {},
  };
  const messages = createPhoneApps(services).find(app => app.route === 'messages');
  const rendered = await messages.render(testContext());
  const privateButton = findByClass(rendered.children[0], 'phone-conversation');
  const groupButton = findByClass(rendered.children[1], 'phone-conversation');
  const retryButton = findByClass(rendered.children[1], 'phone-retry');

  privateButton.click();
  groupButton.click();
  retryButton.click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(opened, ['private:a', 'eden']);
  assert.deepEqual(retried, ['eden']);
  assert.match(groupButton.attributes['aria-label'], /伊甸住户群/);
});

test('settings saves a separate local secret and fetches selectable OpenAI-compatible models', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const saved = [];
  const fetched = [];
  let cleared = 0;
  const services = completeServices({
    getSettings: () => ({
      provider: 'tavern',
      apiUrl: 'https://api.example.com',
      model: 'model-a',
      parameters: '{"temperature":0.7}',
      theme: 'system',
      notifications: true,
      hasApiKey: true,
    }),
    fetchModels: async (apiUrl, apiKey) => {
      fetched.push({ apiUrl, apiKey });
      return ['model-c', 'model-d'];
    },
    clearApiKey: async () => {
      cleared += 1;
    },
    saveSettings: async (next, apiKey) => saved.push({ next, apiKey }),
  });
  const settings = createPhoneApps(services).find(app => app.route === 'settings');
  const rendered = await settings.render(testContext());
  const form = findByClass(rendered, 'phone-settings');
  const fields = Object.fromEntries(
    form.children
      .filter(label => label.children?.length === 2)
      .map(label => [label.children[0].textContent, label.children[1]]),
  );
  assert.equal(fields['API Key'].type, 'password');
  assert.match(findByClass(form, 'phone-settings__status').textContent, /已保存/);
  fields.Provider.value = 'openai-compatible';
  fields['API URL'].value = 'https://new.example.com/v1';
  fields['模型'].value = 'model-b';
  fields['生成参数'].value = '{"temperature":0.4}';
  fields['主题'].value = 'dark';
  fields['通知'].checked = false;
  fields['API Key'].value = 'new-local-secret';

  findByClass(form, 'phone-settings__fetch-models').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetched, [{ apiUrl: 'https://new.example.com/v1', apiKey: 'new-local-secret' }]);
  const modelChoices = findByClass(form, 'phone-settings__models');
  assert.deepEqual(
    modelChoices.children.map(option => option.value),
    ['model-c', 'model-d'],
  );
  modelChoices.value = 'model-d';
  for (const listener of modelChoices.listeners.get('change') ?? []) listener({ target: modelChoices });
  assert.equal(fields['模型'].value, 'model-d');

  findByClass(form, 'phone-settings__save').click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(saved, [
    {
      next: {
        provider: 'openai-compatible',
        apiUrl: 'https://new.example.com/v1',
        model: 'model-d',
        parameters: '{"temperature":0.4}',
        theme: 'dark',
        notifications: false,
        hasApiKey: true,
      },
      apiKey: 'new-local-secret',
    },
  ]);
  assert.equal(fields['API Key'].value, '', '保存成功后不得在界面保留明文 Key');

  findByClass(form, 'phone-settings__clear-key').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cleared, 1);
  assert.match(findByClass(form, 'phone-settings__status').textContent, /已清除/);
});

test('message detail sends, retries and cancels by message id', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const calls = [];
  let requestCount = 0;
  const services = completeServices({
    listConversations: () => [{ id: 'eden', kind: 'eden-group', title: '伊甸住户群', preview: '消息', unread: 0 }],
    listMessages: () => [
      { id: 'failed-1', sender: '纪宁', content: '<script>x</script>', direction: 'incoming', status: 'failed' },
      { id: 'pending-1', sender: '我', content: '等待', direction: 'outgoing', status: 'pending' },
    ],
    openConversation: async id => calls.push(['open', id]),
    sendMessage: async (id, value) => calls.push(['send', id, value]),
    retryMessage: async (id, messageId) => calls.push(['retry', id, messageId]),
    cancelMessage: async (id, messageId) => calls.push(['cancel', id, messageId]),
  });
  const apps = createPhoneApps(services);
  const messages = apps.find(app => app.route === 'messages');
  const context = {
    document: fakeDocument,
    listen,
    announce() {},
    requestRender() {
      requestCount += 1;
    },
    navigate() {},
    isActive: () => true,
  };
  const listView = await messages.render(context);
  findByClass(listView, 'phone-conversation').click();
  await new Promise(resolve => setImmediate(resolve));
  const detail = await messages.render(context);
  const composer = findByClass(detail, 'phone-composer__input');
  composer.value = '  保持供暖  ';
  findByClass(detail, 'phone-composer__send').click();
  findByClass(detail, 'phone-message__retry').click();
  findByClass(detail, 'phone-message__cancel').click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls, [
    ['open', 'eden'],
    ['send', 'eden', '保持供暖'],
    ['retry', 'eden', 'failed-1'],
    ['cancel', 'eden', 'pending-1'],
  ]);
  assert.ok(requestCount >= 4);
  assert.ok(collectText(detail).includes('<script>x</script>'));
});

test('open message detail redraws when the adapter reports an AI reply and releases the subscription', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  let conversationListener;
  let released = 0;
  let rerenders = 0;
  let disposeView;
  const services = completeServices({
    listConversations: () => [
      { id: 'private:a', kind: 'private', title: '纪宁', preview: '你好', unread: 0, status: 'sent' },
    ],
    openConversation: async () => {},
    watchConversation(conversationId, listener) {
      assert.equal(conversationId, 'private:a');
      conversationListener = listener;
      return () => {
        released += 1;
      };
    },
  });
  const messages = createPhoneApps(services).find(app => app.route === 'messages');
  const context = testContext({
    requestRender: () => {
      rerenders += 1;
    },
    onDispose: disposer => {
      disposeView = disposer;
    },
  });
  const listView = await messages.render(context);
  findByClass(listView, 'phone-conversation').click();
  await new Promise(resolve => setImmediate(resolve));
  await messages.render(context);

  assert.equal(typeof conversationListener, 'function');
  conversationListener();
  assert.equal(rerenders, 2, '打开详情一次，AI 回复通知再重绘一次');
  disposeView();
  assert.equal(released, 1);
});

test('messages and contacts expose one WeChat visual language', () => {
  const apps = readFileSync(appsPath, 'utf8');
  const css = readFileSync(cssPath, 'utf8');
  for (const className of [
    'phone-conversation__avatar',
    'phone-conversation__meta',
    'phone-message__avatar',
    'phone-message__bubble',
    'phone-message--incoming',
    'phone-message--outgoing',
    'phone-contact__avatar',
  ]) {
    assert.match(apps, new RegExp(className));
    assert.match(css, new RegExp(`\\.${className}`));
  }
  assert.match(css, /--wechat-green:\s*#07c160/i);
  assert.match(css, /phone-message--outgoing[\s\S]*?#95ec69/i);
});

test('contact creates a private conversation and navigates to messages', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const navigated = [];
  const services = completeServices({
    listContacts: () => [
      {
        id: 'role:a',
        name: '纪宁',
        detail: '公民',
        online: true,
        canSend: true,
        added: true,
        inEdenGroup: false,
      },
    ],
    openOrCreateConversation: async () => 'private:a',
  });
  const contacts = createPhoneApps(services).find(app => app.route === 'contacts');
  const rendered = await contacts.render({
    document: fakeDocument,
    listen,
    announce() {},
    requestRender() {},
    navigate: route => navigated.push(route),
    isActive: () => true,
  });
  findByClass(rendered, 'phone-contact').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(navigated, ['messages']);
});

test('view scopes release stale listeners and reject late registration', () => {
  const { PhoneViewScope } = loadTypeScriptModule(shellPath);
  const target = new FakeElement('button');
  const scope = new PhoneViewScope();
  const listener = () => {};
  scope.listen(target, 'click', listener);
  assert.equal(target.listeners.get('click').length, 1);
  scope.dispose();
  assert.equal(target.listeners.get('click').length, 0);
  scope.listen(target, 'click', listener);
  assert.equal(target.listeners.get('click').length, 0);
});

test('focus guard and focus trap prevent late focus theft', () => {
  const source = readFileSync(shellPath, 'utf8');
  const { PhoneOpenFocusGuard, getFocusTrapTarget } = loadTypeScriptModule(shellPath);
  const guard = new PhoneOpenFocusGuard();
  const token = guard.begin();
  assert.equal(guard.isCurrent(token), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(token), false);
  const first = { id: 'first' };
  const last = { id: 'last' };
  assert.equal(getFocusTrapTarget([first, last], last, false), first);
  assert.equal(getFocusTrapTarget([first, last], first, true), last);
  assert.match(source, /this\.panel\.focus\(\);\s*await this\.render\(\)/s);
  assert.match(source, /this\.opened[^\n]+isCurrent/);
});

test('diagnostics redact JSON headers and URL credentials only', () => {
  const { redactDiagnostic } = loadTypeScriptModule(appsPath);
  const input =
    'request failed {"Authorization":"Bearer top-secret","x-api-key":"sk-abcdefgh"} https://x.test/v1?token=abc&mode=fast api-key=plain-secret';
  const output = redactDiagnostic(input);
  assert.doesNotMatch(output, /top-secret|sk-abcdefgh|token=abc|plain-secret/);
  assert.match(output, /mode=fast/);
  assert.equal(redactDiagnostic('ordinary timeout in model alpha'), 'ordinary timeout in model alpha');
});

test('diagnostics exposes an explicit retry for captured ChatLore failures', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  let retries = 0;
  const services = completeServices({
    getDiagnostics: () => ({
      runtimeState: 'READY',
      snapshotVersion: 'snapshot-a',
      pendingLoreCount: 2,
      pendingLoreRetryCount: 1,
      moduleStates: [],
      recentErrors: ['ChatLore 写入失败'],
    }),
    retryPendingLore: async () => {
      retries += 1;
    },
  });
  const diagnostics = createPhoneApps(services).find(app => app.route === 'diagnostics');
  const rendered = await diagnostics.render(testContext());
  findByClass(rendered, 'phone-lore-retry').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retries, 1);
});

test('dynamic profile app exposes settings, progress, batch actions and complete fields', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const calls = [];
  const services = completeServices({
    listProfiles: () => [
      {
        id: 'main:纪宁',
        name: '纪宁',
        basicInfo: '医生',
        personalityBaseline: '冷静谨慎',
        behaviorTuning: '行动前先确认风险',
        personalityTuning: '近期更直接',
        speechStyleTuning: '任务沟通使用短句',
        currentGoals: '补足药品库存',
        currentStatus: '诊疗室值守',
        relationship: '协作',
        storyInteractionSummary: '正文中完成交接',
        chatInteractionSummary: '微信确认药品不足',
        playerActionAdvice: '确认药品库存',
        lastWechatRound: ['纪宁：药品不多了'],
        sourceRange: '正文 1-20；微信新增 1 条',
        refreshStatus: 'success',
        lastUpdated: 1_000,
      },
    ],
    getProfileSettings: () => ({
      storyProgress: 7,
      autoRefreshEvery: 20,
      promptProfileMaxChars: 2000,
    }),
    saveProfileSettings: async value => calls.push(['save', value]),
    refreshProfile: async id => calls.push(['person', id]),
    refreshAllProfiles: async () => calls.push(['all']),
    retryFailedProfiles: async () => calls.push(['retry']),
  });
  const apps = createPhoneApps(services);
  const profiles = apps.find(app => app.route === 'profiles');
  const rendered = await profiles.render(testContext());

  assert.equal(findByClass(rendered, 'phone-profile-progress').textContent.includes('正文进度 7 / 20'), true);
  const threshold = findByClass(rendered, 'phone-profile-settings__threshold');
  const budget = findByClass(rendered, 'phone-profile-settings__budget');
  assert.equal(threshold.min, '1');
  assert.equal(threshold.max, '50');
  assert.equal(threshold.value, '20');
  assert.equal(budget.value, '2000');

  findByClass(rendered, 'phone-profile-refresh-all').click();
  findByClass(rendered, 'phone-profile-retry').click();
  findByClass(rendered, 'phone-profile-refresh').click();
  threshold.value = '25';
  budget.value = '2400';
  findByClass(rendered, 'phone-profile-settings__save').click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls, [
    ['all'],
    ['retry'],
    ['person', 'main:纪宁'],
    ['save', { storyProgress: 7, autoRefreshEvery: 25, promptProfileMaxChars: 2400 }],
  ]);
  findByClass(rendered, 'phone-profile-row').click();
  const detail = await apps.find(app => app.route === 'profile-detail').render(testContext());
  findByText(detail, '档案').click();
  const textValues = collectText(detail).join('\n');
  for (const label of [
    '基本信息',
    '固定本色（世界书）',
    '行为模式',
    '性格微调',
    '说话方式',
    '当前目标',
    '当前处境',
    '关系解释',
    '正文互动',
    '微信互动',
    '玩家行动建议',
  ]) {
    assert.match(textValues, new RegExp(label));
  }
  assert.equal(findAllByTag(detail, 'textarea').length, 10);
});

test('broadcast app renders profile radio history and can regenerate without replacing notices', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  let regenerations = 0;
  const services = completeServices({
    listBroadcasts: () => [
      { id: 'notice', source: '伊甸网络', content: '网络受限', trust: 'confirmed', kind: 'deterministic' },
      {
        id: 'radio',
        source: '伊甸末日广播',
        content: '本期三栏广播',
        trust: 'unverified',
        kind: 'profile-radio',
        generatedAt: 1_000,
        sections: [
          { title: '秩序与局势', body: '北门关闭。' },
          { title: '生存与资源', body: '暂无重大变化。' },
          { title: '人物与社会', body: '诊疗室恢复值守。' },
        ],
      },
    ],
    regenerateProfileRadio: async () => {
      regenerations += 1;
    },
  });
  const broadcasts = createPhoneApps(services).find(app => app.route === 'broadcasts');
  const rendered = await broadcasts.render(testContext());
  const textValues = collectText(rendered).join('\n');
  assert.match(textValues, /伊甸网络/);
  assert.match(textValues, /秩序与局势/);
  assert.match(textValues, /生存与资源/);
  assert.match(textValues, /人物与社会/);
  findByClass(rendered, 'phone-broadcast-regenerate').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(regenerations, 1);
});

function completeServices(overrides = {}) {
  return {
    listConversations: () => [],
    listMessages: () => [],
    listContacts: () => [],
    listBroadcasts: () => [],
    listTasks: () => [],
    getSettings: () => ({
      provider: 'tavern',
      apiUrl: '',
      model: '',
      parameters: '',
      theme: 'system',
      notifications: false,
      hasApiKey: false,
    }),
    getDiagnostics: () => ({
      runtimeState: '',
      snapshotVersion: '',
      pendingLoreCount: 0,
      pendingLoreRetryCount: 0,
      moduleStates: [],
      recentErrors: [],
    }),
    openConversation: async () => {},
    openOrCreateConversation: async () => '',
    addContact: async () => {},
    setContactGroupMembership: async () => {},
    retryFailedMessage: async () => {},
    sendMessage: async () => {},
    retryMessage: async () => {},
    cancelMessage: async () => {},
    retryPendingLore: async () => {},
    watchConversation: () => () => {},
    saveSettings: async () => {},
    fetchModels: async () => [],
    clearApiKey: async () => {},
    submitActionToHost: async () => {},
    ...overrides,
  };
}

function testContext(overrides = {}) {
  return {
    document: fakeDocument,
    listen,
    announce() {},
    requestRender() {},
    navigate() {},
    onDispose() {},
    isActive: () => true,
    ...overrides,
  };
}
