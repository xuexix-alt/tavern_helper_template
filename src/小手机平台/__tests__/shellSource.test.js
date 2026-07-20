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
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
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
    listConversations: () => [{ id: 'x', title: attack, preview: attack, unread: 0 }],
    listContacts: () => [],
    listBroadcasts: () => [],
    listTasks: () => [],
    getSettings: () => ({}),
    getDiagnostics: () => ({}),
    submitActionToHost: async () => {},
  });
  const messages = apps.find(app => app.route === 'messages');
  const rendered = await messages.render({ document: fakeDocument });

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
