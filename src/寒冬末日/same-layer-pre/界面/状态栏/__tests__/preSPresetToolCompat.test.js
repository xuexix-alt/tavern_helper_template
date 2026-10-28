const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { adaptSPresetResponse, resolvePreGenerationText } = require('../preSPresetToolCompat.ts');

// Extract processing declarations only, never the plugin startup, DOM or fetch hooks.
function loadRuntime(path) {
  const source = fs.readFileSync(path, 'utf8');
  const ast = ts.createSourceFile('spreset.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = new Map();
  for (const s of ast.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) declarations.set(s.name.text, s);
    if (ts.isVariableStatement(s))
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) declarations.set(d.name.text, s);
  }
  const selected = new Set();
  function include(name) {
    if (name === 'ctx') return;
    const node = declarations.get(name);
    if (!node || selected.has(node)) return;
    selected.add(node);
    function walk(child) {
      if (ts.isIdentifier(child) && child.text !== name) include(child.text);
      ts.forEachChild(child, walk);
    }
    walk(node);
  }
  ['createSPresetOutputPreprocessingSession', 'formatSPresetToolCalls', 'consumeSPresetToolCallsFromResponse'].forEach(
    include,
  );
  const sandbox = {
    structuredClone,
    console: { log() {}, error() {}, warn() {} },
    ctx: { chatCompletionSettings: { chat_completion_source: 'custom', custom_model: 'replay' } },
  };
  vm.createContext(sandbox);
  vm.runInContext([...selected].map(n => n.getText(ast)).join('\n'), sandbox, { timeout: 1000 });
  return {
    createSession: sandbox.createSPresetOutputPreprocessingSession,
    formatCalls: sandbox.formatSPresetToolCalls,
    consumeResponse: sandbox.consumeSPresetToolCallsFromResponse,
  };
}
const canReplay =
  process.env.PRE_SPRESET_SOURCE && process.env.PRE_TOOL_REPLAY_PRESET && process.env.PRE_TOOL_REPLAY_OUTPUT;
const runtime = canReplay ? loadRuntime(process.env.PRE_SPRESET_SOURCE) : null;
const settings = canReplay
  ? JSON.parse(fs.readFileSync(process.env.PRE_TOOL_REPLAY_PRESET, 'utf8')).extensions.SPreset.OutputPreprocessing
  : null;
