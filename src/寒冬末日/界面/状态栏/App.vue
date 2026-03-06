<template>
  <main id="eden-shell" :style="shellStyle">
    <div class="eden-shell-top-actions">
      <button
        type="button"
        class="eden-mode-toggle-btn"
        :title="isDarkTheme ? '切换到浅色模式' : '切换到深色模式'"
        @click.stop="toggleLightDarkTheme"
      >
        {{ isDarkTheme ? '☀️ 浅色' : '🌙 深色' }}
      </button>
      <button
        ref="displayButtonRef"
        type="button"
        class="eden-display-settings-btn"
        aria-label="显示设置"
        :aria-expanded="displayPanelOpen"
        @click.stop="toggleDisplayPanel"
      >
        🎨
      </button>
      <div ref="displayPanelRef" class="eden-display-panel" :class="{ show: displayPanelOpen }">
        <h3>显示设置</h3>
        <div class="eden-display-option">
          <label>🎨 主题</label>
          <select v-model="theme">
            <option value="apocalypse_tech">末日科技 (深色)</option>
            <option value="jade_green">淡翡翠绿 (浅色)</option>
            <option value="parchment">复古羊皮纸</option>
            <option value="milky">清新奶白</option>
          </select>
        </div>
        <div class="eden-display-option">
          <label>🖋️ 字体</label>
          <select v-model="fontKey">
            <option value="yahei">微软雅黑 (默认)</option>
            <option value="simsun">宋体</option>
            <option value="kaiti">楷体</option>
          </select>
        </div>
        <div class="eden-display-option">
          <label>↔️ 字体大小</label>
          <select v-model="fontSize">
            <option value="12">12px (最小)</option>
            <option value="14">14px (较小)</option>
            <option value="15">15px (稍小)</option>
            <option value="16">16px (默认)</option>
            <option value="18">18px (稍大)</option>
            <option value="20">20px (较大)</option>
            <option value="22">22px (很大)</option>
            <option value="24">24px (最大)</option>
          </select>
        </div>
        <div class="eden-display-buttons">
          <button type="button" class="eden-display-close" @click="displayPanelOpen = false">关闭</button>
        </div>
      </div>
    </div>

    <section ref="shellMainRef" class="eden-shell-main">
      <KeepAlive>
        <component :is="activeTab.component" v-bind="activeTabProps" class="eden-pane" />
      </KeepAlive>
    </section>

    <footer class="eden-shell-footer">
      <StoryStreamObserver :active="isStoryTab" />
      <nav class="eden-tabbar" aria-label="状态栏页面切换">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="eden-tab-btn"
          :class="{ active: activeTabKey === tab.key }"
          @click="switchTab(tab.key)"
        >
          <span class="eden-tab-icon" aria-hidden="true">{{ tab.icon }}</span>
          <span class="eden-tab-label">{{ tab.label }}</span>
        </button>
      </nav>
      <div class="eden-version" aria-label="状态栏版本">v{{ STATUSBAR_VERSION }}</div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { useEventListener, useLocalStorage, watchDebounced } from '@vueuse/core';
import type { Component } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CHAT_VAR_KEYS } from '../outbound';
import { createMobileTouchScrollBridge } from '../useMobileTouchScrollBridge';
import StoryStreamObserver from './components/StoryStreamObserver.vue';
import CharactersPage from './pages/CharactersPage.vue';
import CreationPage from './pages/CreationPage.vue';
import MissionPage from './pages/MissionPage.vue';
import ShelterPage from './pages/ShelterPage.vue';
import StoryPage from './pages/StoryPage.vue';
import { useInjectedData } from './useInjectedData';

