<template>
  <section class="ui-host-shell">
    <header class="ui-topbar">
      <div class="ui-topbar-brand">
        <span class="ui-dot"></span>
        <span class="ui-brand-copy">NEXUS // CORE_SYNC</span>
      </div>

      <div class="ui-topbar-center">
        <button type="button" class="ui-signal-btn" @click="workbenchModalOpen = true">
          <span>系统</span>
          <span class="ui-bars">
            <i v-for="i in 8" :key="`log-${i}`" :class="{ active: i <= 5 }"></i>
          </span>
        </button>

        <button type="button" class="ui-signal-btn" @click="mapModalOpen = true">
          <span>地图</span>
          <span class="ui-bars">
            <i v-for="i in 8" :key="`map-${i}`" :class="{ active: i <= 3 }"></i>
          </span>
        </button>
      </div>

      <div class="ui-topbar-actions">
        <span class="ui-online">● 在线</span>

        <button type="button" class="ui-icon-btn" @click="roleDrawerOpen = true">人物</button>

        <button type="button" class="ui-icon-btn" @click="settingsModalOpen = true">排版</button>

        <div class="ui-chip-group">
          <button
            v-for="item in densityItems"
            :key="item.value"
            type="button"
            class="ui-chip"
            :class="{ active: density === item.value }"
            @click="density = item.value"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="theme-dropdown">
          <button type="button" class="ui-icon-btn theme-trigger" @click="themeDropdownOpen = !themeDropdownOpen">
            {{ currentThemeLabel }}
            <span :class="['theme-caret', { open: themeDropdownOpen }]">⌄</span>
          </button>
          <div v-if="themeDropdownOpen" class="theme-dropdown-menu clip-corner-sm">
            <button
              v-for="item in themeItems"
              :key="item.value"
              type="button"
              class="theme-option"
              :class="{ active: theme === item.value }"
              @click="selectTheme(item.value)"
            >
              <span>{{ item.label }}</span>
              <span v-if="theme === item.value">✓</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="ui-host-body">
      <transition name="sidebar-mask-fade">
        <div v-if="roleDrawerOpen" class="ui-sidebar-mask" @click="closeRoleDrawer"></div>
      </transition>

      <button
        type="button"
        class="ui-sidebar-toggle"
        :class="{ open: roleDrawerOpen }"
        @click="roleDrawerOpen = !roleDrawerOpen"
      >
        <span class="ui-sidebar-toggle-arrow">›</span>
        <span class="ui-sidebar-toggle-label">[ ROSTER ]</span>
      </button>

      <aside class="ui-sidebar" :class="{ open: roleDrawerOpen }">
        <div class="ui-sidebar-head">
          <div>
            <span class="demo-kicker">CHARACTER // SIDEBAR</span>
            <strong>登场角色与房间态势</strong>
          </div>
          <button type="button" class="ui-close-btn" @click="closeRoleDrawer">✕</button>
        </div>

        <div class="ui-sidebar-body">
          <MvuRolePanel
            :transcript-items="transcript"
            :active-character-key="activeRoleKey"
            @select-character="handleRoleSelect"
            @roster-change="handleRosterChange"
          />
        </div>
      </aside>

      <main class="ui-main-panel">
        <section class="ui-transcript-panel">
          <div class="ui-transcript-head">
            <div>
              <span class="demo-kicker">TRANSCRIPT // LIVE_VIEW</span>
              <strong>第 0 层同层阅读工作台</strong>
              <p>{{ readerSummary.storySummary || '等待首段剧情建立当前阅读上下文。' }}</p>
            </div>

            <div class="ui-transcript-meta">
              <span class="ui-meta-pill">总楼层 {{ transcriptStats.total }}</span>
              <span class="ui-meta-pill">助手 {{ transcriptStats.assistant }}</span>
              <span class="ui-meta-pill">{{ readerSummary.statusLabel }}</span>
              <span class="ui-meta-pill">{{ readerSummary.readingModeLabel }}</span>
              <button type="button" class="ui-meta-pill action" :disabled="followLatest" @click="jumpLatest">
                {{ followLatest ? '已在最新' : '回到最新' }}
              </button>
            </div>
          </div>

          <div class="ui-transcript-stage">
            <TranscriptList
              ref="transcriptListRef"
              :items="visibleTranscript"
              :density="density"
              :busy="busy"
              :should-follow-latest="followLatest"
              :opening-expanded="openingExpanded"
              :latest-user-message-id="latestUserItem?.message_id ?? null"
              :editing-user-message-id="editingUserMessageId"
              :editing-user-draft="editingUserDraft"
              :rollback-confirm-message-id="rollbackConfirmMessageId"
              :swipe-message-id="latestAssistantSwipeMessageId"
              :swipe-label="latestAssistantSwipeLabel"
              :can-swipe-prev="canSwipeLatestAssistantPrev"
              :can-swipe-next="canSwipeLatestAssistantNext"
              @open-detail="openDetail"
              @reading-mode-change="setReadingMode"
              @toggle-opening="toggleOpeningExpanded"
              @start-edit-user="startInlineEdit"
              @update-edit-draft="setEditingUserDraft"
              @confirm-edit-user="confirmInlineEditRegenerate"
              @cancel-edit-user="cancelInlineEdit"
              @request-rollback="requestRollbackDelete"
              @confirm-rollback="confirmRollbackDelete"
              @cancel-rollback="cancelRollbackDelete"
              @swipe-assistant="swipeLatestAssistant"
            />
          </div>
        </section>

        <section class="ui-bottom-dock">
          <div class="ui-bottom-quickline">
            <div class="ui-quick-card">
              <span class="demo-kicker">LATEST USER</span>
              <strong>{{ readerSummary.latestUserPreview || '暂无用户输入' }}</strong>
            </div>
            <div class="ui-quick-card">
              <span class="demo-kicker">LATEST ASSISTANT</span>
              <strong>{{ readerSummary.latestAssistantPreview || '等待流式输出' }}</strong>
            </div>
            <div class="ui-quick-card compact">
              <span class="demo-kicker">SWIPE</span>
              <strong>{{ latestAssistantSwipeLabel || '1/1' }}</strong>
            </div>
          </div>

          <BottomComposer
            v-model="input"
            :busy="busy"
            :status="status"
            :can-roll="Boolean(latestUserItem)"
            :swipe-label="latestAssistantSwipeLabel"
            :can-swipe-prev="canSwipeLatestAssistantPrev"
            :can-swipe-next="canSwipeLatestAssistantNext"
            :role-tabs="roleTabs"
            :active-role-key="activeRoleKey"
            @submit="runDemo"
            @roll="rollLatestTurn"
            @swipe="swipeLatestAssistant"
            @jump-latest="jumpLatest"
            @refresh="refreshWorkbench"
            @open-role="openRoleFromComposer"
          />
        </section>
      </main>
    </div>

    <RadialQuickMenu :items="roleTabs" :active-key="activeRoleKey" @select="openRoleFromComposer" />

    <HudModal
      :open="workbenchModalOpen"
      title="系统 TAB"
      subtitle="这里开始承接 docs/UI 的系统页签、进度条、告警块和确认窗语义。"
      variant="tasks"
      icon="▦"
      eyebrow="TASKS // SYSTEM"
      @close="workbenchModalOpen = false"
    >
      <WorkbenchTabs
        :logs="logs"
        :busy="busy"
        :transcript-total="transcriptStats.total"
        :assistant-count="transcriptStats.assistant"
        :latest-swipe-label="latestAssistantSwipeLabel"
      />
    </HudModal>

    <HudModal
      :open="mapModalOpen"
      title="战术地图"
      subtitle="使用 docs/UI 的地图卡片语言渲染真实业务数据，而不是复用旧地图外观。"
      variant="map"
      icon="🗺"
      eyebrow="MAP // TACTICAL"
      wide
      @close="mapModalOpen = false"
    >
      <MapBusinessPanel />
    </HudModal>

    <HudModal
      :open="componentLibraryOpen"
      title="UI 组件库 V2.0"
      subtitle="这里不是展示页，而是迁移时可直接复用的表单、进度、告警、确认组件仓。"
      variant="library"
      icon="◫"
      eyebrow="LIBRARY // COMPONENTS"
      wide
      @close="componentLibraryOpen = false"
    >
      <ComponentLibraryPanel />
    </HudModal>

    <HudModal
      :open="settingsModalOpen"
      title="阅读与排版设置"
      subtitle="细调主题、筛选、密度与阅读跳转。"
      variant="typography"
      icon="T"
      eyebrow="TYPE // SETTINGS"
      @close="settingsModalOpen = false"
    >
      <TopToolbar
        v-model:theme="theme"
        v-model:filter-mode="filterMode"
        v-model:density="density"
        :total-count="transcriptStats.total"
        :latest-user-preview="readerSummary.latestUserPreview"
        :at-latest="followLatest"
        :is-browsing-history="readingMode === 'browsing_history'"
        @jump-latest="jumpLatest"
      />
    </HudModal>

    <HudModal
      :open="openingModalOpen || shouldShowOpeningSetup"
      title="开局设定 / Opening Setup"
      subtitle="这部分保留 demo 的开局业务链，但显示形态改成 docs/UI 式宿主弹层，而不是单独页面。"
      variant="workspace"
      icon="◈"
      eyebrow="MODAL // WORKSPACE"
      wide
      @close="openingModalOpen = false"
    >
      <OpeningSetupPanel
        :preset="openingPreset"
        :payload="openingPayload"
        :busy="busy"
        :world-modes="openingWorldModes"
        :routes="openingRoutes"
        @update-meta="updateOpeningMeta"
        @update-field="updateOpeningField"
        @update-world-mode="updateOpeningWorldMode"
        @update-route="updateOpeningRoute"
        @update-stream="updateOpeningStream"
        @submit="generateOpening"
      />
    </HudModal>

    <MessageDetailModal :item="selectedItem" @close="closeDetail" />
  </section>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';

