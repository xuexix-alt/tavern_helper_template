<template>
  <main id="eden-shell" :style="shellStyle">
    <section ref="shellMainRef" class="eden-shell-main">
      <KeepAlive>
        <component :is="activeTab.component" v-bind="activeTabProps" class="eden-pane" />
      </KeepAlive>
    </section>

    <footer class="eden-shell-footer">
      <div class="eden-version">界面版本 v{{ UI_VERSION }}</div>
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
  </main>
</template>

<script setup lang="ts">
import type { Component } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { watchDebounced } from '@vueuse/core';
import CharactersPage from './pages/CharactersPage.vue';
import ChoicesPage from './pages/ChoicesPage.vue';
import MissionPage from './pages/MissionPage.vue';
import OverviewPage from './pages/OverviewPage.vue';
import ShelterPage from './pages/ShelterPage.vue';
import { useInjectedData } from './useInjectedData';

const UI_VERSION = '2.2';
const { options } = useInjectedData();
const tabs = [
  { key: 'overview', label: '总览', icon: '📡', component: OverviewPage },
  { key: 'shelter', label: '庇护', icon: '🛡️', component: ShelterPage },
  { key: 'mission', label: '任务', icon: '🎯', component: MissionPage },
  { key: 'characters', label: '角色', icon: '🧑‍🤝‍🧑', component: CharactersPage },
  { key: 'choices', label: '选项', icon: '⚜️', component: ChoicesPage },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: string; component: Component }>;

type TabKey = (typeof tabs)[number]['key'];

const activeTabKey = ref<TabKey>('overview');
const shellHeight = ref<number>(Math.max(360, window.innerHeight));
const shellMainRef = ref<HTMLElement | null>(null);
const tabScrollPosition = new Map<TabKey, number>(tabs.map(tab => [tab.key, 0] as const));

const activeTab = computed(() => tabs.find(tab => tab.key === activeTabKey.value) ?? tabs[0]);
const activeTabProps = computed<Record<string, unknown>>(() => {
  if (activeTab.value.key === 'choices') return { options: options.value };
  return {};
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
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  });
}

function calculateShellHeight() {
  try {
    const frameEl = window.frameElement as HTMLElement | null;
    if (!frameEl || window.parent === window) return Math.max(360, window.innerHeight);
    const rect = frameEl.getBoundingClientRect();
    const parentH = Math.max(360, window.parent.innerHeight);
    const clampedTop = Math.min(Math.max(rect.top, 0), parentH);
    const next = Math.floor(parentH - clampedTop - 8);
    return Math.min(parentH, Math.max(360, next));
  } catch {
    return Math.max(360, window.innerHeight);
  }
}

function syncShellHeight() {
  shellHeight.value = calculateShellHeight();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}

let removeParentResizeListener: (() => void) | null = null;

onMounted(() => {
  syncShellHeight();
  window.addEventListener('resize', syncShellHeight, { passive: true });
  window.addEventListener('orientationchange', syncShellHeight);
  nextTick(() => restoreTabScroll(activeTabKey.value));

  try {
    if (window.parent && window.parent !== window) {
      const onParentResize = () => syncShellHeight();
      window.parent.addEventListener('resize', onParentResize, { passive: true });
      removeParentResizeListener = () => {
        window.parent.removeEventListener('resize', onParentResize);
      };
    }
  } catch {
    removeParentResizeListener = null;
  }
});

onBeforeUnmount(() => {
  saveCurrentTabScroll(activeTabKey.value);
  window.removeEventListener('resize', syncShellHeight);
  window.removeEventListener('orientationchange', syncShellHeight);
  if (removeParentResizeListener) removeParentResizeListener();
});

watchDebounced(
  () => [options.value.join('\n')],
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
  height: var(--eden-shell-height, 640px);
  max-height: var(--eden-shell-height, 640px);
  min-height: 360px;
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
  padding: 6px 10px calc(8px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.eden-version {
  align-self: flex-end;
  font-size: 0.72em;
  opacity: 0.62;
  letter-spacing: 0.02em;
}

.eden-tabbar {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.eden-tab-btn {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
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
  font-size: 1.04em;
}

.eden-tab-label {
  line-height: 1;
  font-size: 0.74em;
  white-space: nowrap;
}

@media (max-width: 520px) {
  #eden-shell {
    min-height: 320px;
  }

  .eden-shell-footer {
    padding-left: 8px;
    padding-right: 8px;
  }

  .eden-tab-btn {
    min-height: 42px;
    border-radius: 9px;
  }

  .eden-tab-label {
    font-size: 0.7em;
  }
}
</style>