const STATUSBAR_VERSION = '3.1';
const BASE_MIN_SHELL_HEIGHT = 312;
const STORY_MIN_SHELL_HEIGHT = 410;
const MOBILE_MIN_SHELL_HEIGHT = 280;
const MOBILE_STORY_MIN_SHELL_HEIGHT = 340;
const MOBILE_KEYBOARD_MIN_SHELL_HEIGHT = 248;
const MOBILE_KEYBOARD_STORY_MIN_SHELL_HEIGHT = 280;
const MAX_SHELL_HEIGHT = 4096;
const SHELL_COMFORT_OFFSET_RATIO = 0.03;
const SHELL_COMFORT_MIN_OFFSET = 12;
const SHELL_COMFORT_MAX_OFFSET = 36;
const MOBILE_ONE_SCREEN_MAX_WIDTH = 920;
const HOST_CHAT_HEIGHT_SELECTORS = ['#chat', '#sheld'] as const;
const { raw, options } = useInjectedData();
const tabs = [
  { key: 'story', label: '剧情', icon: '📖', component: StoryPage },
  { key: 'shelter', label: '庇护', icon: '🛡️', component: ShelterPage },
  { key: 'mission', label: '任务', icon: '🎯', component: MissionPage },
  { key: 'characters', label: '角色', icon: '🧑‍🤝‍🧑', component: CharactersPage },
  { key: 'creation', label: '创作', icon: '🛠️', component: CreationPage },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; component: Component }>;

type TabKey = (typeof tabs)[number]['key'];

const activeTabKey = ref<TabKey>('story');
const shellHeight = ref<number>(Math.max(BASE_MIN_SHELL_HEIGHT, Math.floor(getViewportHeight())));
const shellMainRef = ref<HTMLElement | null>(null);
const tabScrollPosition = new Map<TabKey, number>(tabs.map(tab => [tab.key, 0] as const));
const displayButtonRef = ref<HTMLElement | null>(null);
const displayPanelRef = ref<HTMLElement | null>(null);
const displayPanelOpen = ref(false);
const theme = useLocalStorage<string>('eden_theme', 'apocalypse_tech');
const fontKey = useLocalStorage<string>('eden_font_key', 'yahei');
const fontSize = useLocalStorage<string>('eden_font_size_key', '16');
const lastLightTheme = useLocalStorage<string>('eden_last_light_theme', 'jade_green');
const isDarkTheme = computed(() => theme.value === 'apocalypse_tech');
let removeDisplayClick: (() => void) | null = null;

const THEME_KEYS = ['apocalypse_tech', 'jade_green', 'parchment', 'milky'] as const;
const THEME_SET = new Set<string>(THEME_KEYS);
const LEGACY_THEME_MAP: Record<string, string> = {
  dark: 'apocalypse_tech',
  light: 'jade_green',
  emerald: 'jade_green',
  emerald_green: 'jade_green',
  green: 'jade_green',
};

const FONT_MAP: Record<string, string> = {
  yahei: '"Microsoft YaHei", sans-serif',
  simsun: 'SimSun, serif',
  kaiti: 'KaiTi, serif',
};

const activeTab = computed(() => tabs.find(tab => tab.key === activeTabKey.value) ?? tabs[0]);
const isStoryTab = computed(() => activeTab.value.key === 'story');
const activeTabProps = computed<Record<string, unknown>>(() => {
  const baseProps: Record<string, unknown> = { query: '' };
  if (activeTab.value.key === 'story') return { ...baseProps, raw: raw.value, options: options.value };
  return baseProps;
});

const shellStyle = computed<Record<string, string>>(() => ({
  '--eden-shell-height': `${shellHeight.value}px`,
}));

function applyTheme(value: string) {
  if (!value || value === 'apocalypse_tech') {
    delete document.documentElement.dataset.theme;
    return;
  }
  document.documentElement.dataset.theme = value;
}

function normalizeTheme(value: unknown): string {
  const input = String(value ?? '').trim();
  if (!input) return 'apocalypse_tech';
  const mapped = LEGACY_THEME_MAP[input] ?? input;
  return THEME_SET.has(mapped) ? mapped : 'apocalypse_tech';
}

function applyTypography(fontValue: string, sizeValue: string) {
  const resolvedFont = FONT_MAP[fontValue] || FONT_MAP.yahei;
  document.documentElement.style.setProperty('--font-main', resolvedFont);
  document.documentElement.style.setProperty('--font-size-main', `${sizeValue}px`);
  const shell = document.getElementById('eden-shell');
  shell?.style.setProperty('--font-size-main', `${sizeValue}px`);
}

