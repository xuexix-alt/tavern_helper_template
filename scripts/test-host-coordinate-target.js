require('ts-node/register/transpile-only');

const {
  convertIframePointToHostPoint,
  resolveHostTriggerTargetFromPoint,
} = require('../src/寒冬末日/界面同层版/界面/状态栏/hostCoordinateTarget.ts');

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nexpected: ${expectedJson}\nactual: ${actualJson}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nexpected: ${String(expected)}\nactual: ${String(actual)}`);
  }
}

const converted = convertIframePointToHostPoint(
  { clientX: 478.84375, clientY: 687.8958740234375 },
  { left: 19.822917938232422, top: -83.89583587646484 },
);

assertDeepEqual(
  converted,
  { clientX: 498.6666679382324, clientY: 604.0000381469727 },
  'iframe point should convert to host point using iframe rect offset',
);

const mesText = {
  id: 'mes-text',
  closest(selector) {
    if (selector === '.mes_text, .mes_block, .message_text') return this;
    if (selector === '.mes[mesid]') return { getAttribute: () => '6' };
    return null;
  },
};

const hostDoc = {
  elementFromPoint(x, y) {
    if (x === 498.6666679382324 && y === 604.0000381469727) return mesText;
    return null;
  },
};

const resolved = resolveHostTriggerTargetFromPoint(hostDoc, converted);
assertEqual(resolved, mesText, 'coordinate targeting should resolve host mes_text element');

console.log('host coordinate target test passed');
