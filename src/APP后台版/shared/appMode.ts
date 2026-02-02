import { computed, ref } from 'vue';
import { getNestedValue } from '../utils';

export type AppMode = 'app' | 'rp' | 'mixed';

const mode = ref<AppMode>('app');

export const appMode = mode;
export const isAppMode = computed(() => mode.value === 'app');
export const isRpMode = computed(() => mode.value === 'rp');
export const isMixedMode = computed(() => mode.value === 'mixed');
export const appModeLabel = computed(() => {
  if (mode.value === 'app') return 'APP 模式';
  if (mode.value === 'rp') return 'RP 模式';
  return '混合模式';
});

function normalizeMode(raw: any): AppMode {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!text) return 'app';
  if (['app', 'play', 'home'].includes(text)) return 'app';
  if (['rp', 'rpg', 'story', '剧情', '正文'].includes(text)) return 'rp';
  if (['mixed', 'mix', 'both', '混合'].includes(text)) return 'mixed';
  return 'app';
}

function readSnapshot(): any {
  try {
    const globalAny = window as any;
    const message_id = typeof globalAny.getCurrentMessageId === 'function' ? globalAny.getCurrentMessageId() : 'latest';
    if (typeof globalAny.waitGlobalInitialized === 'function') {
      try {
        globalAny.waitGlobalInitialized('Mvu');
      } catch {
        // ignore
      }
    }
    if (typeof globalAny.Mvu !== 'undefined' && globalAny.Mvu?.getMvuData) {
      return globalAny.Mvu.getMvuData({ type: 'message', message_id });
    }
    if (typeof globalAny.getVariables === 'function') {
      return globalAny.getVariables({ type: 'message', message_id });
    }
  } catch {
    // ignore
  }
  return null;
}

export function refreshAppMode(): AppMode {
  try {
    const snap = readSnapshot();
    const stat = snap?.stat_data || snap || {};
    const raw = getNestedValue(stat, '系统状态.当前模式', 'app');
    mode.value = normalizeMode(raw);
  } catch {
    mode.value = 'app';
  }
  return mode.value;
}

let started = false;
let stopListener: { stop?: () => void } | null = null;
let pollTimer: number | null = null;

export function startAppModeWatcher() {
  if (started) return () => {};
  started = true;
  refreshAppMode();

  const globalAny = window as any;
  try {
    if (typeof globalAny.eventOn === 'function' && globalAny.tavern_events) {
      stopListener = globalAny.eventOn(globalAny.tavern_events.MESSAGE_RECEIVED, () => {
        refreshAppMode();
      });
    }
  } catch {
    // ignore
  }

  pollTimer = window.setInterval(() => {
    refreshAppMode();
  }, 20000);

  return () => stopAppModeWatcher();
}

export function stopAppModeWatcher() {
  stopListener?.stop?.();
  stopListener = null;
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  started = false;
}
