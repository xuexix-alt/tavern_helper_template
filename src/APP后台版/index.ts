import { createApp } from 'vue';
import $ from 'jquery';
import _ from 'lodash';
import { mountStreamingMessages } from '@util/streaming';
import App from './app.vue';
import router from './界面';
import StreamingApp from './StreamingApp.vue';

const parentWindow = (() => {
  try {
    return window.parent && window.parent !== window ? window.parent : null;
  } catch {
    return null;
  }
})();

const parentAny = parentWindow as any;

// 让流式渲染优先作用在宿主页面（避免 iframe 内找不到 #chat）
const parentJq = parentAny?.$ || parentAny?.jQuery;
const rootJq = parentJq || $;
(window as any).$ = rootJq;
(window as any).jQuery = rootJq;
(window as any)._ = parentAny?._ || _;

// 尽量复用宿主全局（避免 iframe 环境拿不到 tavern API）
[
  'SillyTavern',
  'tavern_events',
  'eventOn',
  'eventEmit',
  'eventMakeFirst',
  'eventMakeLast',
  'eventRemoveListener',
  'eventClearEvent',
  'getChatMessages',
  'getCurrentMessageId',
  'getVariables',
  'waitGlobalInitialized',
  'Mvu',
  'triggerSlash',
  'toastr',
  'getScriptId',
].forEach(key => {
  if ((window as any)[key]) return;
  if (parentAny?.[key]) {
    (window as any)[key] = parentAny[key];
  }
});

if (typeof (window as any).getScriptId !== 'function') {
  (window as any).getScriptId = () => 'app-backend-ui';
}

const streamGate = {
  enabled: false,
  until: 0,
  reason: '',
};

const enableStreaming = (detail?: { reason?: string; ttlMs?: number }) => {
  streamGate.enabled = true;
  streamGate.reason = detail?.reason || 'manual';
  const ttl = typeof detail?.ttlMs === 'number' ? detail?.ttlMs : 120000;
  streamGate.until = Date.now() + ttl;
};

const disableStreaming = () => {
  streamGate.enabled = false;
  streamGate.reason = '';
  streamGate.until = 0;
};

window.addEventListener('app-backend:streaming:enable', (event: Event) => {
  const detail = (event as CustomEvent).detail as { reason?: string; ttlMs?: number } | undefined;
  enableStreaming(detail);
});
window.addEventListener('app-backend:streaming:disable', () => disableStreaming());

const streamTagPattern = /<(content|game|summary|option|roleplay_options)[^>]*>/i;
const shopPattern = /\[(店铺|套餐)\]|shops\s*:|\"shops\"\s*:|店铺列表/i;

$(() => {
  const app = createApp(App);
  app.use(router);
  app.mount('#app');

  const canStream =
    typeof (window as any).eventOn === 'function' && typeof (window as any).getChatMessages === 'function';
  const { unmount } = canStream
    ? mountStreamingMessages(() => createApp(StreamingApp), {
        host: 'iframe',
        prefix: 'app-backend-stream',
        filter: (_message_id, message) => {
          if (!streamGate.enabled) return false;
          if (streamGate.until && Date.now() > streamGate.until) {
            disableStreaming();
            return false;
          }
          const text = String(message ?? '');
          return streamTagPattern.test(text) || shopPattern.test(text);
        },
      })
    : { unmount: () => {} };

  let stopMessageReceive: { stop: () => void } | null = null;
  if (canStream && (window as any).tavern_events) {
    try {
      stopMessageReceive = (window as any).eventOn((window as any).tavern_events.MESSAGE_RECEIVED, () => {
        disableStreaming();
      });
    } catch {
      // ignore
    }
  }

  const gateTimer = window.setInterval(() => {
    if (streamGate.enabled && streamGate.until && Date.now() > streamGate.until) {
      disableStreaming();
    }
  }, 2000);

  $(window).on('pagehide', () => {
    stopMessageReceive?.stop?.();
    window.clearInterval(gateTimer);
    unmount();
    app.unmount();
  });
});