function loadPersistedDisplaySettings() {
  const vars = typeof getVariables === 'function' ? (getVariables({ type: 'chat' }) ?? {}) : {};
  const saved = _.get(vars, CHAT_VAR_KEYS.UI_SETTINGS, {}) as Record<string, string>;
  if (typeof saved.theme === 'string') theme.value = normalizeTheme(saved.theme);
  if (typeof saved.font_key === 'string') fontKey.value = saved.font_key;
  if (typeof saved.font_size === 'string') fontSize.value = saved.font_size;
  if (theme.value !== 'apocalypse_tech') lastLightTheme.value = theme.value;
}

function toggleDisplayPanel() {
  displayPanelOpen.value = !displayPanelOpen.value;
}

function toggleLightDarkTheme() {
  if (isDarkTheme.value) {
    theme.value = normalizeTheme(lastLightTheme.value);
    if (theme.value === 'apocalypse_tech') theme.value = 'jade_green';
    return;
  }
  theme.value = 'apocalypse_tech';
}

function onDocumentClick(ev: MouseEvent) {
  if (!displayPanelOpen.value) return;
  const target = ev.target as Node | null;
  if (!target) return;
  if (displayPanelRef.value?.contains(target)) return;
  if (displayButtonRef.value?.contains(target)) return;
  displayPanelOpen.value = false;
}

function getActiveScrollContainer() {
  const shellMain = shellMainRef.value;
  if (!shellMain) return null;
  const nodes = Array.from(shellMain.querySelectorAll<HTMLElement>('.eden-page-scroll'));
  if (!nodes.length) return null;
  return nodes.find(node => node.offsetParent !== null) ?? nodes[0];
}

function saveCurrentTabScroll(tabKey: TabKey = activeTabKey.value) {
  const scroller = getActiveScrollContainer();
  if (!scroller) return;
  tabScrollPosition.set(tabKey, scroller.scrollTop);
}

function restoreTabScroll(tabKey: TabKey = activeTabKey.value) {
  const targetTop = tabScrollPosition.get(tabKey) ?? 0;
  const apply = () => {
    const scroller = getActiveScrollContainer();
    if (!scroller) return;
    scroller.scrollTop = targetTop;
  };

  apply();
  requestAnimationFrame(apply);
  setTimeout(apply, 120);
}

function switchTab(nextTab: TabKey) {
  if (activeTabKey.value === nextTab) return;
  saveCurrentTabScroll(activeTabKey.value);
  activeTabKey.value = nextTab;
  syncShellHeight();
  nextTick(() => {
    restoreTabScroll(nextTab);
    notifyLayoutChanged();
  });
}

function getViewportHeight() {
  const vv = window.visualViewport;
  if (vv?.height && Number.isFinite(vv.height) && vv.height > 0) return vv.height;
  if (window.innerHeight > 0) return window.innerHeight;
  return document.documentElement.clientHeight || BASE_MIN_SHELL_HEIGHT;
}

function getStableMinShellHeight(baseline: number) {
  const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
  const viewportHeight = getViewportHeight();
  const isNarrowViewport = viewportWidth > 0 && viewportWidth <= 640;
  const keyboardLikelyOpen = Number(window.innerHeight || 0) - viewportHeight >= 90;
  const adaptive = Math.floor(baseline * 0.58);
  const shellFloor = isNarrowViewport
    ? keyboardLikelyOpen
      ? MOBILE_KEYBOARD_MIN_SHELL_HEIGHT
      : MOBILE_MIN_SHELL_HEIGHT
    : BASE_MIN_SHELL_HEIGHT;
  const baseMin = Math.max(shellFloor, Math.min(760, adaptive));
  if (activeTabKey.value === 'story') {
    const storyFloor = isNarrowViewport
      ? keyboardLikelyOpen
        ? MOBILE_KEYBOARD_STORY_MIN_SHELL_HEIGHT
        : MOBILE_STORY_MIN_SHELL_HEIGHT
      : STORY_MIN_SHELL_HEIGHT;
    return Math.max(baseMin, storyFloor);
  }
  return baseMin;
}

