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
import type { Component } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener, useLocalStorage, watchDebounced } from '@vueuse/core';
import CharactersPage from './pages/CharactersPage.vue';
import CreationPage from './pages/CreationPage.vue';
import MissionPage from './pages/MissionPage.vue';
import StoryStreamObserver from './components/StoryStreamObserver.vue';
import ShelterPage from './pages/ShelterPage.vue';
import StoryPage from './pages/StoryPage.vue';
import { CHAT_VAR_KEYS } from '../outbound';
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

function calculateShellHeight() {
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
:global(html),
:global(body),
:global(#app) {
  height: 100%;
}

:global(body) {
  overflow: hidden;
  padding: 0;
}

#eden-shell {
  position: relative;
  font-size: var(--font-size-main, 16px);
  border: 1px solid var(--border-color);
  box-shadow:
    0 0 25px 0px var(--border-shadow-color),
    inset 0 0 15px rgba(255, 255, 255, 0.05);
  background-color: var(--bg-main);
  border-radius: var(--border-radius);
  width: 100%;
  margin: 0;
  padding: 0;
  gap: 0;
  height: var(--eden-shell-height, 560px);
  max-height: var(--eden-shell-height, 560px);
  min-height: 312px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.eden-shell-top-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.eden-mode-toggle-btn,
.eden-display-settings-btn {
  min-height: 36px;
  border-radius: 10px;
  border: 1px solid var(--btn-border, var(--border-color));
  background: var(--btn-bg, var(--bg-light));
  color: var(--btn-text, var(--text-color));
  font: inherit;
  font-size: 0.74em;
  line-height: 1;
  cursor: pointer;
  padding: 0 10px;
}

.eden-display-settings-btn {
  min-width: 36px;
  padding: 0;
  font-size: 1em;
}

.eden-mode-toggle-btn:hover,
.eden-display-settings-btn:hover {
  background: var(--btn-hover-bg, rgba(139, 233, 253, 0.2));
  color: var(--btn-hover-text, var(--text-strong));
}

.eden-display-panel {
  position: absolute;
  top: 44px;
  right: 0;
  width: min(280px, calc(100vw - 18px));
  background: var(--card-surface-bg-elevated, var(--bg-light));
  border: 1px solid var(--card-surface-border, var(--border-color));
  border-radius: 12px;
  box-shadow: var(--theme-elevated-shadow, 0 10px 30px rgba(0, 0, 0, 0.35));
  padding: 12px;
  display: none;
}

.eden-display-panel.show {
  display: block;
}

.eden-display-panel h3 {
  margin: 0 0 8px 0;
  font-size: 0.98em;
  color: var(--text-strong);
}

.eden-display-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.eden-display-option label {
  font-size: 0.84em;
  color: var(--text-color);
}

.eden-display-option select {
  width: 140px;
  min-height: 34px;
  padding: 4px 6px;
  border-radius: 8px;
  border: 1px solid var(--btn-border, rgba(255, 255, 255, 0.16));
  background: var(--card-surface-bg, var(--bg-medium));
  color: var(--text-color);
  color-scheme: light;
  -webkit-text-fill-color: currentColor;
}

.eden-display-option select option {
  color: #1f2f42;
  background-color: #f6f9fc;
}

.eden-display-buttons {
  display: flex;
  justify-content: flex-end;
}

.eden-display-close {
  min-height: 34px;
  border-radius: 8px;
  border: 1px solid var(--btn-primary-border, rgba(255, 255, 255, 0.2));
  background: var(--btn-primary-bg, rgba(139, 233, 253, 0.25));
  color: var(--btn-primary-text, var(--text-strong));
  font: inherit;
  font-size: 0.84em;
  padding: 0 10px;
  cursor: pointer;
}

.eden-shell-main {
  min-height: 0;
  overflow: hidden;
  padding-top: 44px;
}

.eden-pane {
  height: 100%;
  min-height: 0;
}

.eden-shell-footer {
  border-top: 1px solid var(--card-surface-border, rgba(255, 255, 255, 0.1));
  background: linear-gradient(
    180deg,
    var(--theme-footer-grad-start, rgba(3, 8, 20, 0.4)),
    var(--theme-footer-grad-end, rgba(3, 8, 20, 0.72))
  );
  backdrop-filter: blur(4px);
  padding: 4px 7px calc(6px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eden-tabbar {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.eden-tab-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 42px;
  border-radius: 9px;
  border: 1px solid var(--btn-border, rgba(255, 255, 255, 0.15));
  background: var(--btn-bg, rgba(255, 255, 255, 0.06));
  color: var(--btn-text, var(--text-color));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font: inherit;
  cursor: pointer;
  transition: all 0.18s ease;
}

.eden-tab-btn:hover {
  background: var(--btn-hover-bg, rgba(139, 233, 253, 0.2));
  color: var(--btn-hover-text, var(--text-strong));
}

.eden-tab-btn:focus-visible {
  outline: 2px solid var(--focus-ring-color, rgba(139, 233, 253, 0.56));
  outline-offset: 1px;
}

.eden-tab-btn.active {
  background: var(--btn-active-bg, rgba(139, 233, 253, 0.3));
  border-color: var(--btn-active-border, rgba(139, 233, 253, 0.65));
  color: var(--btn-active-text, var(--text-strong));
  box-shadow: 0 0 12px var(--btn-active-border, rgba(139, 233, 253, 0.22));
}

.eden-tab-icon {
  line-height: 1;
  font-size: 0.96em;
}

.eden-tab-label {
  line-height: 1;
  font-size: 0.68em;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .eden-shell-top-actions {
    top: 6px;
    right: 6px;
    gap: 4px;
  }

  .eden-mode-toggle-btn,
  .eden-display-settings-btn {
    min-height: 34px;
  }

  .eden-mode-toggle-btn {
    padding: 0 8px;
    font-size: 0.7em;
  }

  .eden-shell-main {
    padding-top: 40px;
  }

  #eden-shell {
    min-height: 292px;
  }

  .eden-shell-footer {
    padding-left: 6px;
    padding-right: 6px;
  }

  .eden-tab-btn {
    min-height: 40px;
    border-radius: 8px;
  }

  .eden-tab-label {
    font-size: 0.64em;
  }
}

@media (max-width: 380px) {
  .eden-tab-label {
    font-size: 0.6em;
    letter-spacing: 0.01em;
  }

  .eden-tab-btn {
    min-height: 38px;
  }
}
</style>