const argumentsText = canReplay ? fs.readFileSync(process.env.PRE_TOOL_REPLAY_OUTPUT, 'utf8') : null;
const expected = canReplay ? JSON.parse(argumentsText).content : null;
function jsonResponse(args = argumentsText) {
  return {
    id: 'replay',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'any_preset_tool', arguments: args } }],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { total_tokens: 10 },
  };
}
function sseResponse(args = argumentsText) {
  const packets = [];
  for (let offset = 0; offset < args.length; offset += 31)
    packets.push({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                ...(offset === 0 ? { id: 'call-1', type: 'function' } : {}),
                function: {
                  ...(offset === 0 ? { name: 'any_preset_tool' } : {}),
                  arguments: args.slice(offset, offset + 31),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    });
  packets.push(
    { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    { choices: [], usage: { total_tokens: 10 } },
  );
  const text = packets.map(p => 'data: ' + JSON.stringify(p) + '\r\n\r\n').join('') + 'data: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 17) c.enqueue(bytes.slice(i, i + 17));
        c.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
function readEvents(text) {
  return text
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map(s => s.slice(6))
    .filter(s => s !== '[DONE]')
    .map(JSON.parse);
}
test('real tool arguments through real SPreset non-stream processing', { skip: !canReplay }, async () => {
  const result = await adaptSPresetResponse(
    new Response(JSON.stringify(jsonResponse()), { headers: { 'content-type': 'application/json' } }),
    { runtime, settings, stream: false },
  );
  const data = await result.json();
  assert.equal(data.choices[0].message.content, expected);
  assert.equal(data.choices[0].message.tool_calls, undefined);
  assert.equal(data.choices[0].finish_reason, 'stop');
  assert.equal(data.usage.total_tokens, 10);
});
test('real tool argument fragments with split UTF-8 and SSE framing', { skip: !canReplay }, async () => {
  const result = await adaptSPresetResponse(sseResponse(), { runtime, settings, stream: true });
  const events = readEvents(await result.text());
  assert.equal(events.map(e => e.choices?.[0]?.delta?.content ?? '').join(''), expected);
  assert.equal(
    events.some(e => e.choices?.[0]?.delta?.tool_calls),
    false,
  );
  assert.equal(events.find(e => e.choices?.[0]?.finish_reason)?.choices[0].finish_reason, 'stop');
  assert.equal(events.at(-1).usage.total_tokens, 10);
});
test('real stream/main/final/state/hold semantics for ordinary text', { skip: !canReplay }, async () => {
  const config = {
    ...settings,
    script:
      '({buffer, final, stream, channel, state}) => { if (!stream || channel !== "main") throw Error("wrong context"); return final ? {output: buffer.toUpperCase(), hold:"", state} : {output:"", hold:buffer, state:{count:(state.count||0)+1}}; }',
  };
  const body =
    ['a', 'b']
      .map(content => 'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content } }] }) + '\n\n')
      .join('') + 'data: [DONE]\n\n';
  const result = await adaptSPresetResponse(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), {
    runtime,
    settings: config,
    stream: true,
  });
  assert.equal(
    readEvents(await result.text())
      .map(e => e.choices?.[0]?.delta?.content ?? '')
      .join(''),
    'AB',
  );
});
test('existing non-stream response hooks consume tool calls only once', { skip: !canReplay }, async () => {
  let consumed = 0;
  const response = new Response(JSON.stringify(jsonResponse()), { headers: { 'content-type': 'application/json' } });
  const json = response.json.bind(response);
  response.json = async () => {
    consumed++;
    return runtime.consumeResponse(await json(), settings);
  };
  const result = await adaptSPresetResponse(response, {
    runtime: {
      ...runtime,
      consumeResponse: async data => {
        assert.equal(data.choices[0].message.tool_calls, undefined);
        return runtime.consumeResponse(data, settings);
      },
    },
    settings,
    stream: false,
  });
  assert.equal((await result.json()).choices[0].message.content, expected);
  assert.equal(consumed, 1);
});
test('disabled SPreset processing leaves Kunlun-style already-restored responses untouched', async () => {
  const response = new Response('already restored');
  assert.equal(
    await adaptSPresetResponse(response, { settings: { enabled: false }, runtime: null, stream: true }),
    response,
  );
});
test(
  'formatter failure retains raw response and arguments instead of producing empty success',
  { skip: !canReplay },
  async () => {
    let recovery;
    const bad = {
      ...settings,
      toolCallFormatter: { enabled: true, script: '() => { throw Error("formatter failed") }' },
    };
    const response = await adaptSPresetResponse(sseResponse(), {
      runtime,
      settings: bad,
      stream: true,
      onFailure: x => {
        recovery = x;
      },
    });
    await assert.rejects(response.text(), /formatter failed/);
    assert.ok(recovery.rawResponse.includes('tool_calls'));
    assert.equal(JSON.parse(recovery.toolCalls[0].function.arguments).content, expected);
  },
);
test('SPreset preprocessor fallback is an explicit failure', { skip: !canReplay }, async () => {
  const bad = { ...settings, script: '() => { throw Error("processor failed") }' };
  await assert.rejects(
    adaptSPresetResponse(
      new Response(JSON.stringify(jsonResponse()), { headers: { 'content-type': 'application/json' } }),
      { runtime, settings: bad, stream: false },
    ),
    /预处理/,
  );
});
test('empty or unconsumed detailed results cannot become assistant floors', () => {
  assert.throws(() => resolvePreGenerationText(''), /空/);
  assert.throws(() => resolvePreGenerationText({ content: '', tool_calls: [{ id: 'unhandled' }] }), /工具/);
  assert.equal(resolvePreGenerationText({ content: 'plain', reasoning: 'reasoning' }), 'plain');
});

test(
  'DONE terminates an open connection and releases the source reader',
  { skip: !canReplay, timeout: 2000 },
  async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(
          new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n'),
        );
        // Deliberately do not close: the semantic terminator is sufficient.
      },
      cancel() {
        cancelled = true;
      },
    });
    const adapted = await adaptSPresetResponse(
      new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      { runtime, settings, stream: true },
    );
    const reader = adapted.body.getReader();
    const output = [];
    const completion = (async () => {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        output.push(part.value);
      }
    })();
    let timer;
    try {
      await Promise.race([
        completion,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('waiting for transport EOF')), 300);
        }),
      ]);
      assert.equal(cancelled, true);
    } finally {
      clearTimeout(timer);
      await reader.cancel();
    }
  },
);

test('consumer cancellation releases an in-flight source read', { skip: !canReplay, timeout: 2000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const adapted = await adaptSPresetResponse(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), {
    runtime,
    settings,
    stream: true,
  });
  const reader = adapted.body.getReader();
  const pending = reader.read();
  await reader.cancel();
  await pending;
  assert.equal(cancelled, true);
});

test('formatter returning empty text preserves the received response as a failure', { skip: !canReplay }, async () => {
  let recovery;
  const config = { ...settings, toolCallFormatter: { enabled: true, script: '() => ""' } };
  const response = await adaptSPresetResponse(sseResponse(), {
    runtime,
    settings: config,
    stream: true,
    onFailure: value => {
      recovery = value;
    },
  });
  await assert.rejects(response.text(), /空/);
  assert.ok(recovery.rawResponse.includes('tool_calls'));
});

test(
  'non-stream plain text is preserved and empty formatted output remains recoverable',
  { skip: !canReplay },
  async () => {
    const plain = { choices: [{ index: 0, message: { content: 'ordinary text' }, finish_reason: 'stop' }] };
    const response = await adaptSPresetResponse(new Response(JSON.stringify(plain)), {
      runtime,
      settings,
      stream: false,
    });
    assert.equal((await response.json()).choices[0].message.content, 'ordinary text');
    let recovery;
    await assert.rejects(
      adaptSPresetResponse(new Response(JSON.stringify(jsonResponse())), {
        runtime,
        settings: { ...settings, toolCallFormatter: { enabled: true, script: '() => ""' } },
        stream: false,
        onFailure: value => {
          recovery = value;
        },
      }),
      /空/,
    );
    assert.equal(JSON.parse(recovery.toolCalls[0].function.arguments).content, expected);
  },
);
