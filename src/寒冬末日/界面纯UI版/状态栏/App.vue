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
      <div class="eden-shell-footer-bottom">
        <button
          type="button"
          class="eden-quick-options-btn"
          :disabled="quickOptions.length === 0"
          @click="openQuickChoicesPanel"
        >
          选项
          <span class="eden-quick-options-count">{{ quickOptions.length }}</span>
        </button>
        <div class="eden-version" aria-label="状态栏版本">v{{ STATUSBAR_VERSION }}</div>
      </div>
    </footer>
  </main>

  <Teleport to="body">
    <div v-if="quickChoicesPanelOpen" class="eden-quick-choices-mask" @click.self="closeQuickChoicesPanel">
      <div class="eden-quick-choices-modal">
        <div class="eden-quick-choices-head">
          <strong class="eden-quick-choices-title">剧情选项</strong>
          <button type="button" class="eden-quick-choices-close" @click="closeQuickChoicesPanel">关闭</button>
        </div>
        <div class="eden-quick-choices-body">
          <ChoicesSection :options="quickOptions" :query="''" @choice-sent="onQuickChoiceSent" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener, useLocalStorage } from '@vueuse/core';
import { CHAT_VAR_KEYS } from '../outbound';
import ChoicesSection from './components/ChoicesSection.vue';
import CharactersPage from './pages/CharactersPage.vue';
import CreationPage from './pages/CreationPage.vue';
import MissionPage from './pages/MissionPage.vue';
import ShelterPage from './pages/ShelterPage.vue';
import { useInjectedData } from './useInjectedData';
import { createMobileTouchScrollBridge } from '../../界面/useMobileTouchScrollBridge';

const STATUSBAR_VERSION = '3.1';
const HOST_CHAT_HEIGHT_SELECTORS = ['#chat', '#sheld'] as const;
const tabs = [
  { key: 'shelter', label: '庇护', icon: '🛡️', component: ShelterPage },
  { key: 'mission', label: '任务', icon: '🎯', component: MissionPage },
  { key: 'characters', label: '角色', icon: '🧑‍🤝‍🧑', component: CharactersPage },
  { key: 'creation', label: '创作', icon: '🛠️', component: CreationPage },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; component: Component }>;

type TabKey = (typeof tabs)[number]['key'];

const activeTabKey = ref<TabKey>('characters');
const shellHeight = ref<number | null>(null);
const shellMainRef = ref<HTMLElement | null>(null);
const quickChoicesPanelOpen = ref(false);
const tabScrollPosition = new Map<TabKey, number>(tabs.map(tab => [tab.key, 0] as const));
const displayButtonRef = ref<HTMLElement | null>(null);
const displayPanelRef = ref<HTMLElement | null>(null);
const displayPanelOpen = ref(false);
const theme = useLocalStorage<string>('eden_theme', 'apocalypse_tech');
const fontKey = useLocalStorage<string>('eden_font_key', 'yahei');
const fontSize = useLocalStorage<string>('eden_font_size_key', '16');
const lastLightTheme = useLocalStorage<string>('eden_last_light_theme', 'jade_green');
const isDarkTheme = computed(() => theme.value === 'apocalypse_tech');
const { options } = useInjectedData();

const activeTab = computed(() => tabs.find(tab => tab.key === activeTabKey.value) ?? tabs[0]);
const activeTabProps = computed<Record<string, unknown>>(() => ({ query: '' }));
const quickOptions = computed(() => options.value.filter(opt => String(opt ?? '').trim().length > 0));
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

const shellStyle = computed<Record<string, string>>(() => {
  const styles: Record<string, string> = {};
  if (shellHeight.value !== null) {
    styles['--eden-shell-height'] = `${shellHeight.value}px`;
  }
  return styles;
});

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
  nextTick(() => {
    restoreTabScroll(nextTab);
    notifyLayoutChanged();
  });
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
  const frameContainerHeight = getFrameContainerHeight();
  if (frameContainerHeight != null) {
    return Math.max(1, Math.floor(frameContainerHeight));
  }
  return null;
}

function syncShellHeight() {
  const nextHeight = calculateShellHeight();
  if (nextHeight === null) {
    shellHeight.value = null;
  } else if (Math.abs((shellHeight.value ?? 0) - nextHeight) >= 1) {
    shellHeight.value = nextHeight;
  }
}

