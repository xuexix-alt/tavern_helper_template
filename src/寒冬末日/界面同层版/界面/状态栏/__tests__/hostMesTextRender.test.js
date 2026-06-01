const test = require('node:test');
const assert = require('node:assert/strict');

const { ensureHostMesTextRendered } = require('../hostMesTextRender.ts');

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.style = { cssText: '' };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(String(name));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const out = [];
    const visit = node => {
      if (matchesSelector(node, selector)) {
        out.push(node);
      }
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return out;
  }
}

class FakeDocument {
  constructor() {
    this.chat = new FakeElement('div', this);
    this.chat.setAttribute('id', 'chat');
    this.nodes = [this.chat];
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '#chat') return [this.chat];

    const out = [];
    const visit = node => {
      if (matchesSelector(node, selector)) {
        out.push(node);
      }
      for (const child of node.children) visit(child);
    };
    for (const node of this.nodes) visit(node);
    return out;
  }
}

function matchesSelector(node, selector) {
  if (!node) return false;
  if (selector === '.mes_text') {
    return classList(node).includes('mes_text');
  }
  if (selector === '.mes[mesid="4"] .mes_text') {
    return isMesTextForId(node, '4');
  }
  if (selector === '.mes[mesid="6"] .mes_text') {
    return isMesTextForId(node, '6');
  }
  if (selector === '.mes[mesid="2"] .mes_text') {
    return isMesTextForId(node, '2');
  }
  if (selector === '.mes[mesid="8"] .mes_text') {
    return isMesTextForId(node, '8');
  }
  if (selector === '.mes[mesid="6"][data-ui-injected-mes]') {
    return hasMesId(node, '6') && classList(node).includes('mes') && node.hasAttribute('data-ui-injected-mes');
  }
  if (selector === '.mes[mesid="2"][data-ui-injected-mes]') {
    return hasMesId(node, '2') && classList(node).includes('mes') && node.hasAttribute('data-ui-injected-mes');
  }
  if (selector === '.mes[mesid="4"][data-ui-injected-mes]') {
    return hasMesId(node, '4') && classList(node).includes('mes') && node.hasAttribute('data-ui-injected-mes');
  }
  if (selector === '.mes[mesid="8"][data-ui-injected-mes]') {
    return hasMesId(node, '8') && classList(node).includes('mes') && node.hasAttribute('data-ui-injected-mes');
  }
  if (selector === '.mes[data-ui-injected-mes]') {
    return classList(node).includes('mes') && node.hasAttribute('data-ui-injected-mes');
  }
  return false;
}