import BottomComposer from '../components/BottomComposer.vue';
import ComponentLibraryPanel from '../components/ComponentLibraryPanel.vue';
import HudModal from '../components/HudModal.vue';
import MessageDetailModal from '../components/MessageDetailModal.vue';
import MvuRolePanel from '../components/MvuRolePanel.vue';
import OpeningSetupPanel from '../components/OpeningSetupPanel.vue';
import RadialQuickMenu from '../components/RadialQuickMenu.vue';
import MapBusinessPanel from '../components/MapBusinessPanel.vue';
import TopToolbar from '../components/TopToolbar.vue';
import TranscriptList from '../components/TranscriptList.vue';
import WorkbenchTabs from '../components/WorkbenchTabs.vue';
import type { DemoTheme, TranscriptDensity } from '../types';
import { useStreamingDemo } from '../useStreamingDemo';

const {
  input,
  busy,
  status,
  filterMode,
  density,
  theme,
  readingMode,
  followLatest,
  openingExpanded,
  selectedItem,
  transcript,
  visibleTranscript,
  transcriptStats,
  latestUserItem,
  readerSummary,
  logs,
  editingUserMessageId,
  editingUserDraft,
  rollbackConfirmMessageId,
  latestAssistantSwipeMessageId,
  canSwipeLatestAssistantPrev,
  canSwipeLatestAssistantNext,
  latestAssistantSwipeLabel,
  openingPreset,
  openingPayload,
  openingWorldModes,
  openingRoutes,
  shouldShowOpeningSetup,
  runDemo,
  rollLatestTurn,
  refreshWorkbench,
  updateOpeningMeta,
  updateOpeningField,
  updateOpeningWorldMode,
  updateOpeningRoute,
  updateOpeningStream,
  generateOpening,
  startInlineEdit,
  setEditingUserDraft,
  cancelInlineEdit,
  confirmInlineEditRegenerate,
  requestRollbackDelete,
  cancelRollbackDelete,
  confirmRollbackDelete,
  swipeLatestAssistant,
  setReadingMode,
  toggleOpeningExpanded,
  openDetail,
  closeDetail,
} = useStreamingDemo();

