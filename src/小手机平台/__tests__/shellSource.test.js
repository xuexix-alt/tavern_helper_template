/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

const shellPath = 'src/小手机平台/shell/phoneShell.ts';
const appsPath = 'src/小手机平台/apps/phoneApps.ts';
const cssPath = 'src/小手机平台/shell/phoneShell.css';

function loadTypeScriptModule(path) {
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  Function('module', 'exports', 'require', output)(module, module.exports, require);
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

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
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
  const rendered = await messages.render({ document: fakeDocument, listen, announce() {} });

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
  const rendered = await messages.render({ document: fakeDocument, listen, announce() {} });
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

test('settings form saves structured public settings without a secret field', async () => {
  const { createPhoneApps } = loadTypeScriptModule(appsPath);
  const saved = [];
  const services = {
    listConversations: () => [],
    listContacts: () => [],
    listBroadcasts: () => [],
    listTasks: () => [],
    getSettings: () => ({
      provider: 'tavern',
      apiUrl: 'https://api.example.com',
      model: 'model-a',
      parameters: '{"temperature":0.7}',
      theme: 'system',
      notifications: true,
    }),
    getDiagnostics: () => ({}),
    openConversation: async () => {},
    retryFailedMessage: async () => {},
    saveSettings: async next => saved.push(next),
    submitActionToHost: async () => {},
  };
  const settings = createPhoneApps(services).find(app => app.route === 'settings');
  const rendered = await settings.render({ document: fakeDocument, listen, announce() {} });
  const form = findByClass(rendered, 'phone-settings');
  const fields = Object.fromEntries(
    form.children.slice(0, 6).map(label => [label.children[0].textContent, label.children[1]]),
  );
  fields.Provider.value = 'openai-compatible';
  fields['API URL'].value = 'https://new.example.com/v1';
  fields['模型'].value = 'model-b';
  fields['生成参数'].value = '{"temperature":0.4}';
  fields['主题'].value = 'dark';
  fields['通知'].checked = false;
  findByClass(form, 'phone-settings__save').click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(saved, [
    {
      provider: 'openai-compatible',
      apiUrl: 'https://new.example.com/v1',
      model: 'model-b',
      parameters: '{"temperature":0.4}',
      theme: 'dark',
      notifications: false,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(collectText(rendered)), /api.?key|secret/i);
});