function classList(node) {
  return String(node.className || '')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function hasMesId(node, id) {
  return node.getAttribute?.('mesid') === id;
}

function isMesTextForId(node, id) {
  if (!classList(node).includes('mes_text')) return false;
  let current = node.parentNode;
  while (current) {
    if (classList(current).includes('mes') && hasMesId(current, id)) return true;
    current = current.parentNode;
  }
  return false;
}

function appendExistingMesText(doc, messageId, text) {
  const mes = doc.createElement('div');
  mes.className = 'mes';
  mes.setAttribute('mesid', String(messageId));
  const mesBlock = doc.createElement('div');
  mesBlock.className = 'mes_block';
  const mesText = doc.createElement('div');
  mesText.className = 'mes_text';
  mesText.textContent = text;
  mesBlock.appendChild(mesText);
  mes.appendChild(mesBlock);
  doc.chat.appendChild(mes);
  return mesText;
}

test('ensureHostMesTextRendered skips injection when host mes_text already has enough content', async () => {
  const currentDocument = new FakeDocument();
  const hostDocument = new FakeDocument();
  appendExistingMesText(hostDocument, 4, 'x'.repeat(180));
  let setCalls = 0;

  const rendered = await ensureHostMesTextRendered(4, {
    currentDocument,
    collectHostDocuments() {
      return [currentDocument, hostDocument];
    },
    readChatMessageDetail() {
      return { message: 'y'.repeat(240) };
    },
    async setChatMessages() {
      setCalls += 1;
    },
  });

  assert.equal(rendered, true);
  assert.equal(setCalls, 0);
  assert.equal(hostDocument.querySelectorAll('.mes[data-ui-injected-mes]').length, 0);
});

test('ensureHostMesTextRendered injects an offscreen mes node when host mes_text is missing', async () => {
  const currentDocument = new FakeDocument();
  const hostDocument = new FakeDocument();
  let setCalls = 0;

  const rendered = await ensureHostMesTextRendered(
    6,
    {
      currentDocument,
      collectHostDocuments() {
        return [currentDocument, hostDocument];
      },
      readChatMessageDetail() {
        return { message: 'z'.repeat(320) };
      },
      async setChatMessages() {
        setCalls += 1;
      },
    },
    { delayMs: 0 },
  );

  assert.equal(rendered, true);
  assert.equal(setCalls, 0);

  const injectedMes = hostDocument.querySelector('.mes[mesid="6"][data-ui-injected-mes]');
  const injectedText = hostDocument.querySelector('.mes[mesid="6"] .mes_text');
  assert.ok(injectedMes);
  assert.ok(injectedText);
  assert.equal(injectedMes.getAttribute('data-message-index'), '6');
  assert.equal(injectedText.getAttribute('data-message-index'), '6');
  assert.equal(injectedText.textContent, 'z'.repeat(320));
});

test('ensureHostMesTextRendered preserves older injected nodes while injecting the current message', async () => {
  const currentDocument = new FakeDocument();
  const hostDocument = new FakeDocument();

  const staleMes = hostDocument.createElement('div');
  staleMes.className = 'mes';
  staleMes.setAttribute('mesid', '2');
  staleMes.setAttribute('data-ui-injected-mes', 'true');
  const staleBlock = hostDocument.createElement('div');
  staleBlock.className = 'mes_block';
  const staleText = hostDocument.createElement('div');
  staleText.className = 'mes_text';
  staleText.textContent = 'stale text';
  staleBlock.appendChild(staleText);
  staleMes.appendChild(staleBlock);
  hostDocument.chat.appendChild(staleMes);

  const rendered = await ensureHostMesTextRendered(
    4,
    {
      currentDocument,
      collectHostDocuments() {
        return [currentDocument, hostDocument];
      },
      readChatMessageDetail() {
        return { message: 'fresh message'.repeat(20) };
      },
    },
    { delayMs: 0 },
  );

  assert.equal(rendered, true);
  assert.ok(hostDocument.querySelector('.mes[mesid="2"][data-ui-injected-mes]'));
  assert.ok(hostDocument.querySelector('.mes[mesid="4"][data-ui-injected-mes]'));
  assert.equal(hostDocument.querySelectorAll('.mes[data-ui-injected-mes]').length, 2);
});

test('ensureHostMesTextRendered still injects shorter real messages when host mes_text is absent', async () => {
  const currentDocument = new FakeDocument();
  const hostDocument = new FakeDocument();

  const rendered = await ensureHostMesTextRendered(
    2,
    {
      currentDocument,
      collectHostDocuments() {
        return [currentDocument, hostDocument];
      },
      readChatMessageDetail() {
        return { message: 'short but real body' };
      },
    },
    { delayMs: 0 },
  );

  assert.equal(rendered, true);
  const injectedText = hostDocument.querySelector('.mes[mesid="2"] .mes_text');
  assert.ok(injectedText);
  assert.equal(injectedText.textContent, 'short but real body');
});

test('ensureHostMesTextRendered falls back to the current document in same-layer mode', async () => {
  const currentDocument = new FakeDocument();

  const rendered = await ensureHostMesTextRendered(
    8,
    {
      currentDocument,
      collectHostDocuments() {
        return [currentDocument];
      },
      readChatMessageDetail() {
        return { message: 'same-layer host text'.repeat(12) };
      },
    },
    { delayMs: 0 },
  );

  assert.equal(rendered, true);
  const injectedText = currentDocument.querySelector('.mes_text');
  assert.ok(injectedText);
  assert.match(String(injectedText.textContent), /same-layer host text/);
});