const transcriptListRef = ref<InstanceType<typeof TranscriptList> | null>(null);
const roleDrawerOpen = ref(false);
const workbenchModalOpen = ref(false);
const mapModalOpen = ref(false);
const settingsModalOpen = ref(false);
const openingModalOpen = ref(false);
const componentLibraryOpen = ref(false);
const themeDropdownOpen = ref(false);
const roleTabs = ref<Array<{ key: string; label: string; statusClass?: string; statusText?: string }>>([]);
const activeRoleKey = ref<string | null>(null);

const densityItems: Array<{ label: string; value: TranscriptDensity }> = [
  { label: '舒适', value: 'comfortable' },
  { label: '紧凑', value: 'minimal' },
];

const themeItems: Array<{ label: string; value: DemoTheme }> = [
  { label: '科技', value: 'tech' },
  { label: '暗黑', value: 'dark' },
  { label: '鎏金', value: 'gold' },
  { label: 'iOS', value: 'ios' },
  { label: 'iPod', value: 'ipod' },
  { label: '琥珀', value: 'amber' },
];

const currentThemeLabel = computed(() => themeItems.find(item => item.value === theme.value)?.label ?? '科技');

function jumpLatest() {
  transcriptListRef.value?.scrollToLatest?.();
}

function closeRoleDrawer() {
  roleDrawerOpen.value = false;
}