function isMobileTouchViewport() {
  const viewportWidth = Number(window.visualViewport?.width || window.innerWidth || 0);
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return false;
  if (viewportWidth > MOBILE_ONE_SCREEN_MAX_WIDTH) return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const hasTouch = (navigator?.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
  return coarsePointer || hasTouch;
}

function getHostChatHeight() {
  try {
    const hostDoc = window.parent?.document;
    if (!hostDoc || hostDoc === document) return null;
    for (const selector of HOST_CHAT_HEIGHT_SELECTORS) {
      const el = hostDoc.querySelector(selector) as HTMLElement | null;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (Number.isFinite(rect.height) && rect.height > 0) return rect.height;
    }
  } catch {
    // ignore
  }
  return null;
}

function getFrameContainerHeight() {
  try {
    const frameEl = window.frameElement as HTMLElement | null;
    if (!frameEl) return null;
    const rect = frameEl.getBoundingClientRect();
    if (Number.isFinite(rect.height) && rect.height > 0) return rect.height;
  } catch {
    // ignore
  }
  return null;
}

function calculateShellHeight() {
  if (isMobileTouchViewport()) {
    const viewportHeight = getViewportHeight();
    const frameHeight = getFrameContainerHeight();
    const candidate = frameHeight && frameHeight > 0 ? frameHeight : viewportHeight;
    const keyboardLikelyOpen = Number(window.innerHeight || 0) - viewportHeight >= 90;
    const mobileFloor =
      activeTabKey.value === 'story'
        ? keyboardLikelyOpen
          ? MOBILE_KEYBOARD_STORY_MIN_SHELL_HEIGHT
          : MOBILE_STORY_MIN_SHELL_HEIGHT
        : keyboardLikelyOpen
          ? MOBILE_KEYBOARD_MIN_SHELL_HEIGHT
          : MOBILE_MIN_SHELL_HEIGHT;
    return Math.min(MAX_SHELL_HEIGHT, Math.max(mobileFloor, Math.floor(candidate)));
  }

  const hostChatHeight = getHostChatHeight() ?? 0;
  const viewportHeight = getViewportHeight();
  // In message iframes, prefer host chat height to avoid iframe<->viewport positive feedback loops.
  const candidate = hostChatHeight > 0 ? hostChatHeight : viewportHeight;
  const comfortOffset = Math.max(
    SHELL_COMFORT_MIN_OFFSET,
    Math.min(SHELL_COMFORT_MAX_OFFSET, Math.floor(candidate * SHELL_COMFORT_OFFSET_RATIO)),
  );
  const comfortableCandidate = Math.floor(Math.max(0, candidate - comfortOffset));
  const minHeight = getStableMinShellHeight(candidate);
  return Math.min(MAX_SHELL_HEIGHT, Math.max(minHeight, comfortableCandidate));
}

function syncShellHeight() {
  const nextHeight = calculateShellHeight();
  if (Math.abs(nextHeight - shellHeight.value) >= 1) {
    shellHeight.value = nextHeight;
  }
}

function notifyLayoutChanged() {
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

let frameResizeObserver: ResizeObserver | null = null;
let hostChatResizeObserver: ResizeObserver | null = null;
let removeVisualViewportListener: (() => void) | null = null;
let initialSyncTimers: number[] = [];
let stopTouchScrollBridge: (() => void) | null = null;

onMounted(() => {
  loadPersistedDisplaySettings();
  theme.value = normalizeTheme(theme.value);
  applyTheme(theme.value);
  applyTypography(fontKey.value, fontSize.value);
  removeDisplayClick = useEventListener(document, 'click', onDocumentClick);

  syncShellHeight();
  window.addEventListener('resize', syncShellHeight, { passive: true });
  window.addEventListener('orientationchange', syncShellHeight);
  nextTick(() => {
    restoreTabScroll(activeTabKey.value);
    notifyLayoutChanged();
  });
  stopTouchScrollBridge = createMobileTouchScrollBridge({
    root: () => shellMainRef.value,
  });

  try {
    const frameEl = window.frameElement as HTMLElement | null;
    if (frameEl && typeof ResizeObserver !== 'undefined') {
      frameResizeObserver = new ResizeObserver(() => {
        syncShellHeight();
      });
      frameResizeObserver.observe(frameEl);
    }
  } catch {
    frameResizeObserver = null;
  }

  try {
    const hostDoc = window.parent?.document;
    if (hostDoc && hostDoc !== document && typeof ResizeObserver !== 'undefined') {
      const hostChatEl = HOST_CHAT_HEIGHT_SELECTORS.map(
        selector => hostDoc.querySelector(selector) as HTMLElement | null,
      ).find(Boolean);
      if (hostChatEl) {
        hostChatResizeObserver = new ResizeObserver(() => {
          syncShellHeight();
        });
        hostChatResizeObserver.observe(hostChatEl);
      }
    }
  } catch {
    hostChatResizeObserver = null;
  }

  const vv = window.visualViewport;
  if (vv) {
    const onViewportResize = () => syncShellHeight();
    vv.addEventListener('resize', onViewportResize);
    vv.addEventListener('scroll', onViewportResize);
    removeVisualViewportListener = () => {
      vv.removeEventListener('resize', onViewportResize);
      vv.removeEventListener('scroll', onViewportResize);
    };
  }

  // 首屏阶段多次同步，减小 iframe 初始尺寸抖动
  for (const ms of [40, 120, 260, 520]) {
    const timer = window.setTimeout(() => syncShellHeight(), ms);
    initialSyncTimers.push(timer);
  }
});

onBeforeUnmount(() => {
  removeDisplayClick?.();
  removeDisplayClick = null;
  saveCurrentTabScroll(activeTabKey.value);
  window.removeEventListener('resize', syncShellHeight);
  window.removeEventListener('orientationchange', syncShellHeight);
  if (removeVisualViewportListener) removeVisualViewportListener();
  if (frameResizeObserver) frameResizeObserver.disconnect();
  if (hostChatResizeObserver) hostChatResizeObserver.disconnect();
  if (initialSyncTimers.length) {
    for (const timer of initialSyncTimers) window.clearTimeout(timer);
    initialSyncTimers = [];
  }
  stopTouchScrollBridge?.();
  stopTouchScrollBridge = null;
});

watch(
  theme,
  value => {
    const normalized = normalizeTheme(value);
    if (normalized !== value) {
      theme.value = normalized;
      return;
    }
    if (normalized !== 'apocalypse_tech') lastLightTheme.value = normalized;
    applyTheme(normalized);
  },
  { immediate: true },
);

watch(
  [fontKey, fontSize],
  ([fontValue, sizeValue]) => {
    applyTypography(fontValue, sizeValue);
  },
  { immediate: true },
);

watch(
  [theme, fontKey, fontSize],
  ([t, f, s]) => {
    if (typeof updateVariablesWith !== 'function') return;
    updateVariablesWith(
      vars => {
        _.set(vars, CHAT_VAR_KEYS.UI_SETTINGS, { theme: t, font_key: f, font_size: s });
        return vars;
      },
      { type: 'chat' },
    );
  },
  { immediate: false },
);

watchDebounced(
  () => [raw.value],
  () => {
    window.dispatchEvent(new Event('resize'));
  },
  { debounce: 200 },
);
</script>

<style scoped>
@import '../shared/shell-layout.css';

#eden-shell {
  --eden-shell-height-fallback: 560px;
  --eden-shell-max-height: var(--eden-shell-height, 560px);
  --eden-shell-min-height: 312px;
  --eden-shell-min-height-mobile: 292px;
  --eden-shell-footer-padding-x: 7px;
  --eden-tab-btn-min-height: 42px;
  --eden-tab-btn-min-height-mobile: 40px;
  --eden-tab-btn-min-height-compact: 38px;
  --eden-tab-label-font-size: 0.68em;
  --eden-tab-label-font-size-mobile: 0.64em;
  --eden-tab-label-font-size-compact: 0.6em;
  --eden-tab-label-letter-spacing-compact: 0.01em;
  --eden-tab-label-display-compact: inline;
}
</style>
