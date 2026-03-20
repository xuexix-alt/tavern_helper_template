const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveHostTriggerTargetFromPoint,
  resolveHostMessageTargetFromPoint,
  resolveHostDispatchPlan,
} = require('../hostCoordinateTarget.ts');

test('resolveHostMessageTargetFromPoint prefers mes_text-like carriers and never falls back to image artifacts', () => {
  const hostMesText = { id: 'mes-text' };
  const imageButton = { id: 'image-button' };

  const hit = {
    closest(selector) {
      if (selector === '.mes_text, .mes_block, .message_text') return hostMesText;
      if (selector === '.st-chatu8-image-button') return imageButton;
      if (selector === '.st-chatu8-image-span') return null;
      return null;
    },
  };

  const hostDocument = {
    elementFromPoint() {
      return hit;
    },
  };

  assert.equal(resolveHostMessageTargetFromPoint(hostDocument, { clientX: 10, clientY: 12 }), hostMesText);
});

test('resolveHostTriggerTargetFromPoint still falls back to plugin image controls for generic point targeting', () => {
  const imageButton = { id: 'image-button' };

  const hit = {
    closest(selector) {
      if (selector === '.mes_text, .mes_block, .message_text') return null;
      if (selector === '.st-chatu8-image-button') return imageButton;
      if (selector === '.st-chatu8-image-span') return null;
      return null;
    },
  };

  const hostDocument = {
    elementFromPoint() {
      return hit;
    },
  };

  assert.equal(resolveHostTriggerTargetFromPoint(hostDocument, { clientX: 1, clientY: 2 }), imageButton);
});

test('resolveHostDispatchPlan drops hostPoint for direct message target but keeps it for point fallback target', () => {
  const directTarget = { id: 'direct-target' };
  const fallbackTarget = { id: 'fallback-target' };
  const hostPoint = { clientX: 88, clientY: 144 };

  assert.deepEqual(
    resolveHostDispatchPlan({
      directTarget,
      pointFallbackTarget: fallbackTarget,
      hostPoint,
    }),
    {
      target: directTarget,
      hostPoint: null,
      source: 'message_id',
    },
  );

  assert.deepEqual(
    resolveHostDispatchPlan({
      directTarget: null,
      pointFallbackTarget: fallbackTarget,
      hostPoint,
    }),
    {
      target: fallbackTarget,
      hostPoint,
      source: 'point_fallback',
    },
  );
});