function handleRosterChange(roles: Array<{ key: string; label: string; statusClass: string; statusText: string }>) {
  roleTabs.value = roles;
  if (!activeRoleKey.value && roles[0]) activeRoleKey.value = roles[0].key;
  if (activeRoleKey.value && !roles.some(role => role.key === activeRoleKey.value)) {
    activeRoleKey.value = roles[0]?.key ?? null;
  }
}

function handleRoleSelect(key: string) {
  activeRoleKey.value = key;
}

function openRoleFromComposer(key: string) {
  activeRoleKey.value = key;
  roleDrawerOpen.value = true;
}

function selectTheme(nextTheme: DemoTheme) {
  theme.value = nextTheme;
  themeDropdownOpen.value = false;
}

useEventListener(window, 'keydown', event => {
  if (event.key !== 'Escape') return;
  if (roleDrawerOpen.value) roleDrawerOpen.value = false;
  else if (themeDropdownOpen.value) themeDropdownOpen.value = false;
  else if (componentLibraryOpen.value) componentLibraryOpen.value = false;
  else if (mapModalOpen.value) mapModalOpen.value = false;
  else if (openingModalOpen.value) openingModalOpen.value = false;
  else if (settingsModalOpen.value) settingsModalOpen.value = false;
  else if (workbenchModalOpen.value) workbenchModalOpen.value = false;
});
</script>

<style scoped>
.ui-host-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ui-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--background) 74%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.ui-topbar-brand,
.ui-topbar-center,
.ui-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ui-topbar-center {
  flex: 1 1 auto;
  justify-content: center;
}

.ui-topbar-actions {
  justify-content: flex-end;
}

.ui-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 70%, transparent);
}

.ui-brand-copy,
.ui-online,
.ui-chip,
.ui-icon-btn,
.ui-signal-btn,
.ui-meta-pill,
.ui-floating-trigger {
  font-family: var(--demo-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ui-brand-copy {
  color: var(--demo-text-accent);
}

.ui-online {
  color: var(--demo-text-secondary);
}

.ui-signal-btn,
.ui-icon-btn,
.ui-chip,
.ui-meta-pill {
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 32%, transparent);
  color: var(--demo-text-primary);
}

.ui-signal-btn,
.ui-icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 12px;
}

.ui-bars {
  display: inline-flex;
  gap: 3px;
}

.ui-bars i {
  display: inline-block;
  width: 3px;
  height: 11px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 22%, transparent);
}

.ui-bars i.active {
  background: color-mix(in srgb, var(--primary) 78%, transparent);
}

.ui-chip-group {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ui-chip {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
}

.ui-chip.active,
.ui-meta-pill.action:not(:disabled) {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: var(--demo-gradient-chip-active);
}

.theme-dropdown {
  position: relative;
}
.theme-trigger {
  gap: 8px;
}
.theme-caret {
  transition: transform 0.18s ease;
}
.theme-caret.open {
  transform: rotate(180deg);
}
.theme-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 150px;
  padding: 6px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--shadow-color) 72%, transparent);
  z-index: 15;
}
.theme-option {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--demo-text-primary);
  font-family: var(--demo-font-mono);
  font-size: 12px;
}
.theme-option.active {
  color: var(--demo-text-accent);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

.ui-host-body {
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.ui-sidebar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 25;
  width: 320px;
  border-right: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--background) 72%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow:
    10px 0 34px color-mix(in srgb, var(--shadow-color) 88%, transparent),
    inset -1px 0 0 color-mix(in srgb, var(--primary) 12%, transparent);
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.ui-sidebar.open {
  transform: translateX(0);
}

.ui-sidebar-toggle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 108px;
  border: 1px solid var(--demo-border-accent-soft);
  border-left: 0;
  background: color-mix(in srgb, var(--background) 68%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  color: var(--demo-text-accent);
  box-shadow:
    6px 0 18px color-mix(in srgb, var(--shadow-color) 68%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent);
  transition:
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;
}

.ui-sidebar-toggle:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--background) 90%);
  box-shadow:
    8px 0 22px color-mix(in srgb, var(--shadow-color) 78%, transparent),
    0 0 18px color-mix(in srgb, var(--primary) 14%, transparent);
}

