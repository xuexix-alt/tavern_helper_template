<template>
  <main id="eden-shell" :style="shellStyle">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ChoicesSection from './components/ChoicesSection.vue';
import CharactersPage from './pages/CharactersPage.vue';
import CreationPage from './pages/CreationPage.vue';
import MissionPage from './pages/MissionPage.vue';
import ShelterPage from './pages/ShelterPage.vue';
import { useInjectedData } from './useInjectedData';

const STATUSBAR_VERSION = '3.0';
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
const { options } = useInjectedData();

const activeTab = computed(() => tabs.find(tab => tab.key === activeTabKey.value) ?? tabs[0]);
const activeTabProps = computed<Record<string, unknown>>(() => ({ query: '' }));
const quickOptions = computed(() => options.value.filter(opt => String(opt ?? '').trim().length > 0));

const shellStyle = computed<Record<string, string>>(() => {
  if (shellHeight.value === null) {
    return {};
  }
  return {
    '--eden-shell-height': `${shellHeight.value}px`,
  };
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

function getViewportHeight() {
  const vv = window.visualViewport;
  if (vv?.height && Number.isFinite(vv.height) && vv.height > 0) return vv.height;
  if (window.innerHeight > 0) return window.innerHeight;
  return document.documentElement.clientHeight || MIN_SHELL_HEIGHT;
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

let frameResizeObserver: ResizeObserver | null = null;
let hostChatResizeObserver: ResizeObserver | null = null;
let removeVisualViewportListener: (() => void) | null = null;
let initialSyncTimers: number[] = [];

onMounted(() => {
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
  quickChoicesPanelOpen.value = false;
});

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
  font-size: var(--font-size-main, 16px);
  box-sizing: border-box;
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
  height: var(--eden-shell-height, auto);
  max-height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
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

.eden-shell-main {
  min-height: 0;
  overflow: hidden;
}

#eden-shell:not([style*='--eden-shell-height']) .eden-shell-main {
  overflow: visible;
}

.eden-pane {
  height: 100%;
  min-height: 0;
}

#eden-shell:not([style*='--eden-shell-height']) .eden-pane {
  height: auto;
}

.eden-shell-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.18));
  padding: 4px 8px calc(6px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  border: 1px solid rgba(139, 233, 253, 0.55);
  background: rgba(139, 233, 253, 0.16);
  color: var(--text-strong);
  font: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.eden-quick-options-btn:hover:not(:disabled) {
  background: rgba(139, 233, 253, 0.24);
  box-shadow: 0 0 10px rgba(139, 233, 253, 0.25);
}

.eden-quick-options-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.eden-quick-options-count {
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 0.76em;
  line-height: 18px;
  text-align: center;
  padding: 0 4px;
}

.eden-tabbar {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.eden-tab-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 38px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
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
  background: rgba(139, 233, 253, 0.2);
}

.eden-tab-btn.active {
  background: rgba(139, 233, 253, 0.3);
  border-color: rgba(139, 233, 253, 0.65);
  color: var(--text-strong);
  box-shadow: 0 0 12px rgba(139, 233, 253, 0.22);
}

.eden-tab-icon {
  line-height: 1;
  font-size: 0.96em;
}

.eden-tab-label {
  line-height: 1;
  font-size: 0.66em;
  white-space: nowrap;
}

.eden-quick-choices-mask {
  position: fixed;
  inset: 0;
  z-index: 2588;
  background: rgba(0, 0, 0, 0.52);
  padding: calc(40px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right))
    calc(10px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.eden-quick-choices-modal {
  width: min(680px, 100%);
  max-height: calc(100% - 12px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(18, 21, 29, 0.98);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.eden-quick-choices-title {
  font-size: 0.96em;
  font-weight: 600;
}

.eden-quick-choices-close {
  min-height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  font: inherit;
  padding: 0 10px;
  cursor: pointer;
}

.eden-quick-choices-body {
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.eden-quick-choices-body :deep(.section) {
  margin: 0;
}

@media (max-width: 520px) {
  .eden-shell-footer {
    padding-left: 6px;
    padding-right: 6px;
  }

  .eden-tab-btn {
    min-height: 36px;
    border-radius: 8px;
  }

  .eden-tab-label {
    font-size: 0.64em;
  }

  .eden-quick-options-btn {
    min-height: 32px;
    border-radius: 8px;
  }
}

@media (max-width: 380px) {
  .eden-tab-label {
    display: none;
  }

  .eden-tab-btn {
    min-height: 34px;
  }
}
</style>
