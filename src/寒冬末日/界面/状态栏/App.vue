<template>
  <main id="eden-shell" :style="shellStyle">
    <section ref="shellMainRef" class="eden-shell-main">
      <KeepAlive>
        <component :is="activeTab.component" v-bind="activeTabProps" class="eden-pane" />
      </KeepAlive>
    </section>

    <footer class="eden-shell-footer">
      <StoryStreamObserver :active="isStoryTab" :arm-tick="streamArmTick" />
      <SearchBar
        v-model="footerInputValue"
        :mode="isStoryTab ? 'send' : 'search'"
        @send="sendStoryInputToAi"
        @open-choices="openChoicesModal"
      />
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
    </footer>

    <Teleport to="body">
      <div v-if="choicesModalOpen" class="eden-choices-modal-mask" @click.self="closeChoicesModal">
        <section class="eden-choices-modal" role="dialog" aria-modal="true" aria-label="快速剧情选项">
          <header class="eden-choices-modal-head">
            <div class="eden-choices-modal-title">⚜️ 快速剧情</div>
            <button type="button" class="eden-choices-modal-close" @click="closeChoicesModal">关闭</button>
          </header>
          <div class="eden-choices-modal-body">
            <ChoicesSection :options="options" :query="searchQuery" />
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { watchDebounced } from '@vueuse/core';
import CharactersPage from './pages/CharactersPage.vue';
import ChoicesSection from './components/ChoicesSection.vue';
import MissionPage from './pages/MissionPage.vue';
import OverviewPage from './pages/OverviewPage.vue';
import SearchBar from './components/SearchBar.vue';
import StoryStreamObserver from './components/StoryStreamObserver.vue';
import ShelterPage from './pages/ShelterPage.vue';
import StoryPage from './pages/StoryPage.vue';
import { sendToChat } from '../outbound';
import { useInjectedData } from './useInjectedData';

const MIN_SHELL_HEIGHT = 300;
const MAX_SHELL_HEIGHT = 980;
const HOST_CHAT_HEIGHT_SELECTORS = ['#chat', '#sheld'] as const;
const { raw, options } = useInjectedData();
const tabs = [
  { key: 'overview', label: '总览', icon: '📡', component: OverviewPage },
  { key: 'story', label: '剧情', icon: '📖', component: StoryPage },
  { key: 'shelter', label: '庇护', icon: '🛡️', component: ShelterPage },
  { key: 'mission', label: '任务', icon: '🎯', component: MissionPage },
  { key: 'characters', label: '角色', icon: '🧑‍🤝‍🧑', component: CharactersPage },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; component: Component }>;

type TabKey = (typeof tabs)[number]['key'];

const activeTabKey = ref<TabKey>('story');
const searchQuery = useLocalStorage<string>('eden:ui_search_query', '');
const storyInput = useLocalStorage<string>('eden:ui_story_input', '');
const streamArmTick = ref(0);
const choicesModalOpen = ref(false);
const shellHeight = ref<number>(Math.max(MIN_SHELL_HEIGHT, Math.floor(getViewportHeight())));
const shellMainRef = ref<HTMLElement | null>(null);
const tabScrollPosition = new Map<TabKey, number>(tabs.map(tab => [tab.key, 0] as const));

const activeTab = computed(() => tabs.find(tab => tab.key === activeTabKey.value) ?? tabs[0]);
const isStoryTab = computed(() => activeTab.value.key === 'story');
const footerInputValue = computed<string>({
  get() {
    return isStoryTab.value ? storyInput.value : searchQuery.value;
  },
  set(value) {
    if (isStoryTab.value) {
      storyInput.value = value;
      return;
    }
    searchQuery.value = value;
  },
});
const activeTabProps = computed<Record<string, unknown>>(() => {
  const baseProps: Record<string, unknown> = { query: searchQuery.value };
  if (activeTab.value.key === 'story') return { ...baseProps, raw: raw.value };
  return baseProps;
});

const shellStyle = computed<Record<string, string>>(() => ({
  '--eden-shell-height': `${shellHeight.value}px`,
}));

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

function sendStoryInputToAi(value: string) {
  if (!isStoryTab.value) return;
  const text = String(value ?? '').trim();
  if (!text) return;
  const result = sendToChat(text, {
    successMessage: '已发送给AI',
    failureMessage: '发送失败，请手动发送',
    unavailableMessage: '无法发送：triggerSlash 不可用',
  });
  if (result.ok) {
    storyInput.value = '';
    streamArmTick.value += 1;
  }
}

function openChoicesModal() {
  choicesModalOpen.value = true;
}

function closeChoicesModal() {
  choicesModalOpen.value = false;
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

function calculateShellHeight() {
  const hostChatHeight = getHostChatHeight();
  const candidate = hostChatHeight ?? getViewportHeight();
  return Math.min(MAX_SHELL_HEIGHT, Math.max(MIN_SHELL_HEIGHT, Math.floor(candidate)));
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
      const hostChatEl = HOST_CHAT_HEIGHT_SELECTORS.map(selector => hostDoc.querySelector(selector) as HTMLElement | null)
        .find(Boolean);
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
});

watchDebounced(
  () => [raw.value, options.value.join('\n')],
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
  min-height: 300px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.eden-shell-main {
  min-height: 0;
  overflow: hidden;
}

.eden-pane {
  height: 100%;
  min-height: 0;
}

.eden-shell-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.18));
  padding: 4px 8px calc(6px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eden-tabbar {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.eden-choices-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 2200;
  padding: 54px 12px 10px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgba(8, 12, 20, 0.55);
  backdrop-filter: blur(2px);
}

.eden-choices-modal {
  width: min(100%, 900px);
  max-height: min(72vh, 820px);
  border-radius: 12px;
  border: 1px solid rgba(139, 233, 253, 0.4);
  background: linear-gradient(180deg, rgba(20, 26, 40, 0.96), rgba(10, 14, 22, 0.97));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.36);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.eden-choices-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 9px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.eden-choices-modal-title {
  font-size: 0.88em;
  color: var(--text-strong);
  line-height: 1;
}

.eden-choices-modal-close {
  flex: 0 0 auto;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
  font: inherit;
  font-size: 0.76em;
  line-height: 1;
  padding: 6px 9px;
  cursor: pointer;
}

.eden-choices-modal-close:hover {
  background: rgba(139, 233, 253, 0.24);
}

.eden-choices-modal-body {
  min-height: 0;
  overflow: auto;
  padding: 6px;
}

.eden-choices-modal-body :deep(.choices-title) {
  display: none;
}

.eden-choices-modal-body :deep(.choice-item) {
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 7px;
}

.eden-choices-modal-body :deep(.palette-button) {
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  font-size: 15px;
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

@media (max-width: 520px) {
  #eden-shell {
    min-height: 280px;
  }

  .eden-shell-footer {
    padding-left: 6px;
    padding-right: 6px;
  }

  .eden-tab-btn {
    min-height: 36px;
    border-radius: 8px;
  }

  .eden-choices-modal-mask {
    padding: 44px 8px 8px;
    align-items: flex-start;
  }

  .eden-choices-modal {
    max-height: min(78vh, 940px);
  }

  .eden-choices-modal-head {
    padding: 6px 8px;
  }

  .eden-choices-modal-body {
    padding: 6px;
  }

  .eden-tab-label {
    font-size: 0.64em;
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