function notifyLayoutChanged() {
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

function openQuickChoicesPanel() {
  if (quickOptions.value.length === 0) {
    toastr?.info?.('当前没有可用选项');
    return;
  }
  quickChoicesPanelOpen.value = true;
}

function closeQuickChoicesPanel() {
  quickChoicesPanelOpen.value = false;
}

function onQuickChoiceSent() {
  closeQuickChoicesPanel();
}

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

let frameResizeObserver: ResizeObserver | null = null;
let hostChatResizeObserver: ResizeObserver | null = null;
let removeVisualViewportListener: (() => void) | null = null;
let initialSyncTimers: number[] = [];
let removeDisplayClick: (() => void) | null = null;
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
  quickChoicesPanelOpen.value = false;
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
</script>

<style scoped>
@import '../../界面/shared/shell-layout.css';

#eden-shell {
  --eden-shell-height-fallback: auto;
  --eden-shell-max-height: 100%;
  --eden-shell-min-height: 0px;
  --eden-shell-min-height-mobile: 0px;
  --eden-shell-footer-padding-x: 8px;
  --eden-tab-btn-min-height: 38px;
  --eden-tab-btn-min-height-mobile: 36px;
  --eden-tab-btn-min-height-compact: 34px;
  --eden-tab-label-font-size: 0.66em;
  --eden-tab-label-font-size-mobile: 0.64em;
  --eden-tab-label-display-compact: none;
  --eden-tab-label-letter-spacing-compact: 0;
  --eden-shell-mobile-margin-top: 2px;
  --eden-shell-mobile-margin-bottom: 3px;
  --eden-shell-mobile-height-offset: 5px;
}

#eden-shell:not([style*='--eden-shell-height']) {
  height: auto;
  display: flex;
  flex-direction: column;
}

#eden-shell:not([style*='--eden-shell-height']) .eden-shell-main {
  flex: 0 0 auto;
  overflow: visible;
}

#eden-shell:not([style*='--eden-shell-height']) .eden-pane {
  height: auto;
}

.eden-shell-footer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.eden-quick-options-btn {
  flex: 1 1 auto;
  min-height: 34px;
  border-radius: 9px;
  border: 1px solid var(--btn-primary-border);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  font: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.eden-quick-options-btn:hover:not(:disabled) {
  background: var(--btn-primary-hover-bg);
  color: var(--btn-primary-text);
  box-shadow: 0 0 10px var(--btn-primary-border);
}

.eden-quick-options-btn:disabled {
  background: var(--btn-disabled-bg);
  border-color: var(--btn-disabled-border);
  color: var(--btn-disabled-text);
  cursor: not-allowed;
}

.eden-quick-options-count {
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--card-surface-bg-elevated);
  border: 1px solid var(--card-surface-border);
  font-size: 0.76em;
  line-height: 18px;
  text-align: center;
  padding: 0 4px;
}

.eden-quick-choices-mask {
  position: fixed;
  inset: 0;
  z-index: 2588;
  background: var(--theme-overlay-mask);
  padding: calc(40px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right))
    calc(10px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.eden-quick-choices-modal {
  width: min(680px, 100%);
  max-height: calc(100% - 12px);
  border: 1px solid var(--card-surface-border);
  border-radius: 14px;
  background: var(--theme-modal-bg);
  box-shadow: var(--theme-elevated-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.eden-quick-choices-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--card-surface-border);
}

.eden-quick-choices-title {
  font-size: 0.96em;
  font-weight: 600;
}

.eden-quick-choices-close {
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid var(--btn-border);
  background: var(--btn-bg);
  color: var(--btn-text, var(--text-color));
  font: inherit;
  padding: 0 10px;
  cursor: pointer;
}

.eden-quick-choices-close:hover {
  background: var(--btn-hover-bg);
  color: var(--btn-hover-text, var(--text-strong));
}

.eden-quick-choices-body {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 8px;
}

.eden-quick-choices-body :deep(.section) {
  margin: 0;
}

@media (max-width: 520px) {
  .eden-quick-options-btn {
    min-height: 32px;
    border-radius: 8px;
  }
}
</style>