.ui-sidebar-toggle.open {
  transform: translateY(-50%) translateX(320px);
}

.ui-sidebar-toggle-arrow {
  font-family: var(--demo-font-mono);
  font-size: 16px;
  transition: transform 0.3s ease;
}

.ui-sidebar-toggle.open .ui-sidebar-toggle-arrow {
  transform: rotate(180deg);
}

.ui-sidebar-toggle-label {
  position: absolute;
  right: -34px;
  font-family: var(--demo-font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--demo-text-accent) 56%, transparent);
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  text-shadow: 0 0 10px color-mix(in srgb, var(--primary) 18%, transparent);
}

.ui-sidebar-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.ui-sidebar-head strong {
  display: block;
  margin-top: 6px;
  font-size: 16px;
}

.ui-close-btn {
  display: none;
  width: 34px;
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  color: var(--demo-text-primary);
}

.ui-sidebar-body {
  padding: 12px;
}

.ui-main-panel {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-transcript-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.ui-transcript-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ui-transcript-head strong {
  display: block;
  margin-top: 6px;
  font-size: 18px;
}

.ui-transcript-head p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--demo-text-secondary);
}

.ui-transcript-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.ui-meta-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
}

.ui-meta-pill.action:disabled {
  opacity: 0.6;
}

.ui-transcript-stage {
  min-width: 0;
}

.ui-bottom-dock {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
}

.ui-bottom-quickline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 130px;
  gap: 10px;
}

.ui-quick-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

.ui-quick-card strong {
  font-size: 13px;
  line-height: 1.45;
  color: var(--demo-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-quick-card.compact {
  justify-content: center;
}

.ui-sidebar-mask {
  position: fixed;
  inset: 0;
  z-index: 24;
  background: color-mix(in srgb, black 42%, transparent);
}

.sidebar-mask-fade-enter-active,
.sidebar-mask-fade-leave-active {
  transition: opacity 0.18s ease;
}

.sidebar-mask-fade-enter-from,
.sidebar-mask-fade-leave-to {
  opacity: 0;
}

:deep(.transcript-card) {
  min-height: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

:deep(.transcript-headbar) {
  display: none;
}

:deep(.transcript-scroller) {
  max-height: none;
  padding: 0;
}

:deep(.composer-card) {
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 24%, transparent);
}

@media (max-width: 1100px) {
  .ui-topbar {
    flex-wrap: wrap;
  }

  .ui-topbar-center {
    order: 3;
    width: 100%;
    justify-content: flex-start;
  }

  .ui-sidebar {
    position: fixed;
    top: 58px;
    left: 0;
    bottom: 0;
    z-index: 25;
    box-shadow: 14px 0 34px color-mix(in srgb, var(--shadow-color) 82%, transparent);
  }

  .ui-close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

@media (max-width: 760px) {
  .ui-topbar,
  .ui-transcript-panel,
  .ui-bottom-dock {
    padding-left: 10px;
    padding-right: 10px;
  }

  .ui-topbar-actions,
  .theme-group {
    width: 100%;
  }

  .ui-topbar-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .ui-transcript-head {
    flex-direction: column;
  }

  .ui-transcript-meta {
    justify-content: flex-start;
  }

  .ui-bottom-quickline {
    grid-template-columns: 1fr;
  }

  .ui-sidebar {
    top: auto;
    width: 100%;
    left: 0;
    right: 0;
    bottom: 0;
    transform: translateY(100%);
  }

  .ui-sidebar.open {
    transform: translateY(0);
  }

  .ui-sidebar-toggle {
    top: auto;
    bottom: 120px;
    transform: none;
  }

  .ui-sidebar-toggle.open {
    transform: translateY(-320px);
  }
}
</style>
