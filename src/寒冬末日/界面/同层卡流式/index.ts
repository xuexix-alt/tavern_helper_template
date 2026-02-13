import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { mountStreamingMessages } from '@util/streaming';
import StreamApp from './App.vue';
import StatusBarApp from '../状态栏/App.vue';
import './global.css';
import '../状态栏/global.css';
import { resolveSameLayerAnchorMessageId } from '../../samelayer_anchor';

function parseFlag(value: string | null | undefined): boolean | null {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return null;
}

function isLegacyModeEnabled(): boolean {
  try {
    const search = new URLSearchParams(window.location.search);
    const fromQuery = parseFlag(search.get('legacy_mode'));
    if (fromQuery != null) return fromQuery;
  } catch {
    // ignore
  }

  try {
    const fromStorage = parseFlag(localStorage.getItem('eden:samelayer:legacy_mode'));
    if (fromStorage != null) return fromStorage;
  } catch {
    // ignore
  }

  return false;
}

function shouldUseStatusBarShell(): boolean {
  try {
    const fromStorage = parseFlag(localStorage.getItem('eden:samelayer:statusbar_shell'));
    if (fromStorage != null) return fromStorage;
  } catch {
    // ignore
  }

  // 默认启用原版状态栏壳，轻量流式壳作为回退。
  return true;
}

$(() => {
  if (isLegacyModeEnabled()) {
    console.info('[eden/samelayer] legacy_mode=on, 同层卡流式挂载已跳过');
    return;
  }

  const rootApp = shouldUseStatusBarShell() ? StatusBarApp : StreamApp;

  const { unmount } = mountStreamingMessages(
    () => {
      return createApp(rootApp).use(createPinia());
    },
    {
      host: 'iframe',
      prefix: 'eden-stream',
      filter: message_id => {
        const anchor_id = resolveSameLayerAnchorMessageId();
        return anchor_id != null && message_id === anchor_id;
      },
    },
  );

  $(window).on('pagehide', () => {
    unmount();
    if (typeof eventClearAll === 'function') eventClearAll();
  });
});
